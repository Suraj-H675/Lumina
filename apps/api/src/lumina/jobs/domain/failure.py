"""Closed, secret-safe domain contracts for owned job failure transitions."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
from types import MappingProxyType
from typing import Self
from uuid import UUID

from lumina.jobs.domain.heartbeat import JobOwnerToken
from lumina.jobs.domain.models import (
    ExpectedJobAttempt,
    JobClaimValidationError,
    JobStatus,
    validate_claimed_by,
)

_ERROR_CODE_PATTERN = re.compile(r"[a-z][a-z0-9_.-]{0,127}", re.ASCII)
_INVALID_REQUEST_MESSAGE = "Job failure request is invalid."
_BACKOFF_BASE_SECONDS = 2
_BACKOFF_MAX_SECONDS = 300


class FailureClassification(Enum):
    """Closed transition policy attached to each production failure reason."""

    RETRYABLE = "retryable"
    NON_RETRYABLE = "non_retryable"
    TERMINAL_RECOVERY = "terminal_recovery"


class FailureReason(Enum):
    """Closed identities whose mutable Enum values carry no production metadata."""

    HANDLER_RETRYABLE = auto()
    HANDLER_NON_RETRYABLE = auto()
    HANDLER_TIMEOUT = auto()
    HANDLER_CANCELLED = auto()
    HANDLER_UNEXPECTED = auto()
    HANDLER_INVALID_RESULT = auto()
    UNSUPPORTED_TYPE = auto()
    INCOMPATIBLE_PAYLOAD = auto()
    HEARTBEAT_FAILED = auto()
    STALE_ATTEMPTS_EXHAUSTED = auto()

    @property
    def code(self) -> str:
        """Return the fixed schema-safe catalog code."""
        return _canonical_failure_entry(self).code

    @property
    def message(self) -> str:
        """Return the fixed catalog message."""
        return _canonical_failure_entry(self).message

    @property
    def classification(self) -> FailureClassification:
        """Return the catalog-owned transition classification."""
        return _canonical_failure_entry(self).classification

    def __repr__(self) -> str:
        """Do not expose even catalog selection through request diagnostics."""
        return "FailureReason(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary conversion non-evidentiary."""
        return self.__repr__()


@dataclass(frozen=True, slots=True)
class _FailureCatalogEntry:
    code: str
    message: str
    classification: FailureClassification
    c1_eligible: bool

    @property
    def retryable(self) -> bool:
        return self.classification is FailureClassification.RETRYABLE


_FAILURE_CATALOG = MappingProxyType(
    {
        FailureReason.HANDLER_RETRYABLE: _FailureCatalogEntry(
            "job.handler_retryable",
            "Job handler reported a retryable failure.",
            FailureClassification.RETRYABLE,
            True,
        ),
        FailureReason.HANDLER_NON_RETRYABLE: _FailureCatalogEntry(
            "job.handler_non_retryable",
            "Job handler reported a non-retryable failure.",
            FailureClassification.NON_RETRYABLE,
            True,
        ),
        FailureReason.HANDLER_TIMEOUT: _FailureCatalogEntry(
            "job.handler_timeout",
            "Job handler exceeded its execution deadline.",
            FailureClassification.RETRYABLE,
            True,
        ),
        FailureReason.HANDLER_CANCELLED: _FailureCatalogEntry(
            "job.handler_cancelled",
            "Job handler execution was cancelled.",
            FailureClassification.RETRYABLE,
            True,
        ),
        FailureReason.HANDLER_UNEXPECTED: _FailureCatalogEntry(
            "job.handler_unexpected",
            "Job handler failed unexpectedly.",
            FailureClassification.NON_RETRYABLE,
            True,
        ),
        FailureReason.HANDLER_INVALID_RESULT: _FailureCatalogEntry(
            "job.handler_invalid_result",
            "Job handler returned an invalid result.",
            FailureClassification.NON_RETRYABLE,
            True,
        ),
        FailureReason.UNSUPPORTED_TYPE: _FailureCatalogEntry(
            "job.unsupported_type",
            "Persisted job type is unsupported.",
            FailureClassification.NON_RETRYABLE,
            True,
        ),
        FailureReason.INCOMPATIBLE_PAYLOAD: _FailureCatalogEntry(
            "job.incompatible_payload",
            "Persisted job payload is incompatible.",
            FailureClassification.NON_RETRYABLE,
            True,
        ),
        FailureReason.HEARTBEAT_FAILED: _FailureCatalogEntry(
            "job.heartbeat_failed",
            "Job heartbeat failed during execution.",
            FailureClassification.RETRYABLE,
            True,
        ),
        FailureReason.STALE_ATTEMPTS_EXHAUSTED: _FailureCatalogEntry(
            "job.stale_attempts_exhausted",
            "Stale job exhausted its maximum attempts.",
            FailureClassification.TERMINAL_RECOVERY,
            False,
        ),
    }
)


class JobFailureValidationError(ValueError):
    """Raised when an internal failure request is not exactly catalog-derived."""

    def __init__(self) -> None:
        super().__init__(_INVALID_REQUEST_MESSAGE)

    def __repr__(self) -> str:
        """Keep validation diagnostics fixed and redacted."""
        return "JobFailureValidationError(<redacted>)"


class _SafeFailureOperation(RuntimeError):
    """Base for fixed, cause-free failure-transition errors."""

    message: str

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        """Keep database and ownership evidence out of diagnostics."""
        return f"{type(self).__name__}(<redacted>)"


class JobFailureStorageUnavailable(_SafeFailureOperation):
    """Confirmed failure-store acquisition or transport unavailability."""

    message = "Job failure storage is temporarily unavailable."


class JobFailureContention(_SafeFailureOperation):
    """Configured PostgreSQL statement or lock timeout."""

    message = "Job failure timed out while waiting for database contention."


class JobFailureDatabaseStateFailure(_SafeFailureOperation):
    """Integrity failure or malformed returned database evidence."""

    message = "Job failure could not be recorded because database state is inconsistent."


class JobFailureDatabaseProgrammingFailure(_SafeFailureOperation):
    """SQL, schema, ACL, or other programming incompatibility."""

    message = "Job failure could not be recorded because database operations are incompatible."


class JobFailureDatabaseOperationFailure(_SafeFailureOperation):
    """Generic failure operation or exact evidence that the mutation did not persist."""

    message = "Job failure database operation failed."


class JobFailureOutcomeUnknown(_SafeFailureOperation):
    """Fatal indeterminate durable outcome after a returned failure mutation."""

    message = "Job failure outcome is unknown."


def _canonical_failure_entry(reason: object) -> _FailureCatalogEntry:
    if type(reason) is not FailureReason:
        raise JobFailureValidationError()
    for catalog_reason, entry in _FAILURE_CATALOG.items():
        if reason is catalog_reason:
            return entry
    raise JobFailureValidationError()


def retry_delay_seconds(expected_attempt: ExpectedJobAttempt) -> int:
    """Return deterministic bounded exponential delay for the committed attempt."""
    if (
        type(expected_attempt) is not ExpectedJobAttempt
        or type(expected_attempt.value) is not int
        or not 1 <= expected_attempt.value <= 5
    ):
        raise JobFailureValidationError()
    delay = _BACKOFF_BASE_SECONDS
    for _ in range(expected_attempt.value - 1):
        if delay >= _BACKOFF_MAX_SECONDS:
            return _BACKOFF_MAX_SECONDS
        delay = min(_BACKOFF_MAX_SECONDS, delay * 2)
    return delay


@dataclass(frozen=True, repr=False, slots=True, init=False)
class FailJobRequest:
    """Intrinsically catalog-derived owner/status/attempt failure request."""

    job_id: UUID
    owner: JobOwnerToken = field(repr=False)
    expected_attempt: ExpectedJobAttempt = field(repr=False)
    reason: FailureReason = field(repr=False)
    _code: str = field(repr=False)
    _message: str = field(repr=False)
    _classification: FailureClassification = field(repr=False)
    _retryable: bool = field(repr=False)
    _c1_eligible: bool = field(repr=False)
    _retry_delay_seconds: int | None = field(repr=False)

    def __new__(cls) -> Self:
        """Reject direct construction; production callers must use ``create``."""
        raise JobFailureValidationError()

    @classmethod
    def create(
        cls,
        *,
        job_id: UUID,
        owner: JobOwnerToken,
        expected_attempt: ExpectedJobAttempt,
        reason: FailureReason,
    ) -> Self:
        """Construct only an exact production failure request."""
        if (
            not isinstance(job_id, UUID)
            or type(owner) is not JobOwnerToken
            or type(expected_attempt) is not ExpectedJobAttempt
            or type(reason) is not FailureReason
        ):
            raise JobFailureValidationError()
        entry = _canonical_failure_entry(reason)
        if not entry.c1_eligible:
            raise JobFailureValidationError()
        try:
            owner_is_valid = validate_claimed_by(owner.value) == owner.value
        except (AttributeError, JobClaimValidationError, TypeError, ValueError):
            owner_is_valid = False
        if (
            not owner_is_valid
            or type(expected_attempt.value) is not int
            or not 1 <= expected_attempt.value <= 5
        ):
            raise JobFailureValidationError()
        classification = entry.classification
        delay = retry_delay_seconds(expected_attempt) if entry.retryable else None
        request = object.__new__(cls)
        object.__setattr__(request, "job_id", job_id)
        object.__setattr__(request, "owner", owner)
        object.__setattr__(request, "expected_attempt", expected_attempt)
        object.__setattr__(request, "reason", reason)
        object.__setattr__(request, "_code", entry.code)
        object.__setattr__(request, "_message", entry.message)
        object.__setattr__(request, "_classification", classification)
        object.__setattr__(request, "_retryable", entry.retryable)
        object.__setattr__(request, "_c1_eligible", entry.c1_eligible)
        object.__setattr__(request, "_retry_delay_seconds", delay)
        return request

    @property
    def classification(self) -> FailureClassification:
        """Return the classification captured from the production catalog."""
        return self._classification

    @property
    def retry_delay_seconds(self) -> int | None:
        """Return the internally derived retry delay, if the reason is retryable."""
        return self._retry_delay_seconds

    def __repr__(self) -> str:
        """Never expose job, ownership, reason, or schedule evidence."""
        return "FailJobRequest(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary conversion non-evidentiary."""
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class RetryScheduled:
    """Successful retry requeue with PostgreSQL-authored availability."""

    job_id: UUID
    expected_attempt: ExpectedJobAttempt = field(repr=False)
    available_at: datetime = field(repr=False)

    def __post_init__(self) -> None:
        if (
            not isinstance(self.job_id, UUID)
            or type(self.expected_attempt) is not ExpectedJobAttempt
            or not _timestamp_is_aware(self.available_at)
        ):
            raise JobFailureValidationError()

    def __repr__(self) -> str:
        """Hide scheduling and ownership evidence."""
        return "RetryScheduled(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class TerminalFailureRecorded:
    """Successful terminal failure transition with PostgreSQL-authored completion."""

    job_id: UUID
    expected_attempt: ExpectedJobAttempt = field(repr=False)
    status: JobStatus
    completed_at: datetime = field(repr=False)

    def __post_init__(self) -> None:
        if (
            not isinstance(self.job_id, UUID)
            or type(self.expected_attempt) is not ExpectedJobAttempt
            or type(self.status) is not JobStatus
            or self.status not in {JobStatus.FAILED, JobStatus.DEAD_LETTER}
            or not _timestamp_is_aware(self.completed_at)
        ):
            raise JobFailureValidationError()

    def __repr__(self) -> str:
        """Hide transition and ownership evidence."""
        return "TerminalFailureRecorded(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


type FailJobOutcome = RetryScheduled | TerminalFailureRecorded


@dataclass(frozen=True, repr=False, slots=True)
class ValidatedFailJobRequest:
    """Private-boundary immutable snapshot used after asynchronous suspension."""

    job_id: UUID
    owner: str = field(repr=False)
    expected_attempt: ExpectedJobAttempt = field(repr=False)
    reason: FailureReason = field(repr=False)
    code: str = field(repr=False)
    message: str = field(repr=False)
    classification: FailureClassification = field(repr=False)
    retryable: bool = field(repr=False)
    retry_delay_seconds: int | None = field(repr=False)

    def __repr__(self) -> str:
        return "ValidatedFailJobRequest(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def validate_fail_job_request(request: object) -> ValidatedFailJobRequest:
    """Validate snapshots against the canonical catalog before any database work."""
    if type(request) is not FailJobRequest:
        raise JobFailureValidationError()
    try:
        reason = request.reason
        entry = _canonical_failure_entry(reason)
        expected_attempt = request.expected_attempt
        owner = request.owner
        classification = request.classification
        delay = request.retry_delay_seconds
        owner_value = owner.value
        valid = (
            isinstance(request.job_id, UUID)
            and type(owner) is JobOwnerToken
            and validate_claimed_by(owner_value) == owner_value
            and type(expected_attempt) is ExpectedJobAttempt
            and type(expected_attempt.value) is int
            and 1 <= expected_attempt.value <= 5
            and type(reason) is FailureReason
            and entry.c1_eligible
            and type(classification) is FailureClassification
            and classification is entry.classification
            and request._code == entry.code
            and request._message == entry.message
            and request._retryable is entry.retryable
            and request._c1_eligible is entry.c1_eligible
            and _catalog_entry_is_schema_safe(entry)
        )
        expected_delay = retry_delay_seconds(expected_attempt) if entry.retryable else None
        valid = (
            valid
            and delay == expected_delay
            and (
                (entry.retryable and type(delay) is int)
                or (
                    classification is FailureClassification.NON_RETRYABLE
                    and not entry.retryable
                    and delay is None
                )
            )
        )
    except (AttributeError, JobClaimValidationError, TypeError, ValueError):
        valid = False
    if not valid:
        raise JobFailureValidationError()
    return ValidatedFailJobRequest(
        job_id=request.job_id,
        owner=owner_value,
        expected_attempt=expected_attempt,
        reason=reason,
        code=entry.code,
        message=entry.message,
        classification=entry.classification,
        retryable=entry.retryable,
        retry_delay_seconds=expected_delay,
    )


def _catalog_entry_is_schema_safe(entry: _FailureCatalogEntry) -> bool:
    return (
        _ERROR_CODE_PATTERN.fullmatch(entry.code) is not None
        and len(entry.code) <= 128
        and len(entry.message) <= 1024
    )


def _timestamp_is_aware(value: object) -> bool:
    try:
        return (
            isinstance(value, datetime)
            and value.tzinfo is not None
            and value.utcoffset() is not None
        )
    except (OverflowError, ValueError):
        return False
