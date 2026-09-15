"""Durable, redacted lifecycle contracts for consented remote plate solving."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from lumina.identification.domain.nova import NovaJobId, NovaSubmissionId

_LEASE = re.compile(r"[0-9a-f]{64}", re.ASCII)


class RemoteSolveState(StrEnum):
    SUBMITTING = "submitting"
    WAITING_FOR_SOLVER = "waiting_for_solver"
    SOLVING = "solving"
    FETCHING_RESULTS = "fetching_results"
    SUCCEEDED = "succeeded"
    UNSOLVED = "unsolved"
    FAILED = "failed"
    EXPIRED = "expired"
    DELETED = "deleted"


class RemoteTransitionReason(StrEnum):
    REMOTE_PROCESSING_CONSENTED = "remote_processing_consented"
    REMOTE_UPLOAD_ACCEPTED = "remote_upload_accepted"
    REMOTE_JOB_RESOLVED = "remote_job_resolved"
    REMOTE_JOB_SUCCEEDED = "remote_job_succeeded"
    NO_ASTROMETRIC_SOLUTION = "no_astrometric_solution"
    PROVIDER_REJECTED = "provider_rejected"
    PROVIDER_PROTOCOL_ERROR = "provider_protocol_error"
    REMOTE_SUBMISSION_OUTCOME_UNKNOWN = "remote_submission_outcome_unknown"
    LOCAL_INPUT_UNAVAILABLE = "local_input_unavailable"
    SOLVER_TIMEOUT = "solver_timeout"
    RESULTS_STORED = "results_stored"
    LOCAL_DELETED = "local_deleted"


_TERMINAL = frozenset(
    {
        RemoteSolveState.SUCCEEDED,
        RemoteSolveState.UNSOLVED,
        RemoteSolveState.FAILED,
        RemoteSolveState.EXPIRED,
        RemoteSolveState.DELETED,
    }
)
_POLLABLE = frozenset(
    {
        RemoteSolveState.SUBMITTING,
        RemoteSolveState.WAITING_FOR_SOLVER,
        RemoteSolveState.SOLVING,
        RemoteSolveState.FETCHING_RESULTS,
    }
)
_ALLOWED_TRANSITIONS: dict[RemoteSolveState | None, frozenset[RemoteSolveState]] = {
    None: frozenset({RemoteSolveState.SUBMITTING}),
    RemoteSolveState.SUBMITTING: frozenset(
        {
            RemoteSolveState.WAITING_FOR_SOLVER,
            RemoteSolveState.FAILED,
            RemoteSolveState.EXPIRED,
            RemoteSolveState.DELETED,
        }
    ),
    RemoteSolveState.WAITING_FOR_SOLVER: frozenset(
        {
            RemoteSolveState.SOLVING,
            RemoteSolveState.FAILED,
            RemoteSolveState.EXPIRED,
            RemoteSolveState.DELETED,
        }
    ),
    RemoteSolveState.SOLVING: frozenset(
        {
            RemoteSolveState.FETCHING_RESULTS,
            RemoteSolveState.UNSOLVED,
            RemoteSolveState.FAILED,
            RemoteSolveState.EXPIRED,
            RemoteSolveState.DELETED,
        }
    ),
    RemoteSolveState.FETCHING_RESULTS: frozenset(
        {
            RemoteSolveState.SUCCEEDED,
            RemoteSolveState.FAILED,
            RemoteSolveState.EXPIRED,
            RemoteSolveState.DELETED,
        }
    ),
}
_REASON_BY_TARGET: dict[RemoteSolveState, frozenset[RemoteTransitionReason]] = {
    RemoteSolveState.SUBMITTING: frozenset({RemoteTransitionReason.REMOTE_PROCESSING_CONSENTED}),
    RemoteSolveState.WAITING_FOR_SOLVER: frozenset({RemoteTransitionReason.REMOTE_UPLOAD_ACCEPTED}),
    RemoteSolveState.SOLVING: frozenset({RemoteTransitionReason.REMOTE_JOB_RESOLVED}),
    RemoteSolveState.FETCHING_RESULTS: frozenset({RemoteTransitionReason.REMOTE_JOB_SUCCEEDED}),
    RemoteSolveState.SUCCEEDED: frozenset({RemoteTransitionReason.RESULTS_STORED}),
    RemoteSolveState.UNSOLVED: frozenset({RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION}),
    RemoteSolveState.EXPIRED: frozenset({RemoteTransitionReason.SOLVER_TIMEOUT}),
    RemoteSolveState.DELETED: frozenset({RemoteTransitionReason.LOCAL_DELETED}),
    RemoteSolveState.FAILED: frozenset(
        {
            RemoteTransitionReason.PROVIDER_REJECTED,
            RemoteTransitionReason.PROVIDER_PROTOCOL_ERROR,
            RemoteTransitionReason.REMOTE_SUBMISSION_OUTCOME_UNKNOWN,
            RemoteTransitionReason.LOCAL_INPUT_UNAVAILABLE,
        }
    ),
}


class RemoteStateValidationError(ValueError):
    def __init__(self) -> None:
        super().__init__("Remote identification state is invalid.")


class RemoteStateStorageFailure(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Remote identification state storage failed.")

    def __repr__(self) -> str:
        return "RemoteStateStorageFailure(<redacted>)"


@dataclass(frozen=True, slots=True, repr=False)
class RemoteLeaseToken:
    value: str = field(repr=False)

    def __post_init__(self) -> None:
        if type(self.value) is not str or _LEASE.fullmatch(self.value) is None:
            raise RemoteStateValidationError()

    def __repr__(self) -> str:
        return "RemoteLeaseToken(<redacted>)"

    __str__ = __repr__


@dataclass(frozen=True, slots=True, repr=False)
class RemoteSolveRecord:
    submission_id: UUID
    state: RemoteSolveState
    external_submission_id: NovaSubmissionId | None
    external_job_id: NovaJobId | None
    next_poll_at: datetime | None
    deadline_at: datetime
    last_polled_at: datetime | None
    upload_attempted_at: datetime | None
    terminal_at: datetime | None
    safe_reason: RemoteTransitionReason | None
    created_at: datetime
    updated_at: datetime

    def __post_init__(self) -> None:
        if not isinstance(self.submission_id, UUID) or self.submission_id.version != 4:
            raise RemoteStateValidationError()
        for name in ("deadline_at", "created_at", "updated_at"):
            object.__setattr__(self, name, _utc(getattr(self, name)))
        for name in ("next_poll_at", "last_polled_at", "upload_attempted_at", "terminal_at"):
            value = getattr(self, name)
            if value is not None:
                object.__setattr__(self, name, _utc(value))
        _validate_record_shape(self)

    @property
    def terminal(self) -> bool:
        return self.state in _TERMINAL

    @property
    def pollable(self) -> bool:
        return self.state in _POLLABLE

    def __repr__(self) -> str:
        return "RemoteSolveRecord(<redacted>)"


@dataclass(frozen=True, slots=True, repr=False)
class RemoteSolveClaim:
    record: RemoteSolveRecord
    lease_token: RemoteLeaseToken = field(repr=False)
    database_claimed_at: datetime
    lease_expires_at: datetime

    def __post_init__(self) -> None:
        if (
            type(self.record) is not RemoteSolveRecord
            or type(self.lease_token) is not RemoteLeaseToken
        ):
            raise RemoteStateValidationError()
        object.__setattr__(self, "database_claimed_at", _utc(self.database_claimed_at))
        object.__setattr__(self, "lease_expires_at", _utc(self.lease_expires_at))
        if (
            not self.record.pollable
            or self.database_claimed_at < self.record.created_at
            or self.lease_expires_at <= self.database_claimed_at
        ):
            raise RemoteStateValidationError()

    def __repr__(self) -> str:
        return "RemoteSolveClaim(<redacted>)"


class RemoteFinalizationOutcome(StrEnum):
    APPLIED = "applied"
    FENCED = "fenced"


def validate_remote_transition(
    from_state: RemoteSolveState | None,
    to_state: RemoteSolveState,
    reason: RemoteTransitionReason,
) -> None:
    if type(to_state) is not RemoteSolveState or type(reason) is not RemoteTransitionReason:
        raise RemoteStateValidationError()
    if from_state is not None and type(from_state) is not RemoteSolveState:
        raise RemoteStateValidationError()
    if to_state not in _ALLOWED_TRANSITIONS.get(from_state, frozenset()):
        raise RemoteStateValidationError()
    if reason not in _REASON_BY_TARGET[to_state]:
        raise RemoteStateValidationError()


def _validate_record_shape(record: RemoteSolveRecord) -> None:
    if type(record.state) is not RemoteSolveState:
        raise RemoteStateValidationError()
    if record.deadline_at <= record.created_at or record.updated_at < record.created_at:
        raise RemoteStateValidationError()
    if record.next_poll_at is not None and record.next_poll_at < record.created_at:
        raise RemoteStateValidationError()
    if record.last_polled_at is not None and record.last_polled_at < record.created_at:
        raise RemoteStateValidationError()
    if record.upload_attempted_at is not None and record.upload_attempted_at < record.created_at:
        raise RemoteStateValidationError()
    if record.terminal_at is not None and record.terminal_at < record.created_at:
        raise RemoteStateValidationError()
    if record.state in _POLLABLE:
        if (
            record.next_poll_at is None
            or record.terminal_at is not None
            or record.safe_reason is not None
        ):
            raise RemoteStateValidationError()
    elif record.state in _TERMINAL:
        if (
            record.next_poll_at is not None
            or record.terminal_at is None
            or record.safe_reason is None
        ):
            raise RemoteStateValidationError()
    else:
        raise RemoteStateValidationError()

    if record.state is RemoteSolveState.SUBMITTING:
        if record.external_submission_id is not None or record.external_job_id is not None:
            raise RemoteStateValidationError()
    elif record.state is RemoteSolveState.WAITING_FOR_SOLVER:
        if (
            record.external_submission_id is None
            or record.external_job_id is not None
            or record.upload_attempted_at is None
        ):
            raise RemoteStateValidationError()
    elif record.state in {
        RemoteSolveState.SOLVING,
        RemoteSolveState.FETCHING_RESULTS,
        RemoteSolveState.SUCCEEDED,
        RemoteSolveState.UNSOLVED,
    } and (record.external_submission_id is None or record.external_job_id is None):
        raise RemoteStateValidationError()


def _utc(value: object) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise RemoteStateValidationError()
    return value.astimezone(UTC)


__all__ = [
    "RemoteFinalizationOutcome",
    "RemoteLeaseToken",
    "RemoteSolveClaim",
    "RemoteSolveRecord",
    "RemoteSolveState",
    "RemoteStateStorageFailure",
    "RemoteStateValidationError",
    "RemoteTransitionReason",
    "validate_remote_transition",
]
