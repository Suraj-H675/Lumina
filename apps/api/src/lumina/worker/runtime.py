"""Sequential worker scheduling and shutdown/handler-start linearization."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from enum import Enum, auto
from typing import NoReturn, Protocol
from uuid import UUID

from lumina.jobs.application.execution import (
    ClaimOneJob,
    CompleteOneAttempt,
    ExecuteOneJobOutcome,
    FailOneAttempt,
    HeartbeatOneAttempt,
    JobHandlerSettlementUnknown,
    JobHeartbeatSettlementUnknown,
    JobProcessed,
    NoJobExecuted,
    ResolveStaticHandler,
)
from lumina.jobs.domain.completion import SuccessfulJobCompletion
from lumina.jobs.domain.failure import (
    FailJobOutcome,
    FailureReason,
    RetryScheduled,
    TerminalFailureRecorded,
)
from lumina.jobs.domain.handler import JobHandler
from lumina.jobs.domain.heartbeat import JobOwnershipLost
from lumina.jobs.domain.models import (
    ClaimedJob,
    ClaimJobOutcome,
    NoEligibleJob,
    PersistedJobTypeName,
)
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.jobs.domain.recovery import RecoverStaleJobsResult
from lumina.worker.output import HANDLER_SETTLEMENT_UNKNOWN, HEARTBEAT_SETTLEMENT_UNKNOWN
from lumina.worker.termination import TerminatorReturned


class ExecutionPhase(Enum):
    """Private process phases containing no job or ownership evidence."""

    SCHEDULING = auto()
    RECOVERY = auto()
    CLAIMING = auto()
    PRE_HANDLER = auto()
    HANDLER_ACTIVE = auto()
    POST_HANDLER = auto()
    TERMINAL_SETTLEMENT = auto()
    SHUTTING_DOWN = auto()


class RuntimeExecutionObserver:
    """Synchronous private phase observer used to stage shutdown safely."""

    def __init__(self) -> None:
        self._phase = ExecutionPhase.SCHEDULING

    @property
    def phase(self) -> ExecutionPhase:
        return self._phase

    def mark(self, phase: ExecutionPhase) -> None:
        if type(phase) is not ExecutionPhase:
            raise WorkerRuntimeError()
        self._phase = phase

    def __repr__(self) -> str:
        return "RuntimeExecutionObserver(<redacted>)"


class RuntimeTiming(Protocol):
    """Injectable monotonic wait boundary for scheduler tests."""

    def monotonic(self) -> float:
        """Return current monotonic time."""
        ...

    async def sleep_until(self, deadline: float) -> None:
        """Wait until one absolute monotonic deadline."""
        ...


class EventLoopRuntimeTiming:
    """Production runtime timing backed by the running event loop."""

    def monotonic(self) -> float:
        return asyncio.get_running_loop().time()

    async def sleep_until(self, deadline: float) -> None:
        await asyncio.sleep(max(0.0, deadline - self.monotonic()))


class RecoverOneBatch(Protocol):
    """One accepted fixed-size stale-recovery invocation."""

    async def recover(self) -> RecoverStaleJobsResult:
        """Recover at most one batch."""
        ...


class ExecuteOne(Protocol):
    """One accepted claim-and-execute invocation."""

    async def execute(self) -> ExecuteOneJobOutcome:
        """Claim at most one job."""
        ...


class FatalTermination(Protocol):
    """Hard-termination capability for a settlement-unknown live task."""

    async def terminate(self, event: bytes | None) -> NoReturn:
        """Write an optional fixed event, clean up, and terminate once."""
        ...


class WorkerRuntimeError(RuntimeError):
    """Fixed runtime state/configuration failure."""

    def __init__(self) -> None:
        super().__init__("Worker runtime failed.")

    def __repr__(self) -> str:
        return "WorkerRuntimeError(<redacted>)"


class HandlerStartGate:
    """Synchronous handler-start linearization against one shutdown event."""

    def __init__(
        self,
        shutdown_event: asyncio.Event,
        observer: RuntimeExecutionObserver,
    ) -> None:
        self._shutdown_event = shutdown_event
        self._observer = observer

    def try_enter(self) -> None:
        """Either reject before user code or synchronously commit active entry."""
        if self._shutdown_event.is_set():
            raise asyncio.CancelledError()
        self._observer.mark(ExecutionPhase.HANDLER_ACTIVE)


class _GatedHandler:
    def __init__(
        self,
        handler: JobHandler | None,
        gate: HandlerStartGate,
        observer: RuntimeExecutionObserver,
    ) -> None:
        self._handler = handler
        self._gate = gate
        self._observer = observer

    async def handle(self, payload: PersistedJobPayload) -> object:
        self._gate.try_enter()
        try:
            if self._handler is None:
                raise WorkerRuntimeError()
            return await self._handler.handle(payload)
        finally:
            self._observer.mark(ExecutionPhase.POST_HANDLER)

    def __repr__(self) -> str:
        return "_GatedHandler(<redacted>)"


class ShutdownAwareRegistry:
    """Wrap exact static resolution/preflight with the handler-start gate."""

    def __init__(
        self,
        delegate: ResolveStaticHandler,
        *,
        shutdown_event: asyncio.Event,
        observer: RuntimeExecutionObserver,
    ) -> None:
        self._delegate = delegate
        self._shutdown_event = shutdown_event
        self._observer = observer
        self._cancel_preflight = False

    def resolve(self, job_type: PersistedJobTypeName) -> JobHandler | None:
        self._observer.mark(ExecutionPhase.PRE_HANDLER)
        gate = HandlerStartGate(self._shutdown_event, self._observer)
        if self._shutdown_event.is_set():
            self._cancel_preflight = True
            return _GatedHandler(None, gate, self._observer)
        handler = self._delegate.resolve(job_type)
        if self._shutdown_event.is_set():
            self._cancel_preflight = True
            return _GatedHandler(None, gate, self._observer)
        self._cancel_preflight = False
        if handler is None:
            return None
        return _GatedHandler(handler, gate, self._observer)

    def validate_payload(
        self,
        job_type: PersistedJobTypeName,
        payload: PersistedJobPayload,
    ) -> None:
        if self._cancel_preflight or self._shutdown_event.is_set():
            return
        try:
            self._delegate.validate_payload(job_type, payload)
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            if self._shutdown_event.is_set():
                return
            raise

    def __repr__(self) -> str:
        return "ShutdownAwareRegistry(<redacted>)"


class ShutdownAwareClaim:
    """Settle a definitely returned claim when shutdown already won."""

    def __init__(
        self,
        delegate: ClaimOneJob,
        *,
        heartbeat: HeartbeatOneAttempt,
        failure: FailOneAttempt,
        shutdown_event: asyncio.Event,
        observer: RuntimeExecutionObserver,
    ) -> None:
        self._delegate = delegate
        self._heartbeat = heartbeat
        self._failure = failure
        self._shutdown_event = shutdown_event
        self._observer = observer

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        if self._shutdown_event.is_set():
            return NoEligibleJob()
        self._observer.mark(ExecutionPhase.CLAIMING)
        outcome = await self._delegate.claim(claimed_by=claimed_by)
        if type(outcome) is not ClaimedJob or not self._shutdown_event.is_set():
            return outcome
        self._observer.mark(ExecutionPhase.POST_HANDLER)
        try:
            await self._heartbeat.heartbeat(
                job_id=outcome.id,
                owner=claimed_by,
                expected_attempt=outcome.attempts,
            )
        except JobOwnershipLost:
            return NoEligibleJob()
        self._observer.mark(ExecutionPhase.TERMINAL_SETTLEMENT)
        failure = await self._failure.fail(
            job_id=outcome.id,
            owner=claimed_by,
            expected_attempt=outcome.attempts,
            reason=FailureReason.HANDLER_CANCELLED,
        )
        if type(failure) not in {RetryScheduled, TerminalFailureRecorded}:
            raise WorkerRuntimeError()
        return NoEligibleJob()

    def __repr__(self) -> str:
        return "ShutdownAwareClaim(<redacted>)"


class ObservedCompletion:
    """Mark terminal settlement without altering completion arguments/results."""

    def __init__(
        self,
        delegate: CompleteOneAttempt,
        observer: RuntimeExecutionObserver,
    ) -> None:
        self._delegate = delegate
        self._observer = observer

    async def complete(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        result: object,
    ) -> SuccessfulJobCompletion:
        self._observer.mark(ExecutionPhase.TERMINAL_SETTLEMENT)
        return await self._delegate.complete(
            job_id=job_id,
            owner=owner,
            expected_attempt=expected_attempt,
            result=result,
        )


class ObservedFailure:
    """Mark terminal settlement without altering failure arguments/results."""

    def __init__(
        self,
        delegate: FailOneAttempt,
        observer: RuntimeExecutionObserver,
    ) -> None:
        self._delegate = delegate
        self._observer = observer

    async def fail(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        reason: FailureReason,
    ) -> FailJobOutcome:
        self._observer.mark(ExecutionPhase.TERMINAL_SETTLEMENT)
        return await self._delegate.fail(
            job_id=job_id,
            owner=owner,
            expected_attempt=expected_attempt,
            reason=reason,
        )


class WorkerRuntime:
    """Run initial recovery, due recovery, and one executor at a time."""

    def __init__(
        self,
        *,
        recovery: RecoverOneBatch,
        executor: ExecuteOne,
        shutdown_event: asyncio.Event,
        observer: RuntimeExecutionObserver,
        fatal_termination: FatalTermination,
        poll_seconds: int,
        stale_seconds: int,
        cancellation_grace_seconds: int,
        timing: RuntimeTiming | None = None,
    ) -> None:
        if (
            type(poll_seconds) is not int
            or not 1 <= poll_seconds <= 60
            or type(stale_seconds) is not int
            or not 2 <= stale_seconds <= 86_400
            or type(cancellation_grace_seconds) is not int
            or not 1 <= cancellation_grace_seconds <= 60
        ):
            raise WorkerRuntimeError()
        self._recovery = recovery
        self._executor = executor
        self._shutdown_event = shutdown_event
        self._observer = observer
        self._fatal = fatal_termination
        self._poll_seconds = poll_seconds
        self._recovery_cadence = max(1, min(60, stale_seconds // 2))
        self._cancellation_grace = cancellation_grace_seconds
        self._timing = timing or EventLoopRuntimeTiming()
        self._owned_tasks: set[asyncio.Task[object]] = set()
        self._cancel_requested: set[asyncio.Task[object]] = set()
        self._cleanup_deadline: float | None = None
        self._hard_termination_started = False

    @property
    def recovery_cadence_seconds(self) -> int:
        return self._recovery_cadence

    async def run(self) -> int:
        """Run until graceful shutdown or one fixed/fatal runtime outcome."""
        shutdown_wait = asyncio.create_task(
            self._shutdown_event.wait(),
            name="lumina.worker.shutdown-wait",
        )
        self._owned_tasks.add(shutdown_wait)
        status = 0
        try:
            if self._shutdown_event.is_set():
                return 0
            if not await self._recover_once():
                return 1
            if self._shutdown_event.is_set():
                return 0
            next_recovery = self._timing.monotonic() + self._recovery_cadence
            next_claim: float | None = None
            while not self._shutdown_event.is_set():
                now = self._timing.monotonic()
                if now >= next_recovery:
                    if not await self._recover_once():
                        return 1
                    next_recovery = self._timing.monotonic() + self._recovery_cadence
                    if self._shutdown_event.is_set():
                        return 0
                    continue
                if next_claim is not None and now < next_claim:
                    due = min(next_claim, next_recovery)
                    if await self._wait_until(due, shutdown_wait=shutdown_wait):
                        return 0
                    continue
                self._observer.mark(ExecutionPhase.SCHEDULING)
                executor_status, outcome = await self._execute_once(shutdown_wait=shutdown_wait)
                if executor_status is not None:
                    return executor_status
                if type(outcome) is NoJobExecuted:
                    next_claim = self._timing.monotonic() + self._poll_seconds
                elif type(outcome) is JobProcessed:
                    next_claim = None
                else:
                    return 1
            return 0
        except (KeyboardInterrupt, SystemExit):
            raise
        except TerminatorReturned:
            raise
        except BaseException:
            status = 1
            return status
        finally:
            self._observer.mark(ExecutionPhase.SHUTTING_DOWN)
            if not self._hard_termination_started:
                await self._cleanup_owned_tasks()

    async def _recover_once(self) -> bool:
        self._observer.mark(ExecutionPhase.RECOVERY)
        try:
            result = await self._recovery.recover()
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            return False
        return type(result) is RecoverStaleJobsResult

    async def _execute_once(
        self,
        *,
        shutdown_wait: asyncio.Task[bool],
    ) -> tuple[int | None, ExecuteOneJobOutcome | None]:
        task = asyncio.create_task(
            self._executor.execute(),
            name="lumina.worker.execute-one",
        )
        self._owned_tasks.add(task)
        cancelled_for_shutdown = False
        try:
            done, _ = await asyncio.wait(
                (task, shutdown_wait),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if shutdown_wait in done and task not in done:
                if self._observer.phase is ExecutionPhase.HANDLER_ACTIVE:
                    task.cancel()
                    cancelled_for_shutdown = True
                try:
                    await asyncio.shield(task)
                except asyncio.CancelledError:
                    if cancelled_for_shutdown and self._shutdown_event.is_set():
                        return 0, None
                    return 1, None
            return None, task.result()
        except JobHandlerSettlementUnknown:
            await self._hard_terminate(HANDLER_SETTLEMENT_UNKNOWN)
        except JobHeartbeatSettlementUnknown:
            await self._hard_terminate(HEARTBEAT_SETTLEMENT_UNKNOWN)
        except asyncio.CancelledError:
            if cancelled_for_shutdown and self._shutdown_event.is_set():
                return 0, None
            return 1, None
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            return 1, None
        finally:
            if task.done() and task in self._owned_tasks:
                _consume_task(task)
                self._owned_tasks.discard(task)
                self._cancel_requested.discard(task)

    async def _wait_until(
        self,
        deadline: float,
        *,
        shutdown_wait: asyncio.Task[bool],
    ) -> bool:
        wait = asyncio.create_task(
            self._timing.sleep_until(deadline),
            name="lumina.worker.scheduler-wait",
        )
        self._owned_tasks.add(wait)
        try:
            done, _ = await asyncio.wait(
                (wait, shutdown_wait),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if shutdown_wait in done:
                if not wait.done():
                    self._request_cancel(wait)
                cleanup_deadline = self._get_cleanup_deadline()
                if not await _observe_bounded(wait, deadline=cleanup_deadline):
                    self._owned_tasks.discard(wait)
                    self._attach_eventual_consumer(wait)
                    await self._hard_terminate(None)
                self._owned_tasks.discard(wait)
                self._cancel_requested.discard(wait)
                with suppress(asyncio.CancelledError):
                    wait.result()
                return True
            wait.result()
            return False
        finally:
            if wait.done():
                _consume_task(wait)
                self._owned_tasks.discard(wait)
                self._cancel_requested.discard(wait)

    async def _cleanup_owned_tasks(self) -> None:
        pending = tuple(task for task in self._owned_tasks if not task.done())
        for task in pending:
            self._request_cancel(task)
        if pending:
            deadline = self._get_cleanup_deadline()
            try:
                done, still_pending = await asyncio.wait(
                    pending,
                    timeout=max(0.0, deadline - asyncio.get_running_loop().time()),
                )
            except BaseException:
                done = {task for task in pending if task.done()}
                still_pending = set(pending) - done
            for task in done:
                _consume_task(task)
            if still_pending:
                for task in still_pending:
                    self._attach_eventual_consumer(task)
                await self._hard_terminate(None)
        for task in tuple(self._owned_tasks):
            if task.done():
                _consume_task(task)
        self._owned_tasks.clear()
        self._cancel_requested.clear()

    def _get_cleanup_deadline(self) -> float:
        if self._cleanup_deadline is None:
            self._cleanup_deadline = asyncio.get_running_loop().time() + self._cancellation_grace
        return self._cleanup_deadline

    def _request_cancel(self, task: asyncio.Task[object]) -> None:
        if task in self._cancel_requested or task.done():
            return
        self._cancel_requested.add(task)
        task.cancel()

    def _attach_eventual_consumer(self, task: asyncio.Task[object]) -> None:
        if task.done():
            _consume_task(task)
            return
        task.add_done_callback(_consume_task)

    async def _hard_terminate(self, event: bytes | None) -> NoReturn:
        self._hard_termination_started = True
        for task in tuple(self._owned_tasks):
            if task.done():
                _consume_task(task)
                self._owned_tasks.discard(task)
                self._cancel_requested.discard(task)
        await self._fatal.terminate(event)

    def __repr__(self) -> str:
        return "WorkerRuntime(<redacted>)"


async def _observe_bounded(task: asyncio.Task[object], *, deadline: float) -> bool:
    if task.done():
        return True
    try:
        done, _ = await asyncio.wait(
            (task,),
            timeout=max(0.0, deadline - asyncio.get_running_loop().time()),
        )
    except BaseException:
        return task.done()
    return task in done or task.done()


def _consume_task(task: asyncio.Task[object]) -> None:
    if not task.done():
        return
    with suppress(BaseException):
        task.exception()
