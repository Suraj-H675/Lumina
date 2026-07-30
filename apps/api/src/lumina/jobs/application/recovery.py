"""Application boundary for one atomic stale-running-job recovery batch."""

from __future__ import annotations

from typing import Protocol

from lumina.jobs.domain.recovery import (
    JobStaleThresholdSeconds,
    RecoverStaleJobsRequest,
    RecoverStaleJobsResult,
)


class RecoverStaleJobsStore(Protocol):
    """Only the bounded stale-running-job recovery capability."""

    async def recover(
        self,
        request: RecoverStaleJobsRequest,
    ) -> RecoverStaleJobsResult:
        """Persist at most one fixed-size atomic recovery batch."""
        ...


class RecoverStaleJobsService:
    """Inject validated policy and delegate one recovery invocation."""

    def __init__(
        self,
        store: RecoverStaleJobsStore,
        *,
        stale_seconds: int,
    ) -> None:
        self._store = store
        self._stale_threshold = JobStaleThresholdSeconds(stale_seconds)

    async def recover(self) -> RecoverStaleJobsResult:
        """Recover one fixed-size batch without caller-controlled lifecycle data."""
        return await self._store.recover(
            RecoverStaleJobsRequest(stale_threshold=self._stale_threshold)
        )
