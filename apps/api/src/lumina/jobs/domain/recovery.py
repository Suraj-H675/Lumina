"""Secret-safe domain contracts for atomic stale-running-job recovery."""

from __future__ import annotations

from dataclasses import dataclass, field

RECOVERY_BATCH_SIZE = 100
MIN_STALE_SECONDS = 2
MAX_STALE_SECONDS = 86_400
_INVALID_REQUEST_MESSAGE = "Job recovery request is invalid."


class JobRecoveryValidationError(ValueError):
    """Raised when recovery input or aggregate evidence is invalid."""

    def __init__(self) -> None:
        super().__init__(_INVALID_REQUEST_MESSAGE)

    def __repr__(self) -> str:
        """Keep validation diagnostics fixed and non-evidentiary."""
        return "JobRecoveryValidationError(<redacted>)"


class _SafeRecoveryFailure(RuntimeError):
    """Base for fixed, cause-free recovery storage failures."""

    message: str

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        """Keep database and lifecycle evidence out of diagnostics."""
        return f"{type(self).__name__}(<redacted>)"


class JobRecoveryStorageUnavailable(_SafeRecoveryFailure):
    """Confirmed recovery-store acquisition or transport unavailability."""

    message = "Job recovery storage is temporarily unavailable."


class JobRecoveryContention(_SafeRecoveryFailure):
    """Configured PostgreSQL statement or lock timeout."""

    message = "Job recovery timed out while waiting for database contention."


class JobRecoveryDatabaseStateFailure(_SafeRecoveryFailure):
    """Integrity failure or malformed aggregate database evidence."""

    message = "Job recovery failed because database state is inconsistent."


class JobRecoveryDatabaseProgrammingFailure(_SafeRecoveryFailure):
    """SQL, schema, ACL, or other programming incompatibility."""

    message = "Job recovery failed because database operations are incompatible."


class JobRecoveryDatabaseOperationFailure(_SafeRecoveryFailure):
    """Generic recovery database or resource-terminal-state failure."""

    message = "Job recovery database operation failed."


class JobRecoveryOutcomeUnknown(_SafeRecoveryFailure):
    """Fatal indeterminate durable outcome after a positive recovery mutation."""

    message = "Job recovery outcome is unknown."


@dataclass(frozen=True, repr=False, slots=True)
class JobStaleThresholdSeconds:
    """Validated exact integer stale threshold in seconds."""

    value: int = field(repr=False)

    def __post_init__(self) -> None:
        if type(self.value) is not int or not MIN_STALE_SECONDS <= self.value <= MAX_STALE_SECONDS:
            raise JobRecoveryValidationError()

    def __repr__(self) -> str:
        """Do not expose recovery policy through diagnostics."""
        return "JobStaleThresholdSeconds(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class RecoverStaleJobsRequest:
    """One recovery request containing only the validated stale threshold."""

    stale_threshold: JobStaleThresholdSeconds = field(repr=False)

    def __post_init__(self) -> None:
        if type(self.stale_threshold) is not JobStaleThresholdSeconds:
            raise JobRecoveryValidationError()

    def __repr__(self) -> str:
        """Never expose recovery policy or lifecycle evidence."""
        return "RecoverStaleJobsRequest(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


@dataclass(frozen=True, repr=False, slots=True)
class RecoverStaleJobsResult:
    """Aggregate-only evidence from one bounded recovery batch."""

    requeued_count: int = field(repr=False)
    dead_lettered_count: int = field(repr=False)

    def __post_init__(self) -> None:
        if (
            type(self.requeued_count) is not int
            or type(self.dead_lettered_count) is not int
            or self.requeued_count < 0
            or self.dead_lettered_count < 0
            or self.total_count > RECOVERY_BATCH_SIZE
        ):
            raise JobRecoveryValidationError()

    @property
    def total_count(self) -> int:
        """Return the validated aggregate batch total."""
        return self.requeued_count + self.dead_lettered_count

    def __repr__(self) -> str:
        """Hide even aggregate operational evidence from diagnostics."""
        return "RecoverStaleJobsResult(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def validate_recover_stale_jobs_request(
    request: object,
) -> JobStaleThresholdSeconds:
    """Defensively snapshot a request before opening a database session."""
    if type(request) is not RecoverStaleJobsRequest:
        raise JobRecoveryValidationError()
    try:
        threshold = request.stale_threshold
        valid = (
            type(threshold) is JobStaleThresholdSeconds
            and type(threshold.value) is int
            and MIN_STALE_SECONDS <= threshold.value <= MAX_STALE_SECONDS
        )
    except (AttributeError, TypeError, ValueError):
        valid = False
    if not valid:
        raise JobRecoveryValidationError()
    return JobStaleThresholdSeconds(threshold.value)
