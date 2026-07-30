"""Exactly-once hard termination for settlement-unknown worker tasks."""

from __future__ import annotations

import asyncio
import os
from collections.abc import Callable, Coroutine
from contextlib import suppress
from typing import Any, NoReturn, Protocol

from lumina.worker.output import ProcessOutput


class ProcessTerminator(Protocol):
    """Narrow process hard-exit capability."""

    def terminate(self, status: int) -> NoReturn:
        """Terminate immediately without ordinary async-runner shutdown."""
        ...


class OsProcessTerminator:
    """Production hard terminator used only after settlement is unknown."""

    def terminate(self, status: int) -> NoReturn:
        """Use the only authorized process hard-exit operation."""
        del status
        os._exit(1)


class TerminatorReturned(RuntimeError):
    """Sentinel preventing a faulty injected terminator from being called twice."""

    def __init__(self) -> None:
        super().__init__("Worker process terminator returned.")


class HardTerminationCoordinator:
    """Bound fatal output/cleanup, then invoke one terminator exactly once."""

    def __init__(
        self,
        *,
        output: ProcessOutput,
        terminator: ProcessTerminator,
        cancellation_grace_seconds: int,
        cleanup: Callable[[float], Coroutine[Any, Any, None]],
        monotonic: Callable[[], float] | None = None,
    ) -> None:
        if type(cancellation_grace_seconds) is not int or not 1 <= cancellation_grace_seconds <= 60:
            raise ValueError("Worker termination configuration is invalid.")
        self._output = output
        self._terminator = terminator
        self._grace_seconds = cancellation_grace_seconds
        self._cleanup = cleanup
        self._monotonic = monotonic
        self._invoked = False

    async def terminate(self, event: bytes | None) -> NoReturn:
        """Freeze normal work, bound all remaining work, and hard-exit once."""
        if self._invoked:
            raise TerminatorReturned()
        self._invoked = True
        loop = asyncio.get_running_loop()
        now = self._monotonic() if self._monotonic is not None else loop.time()
        deadline = now + self._grace_seconds
        try:
            if event is not None:
                output_deadline = now + self._grace_seconds / 4
                await _start_and_settle_bounded(
                    self._output.write_stderr(event, deadline=output_deadline),
                    name="lumina.worker.fatal-output",
                    deadline=output_deadline,
                )
            await _start_and_settle_bounded(
                self._cleanup(deadline),
                name="lumina.worker.fatal-cleanup",
                deadline=deadline,
            )
        except BaseException:
            pass
        finally:
            self._terminator.terminate(1)
            raise TerminatorReturned()

    def __repr__(self) -> str:
        return "HardTerminationCoordinator(<redacted>)"


async def _start_and_settle_bounded(
    awaitable: Coroutine[Any, Any, None],
    *,
    name: str,
    deadline: float,
) -> None:
    task: asyncio.Task[None] | None = None
    try:
        task = asyncio.create_task(awaitable, name=name)
    except BaseException:
        awaitable.close()
        raise
    await _settle_bounded(task, deadline=deadline)


async def _settle_bounded(task: asyncio.Task[None], *, deadline: float) -> None:
    try:
        remaining = max(0.0, deadline - asyncio.get_running_loop().time())
        done, _ = await asyncio.wait((task,), timeout=remaining)
    except BaseException:
        if not task.done():
            task.cancel()
        if task.done():
            _consume_task(task)
        else:
            task.add_done_callback(_consume_task)
        raise
    if task in done:
        _consume_task(task)
        return
    if not task.done():
        task.cancel()
        task.add_done_callback(_consume_task)
        return
    _consume_task(task)


def _consume_task(task: asyncio.Task[object]) -> None:
    if not task.done():
        return
    with suppress(BaseException):
        task.exception()
