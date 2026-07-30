"""Secret-safe domain values and failures for owner-guarded job heartbeats."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from lumina.jobs.domain.models import (
    ExpectedJobAttempt,
    JobClaimValidationError,
    validate_claimed_by,
)

_INVALID_REQUEST_MESSAGE = "Job heartbeat request is invalid."
_OWNERSHIP_LOST_MESSAGE = "Job heartbeat ownership was lost."


class JobHeartbeatValidationError(ValueError):
    """Raised when caller input cannot form a bounded heartbeat request."""

    def __init__(self) -> None:
        super().__init__(_INVALID_REQUEST_MESSAGE)


class _SafeHeartbeatFailure(RuntimeError):
    """Base for fixed, non-evidentiary heartbeat database failures."""

    message: str

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        """Keep exception diagnostics fixed and free of heartbeat evidence."""
        return f"{type(self).__name__}(<redacted>)"


class JobOwnershipLost(_SafeHeartbeatFailure):
    """Indistinguishable outcome for every rejected guarded heartbeat."""

    message = _OWNERSHIP_LOST_MESSAGE


class JobHeartbeatStorageUnavailable(_SafeHeartbeatFailure):
    """Raised only for confirmed heartbeat connection or transport failure."""

    message = "Job heartbeat storage is temporarily unavailable."


class JobHeartbeatContention(_SafeHeartbeatFailure):
    """Raised when PostgreSQL bounds a heartbeat statement or lock wait."""

    message = "Job heartbeat timed out while waiting for database contention."


class JobHeartbeatDatabaseStateFailure(_SafeHeartbeatFailure):
    """Raised for malformed heartbeat results or inconsistent database state."""

    message = "Job heartbeat failed because database state is inconsistent."


class JobHeartbeatDatabaseProgrammingFailure(_SafeHeartbeatFailure):
    """Raised for heartbeat ACL, schema, SQL, or programming failures."""

    message = "Job heartbeat failed because database operations are incompatible."


class JobHeartbeatDatabaseOperationFailure(_SafeHeartbeatFailure):
    """Raised for otherwise unclassified heartbeat database failures."""

    message = "Job heartbeat database operation failed."


@dataclass(frozen=True, repr=False, slots=True)
class JobOwnerToken:
    """Validated B1-compatible owner token with a fixed redacted representation."""

    value: str = field(repr=False)

    def __post_init__(self) -> None:
        valid = True
        try:
            validated = validate_claimed_by(self.value)
        except JobClaimValidationError:
            valid = False
            validated = ""
        if not valid:
            raise JobHeartbeatValidationError()
        object.__setattr__(self, "value", validated)

    def __repr__(self) -> str:
        """Never include the owner token in diagnostics."""
        return "JobOwnerToken(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary string conversion secret-safe."""
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class HeartbeatJobRequest:
    """One validated job identifier and its expected ownership attempt."""

    job_id: UUID
    owner: JobOwnerToken = field(repr=False)
    expected_attempt: ExpectedJobAttempt = field(repr=False)

    def __post_init__(self) -> None:
        if (
            not isinstance(self.job_id, UUID)
            or type(self.owner) is not JobOwnerToken
            or type(self.expected_attempt) is not ExpectedJobAttempt
        ):
            raise JobHeartbeatValidationError()

    def __repr__(self) -> str:
        """Never include the job or owner identifiers in diagnostics."""
        return "HeartbeatJobRequest(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary string conversion secret-safe."""
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class HeartbeatRecorded:
    """Successful PostgreSQL-authored heartbeat evidence."""

    job_id: UUID
    heartbeat_at: datetime

    def __post_init__(self) -> None:
        try:
            timestamp_is_aware = (
                isinstance(self.heartbeat_at, datetime)
                and self.heartbeat_at.tzinfo is not None
                and self.heartbeat_at.utcoffset() is not None
            )
        except (OverflowError, ValueError):
            timestamp_is_aware = False
        if not isinstance(self.job_id, UUID) or not timestamp_is_aware:
            raise JobHeartbeatValidationError()

    def __repr__(self) -> str:
        """Never include the identifier or PostgreSQL timestamp in diagnostics."""
        return "HeartbeatRecorded(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary string conversion secret-safe."""
        return self.__repr__()
