"""Idempotent enqueue application service."""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol
from uuid import UUID, uuid4

from lumina.jobs.domain.models import (
    EnqueueJob,
    EnqueueJobOutcome,
    JobType,
    validate_idempotency_key,
    validate_job_type,
    validate_max_attempts,
    validate_priority,
)
from lumina.jobs.domain.payload import validate_json_object


class EnqueueJobStore(Protocol):
    """Only the persistence capability introduced by Phase 0B3A."""

    async def enqueue(self, job: EnqueueJob) -> EnqueueJobOutcome:
        """Insert or replay one validated logical enqueue request."""
        ...


class EnqueueJobService:
    """Validate and assign application UUIDs before persistence."""

    def __init__(
        self,
        store: EnqueueJobStore,
        *,
        payload_max_bytes: int,
        default_max_attempts: int,
        uuid_factory: Callable[[], UUID] = uuid4,
    ) -> None:
        self._store = store
        self._payload_max_bytes = payload_max_bytes
        self._default_max_attempts = validate_max_attempts(default_max_attempts)
        self._uuid_factory = uuid_factory

    async def enqueue(
        self,
        *,
        job_type: str | JobType,
        payload: object,
        idempotency_key: str | None = None,
        priority: int = 0,
        max_attempts: int | None = None,
    ) -> EnqueueJobOutcome:
        """Validate the complete logical request and delegate one atomic enqueue."""
        selected_max_attempts = self._default_max_attempts if max_attempts is None else max_attempts
        job = EnqueueJob(
            id=self._uuid_factory(),
            job_type=validate_job_type(job_type),
            payload=validate_json_object(payload, max_bytes=self._payload_max_bytes),
            idempotency_key=validate_idempotency_key(idempotency_key),
            priority=validate_priority(priority),
            max_attempts=validate_max_attempts(selected_max_attempts),
        )
        if job.id.version != 4:
            raise ValueError("Job identifiers must be UUIDv4.")
        return await self._store.enqueue(job)
