"""Passive claim service boundary tests."""

from __future__ import annotations

import inspect

import pytest
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.domain.models import (
    ClaimJobOutcome,
    JobClaimValidationError,
    NoEligibleJob,
)


class RecordingClaimStore:
    def __init__(self, outcome: ClaimJobOutcome | None = None) -> None:
        self.outcome = outcome
        self.claimants: list[str] = []

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        self.claimants.append(claimed_by)
        return self.outcome or NoEligibleJob()


@pytest.mark.asyncio
async def test_claim_delegates_without_handler_operations() -> None:
    store = RecordingClaimStore()

    outcome = await ClaimJobService(store).claim(claimed_by="worker.claim")

    assert isinstance(outcome, NoEligibleJob)
    assert store.claimants == ["worker.claim"]
    assert list(inspect.signature(ClaimJobService).parameters) == ["store"]
    assert list(inspect.signature(ClaimJobService.claim).parameters) == [
        "self",
        "claimed_by",
    ]


@pytest.mark.asyncio
async def test_invalid_claimant_never_calls_store() -> None:
    store = RecordingClaimStore()

    with pytest.raises(JobClaimValidationError):
        await ClaimJobService(store).claim(claimed_by="invalid:worker")

    assert store.claimants == []
