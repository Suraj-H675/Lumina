"""Deterministic event-controlled tests for one-job execution orchestration."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import fields
from datetime import UTC, datetime
from uuid import UUID

import pytest
from lumina.jobs.application.execution import (
    ExecuteOneJobService,
    JobHandlerSettlementUnknown,
    JobHeartbeatSettlementUnknown,
    JobProcessed,
    NoJobExecuted,
)
from lumina.jobs.application.handlers import (
    StaticHandlerRegistry,
    production_handler_registry,
)
from lumina.jobs.domain.completion import JobCompletionOutcomeUnknown, SuccessfulJobCompletion
from lumina.jobs.domain.failure import (
    FailJobOutcome,
    FailureReason,
    JobFailureOutcomeUnknown,
    RetryScheduled,
)
from lumina.jobs.domain.handler import (
    JobHandler,
    NonRetryableHandlerFailure,
    RetryableHandlerFailure,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
from lumina.jobs.domain.models import (
    ClaimedJob,
    ClaimJobOutcome,
    ExpectedJobAttempt,
    JobClaimOutcomeUnknown,
    NoEligibleJob,
    PersistedJobTypeName,
)
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.jobs.domain.result import JobResultInvalid
from lumina.worker.timing import ExecutionTask

_JOB_ID = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
_OWNER = "worker.execution.12345678-1234-4234-9234-123456789abc"
_NOW = datetime(2026, 7, 30, 12, tzinfo=UTC)


def _claim(
    *,
    job_type: str = "fixture.handler",
    payload: object = None,
    attempts: int = 3,
) -> ClaimedJob:
    return ClaimedJob(
        id=_JOB_ID,
        job_type=PersistedJobTypeName(job_type),
        payload=PersistedJobPayload.from_decoded({} if payload is None else payload),
        attempts=attempts,
        max_attempts=5,
        claimed_at=_NOW,
        heartbeat_at=_NOW,
    )


class RecordingClaim:
    def __init__(self, outcome: ClaimJobOutcome) -> None:
        self.outcome = outcome
        self.owners: list[str] = []

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        self.owners.append(claimed_by)
        return self.outcome


class RaisingClaim(RecordingClaim):
    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        self.owners.append(claimed_by)
        raise JobClaimOutcomeUnknown()


class RecordingHeartbeat:
    def __init__(
        self,
        *,
        error_factory: Callable[[], BaseException] | None = None,
        release: asyncio.Event | None = None,
    ) -> None:
        self.error_factory = error_factory
        self.release = release
        self.calls: list[tuple[UUID, str, int]] = []
        self.entered = asyncio.Event()
        self.finished = asyncio.Event()
        self.active = 0
        self.max_active = 0

    async def heartbeat(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
    ) -> object:
        self.calls.append((job_id, owner, expected_attempt))
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.entered.set()
        try:
            if self.release is not None:
                await self.release.wait()
            if self.error_factory is not None:
                raise self.error_factory()
            return object()
        finally:
            self.active -= 1
            self.finished.set()


class RecordingCompletion:
    def __init__(
        self,
        *,
        reject_result: bool = False,
        error: BaseException | None = None,
    ) -> None:
        self.reject_result = reject_result
        self.error = error
        self.calls: list[tuple[UUID, str, int, object]] = []

    async def complete(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        result: object,
    ) -> SuccessfulJobCompletion:
        self.calls.append((job_id, owner, expected_attempt, result))
        if self.error is not None:
            raise self.error
        if self.reject_result:
            raise JobResultInvalid("fixed")
        return SuccessfulJobCompletion(job_id=job_id, completed_at=_NOW)


class RecordingFailure:
    def __init__(self, *, error: BaseException | None = None) -> None:
        self.error = error
        self.calls: list[tuple[UUID, str, int, FailureReason]] = []

    async def fail(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        reason: FailureReason,
    ) -> FailJobOutcome:
        self.calls.append((job_id, owner, expected_attempt, reason))
        if self.error is not None:
            raise self.error
        return RetryScheduled(
            job_id=job_id,
            expected_attempt=_expected_attempt(expected_attempt),
            available_at=_NOW,
        )


def _expected_attempt(value: int) -> ExpectedJobAttempt:
    return ExpectedJobAttempt(value)


class ControlledTiming:
    """No-wall-clock timing whose progress is released only by test events."""

    def __init__(self, *, settle_pending: bool = True) -> None:
        self.now = 100.0
        self.wait_started = asyncio.Event()
        self.wait_release = asyncio.Event()
        self.sleep_calls: list[float] = []
        self._sleep_values: asyncio.Queue[float] = asyncio.Queue()
        self._sleep_condition = asyncio.Condition()
        self.settle_pending = settle_pending
        self.settlement_deadlines: list[float] = []

    def monotonic(self) -> float:
        return self.now

    async def sleep_until(self, deadline: float) -> None:
        async with self._sleep_condition:
            self.sleep_calls.append(deadline)
            self._sleep_condition.notify_all()
        self.now = await self._sleep_values.get()

    async def wait_first(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        del deadline
        self.wait_started.set()
        await self.wait_release.wait()
        return frozenset(task for task in tasks if task.done())

    async def settle(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        self.settlement_deadlines.append(deadline)
        await asyncio.sleep(0)
        if self.settle_pending:
            await asyncio.wait(tasks)
        return frozenset(task for task in tasks if task.done())

    async def wait_for_sleep_count(self, count: int) -> None:
        async with self._sleep_condition:
            await self._sleep_condition.wait_for(lambda: len(self.sleep_calls) >= count)

    def release_sleep(self, *, now: float) -> None:
        self._sleep_values.put_nowait(now)


class UncooperativeHeartbeatTiming(ControlledTiming):
    def __init__(self) -> None:
        super().__init__(settle_pending=False)
        self.heartbeat_cancelled = asyncio.Event()
        self.heartbeat_cleanup = asyncio.Event()
        self.heartbeat_finished = asyncio.Event()

    async def sleep_until(self, deadline: float) -> None:
        del deadline
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.heartbeat_cancelled.set()
            await self.heartbeat_cleanup.wait()
            raise
        finally:
            self.heartbeat_finished.set()


class ImmediateHandler:
    def __init__(self, outcome: object = None, *, error: BaseException | None = None) -> None:
        self.outcome = {} if outcome is None else outcome
        self.error = error
        self.finished = asyncio.Event()

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        try:
            if self.error is not None:
                raise self.error
            return self.outcome
        finally:
            self.finished.set()


class BlockingHandler:
    def __init__(self, *, uncooperative: bool = False) -> None:
        self.uncooperative = uncooperative
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.cleanup = asyncio.Event()
        self.finished = asyncio.Event()

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        self.started.set()
        try:
            await self.release.wait()
            return {}
        except asyncio.CancelledError:
            self.cancelled.set()
            if self.uncooperative:
                await self.cleanup.wait()
                return {}
            raise
        finally:
            self.finished.set()


def _service(
    *,
    claim: RecordingClaim,
    handler: JobHandler | None = None,
    registry: StaticHandlerRegistry | None = None,
    heartbeat: RecordingHeartbeat | None = None,
    completion: RecordingCompletion | None = None,
    failure: RecordingFailure | None = None,
    timing: ControlledTiming | None = None,
) -> tuple[
    ExecuteOneJobService,
    RecordingHeartbeat,
    RecordingCompletion,
    RecordingFailure,
    ControlledTiming,
]:
    heartbeat = heartbeat or RecordingHeartbeat()
    completion = completion or RecordingCompletion()
    failure = failure or RecordingFailure()
    timing = timing or ControlledTiming()
    handlers = {} if handler is None else {"fixture.handler": handler}
    selected_registry = registry or StaticHandlerRegistry(handlers)
    service = ExecuteOneJobService(
        owner=JobOwnerToken(_OWNER),
        registry=selected_registry,
        claim=claim,
        heartbeat=heartbeat,
        completion=completion,
        failure=failure,
        heartbeat_seconds=30,
        handler_timeout_seconds=300,
        cancellation_grace_seconds=5,
        timing=timing,
    )
    return service, heartbeat, completion, failure, timing


@pytest.mark.asyncio
async def test_no_job_claims_once_and_returns_only_fieldless_control_outcome() -> None:
    claim = RecordingClaim(NoEligibleJob())
    service, heartbeat, completion, failure, _ = _service(claim=claim)

    outcome = await service.execute()

    assert outcome == NoJobExecuted()
    assert fields(outcome) == ()
    assert claim.owners == [_OWNER]
    assert heartbeat.calls == []
    assert completion.calls == []
    assert failure.calls == []


@pytest.mark.asyncio
async def test_fatal_claim_unknown_propagates_exactly_without_later_work() -> None:
    claim = RaisingClaim(NoEligibleJob())
    service, heartbeat, completion, failure, _ = _service(claim=claim)

    with pytest.raises(JobClaimOutcomeUnknown):
        await service.execute()

    assert claim.owners == [_OWNER]
    assert heartbeat.calls == []
    assert completion.calls == []
    assert failure.calls == []


@pytest.mark.asyncio
async def test_unsupported_type_fails_once_without_starting_heartbeat() -> None:
    claim = RecordingClaim(_claim(job_type="unsupported.SECRET"))
    service, heartbeat, completion, failure, _ = _service(claim=claim)

    outcome = await service.execute()

    assert outcome == JobProcessed()
    assert heartbeat.calls == []
    assert completion.calls == []
    assert failure.calls == [
        (_JOB_ID, _OWNER, 3, FailureReason.UNSUPPORTED_TYPE),
    ]


@pytest.mark.asyncio
async def test_incompatible_payload_fails_before_heartbeat_supervision() -> None:
    claim = RecordingClaim(_claim(job_type="system.noop", payload=[]))
    service, heartbeat, completion, failure, _ = _service(
        claim=claim,
        registry=production_handler_registry(),
    )

    await service.execute()

    assert heartbeat.calls == []
    assert completion.calls == []
    assert failure.calls[-1][-1] is FailureReason.INCOMPATIBLE_PAYLOAD


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "reason"),
    [
        (RetryableHandlerFailure(), FailureReason.HANDLER_RETRYABLE),
        (NonRetryableHandlerFailure(), FailureReason.HANDLER_NON_RETRYABLE),
        (RuntimeError("HANDLER-EXCEPTION-SECRET"), FailureReason.HANDLER_UNEXPECTED),
    ],
)
async def test_handler_failure_mapping_preserves_fixed_specific_reason(
    error: BaseException,
    reason: FailureReason,
) -> None:
    handler = ImmediateHandler(error=error)
    claim = RecordingClaim(_claim())
    service, heartbeat, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
    )
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    assert heartbeat.calls == []
    assert completion.calls == []
    assert failure.calls[-1][-1] is reason


@pytest.mark.asyncio
async def test_success_stops_heartbeat_then_completes_once_with_exact_attempt() -> None:
    result = {"fixed": "RESULT-SENTINEL"}
    handler = ImmediateHandler(result)
    claim = RecordingClaim(_claim(attempts=4))
    service, heartbeat, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
    )
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    assert heartbeat.calls == []
    assert completion.calls == [(_JOB_ID, _OWNER, 4, result)]
    assert failure.calls == []


@pytest.mark.asyncio
async def test_completion_result_rejection_maps_only_to_invalid_result_failure() -> None:
    handler = ImmediateHandler({"invalid": object()})
    completion = RecordingCompletion(reject_result=True)
    claim = RecordingClaim(_claim())
    service, _, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        completion=completion,
    )
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    assert len(completion.calls) == 1
    assert failure.calls[-1][-1] is FailureReason.HANDLER_INVALID_RESULT


@pytest.mark.asyncio
async def test_completion_unknown_propagates_exactly_without_failure_write() -> None:
    handler = ImmediateHandler({})
    completion = RecordingCompletion(error=JobCompletionOutcomeUnknown())
    claim = RecordingClaim(_claim())
    service, _, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        completion=completion,
    )
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    with pytest.raises(JobCompletionOutcomeUnknown):
        await task
    assert len(completion.calls) == 1
    assert failure.calls == []


@pytest.mark.asyncio
async def test_failure_unknown_propagates_exactly_without_second_mutation() -> None:
    handler = ImmediateHandler(error=NonRetryableHandlerFailure())
    failure = RecordingFailure(error=JobFailureOutcomeUnknown())
    claim = RecordingClaim(_claim())
    service, _, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        failure=failure,
    )
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    with pytest.raises(JobFailureOutcomeUnknown):
        await task
    assert completion.calls == []
    assert len(failure.calls) == 1


@pytest.mark.asyncio
async def test_handler_deadline_cancels_settles_and_records_timeout() -> None:
    handler = BlockingHandler()
    claim = RecordingClaim(_claim())
    service, _, completion, failure, timing = _service(claim=claim, handler=handler)
    task = asyncio.create_task(service.execute())
    await handler.started.wait()
    await timing.wait_started.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    assert handler.cancelled.is_set()
    assert handler.finished.is_set()
    assert completion.calls == []
    assert failure.calls[-1][-1] is FailureReason.HANDLER_TIMEOUT
    assert len(set(timing.settlement_deadlines)) == 1


@pytest.mark.asyncio
async def test_active_handler_heartbeat_failure_cancels_before_failure_write() -> None:
    handler = BlockingHandler()
    heartbeat = RecordingHeartbeat(error_factory=lambda: RuntimeError("DATABASE-HEARTBEAT-SECRET"))
    claim = RecordingClaim(_claim())
    service, heartbeat, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        heartbeat=heartbeat,
    )
    task = asyncio.create_task(service.execute())
    await handler.started.wait()
    await timing.wait_for_sleep_count(1)
    timing.release_sleep(now=140)
    await heartbeat.finished.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    assert handler.cancelled.is_set()
    assert completion.calls == []
    assert failure.calls[-1][-1] is FailureReason.HEARTBEAT_FAILED


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler_error", "expected_reason", "expect_completion"),
    [
        (None, None, True),
        (
            RetryableHandlerFailure(),
            FailureReason.HANDLER_RETRYABLE,
            False,
        ),
    ],
)
async def test_simultaneous_nonownership_heartbeat_failure_preserves_handler_outcome(
    handler_error: BaseException | None,
    expected_reason: FailureReason | None,
    expect_completion: bool,
) -> None:
    gate = asyncio.Event()
    blocking_handler = BlockingHandler()
    blocking_handler.release = gate
    handler: BlockingHandler | ImmediateHandler = blocking_handler
    heartbeat = RecordingHeartbeat(
        error_factory=lambda: RuntimeError("HEARTBEAT-STORAGE-SECRET"),
        release=gate,
    )
    if handler_error is not None:
        handler = ImmediateHandler(error=handler_error)
    claim = RecordingClaim(_claim())
    service, heartbeat, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        heartbeat=heartbeat,
    )
    task = asyncio.create_task(service.execute())
    await timing.wait_for_sleep_count(1)
    timing.release_sleep(now=140)
    await heartbeat.entered.wait()
    gate.set()
    if isinstance(handler, ImmediateHandler):
        await handler.finished.wait()
    else:
        await handler.finished.wait()
    await heartbeat.finished.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    assert bool(completion.calls) is expect_completion
    if expected_reason is None:
        assert failure.calls == []
    else:
        assert failure.calls[-1][-1] is expected_reason


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "handler_error",
    [None, NonRetryableHandlerFailure()],
)
async def test_simultaneous_heartbeat_ownership_loss_always_wins(
    handler_error: BaseException | None,
) -> None:
    handler = ImmediateHandler(error=handler_error)
    heartbeat = RecordingHeartbeat(error_factory=JobOwnershipLost)
    claim = RecordingClaim(_claim())
    service, heartbeat, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        heartbeat=heartbeat,
    )
    task = asyncio.create_task(service.execute())
    await timing.wait_for_sleep_count(1)
    timing.release_sleep(now=140)
    await handler.finished.wait()
    await heartbeat.finished.wait()
    timing.wait_release.set()

    with pytest.raises(JobOwnershipLost):
        await task
    assert completion.calls == []
    assert failure.calls == []


@pytest.mark.asyncio
async def test_delayed_heartbeat_schedules_from_current_time_without_overlap_or_burst() -> None:
    handler = BlockingHandler()
    heartbeat_release = asyncio.Event()
    heartbeat = RecordingHeartbeat(release=heartbeat_release)
    claim = RecordingClaim(_claim())
    service, heartbeat, _, _, timing = _service(
        claim=claim,
        handler=handler,
        heartbeat=heartbeat,
    )
    task = asyncio.create_task(service.execute())
    await timing.wait_for_sleep_count(1)
    assert timing.sleep_calls == [130.0]
    timing.release_sleep(now=200.0)
    await heartbeat.entered.wait()
    assert heartbeat.max_active == 1
    heartbeat_release.set()
    await heartbeat.finished.wait()
    await timing.wait_for_sleep_count(2)

    assert timing.sleep_calls == [130.0, 230.0]
    assert heartbeat.max_active == 1
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_external_cancellation_settles_handler_records_cancelled_then_propagates() -> None:
    handler = BlockingHandler()
    claim = RecordingClaim(_claim())
    service, _, completion, failure, timing = _service(claim=claim, handler=handler)
    task = asyncio.create_task(service.execute())
    await handler.started.wait()
    await timing.wait_started.wait()
    task.cancel()

    with pytest.raises(asyncio.CancelledError):
        await task
    assert handler.cancelled.is_set()
    assert handler.finished.is_set()
    assert completion.calls == []
    assert failure.calls[-1][-1] is FailureReason.HANDLER_CANCELLED


@pytest.mark.asyncio
async def test_uncooperative_handler_is_fatal_and_prohibits_lifecycle_writes() -> None:
    handler = BlockingHandler(uncooperative=True)
    timing = ControlledTiming(settle_pending=False)
    claim = RecordingClaim(_claim())
    service, heartbeat, completion, failure, timing = _service(
        claim=claim,
        handler=handler,
        timing=timing,
    )
    task = asyncio.create_task(service.execute())
    await handler.started.wait()
    await timing.wait_started.wait()
    task.cancel()

    with pytest.raises(JobHandlerSettlementUnknown) as fatal:
        await task
    assert handler.cancelled.is_set()
    assert heartbeat.calls == []
    assert completion.calls == []
    assert failure.calls == []
    assert fatal.value.__cause__ is None
    assert fatal.value.__context__ is None

    handler.cleanup.set()
    await handler.finished.wait()


@pytest.mark.asyncio
async def test_uncooperative_heartbeat_settlement_is_fatal_before_terminal_write() -> None:
    handler = ImmediateHandler({})
    timing = UncooperativeHeartbeatTiming()
    claim = RecordingClaim(_claim())
    service, _, completion, failure, _ = _service(
        claim=claim,
        handler=handler,
        timing=timing,
    )
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    with pytest.raises(JobHeartbeatSettlementUnknown) as fatal:
        await task
    assert timing.heartbeat_cancelled.is_set()
    assert completion.calls == []
    assert failure.calls == []
    assert fatal.value.__cause__ is None
    assert fatal.value.__context__ is None

    timing.heartbeat_cleanup.set()
    await timing.heartbeat_finished.wait()
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_execution_diagnostics_emit_no_private_sentinels(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    sentinels = (
        "JOB-ID-FORMAT-SENTINEL",
        "OWNER-SENTINEL",
        "ATTEMPT-SENTINEL",
        "TYPE-SENTINEL",
        "PAYLOAD-SENTINEL",
        "HANDLER-EXCEPTION-SENTINEL",
        "INVALID-RESULT-SENTINEL",
        "TIMING-SENTINEL",
        "DATABASE-SENTINEL",
    )
    handler = ImmediateHandler(error=RuntimeError(sentinels[5]))
    claim = RecordingClaim(
        _claim(
            job_type="fixture.handler",
            payload={"private": sentinels[4]},
        )
    )
    service, _, _, failure, timing = _service(claim=claim, handler=handler)
    task = asyncio.create_task(service.execute())
    await handler.finished.wait()
    timing.wait_release.set()

    outcome = await task
    captured = capsys.readouterr()
    diagnostics = " ".join(
        (
            str(outcome),
            repr(outcome),
            str(outcome.__dict__ if hasattr(outcome, "__dict__") else ""),
            captured.out,
            captured.err,
            caplog.text,
        )
    )
    assert failure.calls[-1][-1] is FailureReason.HANDLER_UNEXPECTED
    for sentinel in sentinels:
        assert sentinel not in diagnostics
