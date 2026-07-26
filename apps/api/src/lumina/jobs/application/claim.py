"""Claim one queued job without selecting or executing a handler."""

from __future__ import annotations

from typing import Protocol

from lumina.jobs.domain.models import ClaimJobOutcome, validate_claimed_by


class ClaimJobStore(Protocol):
    """Only the passive claim capability introduced by Phase 0B3B1."""

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        """Claim the next eligible row, or return a typed no-row outcome."""
        ...


class ClaimJobService:
    """Validate claimant identity and delegate one passive database claim."""

    def __init__(self, store: ClaimJobStore) -> None:
        self._store = store

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        """Return a claimed row without handler lookup, validation, or execution."""
        return await self._store.claim(claimed_by=validate_claimed_by(claimed_by))
