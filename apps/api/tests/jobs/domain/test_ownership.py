"""Claim-owner identifier contract tests."""

from __future__ import annotations

import pytest
from lumina.jobs.domain.models import JobClaimValidationError, validate_claimed_by


@pytest.mark.parametrize(
    "owner",
    ["worker", "worker.1", "worker_1", "worker-1", "a" * 128],
)
def test_valid_owner_tokens(owner: str) -> None:
    assert validate_claimed_by(owner) == owner


@pytest.mark.parametrize(
    "owner",
    ["", "Worker", ".worker", "worker:1", "worker/1", "a" * 129],
)
def test_invalid_owner_tokens(owner: str) -> None:
    with pytest.raises(JobClaimValidationError, match="claimant identifier is invalid"):
        validate_claimed_by(owner)
