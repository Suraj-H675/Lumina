"""Static, secret-safe contracts for internal job handlers."""

from __future__ import annotations

from typing import Protocol

from lumina.jobs.domain.payload import PersistedJobPayload


class _DeclaredHandlerFailure(RuntimeError):
    """Base for fixed declarations that never carry handler-provided text."""

    message: str

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        """Keep diagnostics fixed and free of handler or payload evidence."""
        return f"{type(self).__name__}(<redacted>)"


class RetryableHandlerFailure(_DeclaredHandlerFailure):
    """Declare a catalogued retryable handler failure."""

    message = "Job handler declared a retryable failure."


class NonRetryableHandlerFailure(_DeclaredHandlerFailure):
    """Declare a catalogued non-retryable handler failure."""

    message = "Job handler declared a non-retryable failure."


class IncompatibleHandlerPayload(_DeclaredHandlerFailure):
    """Declare that a passive persisted payload is incompatible."""

    message = "Job handler rejected an incompatible payload."


class JobHandler(Protocol):
    """One explicitly registered internal asynchronous handler."""

    async def handle(self, payload: PersistedJobPayload) -> object:
        """Execute using only the passive persisted payload."""
        ...
