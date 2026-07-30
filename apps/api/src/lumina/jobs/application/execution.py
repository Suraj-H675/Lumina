"""Bounded orchestration for claiming and executing at most one job."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Protocol, cast
from uuid import UUID

from lumina.jobs.domain.completion import SuccessfulJobCompletion
from lumina.jobs.domain.failure import (
    FailJobOutcome,
    FailureReason,
    RetryScheduled,
    TerminalFailureRecorded,
)
from lumina.jobs.domain.handler import (
    IncompatibleHandlerPayload,
    JobHandler,
    NonRetryableHandlerFailure,
    RetryableHandlerFailure,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
from lumina.jobs.domain.models import (
    ClaimedJob,
    ClaimJobOutcome,
    NoEligibleJob,
    PersistedJobTypeName,
)
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.jobs.domain.result import JobResultInvalid, JobResultTooLarge
from lumina.worker.timing import ExecutionTask, ExecutionTiming


class ClaimOneJob(Protocol):
    """Capability to claim at most one passive persisted job."""

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        """Claim once for an already-created process owner."""
        ...


class HeartbeatOneAttempt(Protocol):
    """Capability to heartbeat one exact owned attempt."""

    async def heartbeat(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
    ) -> object:
        """Record one owner/status/attempt-fenced heartbeat."""
        ...


class CompleteOneAttempt(Protocol):
    """Capability to complete one exact owned attempt."""

    async def complete(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        result: object,
    ) -> SuccessfulJobCompletion:
        """Persist one validated successful result."""
        ...


class FailOneAttempt(Protocol):
    """Capability to fail one exact owned attempt."""

    async def fail(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        reason: FailureReason,
    ) -> FailJobOutcome:
        """Persist one catalog-derived failure transition."""
        ...


class ResolveStaticHandler(Protocol):
    """Capability to resolve only one exact static registration."""

    def resolve(self, job_type: PersistedJobTypeName) -> JobHandler | None:
        """Return the explicitly registered handler, if any."""
        ...

    def validate_payload(
        self,
        job_type: PersistedJobTypeName,
        payload: PersistedJobPayload,
    ) -> None:
        """Run only explicitly registered synchronous payload preflight."""
        ...


class _SafeExecutionFailure(RuntimeError):
    """Fixed, cause-free, context-free execution-orchestration failure."""

    message: str

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(<redacted>)"


class JobHandlerSettlementUnknown(_SafeExecutionFailure):
    """Fatal outcome when cancelled handler work does not settle in time."""

    message = "Job handler settlement is unknown."


class JobHeartbeatSettlementUnknown(_SafeExecutionFailure):
    """Fatal outcome when the heartbeat supervisor does not settle in time."""

    message = "Job heartbeat supervisor settlement is unknown."


class JobExecutionStateInvalid(_SafeExecutionFailure):
    """Fatal outcome for an impossible internal execution state."""

    message = "Job execution entered an invalid internal state."


@dataclass(frozen=True, slots=True)
class NoJobExecuted:
    """Fieldless control outcome when the one claim found no eligible row."""


@dataclass(frozen=True, slots=True)
class JobProcessed:
    """Fieldless control outcome after one definite accepted lifecycle result."""


type ExecuteOneJobOutcome = NoJobExecuted | JobProcessed


class _HandlerOutcomeKind(Enum):
    SUCCESS = auto()
    FAILURE = auto()


@dataclass(frozen=True, repr=False, slots=True)
class _HandlerOutcome:
    kind: _HandlerOutcomeKind
    result: object = field(default=None, repr=False)
    reason: FailureReason | None = field(default=None, repr=False)


class _HeartbeatOutcome(Enum):
    STOPPED = auto()
    OWNERSHIP_LOST = auto()
    NON_OWNERSHIP_FAILURE = auto()
    INVALID_STATE = auto()


class ExecuteOneJobService:
    """Claim once, then supervise exactly one handler and one heartbeat task."""

    def __init__(
        self,
        *,
        owner: JobOwnerToken,
        registry: ResolveStaticHandler,
        claim: ClaimOneJob,
        heartbeat: HeartbeatOneAttempt,
        completion: CompleteOneAttempt,
        failure: FailOneAttempt,
        heartbeat_seconds: int,
        handler_timeout_seconds: int,
        cancellation_grace_seconds: int,
        timing: ExecutionTiming,
    ) -> None:
        if type(owner) is not JobOwnerToken:
            raise JobExecutionStateInvalid()
        if (
            type(heartbeat_seconds) is not int
            or not 1 <= heartbeat_seconds <= 3_600
            or type(handler_timeout_seconds) is not int
            or not 1 <= handler_timeout_seconds <= 86_400
            or type(cancellation_grace_seconds) is not int
            or not 1 <= cancellation_grace_seconds <= 60
            or cancellation_grace_seconds > handler_timeout_seconds
        ):
            raise JobExecutionStateInvalid()
        self._owner = owner
        self._registry = registry
        self._claim = claim
        self._heartbeat = heartbeat
        self._completion = completion
        self._failure = failure
        self._heartbeat_seconds = heartbeat_seconds
        self._handler_timeout_seconds = handler_timeout_seconds
        self._cancellation_grace_seconds = cancellation_grace_seconds
        self._timing = timing

    async def execute(self) -> ExecuteOneJobOutcome:
        """Claim exactly once and drive at most that one claim to a safe boundary."""
        claim_outcome = await self._claim.claim(claimed_by=self._owner.value)
        if type(claim_outcome) is NoEligibleJob:
            return NoJobExecuted()
        if type(claim_outcome) is not ClaimedJob:
            raise JobExecutionStateInvalid()
        return await self._execute_claimed(claim_outcome)

    async def _execute_claimed(self, claimed: ClaimedJob) -> JobProcessed:
        handler = self._registry.resolve(claimed.job_type)
        if handler is None:
            return await self._record_failure(claimed, FailureReason.UNSUPPORTED_TYPE)

        validation_reason: FailureReason | None = None
        try:
            self._registry.validate_payload(claimed.job_type, claimed.payload)
        except IncompatibleHandlerPayload:
            validation_reason = FailureReason.INCOMPATIBLE_PAYLOAD
        except RetryableHandlerFailure:
            validation_reason = FailureReason.HANDLER_RETRYABLE
        except NonRetryableHandlerFailure:
            validation_reason = FailureReason.HANDLER_NON_RETRYABLE
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            validation_reason = FailureReason.HANDLER_UNEXPECTED
        if validation_reason is not None:
            return await self._record_failure(claimed, validation_reason)

        start = self._monotonic()
        handler_deadline = start + self._handler_timeout_seconds
        handler_task = cast(
            ExecutionTask,
            asyncio.create_task(handler.handle(claimed.payload)),
        )
        heartbeat_task = cast(
            ExecutionTask,
            asyncio.create_task(self._supervise_heartbeats(claimed)),
        )
        return await self._supervise_execution(
            claimed,
            handler_task=handler_task,
            heartbeat_task=heartbeat_task,
            handler_deadline=handler_deadline,
        )

    async def _supervise_heartbeats(self, claimed: ClaimedJob) -> None:
        next_deadline = self._monotonic() + self._heartbeat_seconds
        while True:
            timing_failed = False
            try:
                await self._timing.sleep_until(next_deadline)
            except asyncio.CancelledError:
                raise
            except (KeyboardInterrupt, SystemExit):
                raise
            except BaseException:
                timing_failed = True
            if timing_failed:
                raise JobExecutionStateInvalid()
            await self._heartbeat.heartbeat(
                job_id=claimed.id,
                owner=self._owner.value,
                expected_attempt=claimed.attempts,
            )
            next_deadline = self._monotonic() + self._heartbeat_seconds

    async def _supervise_execution(
        self,
        claimed: ClaimedJob,
        *,
        handler_task: ExecutionTask,
        heartbeat_task: ExecutionTask,
        handler_deadline: float,
    ) -> JobProcessed:
        cancelled = False
        timing_failed = False
        done: frozenset[ExecutionTask] = frozenset()
        try:
            done = await self._timing.wait_first(
                (handler_task, heartbeat_task),
                deadline=handler_deadline,
            )
        except asyncio.CancelledError:
            cancelled = True
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            timing_failed = True

        if cancelled:
            return await self._handle_external_cancellation(
                claimed,
                handler_task=handler_task,
                heartbeat_task=heartbeat_task,
            )
        if timing_failed:
            await self._abort_for_invalid_state(handler_task, heartbeat_task)
            raise JobExecutionStateInvalid()

        heartbeat_is_done = heartbeat_task in done or heartbeat_task.done()
        handler_is_done = handler_task in done or handler_task.done()
        if heartbeat_is_done:
            heartbeat_outcome = _observe_heartbeat(heartbeat_task)
            if heartbeat_outcome is _HeartbeatOutcome.OWNERSHIP_LOST:
                await self._cancel_for_ownership_loss(handler_task)
                raise JobOwnershipLost()
            if heartbeat_outcome is _HeartbeatOutcome.INVALID_STATE:
                await self._abort_for_invalid_state(handler_task, heartbeat_task)
                raise JobExecutionStateInvalid()
            if handler_is_done:
                handler_outcome = _observe_handler(handler_task)
                return await self._settle_known_handler_outcome(
                    claimed,
                    handler_outcome,
                    heartbeat_task=heartbeat_task,
                )
            return await self._handle_active_handler_heartbeat_failure(
                claimed,
                handler_task=handler_task,
                heartbeat_task=heartbeat_task,
            )

        if handler_is_done:
            handler_outcome = _observe_handler(handler_task)
            return await self._settle_known_handler_outcome(
                claimed,
                handler_outcome,
                heartbeat_task=heartbeat_task,
            )

        await self._handle_handler_timeout(
            claimed,
            handler_task=handler_task,
            heartbeat_task=heartbeat_task,
        )
        return JobProcessed()

    async def _settle_known_handler_outcome(
        self,
        claimed: ClaimedJob,
        handler_outcome: _HandlerOutcome,
        *,
        heartbeat_task: ExecutionTask,
    ) -> JobProcessed:
        deadline = self._settlement_deadline()
        settled = await self._cancel_and_settle((heartbeat_task,), deadline=deadline)
        if heartbeat_task not in settled and not heartbeat_task.done():
            _observe_later(heartbeat_task)
            raise JobHeartbeatSettlementUnknown()
        heartbeat_outcome = _observe_heartbeat(heartbeat_task)
        if heartbeat_outcome is _HeartbeatOutcome.OWNERSHIP_LOST:
            raise JobOwnershipLost()
        if heartbeat_outcome is _HeartbeatOutcome.INVALID_STATE:
            raise JobExecutionStateInvalid()
        if handler_outcome.kind is _HandlerOutcomeKind.SUCCESS:
            return await self._record_completion(claimed, handler_outcome.result)
        if handler_outcome.reason is None:
            raise JobExecutionStateInvalid()
        return await self._record_failure(claimed, handler_outcome.reason)

    async def _handle_active_handler_heartbeat_failure(
        self,
        claimed: ClaimedJob,
        *,
        handler_task: ExecutionTask,
        heartbeat_task: ExecutionTask,
    ) -> JobProcessed:
        deadline = self._settlement_deadline()
        settled = await self._cancel_and_settle((handler_task,), deadline=deadline)
        if handler_task not in settled and not handler_task.done():
            _observe_later(handler_task)
            raise JobHandlerSettlementUnknown()
        _consume_task(handler_task)
        _consume_task(heartbeat_task)
        return await self._record_failure(claimed, FailureReason.HEARTBEAT_FAILED)

    async def _handle_handler_timeout(
        self,
        claimed: ClaimedJob,
        *,
        handler_task: ExecutionTask,
        heartbeat_task: ExecutionTask,
    ) -> None:
        deadline = self._settlement_deadline()
        settled = await self._cancel_and_settle(
            (handler_task, heartbeat_task),
            deadline=deadline,
        )
        handler_unknown = handler_task not in settled and not handler_task.done()
        heartbeat_unknown = heartbeat_task not in settled and not heartbeat_task.done()
        if handler_unknown:
            _observe_later(handler_task)
        if heartbeat_unknown:
            _observe_later(heartbeat_task)
        if handler_unknown:
            raise JobHandlerSettlementUnknown()
        if heartbeat_unknown:
            raise JobHeartbeatSettlementUnknown()
        _consume_task(handler_task)
        heartbeat_outcome = _observe_heartbeat(heartbeat_task)
        if heartbeat_outcome is _HeartbeatOutcome.OWNERSHIP_LOST:
            raise JobOwnershipLost()
        if heartbeat_outcome is _HeartbeatOutcome.INVALID_STATE:
            raise JobExecutionStateInvalid()
        await self._record_failure(claimed, FailureReason.HANDLER_TIMEOUT)

    async def _handle_external_cancellation(
        self,
        claimed: ClaimedJob,
        *,
        handler_task: ExecutionTask,
        heartbeat_task: ExecutionTask,
    ) -> JobProcessed:
        deadline = self._settlement_deadline()
        settled = await self._cancel_and_settle(
            (handler_task, heartbeat_task),
            deadline=deadline,
        )
        handler_unknown = handler_task not in settled and not handler_task.done()
        heartbeat_unknown = heartbeat_task not in settled and not heartbeat_task.done()
        if handler_unknown:
            _observe_later(handler_task)
        if heartbeat_unknown:
            _observe_later(heartbeat_task)
        if handler_unknown:
            raise JobHandlerSettlementUnknown()
        if heartbeat_unknown:
            raise JobHeartbeatSettlementUnknown()
        _consume_task(handler_task)
        heartbeat_outcome = _observe_heartbeat(heartbeat_task)
        if heartbeat_outcome is _HeartbeatOutcome.OWNERSHIP_LOST:
            raise JobOwnershipLost()
        if heartbeat_outcome is _HeartbeatOutcome.INVALID_STATE:
            raise JobExecutionStateInvalid()
        await self._record_failure(claimed, FailureReason.HANDLER_CANCELLED)
        raise asyncio.CancelledError()

    async def _cancel_for_ownership_loss(self, handler_task: ExecutionTask) -> None:
        deadline = self._settlement_deadline()
        settled = await self._cancel_and_settle((handler_task,), deadline=deadline)
        if handler_task not in settled and not handler_task.done():
            _observe_later(handler_task)
            raise JobHandlerSettlementUnknown()
        _consume_task(handler_task)

    async def _abort_for_invalid_state(
        self,
        handler_task: ExecutionTask,
        heartbeat_task: ExecutionTask,
    ) -> None:
        deadline = self._settlement_deadline()
        settled = await self._cancel_and_settle(
            (handler_task, heartbeat_task),
            deadline=deadline,
        )
        for task in (handler_task, heartbeat_task):
            if task not in settled and not task.done():
                _observe_later(task)
            else:
                _consume_task(task)

    async def _cancel_and_settle(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        for task in tasks:
            if not task.done():
                task.cancel()
        timing_failed = False
        settled: frozenset[ExecutionTask] = frozenset()
        try:
            settled = await self._timing.settle(tasks, deadline=deadline)
        except asyncio.CancelledError:
            # Repeated process cancellation must not create an unbounded cleanup path.
            settled = frozenset(task for task in tasks if task.done())
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            timing_failed = True
        if timing_failed:
            for task in tasks:
                if task.done():
                    _consume_task(task)
                else:
                    _observe_later(task)
            raise JobExecutionStateInvalid()
        return settled

    async def _record_completion(self, claimed: ClaimedJob, result: object) -> JobProcessed:
        invalid_result = False
        try:
            outcome = await self._completion.complete(
                job_id=claimed.id,
                owner=self._owner.value,
                expected_attempt=claimed.attempts,
                result=result,
            )
        except (JobResultInvalid, JobResultTooLarge):
            invalid_result = True
            outcome = None
        if invalid_result:
            return await self._record_failure(claimed, FailureReason.HANDLER_INVALID_RESULT)
        if type(outcome) is not SuccessfulJobCompletion:
            raise JobExecutionStateInvalid()
        return JobProcessed()

    async def _record_failure(
        self,
        claimed: ClaimedJob,
        reason: FailureReason,
    ) -> JobProcessed:
        outcome = await self._failure.fail(
            job_id=claimed.id,
            owner=self._owner.value,
            expected_attempt=claimed.attempts,
            reason=reason,
        )
        if type(outcome) not in {RetryScheduled, TerminalFailureRecorded}:
            raise JobExecutionStateInvalid()
        return JobProcessed()

    def _settlement_deadline(self) -> float:
        return self._monotonic() + self._cancellation_grace_seconds

    def _monotonic(self) -> float:
        failed = False
        value = 0.0
        try:
            value = self._timing.monotonic()
        except (KeyboardInterrupt, SystemExit):
            raise
        except BaseException:
            failed = True
        if failed or type(value) not in {int, float}:
            raise JobExecutionStateInvalid()
        return float(value)


def _observe_handler(task: ExecutionTask) -> _HandlerOutcome:
    try:
        result = task.result()
    except RetryableHandlerFailure:
        return _HandlerOutcome(
            _HandlerOutcomeKind.FAILURE,
            reason=FailureReason.HANDLER_RETRYABLE,
        )
    except NonRetryableHandlerFailure:
        return _HandlerOutcome(
            _HandlerOutcomeKind.FAILURE,
            reason=FailureReason.HANDLER_NON_RETRYABLE,
        )
    except IncompatibleHandlerPayload:
        return _HandlerOutcome(
            _HandlerOutcomeKind.FAILURE,
            reason=FailureReason.INCOMPATIBLE_PAYLOAD,
        )
    except asyncio.CancelledError:
        return _HandlerOutcome(
            _HandlerOutcomeKind.FAILURE,
            reason=FailureReason.HANDLER_CANCELLED,
        )
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return _HandlerOutcome(
            _HandlerOutcomeKind.FAILURE,
            reason=FailureReason.HANDLER_UNEXPECTED,
        )
    return _HandlerOutcome(_HandlerOutcomeKind.SUCCESS, result=result)


def _observe_heartbeat(task: ExecutionTask) -> _HeartbeatOutcome:
    try:
        task.result()
    except asyncio.CancelledError:
        return _HeartbeatOutcome.STOPPED
    except JobOwnershipLost:
        return _HeartbeatOutcome.OWNERSHIP_LOST
    except JobExecutionStateInvalid:
        return _HeartbeatOutcome.INVALID_STATE
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        return _HeartbeatOutcome.NON_OWNERSHIP_FAILURE
    return _HeartbeatOutcome.INVALID_STATE


def _consume_task(task: ExecutionTask) -> None:
    if not task.done():
        return
    try:
        task.exception()
    except asyncio.CancelledError:
        pass
    except BaseException:
        pass


def _observe_later(task: ExecutionTask) -> None:
    task.add_done_callback(_consume_task)
