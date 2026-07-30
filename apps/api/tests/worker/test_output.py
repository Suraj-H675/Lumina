"""Process-lifetime nonblocking raw-descriptor output tests."""

from __future__ import annotations

import asyncio
import os
from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from lumina.worker.output import (
    WORKER_STARTED,
    NonBlockingProcessOutput,
    ProcessOutputError,
)


@contextmanager
def _pipe() -> Iterator[tuple[int, int]]:
    read_fd, write_fd = os.pipe()
    try:
        yield read_fd, write_fd
    finally:
        os.close(read_fd)
        os.close(write_fd)


@pytest.mark.asyncio
async def test_process_output_owns_modes_for_lifetime_and_restores_once() -> None:
    with _pipe() as (read_fd, write_fd), _pipe() as (_, stderr_fd):
        calls: list[tuple[int, bool]] = []

        def set_blocking(descriptor: int, blocking: bool) -> None:
            calls.append((descriptor, blocking))
            os.set_blocking(descriptor, blocking)

        output = NonBlockingProcessOutput(
            stdout_fd=write_fd,
            stderr_fd=stderr_fd,
            set_blocking=set_blocking,
        )
        output.activate()
        await output.write_stdout(
            WORKER_STARTED,
            deadline=asyncio.get_running_loop().time() + 1,
        )

        assert os.read(read_fd, len(WORKER_STARTED)) == WORKER_STARTED
        assert all(not blocking for _, blocking in calls)

        output.restore()
        restored_calls = tuple(calls)
        output.restore()

        assert calls == list(restored_calls)
        assert calls[-2:] == [(stderr_fd, True), (write_fd, True)]


@pytest.mark.asyncio
async def test_partial_write_and_eagain_are_completed_without_threads() -> None:
    with _pipe() as (read_fd, write_fd):
        writes = 0

        def write(descriptor: int, data: bytes | memoryview) -> int:
            nonlocal writes
            writes += 1
            if writes == 1:
                return os.write(descriptor, bytes(data[:4]))
            if writes == 2:
                raise BlockingIOError()
            return os.write(descriptor, data)

        output = NonBlockingProcessOutput(
            stdout_fd=write_fd,
            stderr_fd=write_fd,
            write=write,
        )
        output.activate()
        await output.write_stdout(
            WORKER_STARTED,
            deadline=asyncio.get_running_loop().time() + 1,
        )
        output.restore()

        assert writes == 3
        assert os.read(read_fd, len(WORKER_STARTED)) == WORKER_STARTED


@pytest.mark.asyncio
@pytest.mark.parametrize("written", [0, -1])
async def test_zero_or_negative_write_is_fixed_failure(written: int) -> None:
    with _pipe() as (_, write_fd):
        output = NonBlockingProcessOutput(
            stdout_fd=write_fd,
            stderr_fd=write_fd,
            write=lambda _descriptor, _data: written,
        )
        output.activate()
        with pytest.raises(ProcessOutputError):
            await output.write_stdout(
                WORKER_STARTED,
                deadline=asyncio.get_running_loop().time() + 1,
            )
        output.restore()


@pytest.mark.asyncio
async def test_confirmation_failure_is_fixed_and_secret_safe() -> None:
    sentinel = "confirmation-secret"

    async def fail_confirmation() -> None:
        raise RuntimeError(sentinel)

    with _pipe() as (_, write_fd):
        output = NonBlockingProcessOutput(
            stdout_fd=write_fd,
            stderr_fd=write_fd,
            confirm=fail_confirmation,
        )
        output.activate()
        with pytest.raises(ProcessOutputError) as failure:
            await output.write_stdout(
                WORKER_STARTED,
                deadline=asyncio.get_running_loop().time() + 1,
            )
        output.restore()

    assert sentinel not in repr(failure.value)
    assert sentinel not in str(failure.value)


def test_partial_activation_restores_first_descriptor() -> None:
    modes = {10: True, 11: True}
    calls: list[tuple[int, bool]] = []

    def set_blocking(descriptor: int, blocking: bool) -> None:
        calls.append((descriptor, blocking))
        if descriptor == 11 and not blocking:
            raise OSError("private")
        modes[descriptor] = blocking

    output = NonBlockingProcessOutput(
        stdout_fd=10,
        stderr_fd=11,
        get_blocking=modes.__getitem__,
        set_blocking=set_blocking,
    )

    with pytest.raises(ProcessOutputError):
        output.activate()

    assert calls == [(10, False), (11, False), (10, True)]
    assert modes[10] is True


def test_restoration_failure_occurs_only_at_final_restore() -> None:
    modes = {10: True, 11: True}

    def set_blocking(descriptor: int, blocking: bool) -> None:
        if blocking and descriptor == 10:
            raise OSError("private")
        modes[descriptor] = blocking

    output = NonBlockingProcessOutput(
        stdout_fd=10,
        stderr_fd=11,
        get_blocking=modes.__getitem__,
        set_blocking=set_blocking,
        write=lambda _descriptor, data: len(data),
    )
    output.activate()

    with pytest.raises(ProcessOutputError):
        output.restore()

    assert modes[11] is True
