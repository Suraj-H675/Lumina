"""Secret-safe domain values and failures for successful job completion."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID

from lumina.jobs.domain.heartbeat import JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt
from lumina.jobs.domain.result import ValidatedJobResult

_INVALID_REQUEST_MESSAGE = "Job completion request is invalid."


class JobCompletionValidationError(ValueError):
    """Raised when caller input cannot form a bounded completion request."""

    def __init__(self) -> None:
        super().__init__(_INVALID_REQUEST_MESSAGE)

    def __repr__(self) -> str:
        """Keep diagnostics fixed and non-evidentiary."""
        return "JobCompletionValidationError(<redacted>)"


class _SafeCompletionFailure(RuntimeError):
    """Base for fixed, non-evidentiary completion database failures."""

    message: str

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        """Keep exception diagnostics free of completion evidence."""
        return f"{type(self).__name__}(<redacted>)"


class JobCompletionStorageUnavailable(_SafeCompletionFailure):
    """Raised only for confirmed completion connection or transport failure."""

    message = "Job completion storage is temporarily unavailable."


class JobCompletionContention(_SafeCompletionFailure):
    """Raised when PostgreSQL bounds a completion statement or lock wait."""

    message = "Job completion timed out while waiting for database contention."


class JobCompletionDatabaseStateFailure(_SafeCompletionFailure):
    """Raised for malformed completion results or inconsistent database state."""

    message = "Job completion failed because database state is inconsistent."


class JobCompletionDatabaseProgrammingFailure(_SafeCompletionFailure):
    """Raised for completion ACL, schema, SQL, or programming failures."""

    message = "Job completion failed because database operations are incompatible."


class JobCompletionDatabaseOperationFailure(_SafeCompletionFailure):
    """Raised for otherwise unclassified completion database failures."""

    message = "Job completion database operation failed."


class JobCompletionOutcomeUnknown(_SafeCompletionFailure):
    """Fatal outcome when a completion commit cannot be confirmed or disproved."""

    message = "Job completion outcome is unknown."


@dataclass(frozen=True, repr=False, slots=True)
class CompleteJobRequest:
    """One validated successful-completion mutation request."""

    job_id: UUID
    owner: JobOwnerToken = field(repr=False)
    expected_attempt: ExpectedJobAttempt = field(repr=False)
    result: ValidatedJobResult = field(repr=False)

    def __post_init__(self) -> None:
        if (
            not isinstance(self.job_id, UUID)
            or type(self.owner) is not JobOwnerToken
            or type(self.expected_attempt) is not ExpectedJobAttempt
            or type(self.result) is not ValidatedJobResult
        ):
            raise JobCompletionValidationError()

    def __repr__(self) -> str:
        """Never include identifiers, ownership, or result evidence."""
        return "CompleteJobRequest(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary string conversion fully redacted."""
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class SuccessfulJobCompletion:
    """A successful completion with its PostgreSQL-authored timestamp."""

    job_id: UUID
    completed_at: datetime

    def __post_init__(self) -> None:
        try:
            timestamp_is_aware = (
                isinstance(self.completed_at, datetime)
                and self.completed_at.tzinfo is not None
                and self.completed_at.utcoffset() is not None
            )
        except (OverflowError, ValueError):
            timestamp_is_aware = False
        if not isinstance(self.job_id, UUID) or not timestamp_is_aware:
            raise JobCompletionValidationError()

    def __repr__(self) -> str:
        """Never include the identifier or completion timestamp."""
        return "SuccessfulJobCompletion(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary string conversion fully redacted."""
        return self.__repr__()
