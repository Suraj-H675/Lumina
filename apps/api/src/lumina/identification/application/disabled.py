"""Fail obsolete queued identification work without touching private storage."""

from __future__ import annotations

from lumina.jobs.domain.handler import NonRetryableHandlerFailure
from lumina.jobs.domain.payload import PersistedJobPayload


class DisabledIdentificationHandler:
    """Reject persisted identification jobs that no longer have a runtime solver."""

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload
        raise NonRetryableHandlerFailure()

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        raise NonRetryableHandlerFailure()

    def __repr__(self) -> str:
        return "DisabledIdentificationHandler(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


__all__ = ["DisabledIdentificationHandler"]
