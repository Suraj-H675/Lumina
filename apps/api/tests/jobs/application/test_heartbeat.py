"""Owner-guarded heartbeat application boundary tests."""

from __future__ import annotations

import inspect
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.domain.heartbeat import (
    HeartbeatJobRequest,
    HeartbeatRecorded,
    JobHeartbeatValidationError,
)

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_HEARTBEAT_AT = datetime(2026, 7, 26, 12, 30, tzinfo=UTC)


class RecordingHeartbeatStore:
    def __init__(self) -> None:
        self.requests: list[HeartbeatJobRequest] = []

    async def heartbeat(self, request: HeartbeatJobRequest) -> HeartbeatRecorded:
        self.requests.append(request)
        return HeartbeatRecorded(
            job_id=request.job_id,
            heartbeat_at=_HEARTBEAT_AT,
        )


@pytest.mark.asyncio
async def test_service_validates_then_delegates_one_narrow_request() -> None:
    store = RecordingHeartbeatStore()

    recorded = await HeartbeatJobService(store).heartbeat(
        job_id=_JOB_ID,
        owner="worker.application",
    )

    assert recorded.job_id == _JOB_ID
    assert recorded.heartbeat_at == _HEARTBEAT_AT
    assert len(store.requests) == 1
    assert store.requests[0].job_id == _JOB_ID
    assert store.requests[0].owner.value == "worker.application"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_id", "owner"),
    [
        ("not-a-uuid", "worker.application"),
        (_JOB_ID, "invalid:owner"),
    ],
)
async def test_invalid_caller_input_never_reaches_infrastructure(
    job_id: UUID | str,
    owner: str,
) -> None:
    store = RecordingHeartbeatStore()

    with pytest.raises(JobHeartbeatValidationError):
        await HeartbeatJobService(store).heartbeat(
            job_id=cast(UUID, job_id),
            owner=owner,
        )

    assert store.requests == []


def test_service_exposes_no_lifecycle_or_caller_timestamp_inputs() -> None:
    assert list(inspect.signature(HeartbeatJobService).parameters) == ["store"]
    assert list(inspect.signature(HeartbeatJobService.heartbeat).parameters) == [
        "self",
        "job_id",
        "owner",
    ]
    assert list(inspect.signature(HeartbeatJobRequest).parameters) == [
        "job_id",
        "owner",
    ]
    assert list(inspect.signature(HeartbeatRecorded).parameters) == [
        "job_id",
        "heartbeat_at",
    ]
