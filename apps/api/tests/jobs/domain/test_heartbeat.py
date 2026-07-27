"""Owner-guarded heartbeat domain contract tests."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.heartbeat import (
    HeartbeatJobRequest,
    HeartbeatRecorded,
    JobHeartbeatValidationError,
    JobOwnershipLost,
    JobOwnerToken,
)

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_OWNER = "worker.heartbeat-secret"
_HEARTBEAT_AT = datetime(2026, 7, 26, 12, 30, tzinfo=UTC)


@pytest.mark.parametrize(
    "owner",
    ["worker", "worker.1", "worker_1", "worker-1", "a" * 128],
)
def test_owner_token_reuses_the_b1_owner_grammar(owner: str) -> None:
    token = JobOwnerToken(owner)

    assert token.value == owner
    assert repr(token) == "JobOwnerToken(<redacted>)"
    assert str(token) == "JobOwnerToken(<redacted>)"
    assert owner not in repr(token)


@pytest.mark.parametrize(
    "owner",
    ["", "Worker", ".worker", "worker:1", "worker/1", "a" * 129],
)
def test_invalid_owner_token_is_rejected_without_echo(owner: str) -> None:
    with pytest.raises(JobHeartbeatValidationError) as failure:
        JobOwnerToken(owner)

    assert failure.value.args == ("Job heartbeat request is invalid.",)
    if owner:
        assert owner not in str(failure.value)
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None


def test_request_and_success_are_immutable_aware_and_fully_redacted() -> None:
    request = HeartbeatJobRequest(job_id=_JOB_ID, owner=JobOwnerToken(_OWNER))
    recorded = HeartbeatRecorded(job_id=_JOB_ID, heartbeat_at=_HEARTBEAT_AT)

    assert request.job_id == _JOB_ID
    assert request.owner.value == _OWNER
    assert recorded.job_id == _JOB_ID
    assert recorded.heartbeat_at == _HEARTBEAT_AT
    assert repr(request) == "HeartbeatJobRequest(<redacted>)"
    assert str(request) == "HeartbeatJobRequest(<redacted>)"
    assert repr(recorded) == "HeartbeatRecorded(<redacted>)"
    assert str(recorded) == "HeartbeatRecorded(<redacted>)"
    for sentinel in (str(_JOB_ID), _OWNER, str(_HEARTBEAT_AT)):
        assert sentinel not in repr(request)
        assert sentinel not in repr(recorded)

    with pytest.raises(FrozenInstanceError):
        request.job_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        recorded.heartbeat_at = datetime.now(UTC)  # type: ignore[misc]


@pytest.mark.parametrize(
    ("job_id", "timestamp"),
    [
        ("not-a-uuid", _HEARTBEAT_AT),
        (_JOB_ID, datetime(2026, 7, 26, 12, 30)),
    ],
)
def test_invalid_domain_values_are_rejected(
    job_id: UUID | str,
    timestamp: datetime,
) -> None:
    with pytest.raises(JobHeartbeatValidationError):
        HeartbeatRecorded(job_id=cast(UUID, job_id), heartbeat_at=timestamp)


def test_ownership_loss_is_fixed_safe_and_non_evidentiary() -> None:
    error = JobOwnershipLost()
    serialized = str(error) + repr(error) + repr(error.args)

    assert str(error) == "Job heartbeat ownership was lost."
    assert repr(error) == "JobOwnershipLost(<redacted>)"
    assert error.args == ("Job heartbeat ownership was lost.",)
    assert error.__cause__ is None
    assert error.__context__ is None
    for sentinel in (str(_JOB_ID), _OWNER, str(_HEARTBEAT_AT)):
        assert sentinel not in serialized
