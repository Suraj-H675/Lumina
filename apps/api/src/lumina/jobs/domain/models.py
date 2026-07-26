"""Enqueue-only job domain records."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum
from uuid import UUID

from .payload import JsonObjectPayload

_IDEMPOTENCY_KEY_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,254}", re.ASCII)
_IDEMPOTENCY_ERROR = "Job idempotency key is invalid."
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
