"""Application boundary for owner-guarded successful job completion."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from lumina.jobs.domain.completion import (
    CompleteJobRequest,
    JobCompletionValidationError,
    SuccessfulJobCompletion,
)
from lumina.jobs.domain.heartbeat import JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt, JobAttemptValidationError
from lumina.jobs.domain.result import validate_job_result


class JobCompletionStore(Protocol):
    """Only the successful-completion capability introduced by Phase 0B3B3."""

    async def complete(
        self,
        request: CompleteJobRequest,
    ) -> SuccessfulJobCompletion:
        """Persist one exact owner-guarded successful completion."""
        ...


class CompleteJobService:
    """Validate all caller input before delegating one completion mutation."""

    def __init__(
        self,
        store: JobCompletionStore,
        *,
        result_max_bytes: int,
    ) -> None:
        if not 1 <= result_max_bytes <= 65_536:
            raise ValueError("Job result size setting is invalid.")
        self._store = store
        self._result_max_bytes = result_max_bytes

    async def complete(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
        result: object,
    ) -> SuccessfulJobCompletion:
        """Validate and persist one successful result without lifecycle extras."""
        try:
            attempt = ExpectedJobAttempt(expected_attempt)
        except JobAttemptValidationError:
            raise JobCompletionValidationError() from None
        request = CompleteJobRequest(
            job_id=job_id,
            owner=JobOwnerToken(owner),
            expected_attempt=attempt,
            result=validate_job_result(result, max_bytes=self._result_max_bytes),
        )
        return await self._store.complete(request)
