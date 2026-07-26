"""Enqueue service validation and UUID behavior."""

from __future__ import annotations

from uuid import UUID

import pytest
from lumina.jobs.application.enqueue import EnqueueJobService
from lumina.jobs.domain.models import (
    EnqueueJob,
    EnqueueJobOutcome,
    JobStatus,
    JobValidationError,
)
from lumina.jobs.domain.payload import JobPayloadTooLarge

_UUID4 = UUID("12345678-1234-4234-9234-123456789abc")


class RecordingStore:
    def __init__(self) -> None:
        self.jobs: list[EnqueueJob] = []

    async def enqueue(self, job: EnqueueJob) -> EnqueueJobOutcome:
        self.jobs.append(job)
        return EnqueueJobOutcome(job.id, JobStatus.QUEUED, replayed=False)


def _service(store: RecordingStore, *, uuid_value: UUID = _UUID4) -> EnqueueJobService:
    return EnqueueJobService(
        store,
        payload_max_bytes=128,
        default_max_attempts=5,
        uuid_factory=lambda: uuid_value,
    )


@pytest.mark.asyncio
async def test_service_builds_one_validated_enqueue() -> None:
    store = RecordingStore()
    outcome = await _service(store).enqueue(
        job_type="system.noop",
        payload={"message": "phase0b"},
        idempotency_key="phase0b:no-op",
        priority=-1,
    )

    assert outcome == EnqueueJobOutcome(_UUID4, JobStatus.QUEUED, replayed=False)
    assert len(store.jobs) == 1
    assert store.jobs[0].max_attempts == 5


@pytest.mark.asyncio
async def test_validation_failure_never_calls_store() -> None:
    store = RecordingStore()

    with pytest.raises(JobValidationError):
        await _service(store).enqueue(job_type="system.unknown", payload={})
    with pytest.raises(JobPayloadTooLarge):
        await _service(store).enqueue(job_type="system.noop", payload={"x": "z" * 200})

    assert store.jobs == []


@pytest.mark.asyncio
async def test_non_uuid4_factory_is_rejected_before_store() -> None:
    store = RecordingStore()

    with pytest.raises(ValueError, match="UUIDv4"):
        await _service(
            store,
            uuid_value=UUID("12345678-1234-1234-9234-123456789abc"),
        ).enqueue(job_type="system.noop", payload={})

    assert store.jobs == []
