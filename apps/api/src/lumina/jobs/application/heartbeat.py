"""Application boundary for one owner-guarded job heartbeat."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from lumina.jobs.domain.heartbeat import (
    HeartbeatJobRequest,
    HeartbeatRecorded,
    JobOwnerToken,
)


class JobHeartbeatStore(Protocol):
    """Only the owner-guarded heartbeat capability introduced by Phase 0B3B2."""

    async def heartbeat(self, request: HeartbeatJobRequest) -> HeartbeatRecorded:
        """Record one PostgreSQL-authored heartbeat for the expected owner."""
        ...


class HeartbeatJobService:
    """Validate caller input before delegating one bounded heartbeat."""

    def __init__(self, store: JobHeartbeatStore) -> None:
        self._store = store

    async def heartbeat(self, *, job_id: UUID, owner: str) -> HeartbeatRecorded:
        """Record a heartbeat without accepting lifecycle or worker data."""
        request = HeartbeatJobRequest(
            job_id=job_id,
            owner=JobOwnerToken(owner),
        )
        return await self._store.heartbeat(request)
