"""Provider-owned adapter for the generic Lumina job-handler contract."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol

from lumina.jobs.domain.handler import IncompatibleHandlerPayload
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.provenance.application.registry import PRODUCTION_PROVIDER_CODES


class ProviderSyncPort(Protocol):
    """Application capability required by the provider synchronization job."""

    async def sync(self, provider_code: str) -> object:
        """Execute one provider synchronization cycle."""
        ...


class ProviderSyncHandler:
    """Translate one exact persisted provider job into the sync application service."""

    def __init__(self, service: ProviderSyncPort) -> None:
        self._service = service

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        """Require exactly the fixed provider code and no additional options."""
        _validate_provider_sync_payload(payload)

    async def handle(self, payload: PersistedJobPayload) -> object:
        """Execute one provider cycle; handled upstream outcomes complete the job."""
        self.validate_payload(payload)
        value = payload.value
        if not isinstance(value, Mapping):
            raise IncompatibleHandlerPayload()
        provider_code = value.get("provider_code")
        if type(provider_code) is not str:
            raise IncompatibleHandlerPayload()
        await self._service.sync(provider_code)
        return {}

    def __repr__(self) -> str:
        """Keep provider service internals out of diagnostics."""
        return "ProviderSyncHandler(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def _validate_provider_sync_payload(payload: PersistedJobPayload) -> None:
    value = payload.value
    if not isinstance(value, Mapping) or set(value) != {"provider_code"}:
        raise IncompatibleHandlerPayload()
    provider_code = value.get("provider_code")
    if type(provider_code) is not str or provider_code not in PRODUCTION_PROVIDER_CODES:
        raise IncompatibleHandlerPayload()


__all__ = ["ProviderSyncHandler", "ProviderSyncPort"]
