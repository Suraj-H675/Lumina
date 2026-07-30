"""Narrow application boundary tests for job failure transitions."""

from __future__ import annotations

import inspect
from datetime import UTC, datetime
from enum import Enum
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.application.failure import FailJobService
from lumina.jobs.domain.failure import (
    FailJobOutcome,
    FailJobRequest,
    FailureReason,
    JobFailureValidationError,
    RetryScheduled,
)

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_AVAILABLE_AT = datetime(2026, 7, 30, 10, tzinfo=UTC)


class RecordingFailStore:
    def __init__(self) -> None:
        self.requests: list[FailJobRequest] = []

    async def fail(self, request: FailJobRequest) -> FailJobOutcome:
        self.requests.append(request)
        return RetryScheduled(
            job_id=request.job_id,
            expected_attempt=request.expected_attempt,
            available_at=_AVAILABLE_AT,
        )


@pytest.mark.asyncio
async def test_service_builds_one_closed_request_and_delegates() -> None:
    store = RecordingFailStore()

    outcome = await FailJobService(store).fail(
        job_id=_JOB_ID,
        owner="worker.failure",
        expected_attempt=3,
        reason=FailureReason.HANDLER_RETRYABLE,
    )

    assert isinstance(outcome, RetryScheduled)
    assert len(store.requests) == 1
    request = store.requests[0]
    assert request.expected_attempt.value == 3
    assert request.retry_delay_seconds == 8
    assert request.reason is FailureReason.HANDLER_RETRYABLE


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_id", "owner", "attempt", "reason"),
    [
        ("not-a-uuid", "worker.failure", 1, FailureReason.HANDLER_RETRYABLE),
        (_JOB_ID, "invalid:owner", 1, FailureReason.HANDLER_RETRYABLE),
        (_JOB_ID, "worker.failure", 0, FailureReason.HANDLER_RETRYABLE),
        (_JOB_ID, "worker.failure", True, FailureReason.HANDLER_RETRYABLE),
        (_JOB_ID, "worker.failure", 1, FailureReason.STALE_ATTEMPTS_EXHAUSTED),
    ],
)
async def test_invalid_input_never_reaches_store(
    job_id: UUID | str,
    owner: str,
    attempt: int,
    reason: FailureReason,
) -> None:
    store = RecordingFailStore()

    with pytest.raises(JobFailureValidationError):
        await FailJobService(store).fail(
            job_id=cast(UUID, job_id),
            owner=owner,
            expected_attempt=attempt,
            reason=reason,
        )

    assert store.requests == []


@pytest.mark.asyncio
async def test_fixture_enum_cannot_reach_store() -> None:
    class FixtureReason(Enum):
        RETRYABLE = FailureReason.HANDLER_RETRYABLE.value

    store = RecordingFailStore()
    with pytest.raises(JobFailureValidationError):
        await FailJobService(store).fail(
            job_id=_JOB_ID,
            owner="worker.failure",
            expected_attempt=1,
            reason=cast(FailureReason, FixtureReason.RETRYABLE),
        )
    assert store.requests == []


def test_service_exposes_no_error_text_classification_or_delay() -> None:
    assert list(inspect.signature(FailJobService.fail).parameters) == [
        "self",
        "job_id",
        "owner",
        "expected_attempt",
        "reason",
    ]
    for excluded in ("code", "message", "classification", "retryable", "delay"):
        assert excluded not in inspect.signature(FailJobService.fail).parameters
