from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from lumina.identification.domain.nova import NovaJobId, NovaSubmissionId
from lumina.identification.domain.remote_state import (
    RemoteLeaseToken,
    RemoteSolveClaim,
    RemoteSolveRecord,
    RemoteSolveState,
    RemoteStateValidationError,
    RemoteTransitionReason,
    validate_remote_transition,
)

_NOW = datetime(2026, 9, 15, 15, 0, tzinfo=UTC)
_ID = UUID("12345678-1234-4234-8234-123456789abc")
_TOKEN = RemoteLeaseToken("ab" * 32)


def _record(
    state: RemoteSolveState,
    *,
    external_submission_id: NovaSubmissionId | None = None,
    external_job_id: NovaJobId | None = None,
    next_poll_at: datetime | None = _NOW + timedelta(seconds=5),
    terminal_at: datetime | None = None,
    safe_reason: RemoteTransitionReason | None = None,
    upload_attempted_at: datetime | None = None,
) -> RemoteSolveRecord:
    return RemoteSolveRecord(
        submission_id=_ID,
        state=state,
        external_submission_id=external_submission_id,
        external_job_id=external_job_id,
        next_poll_at=next_poll_at,
        deadline_at=_NOW + timedelta(minutes=15),
        last_polled_at=None,
        upload_attempted_at=upload_attempted_at,
        terminal_at=terminal_at,
        safe_reason=safe_reason,
        created_at=_NOW,
        updated_at=_NOW,
    )


def test_closed_transition_graph_accepts_only_reviewed_lifecycle_edges() -> None:
    accepted = (
        (None, RemoteSolveState.SUBMITTING, RemoteTransitionReason.REMOTE_PROCESSING_CONSENTED),
        (
            RemoteSolveState.SUBMITTING,
            RemoteSolveState.WAITING_FOR_SOLVER,
            RemoteTransitionReason.REMOTE_UPLOAD_ACCEPTED,
        ),
        (
            RemoteSolveState.WAITING_FOR_SOLVER,
            RemoteSolveState.SOLVING,
            RemoteTransitionReason.REMOTE_JOB_RESOLVED,
        ),
        (
            RemoteSolveState.SOLVING,
            RemoteSolveState.FETCHING_RESULTS,
            RemoteTransitionReason.REMOTE_JOB_SUCCEEDED,
        ),
        (
            RemoteSolveState.SOLVING,
            RemoteSolveState.UNSOLVED,
            RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION,
        ),
        (
            RemoteSolveState.FETCHING_RESULTS,
            RemoteSolveState.SUCCEEDED,
            RemoteTransitionReason.RESULTS_STORED,
        ),
        (
            RemoteSolveState.SUBMITTING,
            RemoteSolveState.FAILED,
            RemoteTransitionReason.REMOTE_SUBMISSION_OUTCOME_UNKNOWN,
        ),
        (
            RemoteSolveState.WAITING_FOR_SOLVER,
            RemoteSolveState.EXPIRED,
            RemoteTransitionReason.SOLVER_TIMEOUT,
        ),
        (
            RemoteSolveState.FETCHING_RESULTS,
            RemoteSolveState.DELETED,
            RemoteTransitionReason.LOCAL_DELETED,
        ),
    )
    for from_state, to_state, reason in accepted:
        validate_remote_transition(from_state, to_state, reason)

    rejected = (
        (
            RemoteSolveState.SUBMITTING,
            RemoteSolveState.SOLVING,
            RemoteTransitionReason.REMOTE_JOB_RESOLVED,
        ),
        (
            RemoteSolveState.SOLVING,
            RemoteSolveState.SUCCEEDED,
            RemoteTransitionReason.RESULTS_STORED,
        ),
        (
            RemoteSolveState.SUCCEEDED,
            RemoteSolveState.DELETED,
            RemoteTransitionReason.LOCAL_DELETED,
        ),
        (
            RemoteSolveState.SUBMITTING,
            RemoteSolveState.FAILED,
            RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION,
        ),
    )
    for from_state, to_state, reason in rejected:
        with pytest.raises(RemoteStateValidationError):
            validate_remote_transition(from_state, to_state, reason)


def test_record_shape_keeps_pollable_fetching_and_terminal_states_distinct() -> None:
    submitting = _record(RemoteSolveState.SUBMITTING)
    assert submitting.pollable is True
    assert submitting.terminal is False

    waiting = _record(
        RemoteSolveState.WAITING_FOR_SOLVER,
        external_submission_id=NovaSubmissionId(101),
        upload_attempted_at=_NOW + timedelta(seconds=1),
    )
    assert waiting.pollable is True

    solving = _record(
        RemoteSolveState.SOLVING,
        external_submission_id=NovaSubmissionId(101),
        external_job_id=NovaJobId(202),
        upload_attempted_at=_NOW + timedelta(seconds=1),
    )
    assert solving.pollable is True

    fetching = _record(
        RemoteSolveState.FETCHING_RESULTS,
        external_submission_id=NovaSubmissionId(101),
        external_job_id=NovaJobId(202),
        next_poll_at=_NOW + timedelta(seconds=5),
        upload_attempted_at=_NOW + timedelta(seconds=1),
    )
    assert fetching.pollable is True
    assert fetching.terminal is False

    unsolved = _record(
        RemoteSolveState.UNSOLVED,
        external_submission_id=NovaSubmissionId(101),
        external_job_id=NovaJobId(202),
        next_poll_at=None,
        terminal_at=_NOW + timedelta(minutes=2),
        safe_reason=RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION,
        upload_attempted_at=_NOW + timedelta(seconds=1),
    )
    assert unsolved.terminal is True
    assert unsolved.pollable is False


def test_record_rejects_cross_state_remote_id_and_terminal_shape_confusion() -> None:
    invalid = (
        dict(
            state=RemoteSolveState.SUBMITTING,
            external_submission_id=NovaSubmissionId(1),
        ),
        dict(
            state=RemoteSolveState.WAITING_FOR_SOLVER,
            external_submission_id=None,
        ),
        dict(
            state=RemoteSolveState.SOLVING,
            external_submission_id=NovaSubmissionId(1),
            external_job_id=None,
        ),
        dict(
            state=RemoteSolveState.FETCHING_RESULTS,
            external_submission_id=NovaSubmissionId(1),
            external_job_id=NovaJobId(2),
            next_poll_at=None,
        ),
        dict(
            state=RemoteSolveState.FAILED,
            next_poll_at=None,
            terminal_at=None,
            safe_reason=RemoteTransitionReason.PROVIDER_REJECTED,
        ),
    )
    for overrides in invalid:
        with pytest.raises(RemoteStateValidationError):
            _record(**overrides)


def test_lease_tokens_and_claims_are_fixed_redacted_private_evidence() -> None:
    record = _record(RemoteSolveState.SUBMITTING)
    claim = RemoteSolveClaim(
        record=record,
        lease_token=_TOKEN,
        database_claimed_at=_NOW,
        lease_expires_at=_NOW + timedelta(minutes=3),
    )
    assert repr(_TOKEN) == str(_TOKEN) == "RemoteLeaseToken(<redacted>)"
    assert repr(record) == "RemoteSolveRecord(<redacted>)"
    assert repr(claim) == "RemoteSolveClaim(<redacted>)"
    assert _TOKEN.value not in repr(claim)

    with pytest.raises(RemoteStateValidationError):
        RemoteLeaseToken("not-a-token")
    with pytest.raises(RemoteStateValidationError):
        RemoteSolveClaim(
            record=record,
            lease_token=_TOKEN,
            database_claimed_at=_NOW,
            lease_expires_at=_NOW,
        )
