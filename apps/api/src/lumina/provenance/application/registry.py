"""Explicit production provider registry and immutable NASA runtime policy."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Protocol

from lumina.provenance.domain.provider import ProviderRuntimeAdapter
from lumina.provenance.domain.runtime import PROVIDER_CODE, ProviderRuntimeConfig


class ProviderRequestFactory(Protocol):
    """Factory for the typed request owned by one static adapter registration."""

    def __call__(self) -> object:
        """Construct the fixed request without performing network I/O."""
        ...


@dataclass(frozen=True, slots=True)
class ProviderRegistration:
    """One explicit provider code, policy, and already-constructed adapter."""

    config: ProviderRuntimeConfig
    adapter: ProviderRuntimeAdapter
    request_factory: ProviderRequestFactory


class StaticProviderRegistry:
    """Immutable exact-code registry with no discovery or database-controlled classes."""

    def __init__(self, registrations: Mapping[str, ProviderRegistration]) -> None:
        copied = dict(registrations)
        if not copied or set(copied) != {PROVIDER_CODE}:
            raise ValueError("Production provider registry is not the approved Phase 4A registry")
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
    "ProviderRegistration",
    "ProviderRequestFactory",
    "StaticProviderRegistry",
]
