"""Successful-completion application boundary tests."""

from __future__ import annotations

import inspect
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.domain.completion import (
    CompleteJobRequest,
    JobCompletionValidationError,
    SuccessfulJobCompletion,
)
from lumina.jobs.domain.heartbeat import JobHeartbeatValidationError
from lumina.jobs.domain.result import JobResultInvalid, JobResultTooLarge

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_COMPLETED_AT = datetime(2026, 7, 28, 10, 30, tzinfo=UTC)


class RecordingCompletionStore:
    def __init__(self) -> None:
        self.requests: list[CompleteJobRequest] = []

    async def complete(
        self,
        request: CompleteJobRequest,
    ) -> SuccessfulJobCompletion:
        self.requests.append(request)
        return SuccessfulJobCompletion(
            job_id=request.job_id,
            completed_at=_COMPLETED_AT,
        )


@pytest.mark.asyncio
async def test_service_validates_then_delegates_one_narrow_request() -> None:
    store = RecordingCompletionStore()

    completed = await CompleteJobService(store, result_max_bytes=1_024).complete(
        job_id=_JOB_ID,
        owner="worker.application",
        expected_attempt=2,
        result={"z": 2, "a": [True, None]},
    )

    assert completed.completed_at == _COMPLETED_AT
    assert len(store.requests) == 1
    request = store.requests[0]
    assert request.job_id == _JOB_ID
    assert request.owner.value == "worker.application"
    assert request.expected_attempt.value == 2
    assert request.result.database_json == '{"a":[true,null],"z":2}'


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_id", "owner", "expected_attempt", "result", "expected"),
    [
        ("not-a-uuid", "worker.application", 2, {}, JobCompletionValidationError),
        (_JOB_ID, "invalid:owner", 2, {}, JobHeartbeatValidationError),
        (_JOB_ID, "worker.application", 0, {}, ValueError),
        (_JOB_ID, "worker.application", True, {}, ValueError),
        (_JOB_ID, "worker.application", 2, [], JobResultInvalid),
    ],
)
async def test_invalid_input_never_reaches_infrastructure(
    job_id: UUID | str,
    owner: str,
    expected_attempt: int,
    result: object,
    expected: type[Exception],
) -> None:
    store = RecordingCompletionStore()

    with pytest.raises(expected):
        await CompleteJobService(store, result_max_bytes=128).complete(
            job_id=cast(UUID, job_id),
            owner=owner,
            expected_attempt=expected_attempt,
            result=result,
        )

    assert store.requests == []


@pytest.mark.asyncio
async def test_oversized_application_result_is_rejected_before_store() -> None:
    store = RecordingCompletionStore()

    with pytest.raises(JobResultTooLarge):
        await CompleteJobService(store, result_max_bytes=8).complete(
            job_id=_JOB_ID,
            owner="worker.application",
            expected_attempt=2,
            result={"value": "too-large"},
        )

    assert store.requests == []


def test_service_accepts_no_lifecycle_or_worker_configuration() -> None:
    assert list(inspect.signature(CompleteJobService.complete).parameters) == [
        "self",
        "job_id",
        "owner",
        "expected_attempt",
        "result",
    ]
    assert list(inspect.signature(CompleteJobRequest).parameters) == [
        "job_id",
        "owner",
        "expected_attempt",
        "result",
    ]
    assert list(inspect.signature(SuccessfulJobCompletion).parameters) == [
        "job_id",
        "completed_at",
    ]
    for excluded in (
        "completed_at",
        "status",
        "progress",
        "error",
        "retry",
        "handler",
        "worker",
    ):
        assert excluded not in inspect.signature(CompleteJobService.complete).parameters
