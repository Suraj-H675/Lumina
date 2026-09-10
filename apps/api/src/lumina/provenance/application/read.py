"""Narrow application read boundary for durable provider snapshots."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol

from lumina.provenance.application.registry import ProviderRegistration
from lumina.provenance.domain.runtime import (
    ProviderPayloadCodec,
    ProviderRuntimeConfig,
    ProviderRuntimeStore,
    ProviderStatusSnapshot,
)


class ProviderSnapshotReadError(RuntimeError):
    """The static provider read composition could not resolve a provider."""

    def __init__(self) -> None:
        super().__init__("Provider snapshot could not be read.")

    def __repr__(self) -> str:
        return "ProviderSnapshotReadError(<redacted>)"


class ProviderSnapshotRegistry(Protocol):
    """Minimal registry capability needed by the durable read boundary."""

    def resolve(self, provider_code: str) -> ProviderRegistration | None:
        """Resolve one statically registered provider."""
        ...


class ProviderSnapshotClock(Protocol):
    """UTC clock used to evaluate cache state at the read boundary."""

    def now(self) -> datetime:
        """Return a timezone-aware UTC instant."""
        ...


@dataclass(frozen=True, slots=True)
class ProviderSnapshot:
    """Typed registration metadata paired with one durable status read."""

    config: ProviderRuntimeConfig
    payload_codec: ProviderPayloadCodec
    status: ProviderStatusSnapshot


class ProviderSnapshotReader(Protocol):
    """Narrow injected capability exposed to product application services."""

    async def read(self, provider_code: str) -> ProviderSnapshot:
        """Read one validated durable provider snapshot."""
        ...


class CachedProviderSnapshotReader:
    """Read provider cache/runtime state without granting product code DB access."""

    def __init__(
        self,
        *,
        registry: ProviderSnapshotRegistry,
        store: ProviderRuntimeStore,
        clock: ProviderSnapshotClock | None = None,
    ) -> None:
        self._registry = registry
        self._store = store
        self._clock = clock or _SystemProviderSnapshotClock()

    async def read(self, provider_code: str) -> ProviderSnapshot:
        """Return the registered provider's validated cache/status projection."""
        registration = self._registry.resolve(provider_code)
        if registration is None:
            raise ProviderSnapshotReadError()
        status = await self._store.status(
            registration.config,
            now=_utc(self._clock.now()),
            payload_codec=registration.payload_codec,
        )
        return ProviderSnapshot(
            config=registration.config,
            payload_codec=registration.payload_codec,
            status=status,
        )


class _SystemProviderSnapshotClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ProviderSnapshotReadError()
    return value.astimezone(UTC)


__all__ = [
    "CachedProviderSnapshotReader",
    "ProviderSnapshot",
    "ProviderSnapshotClock",
    "ProviderSnapshotReadError",
    "ProviderSnapshotReader",
    "ProviderSnapshotRegistry",
]
