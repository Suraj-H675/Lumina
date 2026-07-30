"""Exactly-once hard-termination coordination tests."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Iterable
from typing import NoReturn, Protocol, cast

import pytest
from lumina.worker.output import HANDLER_SETTLEMENT_UNKNOWN
from lumina.worker.termination import (
    HardTerminationCoordinator,
    ProcessTerminator,
    TerminatorReturned,
)


class _TaskDiagnostics(Protocol):
    _log_traceback: bool


class OutputSpy:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.stderr: list[bytes] = []

    def activate(self) -> None:
        pass

    async def write_stdout(self, data: bytes, *, deadline: float) -> None:
        del data, deadline

    async def write_stderr(self, data: bytes, *, deadline: float) -> None:
        del deadline
        self.stderr.append(data)
        if self.fail:
            raise RuntimeError("private")

    def restore(self) -> None:
        pass


class TerminatorSpy:
    def __init__(self) -> None:
        self.calls: list[int] = []

    def terminate(self, status: int) -> NoReturn:
        self.calls.append(status)
        raise TerminatorReturned()


class ReturningTerminatorSpy:
    def __init__(self) -> None:
        self.calls: list[int] = []

    def terminate(self, status: int) -> None:
        self.calls.append(status)


@pytest.mark.asyncio
@pytest.mark.parametrize("output_fails", [False, True])
async def test_fatal_output_cannot_prevent_exactly_once_termination(
    output_fails: bool,
) -> None:
    output = OutputSpy(fail=output_fails)
    terminator = TerminatorSpy()
    cleanup_calls = 0

    async def cleanup(deadline: float) -> None:
        nonlocal cleanup_calls
        assert deadline > 0
        cleanup_calls += 1
        raise RuntimeError("private")

    coordinator = HardTerminationCoordinator(
        output=output,
        terminator=terminator,
        cancellation_grace_seconds=1,
        cleanup=cleanup,
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(HANDLER_SETTLEMENT_UNKNOWN)
    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(HANDLER_SETTLEMENT_UNKNOWN)

    assert output.stderr == [HANDLER_SETTLEMENT_UNKNOWN]
    assert cleanup_calls == 1
    assert terminator.calls == [1]


@pytest.mark.asyncio
@pytest.mark.parametrize("outcome", ["success", "exception", "cancellation"])
async def test_settled_cleanup_outcomes_all_terminate_once(outcome: str) -> None:
    terminator = TerminatorSpy()

    async def cleanup(deadline: float) -> None:
        assert deadline > 0
        if outcome == "exception":
            raise RuntimeError("private")
        if outcome == "cancellation":
            raise asyncio.CancelledError()

    coordinator = HardTerminationCoordinator(
        output=OutputSpy(),
        terminator=terminator,
        cancellation_grace_seconds=1,
        cleanup=cleanup,
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(None)

    assert terminator.calls == [1]


@pytest.mark.asyncio
async def test_uncooperative_cleanup_cannot_block_termination_and_is_consumed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_tasks: list[asyncio.Task[None]] = []
    cancellation_seen = asyncio.Event()
    release = asyncio.Event()
    terminator = TerminatorSpy()

    async def cleanup(deadline: float) -> None:
        del deadline
        task = asyncio.current_task()
        assert task is not None
        cleanup_tasks.append(task)
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancellation_seen.set()
            await release.wait()
            raise RuntimeError("eventual-private") from None

    async def timeout_without_cancellation_settlement(
        tasks: set[asyncio.Task[None]] | tuple[asyncio.Task[None], ...],
        *,
        timeout: float | None = None,
        return_when: str = asyncio.ALL_COMPLETED,
    ) -> tuple[set[asyncio.Task[None]], set[asyncio.Task[None]]]:
        del timeout, return_when
        await asyncio.sleep(0)
        task_set = set(tasks)
        return set(), task_set

    monkeypatch.setattr(
        "lumina.worker.termination.asyncio.wait",
        timeout_without_cancellation_settlement,
    )
    coordinator = HardTerminationCoordinator(
        output=OutputSpy(),
        terminator=terminator,
        cancellation_grace_seconds=1,
        cleanup=cleanup,
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(None)

    await cancellation_seen.wait()
    assert terminator.calls == [1]
    assert len(cleanup_tasks) == 1
    assert cleanup_tasks[0].cancelling() == 1

    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert cleanup_tasks[0].done()
    assert cast(_TaskDiagnostics, cleanup_tasks[0])._log_traceback is False


@pytest.mark.asyncio
async def test_cleanup_observation_failure_still_terminates_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleanup_task: asyncio.Task[None] | None = None
    release = asyncio.Event()
    terminator = TerminatorSpy()

    async def cleanup(deadline: float) -> None:
        nonlocal cleanup_task
        del deadline
        task = asyncio.current_task()
        assert task is not None
        cleanup_task = task
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            await release.wait()

    async def fail_observation(
        tasks: object,
        *,
        timeout: float | None = None,
        return_when: str = asyncio.ALL_COMPLETED,
    ) -> object:
        del tasks, timeout, return_when
        await asyncio.sleep(0)
        raise RuntimeError("private-observer")

    monkeypatch.setattr(
        "lumina.worker.termination.asyncio.wait",
        fail_observation,
    )
    coordinator = HardTerminationCoordinator(
        output=OutputSpy(),
        terminator=terminator,
        cancellation_grace_seconds=1,
        cleanup=cleanup,
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(None)

    assert cleanup_task is not None
    assert cleanup_task.cancelling() == 1
    assert terminator.calls == [1]
    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_cleanup_task_creation_failure_still_terminates_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    terminator = TerminatorSpy()
    cleanup_entered = False

    async def cleanup(deadline: float) -> None:
        nonlocal cleanup_entered
        del deadline
        cleanup_entered = True

    def fail_task_creation(
        coroutine: Awaitable[None],
        *,
        name: str | None = None,
    ) -> asyncio.Task[None]:
        del coroutine, name
        raise RuntimeError("private-create")

    monkeypatch.setattr(
        "lumina.worker.termination.asyncio.create_task",
        fail_task_creation,
    )
    coordinator = HardTerminationCoordinator(
        output=OutputSpy(),
        terminator=terminator,
        cancellation_grace_seconds=1,
        cleanup=cleanup,
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(None)

    assert cleanup_entered is False
    assert terminator.calls == [1]


@pytest.mark.asyncio
async def test_fatal_output_failure_and_uncooperative_cleanup_still_terminate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    release = asyncio.Event()
    cleanup_task: asyncio.Task[None] | None = None
    output = OutputSpy(fail=True)
    terminator = TerminatorSpy()

    async def cleanup(deadline: float) -> None:
        nonlocal cleanup_task
        del deadline
        task = asyncio.current_task()
        assert task is not None
        cleanup_task = task
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            await release.wait()

    real_wait = asyncio.wait

    async def observe_output_but_not_cleanup(
        tasks: Iterable[asyncio.Task[None]],
        *,
        timeout: float | None = None,
        return_when: str = asyncio.ALL_COMPLETED,
    ) -> object:
        task = next(iter(tasks))
        if task.get_name() == "lumina.worker.fatal-output":
            return await real_wait(
                (task,),
                timeout=timeout,
                return_when=return_when,
            )
        await asyncio.sleep(0)
        return set(), {task}

    monkeypatch.setattr(
        "lumina.worker.termination.asyncio.wait",
        observe_output_but_not_cleanup,
    )
    coordinator = HardTerminationCoordinator(
        output=output,
        terminator=terminator,
        cancellation_grace_seconds=1,
        cleanup=cleanup,
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(HANDLER_SETTLEMENT_UNKNOWN)

    assert output.stderr == [HANDLER_SETTLEMENT_UNKNOWN]
    assert cleanup_task is not None
    assert cleanup_task.cancelling() == 1
    assert terminator.calls == [1]
    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_returning_terminator_enters_sentinel_path_without_second_call() -> None:
    terminator = ReturningTerminatorSpy()
    coordinator = HardTerminationCoordinator(
        output=OutputSpy(),
        terminator=cast(ProcessTerminator, terminator),
        cancellation_grace_seconds=1,
        cleanup=lambda deadline: _successful_cleanup(deadline),
    )

    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(None)
    with pytest.raises(TerminatorReturned):
        await coordinator.terminate(None)

    assert terminator.calls == [1]


async def _successful_cleanup(deadline: float) -> None:
    assert deadline > 0
