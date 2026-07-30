"""Narrow application boundary tests for stale-job recovery."""

from __future__ import annotations

import inspect

import pytest
from lumina.jobs.application.recovery import RecoverStaleJobsService
from lumina.jobs.domain.recovery import (
    JobRecoveryValidationError,
    RecoverStaleJobsRequest,
    RecoverStaleJobsResult,
)


class RecordingRecoveryStore:
    def __init__(self) -> None:
        self.requests: list[RecoverStaleJobsRequest] = []

    async def recover(
        self,
        request: RecoverStaleJobsRequest,
    ) -> RecoverStaleJobsResult:
        self.requests.append(request)
        return RecoverStaleJobsResult(requeued_count=2, dead_lettered_count=1)


@pytest.mark.asyncio
async def test_service_injects_validated_threshold_and_delegates_once() -> None:
    store = RecordingRecoveryStore()
    service = RecoverStaleJobsService(store, stale_seconds=120)

    result = await service.recover()

    assert result.total_count == 3
    assert len(store.requests) == 1
    assert store.requests[0].stale_threshold.value == 120


@pytest.mark.parametrize("value", [True, 1, 86_401, 2.0])
def test_service_rejects_invalid_setting_before_storage(value: object) -> None:
    store = RecordingRecoveryStore()

    with pytest.raises(JobRecoveryValidationError):
        RecoverStaleJobsService(store, stale_seconds=value)  # type: ignore[arg-type]

    assert store.requests == []


def test_service_exposes_no_batch_cadence_worker_or_timestamp_input() -> None:
    assert list(inspect.signature(RecoverStaleJobsService.recover).parameters) == ["self"]
    assert list(inspect.signature(RecoverStaleJobsService).parameters) == [
        "store",
        "stale_seconds",
    ]
