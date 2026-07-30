"""Production event-loop timing capability tests."""

from __future__ import annotations

import asyncio
from typing import cast

import pytest
from lumina.worker.timing import EventLoopExecutionTiming, ExecutionTask


@pytest.mark.asyncio
async def test_monotonic_uses_running_event_loop_clock() -> None:
    timing = EventLoopExecutionTiming()
    loop = asyncio.get_running_loop()

    assert abs(timing.monotonic() - loop.time()) < 0.1


@pytest.mark.asyncio
async def test_past_sleep_deadline_returns_and_wait_observes_completed_task() -> None:
    timing = EventLoopExecutionTiming()
    await timing.sleep_until(timing.monotonic() - 1)
    task = cast(ExecutionTask, asyncio.create_task(_result()))

    done = await timing.wait_first((task,), deadline=timing.monotonic() + 1)
    settled = await timing.settle((task,), deadline=timing.monotonic() + 1)

    assert task in done
    assert task in settled
    assert task.result() == {}


@pytest.mark.asyncio
async def test_settlement_deadline_does_not_cancel_pending_task() -> None:
    timing = EventLoopExecutionTiming()
    release = asyncio.Event()
    task = cast(ExecutionTask, asyncio.create_task(release.wait()))

    settled = await timing.settle((task,), deadline=timing.monotonic() - 1)

    assert settled == frozenset()
    assert not task.done()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


async def _result() -> object:
    return {}
