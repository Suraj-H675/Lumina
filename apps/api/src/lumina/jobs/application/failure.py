"""Application boundary for one closed owner-guarded job failure transition."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from lumina.jobs.domain.failure import (
    FailJobOutcome,
    FailJobRequest,
    FailureReason,
    JobFailureValidationError,
)
from lumina.jobs.domain.heartbeat import JobHeartbeatValidationError, JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt, JobAttemptValidationError


class FailJobStore(Protocol):
    """Only the owner/status/attempt-guarded failure capability."""

    async def fail(self, request: FailJobRequest) -> FailJobOutcome:
        """Persist one exact catalog-derived failure transition."""
        ...


class FailJobService:
    """Build an intrinsically closed request before delegating one transition."""

    def __init__(self, store: FailJobStore) -> None:
        self._store = store

    async def fail(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        reason: FailureReason,
    ) -> FailJobOutcome:
        """Persist a failure without caller-controlled classification or error text."""
        try:
            owner_token = JobOwnerToken(owner)
            attempt = ExpectedJobAttempt(expected_attempt)
        except (JobHeartbeatValidationError, JobAttemptValidationError):
            raise JobFailureValidationError() from None
        request = FailJobRequest.create(
            job_id=job_id,
            owner=owner_token,
            expected_attempt=attempt,
            reason=reason,
        )
        return await self._store.fail(request)
