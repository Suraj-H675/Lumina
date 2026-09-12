"""Explicit production provider registry and immutable NASA runtime policy."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Protocol

from lumina.provenance.domain.provider import ProviderRuntimeAdapter
from lumina.provenance.domain.request_plan import (
    ProviderComponentResult,
    ProviderRequestPlan,
)
from lumina.provenance.domain.runtime import (
    APOD_PROVIDER_CODE,
    NEOWS_PROVIDER_CODE,
    PROVIDER_CODE,
    SWPC_PROVIDER_CODE,
    ProviderPayloadCodec,
    ProviderRuntimeConfig,
)

PRODUCTION_PROVIDER_CODES = frozenset(
    {PROVIDER_CODE, APOD_PROVIDER_CODE, NEOWS_PROVIDER_CODE, SWPC_PROVIDER_CODE}
)


def _always_configured() -> bool:
    return True


class ProviderRequestFactory(Protocol):
    """Factory for the typed request owned by one static adapter registration."""

    def __call__(self) -> object:
        """Construct the fixed request without performing network I/O."""
        ...


class ProviderSnapshotNormalizer(Protocol):
    """Combine one complete ordered request plan into one normalized snapshot."""

    def __call__(
        self,
        plan: ProviderRequestPlan,
        results: tuple[ProviderComponentResult, ...],
    ) -> object:
        """Return one provider-owned normalized result after all components succeed."""
        ...


@dataclass(frozen=True, slots=True)
class ProviderRegistration:
    """One explicit provider code, policy, and already-constructed adapter."""

    config: ProviderRuntimeConfig
    adapter: ProviderRuntimeAdapter
    request_factory: ProviderRequestFactory
    payload_codec: ProviderPayloadCodec
    check_replacement: bool = False
    configuration_check: Callable[[], bool] = field(default=_always_configured, repr=False)
    snapshot_normalizer: ProviderSnapshotNormalizer | None = field(default=None, repr=False)

    def is_configured(self) -> bool:
        """Return whether local configuration permits a provider network request."""
        return self.configuration_check()

    def request_plan(self) -> ProviderRequestPlan:
        """Return a finite plan, wrapping existing providers as one-component plans."""
        request = self.request_factory()
        if isinstance(request, ProviderRequestPlan):
            return request
        return ProviderRequestPlan.single(request, self.config.max_response_bytes)


class StaticProviderRegistry:
    """Immutable exact-code registry with no discovery or database-controlled classes."""

    def __init__(self, registrations: Mapping[str, ProviderRegistration]) -> None:
        copied = dict(registrations)
        if not copied or not set(copied).issubset(PRODUCTION_PROVIDER_CODES):
            raise ValueError("Production provider registry contains an unapproved provider")
        for code, registration in copied.items():
            if code != registration.config.provider_code:
                raise ValueError("Provider registry key does not match provider configuration")
        self._registrations = MappingProxyType(copied)

    def resolve(self, provider_code: str) -> ProviderRegistration | None:
        """Resolve one exact static provider code."""
        return self._registrations.get(provider_code)

    @property
    def registered_codes(self) -> frozenset[str]:
        """Expose the finite production allowlist for checks and operator surfaces."""
        return frozenset(self._registrations)

    def __repr__(self) -> str:
        return "StaticProviderRegistry(<redacted>)"


__all__ = [
    "PRODUCTION_PROVIDER_CODES",
    "ProviderRegistration",
    "ProviderRequestFactory",
    "ProviderSnapshotNormalizer",
    "StaticProviderRegistry",
]
