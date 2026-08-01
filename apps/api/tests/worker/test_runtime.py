"""Event-controlled worker scheduler and shutdown-linearization tests."""

from __future__ import annotations

import asyncio
import gc
import threading
import weakref
from collections.abc import Coroutine, Iterable
from datetime import UTC, datetime
from typing import NoReturn, Protocol, cast
from uuid import UUID

import pytest
from lumina.jobs.application.execution import (
    ExecuteOneJobService,
    JobHandlerSettlementUnknown,
    JobHeartbeatSettlementUnknown,
    JobProcessed,
    NoJobExecuted,
)
from lumina.jobs.domain.completion import SuccessfulJobCompletion
from lumina.jobs.domain.failure import FailureReason, RetryScheduled
from lumina.jobs.domain.handler import JobHandler
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
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
    ObservedCompletion,
    ObservedFailure,
    RuntimeExecutionObserver,
    ShutdownAwareClaim,
    ShutdownAwareRegistry,
    WorkerRuntime,
)
from lumina.worker.termination import TerminatorReturned
from lumina.worker.timing import ExecutionTask

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


class ScriptedSchedulerTiming:
    """Release each absolute scheduler deadline explicitly from the test."""

    def __init__(self) -> None:
        self.now = 0.0
        self.deadlines: list[float] = []
        self.releases: list[asyncio.Event] = []
        self._changed = asyncio.Condition()

    def monotonic(self) -> float:
        return self.now

    async def sleep_until(self, deadline: float) -> None:
        release = asyncio.Event()
        async with self._changed:
            self.deadlines.append(deadline)
            self.releases.append(release)
            self._changed.notify_all()
        await release.wait()
        self.now = deadline

    async def wait_for_wait(self, count: int) -> None:
        async with self._changed:
            await self._changed.wait_for(lambda: len(self.releases) >= count)

    def release(self, index: int) -> None:
        self.releases[index].set()


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


@pytest.mark.parametrize(
    ("stale_seconds", "expected_cadence"),
    [(2, 1), (10, 5), (120, 60), (122, 60), (86_400, 60)],
)
def test_recovery_cadence_clamps_complete_valid_domain(
    stale_seconds: int,
    expected_cadence: int,
) -> None:
    recovery = RecordingRecovery([])
    runtime = WorkerRuntime(
        recovery=recovery,
        executor=OneNoJob(),
        shutdown_event=asyncio.Event(),
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=stale_seconds,
        cancellation_grace_seconds=1,
    )

    assert runtime.recovery_cadence_seconds == expected_cadence


@pytest.mark.asyncio
async def test_recovery_and_poll_deadlines_are_exact_and_recovery_does_not_burst() -> None:
    shutdown = asyncio.Event()
    timing = ScriptedSchedulerTiming()

    class CadencedRecovery:
        def __init__(self) -> None:
            self.calls = 0
            self.due_started = asyncio.Event()
            self.release_due = asyncio.Event()
            self.third_started = asyncio.Event()

        async def recover(self) -> RecoverStaleJobsResult:
            self.calls += 1
            if self.calls == 2:
                self.due_started.set()
                await self.release_due.wait()
            if self.calls == 3:
                self.third_started.set()
            return RecoverStaleJobsResult(requeued_count=0, dead_lettered_count=0)

    class NoJob:
        def __init__(self) -> None:
            self.calls = 0

        async def execute(self) -> NoJobExecuted | JobProcessed:
            self.calls += 1
            if self.calls == 7:
                shutdown.set()
                return JobProcessed()
            return NoJobExecuted()

    recovery = CadencedRecovery()
    executor = NoJob()
    runtime = WorkerRuntime(
        recovery=recovery,
        executor=executor,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=10,
        cancellation_grace_seconds=1,
        timing=timing,
    )

    task = asyncio.create_task(runtime.run())
    await timing.wait_for_wait(1)
    assert timing.deadlines == [2]
    timing.release(0)

    await timing.wait_for_wait(2)
    assert timing.deadlines == [2, 4]
    timing.release(1)

    await timing.wait_for_wait(3)
    assert timing.deadlines == [2, 4, 5]
    timing.release(2)
    await recovery.due_started.wait()

    timing.now = 27
    assert recovery.calls == 2
    recovery.release_due.set()

    await timing.wait_for_wait(4)
    assert timing.deadlines == [2, 4, 5, 29]
    timing.release(3)
    await timing.wait_for_wait(5)
    assert timing.deadlines == [2, 4, 5, 29, 31]
    timing.release(4)
    await timing.wait_for_wait(6)
    assert timing.deadlines == [2, 4, 5, 29, 31, 32]
    assert recovery.calls == 2
    timing.release(5)
    await recovery.third_started.wait()
    await timing.wait_for_wait(7)
    assert timing.deadlines == [2, 4, 5, 29, 31, 32, 33]
    timing.release(6)

    assert runtime.recovery_cadence_seconds == 5
    assert recovery.calls == 3

    assert await task == 0
    assert executor.calls == 7
    assert timing.now == 33


class _ThreadSafeShutdownEvent:
    """An asyncio-compatible event whose synchronous test trigger is thread-safe."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._thread_event = threading.Event()
        self._async_event = asyncio.Event()

    def is_set(self) -> bool:
        return self._thread_event.is_set()

    def set(self) -> None:
        if self._thread_event.is_set():
            return
        self._thread_event.set()
        self._loop.call_soon_threadsafe(self._async_event.set)

    async def wait(self) -> None:
        await self._async_event.wait()


class _BoundaryClaim:
    def __init__(self, *, block: bool = False) -> None:
        self.block = block
        self.calls = 0
        self.cancellations = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def claim(self, *, claimed_by: str) -> ClaimedJob:
        del claimed_by
        self.calls += 1
        self.started.set()
        if self.block:
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                self.cancellations += 1
                raise
        return _claimed()


class _BoundaryHeartbeat:
    def __init__(self) -> None:
        self.calls = 0
        self.cancellations = 0

    async def heartbeat(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
    ) -> object:
        del job_id, owner, expected_attempt
        self.calls += 1
        return object()


class _BoundaryRegistry:
    def __init__(
        self,
        *,
        observer: RuntimeExecutionObserver,
        shutdown: asyncio.Event | _ThreadSafeShutdownEvent,
        block_resolution: bool = False,
        shutdown_before_handler: bool = False,
    ) -> None:
        self.observer = observer
        self.shutdown = shutdown
        self.block_resolution = block_resolution
        self.shutdown_before_handler = shutdown_before_handler
        self.resolve_started = threading.Event()
        self.resolve_release = threading.Event()
        self.phase_at_resolution: ExecutionPhase | None = None
        self.handler = _BoundaryHandler()

    def resolve(self, job_type: PersistedJobTypeName) -> JobHandler:
        del job_type
        self.phase_at_resolution = self.observer.phase
        self.resolve_started.set()
        if self.block_resolution:
            self.resolve_release.wait()
        if self.shutdown_before_handler:
            asyncio.get_running_loop().call_soon(self.shutdown.set)
        return self.handler

    def validate_payload(
        self,
        job_type: PersistedJobTypeName,
        payload: PersistedJobPayload,
    ) -> None:
        del job_type, payload


class _BoundaryHandler:
    def __init__(self, *, block: bool = False) -> None:
        self.block = block
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancellations = 0
        self.construction_count = 0
        self.body_started_count = 0
        self.live_coroutine_count = 0

    def handle(self, payload: PersistedJobPayload) -> Coroutine[object, object, object]:
        del payload
        self.construction_count += 1

        async def run() -> object:
            self.body_started_count += 1
            self.started.set()
            if self.block:
                try:
                    await self.release.wait()
                except asyncio.CancelledError:
                    self.cancellations += 1
                    raise
            return {}

        coroutine = run()
        self.live_coroutine_count += 1
        weakref.finalize(coroutine, self._coroutine_finalized)
        return coroutine

    def _coroutine_finalized(self) -> None:
        self.live_coroutine_count -= 1


class _BoundaryCompletion:
    def __init__(self, *, block: bool = False) -> None:
        self.block = block
        self.calls = 0
        self.cancellations = 0
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def complete(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        result: object,
    ) -> SuccessfulJobCompletion:
        del owner, expected_attempt, result
        self.calls += 1
        self.started.set()
        if self.block:
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                self.cancellations += 1
                raise
        return SuccessfulJobCompletion(job_id=job_id, completed_at=_NOW)


class _BoundaryFailure:
    def __init__(self, *, block: bool = False) -> None:
        self.block = block
        self.calls = 0
        self.cancellations = 0
        self.reasons: list[FailureReason] = []
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def fail(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        reason: FailureReason,
    ) -> RetryScheduled:
        del owner
        self.calls += 1
        self.reasons.append(reason)
        self.started.set()
        if self.block:
            try:
                await self.release.wait()
            except asyncio.CancelledError:
                self.cancellations += 1
                raise
        return RetryScheduled(
            job_id=job_id,
            expected_attempt=ExpectedJobAttempt(expected_attempt),
            available_at=_NOW,
        )


class _BoundaryExecutionTiming:
    def __init__(self, *, block_settlement: bool = False) -> None:
        self.now = 0.0
        self.block_settlement = block_settlement
        self.wait_first_cancellations = 0
        self.settle_cancellations = 0
        self.settle_started = asyncio.Event()
        self.settle_release = asyncio.Event()

    def monotonic(self) -> float:
        return self.now

    async def sleep_until(self, deadline: float) -> None:
        del deadline
        await asyncio.Event().wait()

    async def wait_first(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        del deadline
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        except asyncio.CancelledError:
            self.wait_first_cancellations += 1
            raise
        return frozenset(done)

    async def settle(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        del deadline
        if self.block_settlement:
            self.settle_started.set()
            try:
                await self.settle_release.wait()
            except asyncio.CancelledError:
                self.settle_cancellations += 1
                raise
        done, _ = await asyncio.wait(tasks, return_when=asyncio.ALL_COMPLETED)
        return frozenset(done)


def _boundary_executor(
    *,
    shutdown: asyncio.Event | _ThreadSafeShutdownEvent,
    observer: RuntimeExecutionObserver,
    claim: _BoundaryClaim,
    registry: _BoundaryRegistry,
    heartbeat: _BoundaryHeartbeat,
    completion: _BoundaryCompletion,
    failure: _BoundaryFailure,
    timing: _BoundaryExecutionTiming,
) -> ExecuteOneJobService:
    observed_failure = ObservedFailure(failure, observer)
    return ExecuteOneJobService(
        owner=JobOwnerToken("worker.fixture"),
        registry=ShutdownAwareRegistry(
            registry,
            shutdown_event=cast(asyncio.Event, shutdown),
            observer=observer,
        ),
        claim=ShutdownAwareClaim(
            claim,
            heartbeat=heartbeat,
            failure=observed_failure,
            shutdown_event=cast(asyncio.Event, shutdown),
            observer=observer,
        ),
        heartbeat=heartbeat,
        completion=ObservedCompletion(completion, observer),
        failure=observed_failure,
        heartbeat_seconds=30,
        handler_timeout_seconds=30,
        cancellation_grace_seconds=1,
        timing=timing,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "boundary",
    [
        "claim",
        "resolution",
        "pre_handler",
        "handler",
        "post_handler",
        "terminal",
        "terminal_failure",
    ],
)
async def test_shutdown_settles_real_execution_boundaries(
    boundary: str,
    recwarn: pytest.WarningsRecorder,
) -> None:
    loop = asyncio.get_running_loop()
    shutdown: asyncio.Event | _ThreadSafeShutdownEvent = (
        _ThreadSafeShutdownEvent(loop) if boundary == "resolution" else asyncio.Event()
    )
    observer = RuntimeExecutionObserver()
    claim = _BoundaryClaim(block=boundary == "claim")
    registry = _BoundaryRegistry(
        observer=observer,
        shutdown=shutdown,
        block_resolution=boundary == "resolution",
        shutdown_before_handler=boundary in {"pre_handler", "terminal_failure"},
    )
    registry.handler.block = boundary == "handler"
    heartbeat = _BoundaryHeartbeat()
    completion = _BoundaryCompletion(block=boundary == "terminal")
    failure = _BoundaryFailure(block=boundary == "terminal_failure")
    timing = _BoundaryExecutionTiming(block_settlement=boundary == "post_handler")
    executor = _boundary_executor(
        shutdown=shutdown,
        observer=observer,
        claim=claim,
        registry=registry,
        heartbeat=heartbeat,
        completion=completion,
        failure=failure,
        timing=timing,
    )
    resolution_trigger: threading.Thread | None = None
    resolution_finished = threading.Event()
    if boundary == "resolution":

        def release_resolution() -> None:
            try:
                registry.resolve_started.wait()
                shutdown.set()
                registry.resolve_release.set()
            finally:
                resolution_finished.set()

        resolution_trigger = threading.Thread(target=release_resolution)
        resolution_trigger.start()

    recovery = RecordingRecovery([])
    runtime = WorkerRuntime(
        recovery=recovery,
        executor=executor,
        shutdown_event=cast(asyncio.Event, shutdown),
        observer=observer,
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
        timing=ScriptedSchedulerTiming(),
    )
    task = asyncio.create_task(runtime.run())
    if boundary == "claim":
        await claim.started.wait()
        assert observer.phase is ExecutionPhase.CLAIMING
        shutdown.set()
        claim.release.set()
    elif boundary == "resolution" or boundary == "pre_handler":
        await asyncio.to_thread(registry.resolve_started.wait)
    elif boundary == "handler":
        await registry.handler.started.wait()
        assert observer.phase is ExecutionPhase.HANDLER_ACTIVE
        shutdown.set()
    elif boundary == "post_handler":
        await timing.settle_started.wait()
        assert observer.phase is ExecutionPhase.POST_HANDLER
        shutdown.set()
        timing.settle_release.set()
    elif boundary == "terminal_failure":
        await failure.started.wait()
        assert observer.phase is ExecutionPhase.TERMINAL_SETTLEMENT
        shutdown.set()
        failure.release.set()
    else:
        await completion.started.wait()
        assert observer.phase is ExecutionPhase.TERMINAL_SETTLEMENT
        shutdown.set()
        completion.release.set()

    assert await task == 0
    if resolution_trigger is not None:
        await asyncio.to_thread(resolution_finished.wait)
        resolution_trigger.join()
    gc.collect()

    assert claim.calls == 1
    assert recovery.calls == 1
    assert claim.cancellations == 0
    if boundary != "claim":
        assert registry.phase_at_resolution is ExecutionPhase.PRE_HANDLER
    assert heartbeat.cancellations == 0
    assert timing.settle_cancellations == 0
    assert timing.wait_first_cancellations == (1 if boundary == "handler" else 0)
    handler_started = boundary in {"handler", "post_handler", "terminal"}
    assert registry.handler.started.is_set() is handler_started
    expected_handler_calls = 1 if handler_started else 0
    assert registry.handler.construction_count == expected_handler_calls
    assert registry.handler.body_started_count == expected_handler_calls
    assert registry.handler.live_coroutine_count == 0
    assert registry.handler.cancellations == (1 if boundary == "handler" else 0)
    assert completion.cancellations == 0
    assert failure.cancellations == 0
    if boundary in {"claim", "resolution", "pre_handler", "handler", "terminal_failure"}:
        assert failure.reasons == [FailureReason.HANDLER_CANCELLED]
        assert completion.calls == 0
    else:
        assert failure.calls == 0
        assert completion.calls == 1
    assert not any(
        issubclass(warning.category, RuntimeWarning) and "was never awaited" in str(warning.message)
        for warning in recwarn
    )


@pytest.mark.asyncio
async def test_due_recovery_waits_for_execution_and_precedes_next_execution() -> None:
    shutdown = asyncio.Event()
    timing = ScriptedSchedulerTiming()
    events: list[str] = []
    active_operations = 0
    recovery_due = asyncio.Event()
    release_recovery = asyncio.Event()
    execution_started = asyncio.Event()
    release_execution = asyncio.Event()
    next_execution_started = asyncio.Event()

    class OrderedRecovery:
        def __init__(self) -> None:
            self.calls = 0

        async def recover(self) -> RecoverStaleJobsResult:
            nonlocal active_operations
            assert active_operations == 0
            active_operations += 1
            self.calls += 1
            events.append("recovery.begin")
            if self.calls == 2:
                recovery_due.set()
                await release_recovery.wait()
            events.append("recovery.end")
            active_operations -= 1
            return RecoverStaleJobsResult(requeued_count=0, dead_lettered_count=0)

    class OrderedExecutor:
        def __init__(self) -> None:
            self.calls = 0

        async def execute(self) -> JobProcessed:
            nonlocal active_operations
            assert active_operations == 0
            active_operations += 1
            self.calls += 1
            events.append("execution.begin" if self.calls == 1 else "next_execution.begin")
            if self.calls == 1:
                execution_started.set()
                await release_execution.wait()
                events.append("execution.end")
            else:
                next_execution_started.set()
                shutdown.set()
            active_operations -= 1
            return JobProcessed()

    recovery = OrderedRecovery()
    executor = OrderedExecutor()
    runtime = WorkerRuntime(
        recovery=recovery,
        executor=executor,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=10,
        cancellation_grace_seconds=1,
        timing=timing,
    )

    task = asyncio.create_task(runtime.run())
    await execution_started.wait()
    timing.now = 6
    assert recovery.calls == 1
    assert events == ["recovery.begin", "recovery.end", "execution.begin"]
    assert active_operations == 1

    release_execution.set()
    await recovery_due.wait()
    assert events == [
        "recovery.begin",
        "recovery.end",
        "execution.begin",
        "execution.end",
        "recovery.begin",
    ]
    assert active_operations == 1
    assert not next_execution_started.is_set()

    release_recovery.set()
    await next_execution_started.wait()
    assert events == [
        "recovery.begin",
        "recovery.end",
        "execution.begin",
        "execution.end",
        "recovery.begin",
        "recovery.end",
        "next_execution.begin",
    ]
    assert active_operations == 0
    assert await task == 0


@pytest.mark.asyncio
async def test_shutdown_waits_for_inflight_recovery_before_claiming() -> None:
    shutdown = asyncio.Event()
    started = asyncio.Event()
    release = asyncio.Event()

    class BlockingRecovery:
        def __init__(self) -> None:
            self.calls = 0
            self.cancellations = 0

        async def recover(self) -> RecoverStaleJobsResult:
            self.calls += 1
            started.set()
            try:
                await release.wait()
            except asyncio.CancelledError:
                self.cancellations += 1
                raise
            return RecoverStaleJobsResult(requeued_count=0, dead_lettered_count=0)

    class ForbiddenExecutor:
        def __init__(self) -> None:
            self.calls = 0

        async def execute(self) -> NoJobExecuted:
            self.calls += 1
            raise AssertionError("claim must not start after shutdown")

    recovery = BlockingRecovery()
    executor = ForbiddenExecutor()
    runtime = WorkerRuntime(
        recovery=recovery,
        executor=executor,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
        fatal_termination=FatalSpy(),
        poll_seconds=2,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )

    task = asyncio.create_task(runtime.run())
    await started.wait()
    shutdown.set()
    release.set()

    assert await task == 0
    assert recovery.calls == 1
    assert recovery.cancellations == 0
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
