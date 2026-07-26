"""Job domain records for strict enqueue and passive claim boundaries."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from .payload import JsonObjectPayload, PersistedJobPayload

_IDEMPOTENCY_KEY_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,254}", re.ASCII)
_CLAIMED_BY_PATTERN = re.compile(r"[a-z][a-z0-9_.-]{0,127}", re.ASCII)
_IDEMPOTENCY_ERROR = "Job idempotency key is invalid."
_CLAIMED_BY_ERROR = "Job claimant identifier is invalid."
_PRIORITY_ERROR = "Job priority must fit a PostgreSQL smallint."
_MAX_ATTEMPTS_ERROR = "Job max attempts must be between 1 and 5."
_TYPE_ERROR = "Job type is not supported."


class JobValidationError(ValueError):
    """Raised when an enqueue request violates the bounded domain contract."""


class JobIdempotencyConflict(RuntimeError):
    """Raised when an idempotency key identifies a different logical request."""

    def __init__(self) -> None:
        super().__init__("Job idempotency conflict.")


class JobStorageUnavailable(RuntimeError):
    """Raised only for a confirmed database connection or transport failure."""

    def __init__(self) -> None:
        super().__init__("Job storage is temporarily unavailable.")


class JobEnqueueContention(RuntimeError):
    """Raised when PostgreSQL bounds a lock or statement wait."""

    def __init__(self) -> None:
        super().__init__("Job enqueue timed out while waiting for database contention.")


class JobDatabaseStateFailure(RuntimeError):
    """Raised for an unexpected integrity or durable-state failure."""

    def __init__(self) -> None:
        super().__init__("Job enqueue failed because database state is inconsistent.")


class JobDatabaseProgrammingFailure(RuntimeError):
    """Raised for an ACL, SQL, schema, or statement-programming failure."""

    def __init__(self) -> None:
        super().__init__("Job enqueue failed because database operations are incompatible.")


class JobDatabaseOperationFailure(RuntimeError):
    """Raised for an otherwise unclassified SQLAlchemy database operation failure."""

    def __init__(self) -> None:
        super().__init__("Job enqueue database operation failed.")


class JobClaimValidationError(ValueError):
    """Raised when a claim request has an invalid claimant identifier."""


class JobClaimStorageUnavailable(RuntimeError):
    """Raised only for a confirmed claim database connection or transport failure."""

    def __init__(self) -> None:
        super().__init__("Job claim storage is temporarily unavailable.")


class JobClaimContention(RuntimeError):
    """Raised when PostgreSQL bounds a claim statement wait."""

    def __init__(self) -> None:
        super().__init__("Job claim timed out while waiting for database contention.")


class JobClaimDatabaseStateFailure(RuntimeError):
    """Raised for an unexpected claim integrity or durable-state failure."""

    def __init__(self) -> None:
        super().__init__("Job claim failed because database state is inconsistent.")


class JobClaimDatabaseProgrammingFailure(RuntimeError):
    """Raised for an ACL, SQL, schema, or claim statement-programming failure."""

    def __init__(self) -> None:
        super().__init__("Job claim failed because database operations are incompatible.")


class JobClaimDatabaseOperationFailure(RuntimeError):
    """Raised for an otherwise unclassified SQLAlchemy claim operation failure."""

    def __init__(self) -> None:
        super().__init__("Job claim database operation failed.")


class JobClaimOutcomeUnknown(RuntimeError):
    """Raised when a returned claim cannot be confirmed or disproved."""

    def __init__(self) -> None:
        super().__init__("Job claim outcome is unknown.")


class JobType(StrEnum):
    """Internal allowlist of executable job types."""

    SYSTEM_NOOP = "system.noop"


class JobStatus(StrEnum):
    """Exact durable job states accepted by the existing schema."""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


@dataclass(frozen=True, repr=False)
class EnqueueJob:
    """A fully validated logical enqueue request with an application UUID."""

    id: UUID
    job_type: JobType
    payload: JsonObjectPayload = field(repr=False)
    idempotency_key: str | None = field(repr=False)
    priority: int
    max_attempts: int


@dataclass(frozen=True)
class EnqueueJobOutcome:
    """Safe enqueue result for an inserted job or an exact replay."""

    id: UUID
    status: JobStatus
    replayed: bool


@dataclass(frozen=True, repr=False, slots=True)
class PersistedJobTypeName:
    """A passive persisted type name that performs no handler selection."""

    value: str = field(repr=False)

    def __repr__(self) -> str:
        """Never include the persisted type in diagnostics."""
        return "PersistedJobTypeName(<redacted>)"

    def __str__(self) -> str:
        """Keep normal string conversion as secret-safe as representation."""
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class ClaimedJob:
    """The exact passive data returned by one successful database claim."""

    id: UUID
    job_type: PersistedJobTypeName
    payload: PersistedJobPayload = field(repr=False)
    attempts: int
    max_attempts: int
    claimed_at: datetime
    heartbeat_at: datetime

    def __repr__(self) -> str:
        """Never include claim ownership evidence or payload in diagnostics."""
        return "ClaimedJob(<redacted>)"

    def __str__(self) -> str:
        """Keep normal string conversion as secret-safe as representation."""
        return self.__repr__()


@dataclass(frozen=True, slots=True)
class NoEligibleJob:
    """Typed outcome indicating that the atomic claim returned no row."""


type ClaimJobOutcome = ClaimedJob | NoEligibleJob


def validate_job_type(value: str | JobType) -> JobType:
    """Accept only the explicitly registered foundational job type."""
    try:
        return JobType(value)
    except ValueError:
        raise JobValidationError(_TYPE_ERROR) from None


def validate_idempotency_key(value: str | None) -> str | None:
    """Require the exact safe ASCII idempotency-key grammar."""
    if value is not None and _IDEMPOTENCY_KEY_PATTERN.fullmatch(value) is None:
        raise JobValidationError(_IDEMPOTENCY_ERROR)
    return value


def validate_priority(value: int) -> int:
    """Require the complete PostgreSQL smallint range without Boolean coercion."""
    if isinstance(value, bool) or not isinstance(value, int) or not -32_768 <= value <= 32_767:
        raise JobValidationError(_PRIORITY_ERROR)
    return value


def validate_max_attempts(value: int) -> int:
    """Match the existing retry-attempt constraint exactly."""
    if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5:
        raise JobValidationError(_MAX_ATTEMPTS_ERROR)
    return value


def validate_claimed_by(value: str) -> str:
    """Require the existing database identifier grammar for a claimant."""
    if not isinstance(value, str) or _CLAIMED_BY_PATTERN.fullmatch(value) is None:
        raise JobClaimValidationError(_CLAIMED_BY_ERROR)
    return value
