"""Event-controlled worker scheduler and shutdown-linearization tests."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import NoReturn, Protocol, cast
from uuid import UUID

import pytest
from lumina.jobs.application.execution import (
    JobHandlerSettlementUnknown,
    JobHeartbeatSettlementUnknown,
    JobProcessed,
    NoJobExecuted,
)
from lumina.jobs.domain.failure import FailureReason, RetryScheduled
from lumina.jobs.domain.heartbeat import JobOwnershipLost
from lumina.jobs.domain.models import (
    ClaimedJob,
    ExpectedJobAttempt,
    NoEligibleJob,
    PersistedJobTypeName,
)
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.jobs.domain.recovery import RecoverStaleJobsResult
from lumina.worker.output import HANDLER_SETTLEMENT_UNKNOWN, HEARTBEAT_SETTLEMENT_UNKNOWN
from lumina.worker.runtime import (
    ExecutionPhase,
    HandlerStartGate,
    RuntimeExecutionObserver,
    ShutdownAwareClaim,
    WorkerRuntime,
)
from lumina.worker.termination import TerminatorReturned

_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
_NOW = datetime(2026, 7, 30, 12, tzinfo=UTC)


class _TaskDiagnostics(Protocol):
    _log_traceback: bool


def _claimed() -> ClaimedJob:
    return ClaimedJob(
        id=_ID,
        job_type=PersistedJobTypeName("system.noop"),
        payload=PersistedJobPayload.from_decoded({}),
        attempts=1,
        max_attempts=5,
        claimed_at=_NOW,
        heartbeat_at=_NOW,
    )


class FatalSpy:
    def __init__(self) -> None:
        self.events: list[bytes | None] = []

    async def terminate(self, event: bytes | None) -> NoReturn:
        self.events.append(event)
        raise TerminatorReturned()


class RecordingRecovery:
    def __init__(self, events: list[str], *, fail: bool = False) -> None:
        self.events = events
        self.fail = fail
        self.calls = 0

    async def recover(self) -> RecoverStaleJobsResult:
        self.calls += 1
        self.events.append("recover")
        if self.fail:
            raise RuntimeError("private")
        return RecoverStaleJobsResult(requeued_count=0, dead_lettered_count=0)


class StopAfterProcessed:
    def __init__(self, events: list[str], shutdown: asyncio.Event) -> None:
        self.events = events
        self.shutdown = shutdown
        self.calls = 0

    async def execute(self) -> JobProcessed:
        self.calls += 1
        self.events.append("execute")
        self.shutdown.set()
        return JobProcessed()


@pytest.mark.asyncio
async def test_initial_recovery_precedes_first_claim_and_no_second_claim() -> None:
    events: list[str] = []
    shutdown = asyncio.Event()
    executor = StopAfterProcessed(events, shutdown)
    runtime = WorkerRuntime(
        recovery=RecordingRecovery(events),
        executor=executor,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )

    assert await runtime.run() == 0
    assert events == ["recover", "execute"]
    assert executor.calls == 1
    assert runtime.recovery_cadence_seconds == 60


@pytest.mark.asyncio
async def test_recovery_failure_prevents_claim() -> None:
    events: list[str] = []
    shutdown = asyncio.Event()
    executor = StopAfterProcessed(events, shutdown)
    runtime = WorkerRuntime(
        recovery=RecordingRecovery(events, fail=True),
        executor=executor,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=30,
        cancellation_grace_seconds=1,
    )

    assert await runtime.run() == 1
    assert events == ["recover"]
    assert executor.calls == 0


@pytest.mark.asyncio
async def test_executor_failure_prohibits_a_second_claim() -> None:
    calls = 0

    class FailedExecutor:
        async def execute(self) -> JobProcessed:
            nonlocal calls
            calls += 1
            raise RuntimeError("private")

    runtime = WorkerRuntime(
        recovery=RecordingRecovery([]),
        executor=FailedExecutor(),
        shutdown_event=asyncio.Event(),
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )

    assert await runtime.run() == 1
    assert calls == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "event"),
    [
        (JobHandlerSettlementUnknown, HANDLER_SETTLEMENT_UNKNOWN),
        (JobHeartbeatSettlementUnknown, HEARTBEAT_SETTLEMENT_UNKNOWN),
    ],
)
async def test_settlement_unknown_uses_exact_hard_termination_event(
    failure: type[RuntimeError],
    event: bytes,
) -> None:
    fatal = FatalSpy()

    class UnknownExecutor:
        async def execute(self) -> JobProcessed:
            raise failure()

    runtime = WorkerRuntime(
        recovery=RecordingRecovery([]),
        executor=UnknownExecutor(),
        shutdown_event=asyncio.Event(),
        observer=RuntimeExecutionObserver(),
        fatal_termination=fatal,
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )

    with pytest.raises(TerminatorReturned):
        await runtime.run()
    assert fatal.events == [event]


@pytest.mark.asyncio
async def test_idle_no_job_wait_is_immediately_interruptible() -> None:
    shutdown = asyncio.Event()
    called = asyncio.Event()

    class NoJob:
        async def execute(self) -> NoJobExecuted:
            called.set()
            return NoJobExecuted()

    runtime = WorkerRuntime(
        recovery=RecordingRecovery([]),
        executor=NoJob(),
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=60,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )
    task = asyncio.create_task(runtime.run())
    await called.wait()
    await asyncio.sleep(0)
    shutdown.set()

    assert await task == 0


def test_handler_start_gate_shutdown_wins_before_user_entry() -> None:
    shutdown = asyncio.Event()
    observer = RuntimeExecutionObserver()
    gate = HandlerStartGate(shutdown, observer)
    shutdown.set()

    with pytest.raises(asyncio.CancelledError):
        gate.try_enter()

    assert observer.phase is ExecutionPhase.SCHEDULING


def test_handler_start_gate_commits_active_synchronously() -> None:
    observer = RuntimeExecutionObserver()
    gate = HandlerStartGate(asyncio.Event(), observer)

    gate.try_enter()

    assert observer.phase is ExecutionPhase.HANDLER_ACTIVE


class ClaimAfterShutdown:
    def __init__(self, shutdown: asyncio.Event) -> None:
        self.shutdown = shutdown
        self.calls = 0

    async def claim(self, *, claimed_by: str) -> ClaimedJob:
        del claimed_by
        self.calls += 1
        self.shutdown.set()
        return _claimed()


class RecordingHeartbeat:
    def __init__(self, *, ownership_lost: bool = False) -> None:
        self.ownership_lost = ownership_lost
        self.calls: list[tuple[UUID, str, int]] = []

    async def heartbeat(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
    ) -> object:
        self.calls.append((job_id, owner, expected_attempt))
        if self.ownership_lost:
            raise JobOwnershipLost()
        return object()


class RecordingFailure:
    def __init__(self) -> None:
        self.calls: list[tuple[UUID, str, int, FailureReason]] = []

    async def fail(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        reason: FailureReason,
    ) -> RetryScheduled:
        self.calls.append((job_id, owner, expected_attempt, reason))
        return RetryScheduled(
            job_id=job_id,
            expected_attempt=ExpectedJobAttempt(expected_attempt),
            available_at=_NOW,
        )


@pytest.mark.asyncio
async def test_definite_claim_after_shutdown_heartbeats_then_cancels() -> None:
    shutdown = asyncio.Event()
    heartbeat = RecordingHeartbeat()
    failure = RecordingFailure()
    adapter = ShutdownAwareClaim(
        ClaimAfterShutdown(shutdown),
        heartbeat=heartbeat,
        failure=failure,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
    )

    outcome = await adapter.claim(claimed_by="worker.fixture")

    assert type(outcome) is NoEligibleJob
    assert heartbeat.calls == [(_ID, "worker.fixture", 1)]
    assert failure.calls == [(_ID, "worker.fixture", 1, FailureReason.HANDLER_CANCELLED)]


@pytest.mark.asyncio
async def test_claimed_after_shutdown_ownership_loss_suppresses_failure() -> None:
    shutdown = asyncio.Event()
    heartbeat = RecordingHeartbeat(ownership_lost=True)
    failure = RecordingFailure()
    adapter = ShutdownAwareClaim(
        ClaimAfterShutdown(shutdown),
        heartbeat=heartbeat,
        failure=failure,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
    )

    assert type(await adapter.claim(claimed_by="worker.fixture")) is NoEligibleJob
    assert len(heartbeat.calls) == 1
    assert failure.calls == []


@pytest.mark.asyncio
async def test_active_handler_shutdown_cancels_outer_executor_once() -> None:
    shutdown = asyncio.Event()
    observer = RuntimeExecutionObserver()
    active = asyncio.Event()
    cancellations = 0

    class ActiveExecutor:
        async def execute(self) -> JobProcessed:
            nonlocal cancellations
            observer.mark(ExecutionPhase.HANDLER_ACTIVE)
            active.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancellations += 1
                raise
            raise AssertionError("unreachable")

    runtime = WorkerRuntime(
        recovery=RecordingRecovery([]),
        executor=ActiveExecutor(),
        shutdown_event=shutdown,
        observer=observer,
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )
    task = asyncio.create_task(runtime.run())
    await active.wait()
    shutdown.set()

    assert await task == 0
    assert cancellations == 1


class ControlledSchedulerTiming:
    def __init__(self, *, raise_after_cancellation: bool = False) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.task: asyncio.Task[None] | None = None
        self.cancellations = 0
        self.raise_after_cancellation = raise_after_cancellation

    def monotonic(self) -> float:
        return 0

    async def sleep_until(self, deadline: float) -> None:
        assert deadline > 0
        self.task = asyncio.current_task()
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancellations += 1
            if self.raise_after_cancellation:
                raise RuntimeError("private-scheduler") from None
            raise


class SuppressingSchedulerTiming(ControlledSchedulerTiming):
    async def sleep_until(self, deadline: float) -> None:
        assert deadline > 0
        self.task = asyncio.current_task()
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancellations += 1
            await self.release.wait()
            raise RuntimeError("eventual-private-scheduler") from None


class OneNoJob:
    def __init__(self) -> None:
        self.calls = 0

    async def execute(self) -> NoJobExecuted:
        self.calls += 1
        return NoJobExecuted()


@pytest.mark.asyncio
async def test_cooperative_scheduler_wait_cancellation_settles_and_cleanup_continues() -> None:
    shutdown = asyncio.Event()
    timing = ControlledSchedulerTiming()
    fatal = FatalSpy()
    executor = OneNoJob()
    runtime = WorkerRuntime(
        recovery=RecordingRecovery([]),
        executor=executor,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=fatal,
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
        timing=timing,
    )
    task = asyncio.create_task(runtime.run())
    await timing.started.wait()

    shutdown.set()

    assert await task == 0
    assert timing.task is not None
    assert timing.task.done()
    assert timing.cancellations == 1
    assert executor.calls == 1
    assert fatal.events == []


@pytest.mark.asyncio
async def test_scheduler_wait_exception_after_cancellation_is_consumed() -> None:
    shutdown = asyncio.Event()
    timing = ControlledSchedulerTiming(raise_after_cancellation=True)
    fatal = FatalSpy()
    runtime = WorkerRuntime(
        recovery=RecordingRecovery([]),
        executor=OneNoJob(),
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=fatal,
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
        timing=timing,
    )
    task = asyncio.create_task(runtime.run())
    await timing.started.wait()

    shutdown.set()

    assert await task == 1
    assert timing.task is not None
    assert timing.task.done()
    assert timing.cancellations == 1
    assert cast(_TaskDiagnostics, timing.task)._log_traceback is False
    assert fatal.events == []


@pytest.mark.asyncio
async def test_uncooperative_scheduler_wait_hard_terminates_once_without_later_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shutdown = asyncio.Event()
    timing = SuppressingSchedulerTiming()
    fatal = FatalSpy()
    lifecycle: list[str] = []
    recovery = RecordingRecovery(lifecycle)

    class RecordingNoJob:
        async def execute(self) -> NoJobExecuted:
            lifecycle.append("execute")
            return NoJobExecuted()

    runtime = WorkerRuntime(
        recovery=recovery,
        executor=RecordingNoJob(),
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=fatal,
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
        timing=timing,
    )
    real_wait = asyncio.wait

    async def bounded_wait(
        tasks: Iterable[asyncio.Task[object]],
        *,
        timeout: float | None = None,
        return_when: str = asyncio.ALL_COMPLETED,
    ) -> object:
        task_set = set(tasks)
        if len(task_set) == 1 and next(iter(task_set)).get_name() == (
            "lumina.worker.scheduler-wait"
        ):
            await asyncio.sleep(0)
            return set(), task_set
        return await real_wait(
            task_set,
            timeout=timeout,
            return_when=return_when,
        )

    monkeypatch.setattr("lumina.worker.runtime.asyncio.wait", bounded_wait)
    task = asyncio.create_task(runtime.run())
    await timing.started.wait()

    shutdown.set()

    with pytest.raises(TerminatorReturned):
        await task
    assert fatal.events == [None]
    assert timing.task is not None
    assert timing.task.cancelling() == 1
    assert timing.cancellations == 1
    assert lifecycle == ["recover", "execute"]

    timing.release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert timing.task.done()
    assert cast(_TaskDiagnostics, timing.task)._log_traceback is False
