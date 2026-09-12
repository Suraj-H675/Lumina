"""Finite, provider-owned request plans for bounded provider synchronization."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Final

from .runtime import FRAMEWORK_MAX_RAW_RESPONSE_BYTES

_COMPONENT_ID_PATTERN: Final = re.compile(r"[a-z][a-z0-9_-]{0,63}", re.ASCII)
MAX_PROVIDER_PLAN_COMPONENTS: Final = 8


@dataclass(frozen=True, slots=True)
class ProviderRequestComponent:
    """One statically declared request and its raw-response bound."""

    component_id: str
    request: object
    max_response_bytes: int

    def __post_init__(self) -> None:
        if (
            type(self.component_id) is not str
            or _COMPONENT_ID_PATTERN.fullmatch(self.component_id) is None
            or self.request is None
            or type(self.max_response_bytes) is not int
            or not 1 <= self.max_response_bytes <= FRAMEWORK_MAX_RAW_RESPONSE_BYTES
        ):
            raise ValueError("Provider request component is invalid")


@dataclass(frozen=True, slots=True)
class ProviderComponentResult:
    """Validated normalized result and exact-body checksum for one component."""

    component_id: str
    normalized: object
    raw_sha256: str

    def __post_init__(self) -> None:
        if (
            _COMPONENT_ID_PATTERN.fullmatch(self.component_id) is None
            or not isinstance(self.raw_sha256, str)
            or len(self.raw_sha256) != 64
            or any(character not in "0123456789abcdef" for character in self.raw_sha256)
        ):
            raise ValueError("Provider component result is invalid")


@dataclass(frozen=True, slots=True)
class ProviderRequestPlan:
    """An ordered, finite set of fixed component requests for one provider cycle."""

    components: tuple[ProviderRequestComponent, ...]
    max_total_response_bytes: int | None = None
    checksum_domain: str | None = None

    def __post_init__(self) -> None:
        if (
            type(self.components) is not tuple
            or not 1 <= len(self.components) <= MAX_PROVIDER_PLAN_COMPONENTS
            or any(type(component) is not ProviderRequestComponent for component in self.components)
        ):
            raise ValueError("Provider request plan is invalid")
        component_ids = tuple(component.component_id for component in self.components)
        if len(component_ids) != len(set(component_ids)):
            raise ValueError("Provider request plan contains duplicate components")
        if self.max_total_response_bytes is not None and (
            type(self.max_total_response_bytes) is not int
            or not 1 <= self.max_total_response_bytes <= FRAMEWORK_MAX_RAW_RESPONSE_BYTES
            or self.max_total_response_bytes
            < max(component.max_response_bytes for component in self.components)
        ):
            raise ValueError("Provider request plan total response bound is invalid")
        if len(self.components) > 1 and self.checksum_domain is None:
            raise ValueError("Multi-component provider plans require checksum framing")
        if self.checksum_domain is not None and (
            type(self.checksum_domain) is not str
            or not self.checksum_domain
            or not self.checksum_domain.isascii()
            or any(
                ord(character) < 32 or ord(character) == 127 for character in self.checksum_domain
            )
        ):
            raise ValueError("Provider request plan checksum domain is invalid")

    @classmethod
    def single(cls, request: object, max_response_bytes: int) -> ProviderRequestPlan:
        """Wrap one existing Phase 4A request without changing its checksum semantics."""
        return cls(
            components=(ProviderRequestComponent("default", request, max_response_bytes),),
        )

    @property
    def component_ids(self) -> tuple[str, ...]:
        """Return the immutable ordered component identity sequence."""
        return tuple(component.component_id for component in self.components)

    def aggregate_sha256(self, bodies: tuple[bytes, ...]) -> str:
        """Hash exact response bodies using the approved single or framed contract."""
        if type(bodies) is not tuple or len(bodies) != len(self.components):
            raise ValueError("Provider response body sequence does not match its request plan")
        if any(type(body) is not bytes for body in bodies):
            raise ValueError("Provider response bodies must be bytes")
        if len(self.components) == 1:
            return hashlib.sha256(bodies[0]).hexdigest()
        assert self.checksum_domain is not None
        digest = hashlib.sha256(self.checksum_domain.encode("ascii"))
        for component, body in zip(self.components, bodies, strict=True):
            component_id = component.component_id.encode("ascii")
            digest.update(len(component_id).to_bytes(4, "big"))
            digest.update(component_id)
            digest.update(len(body).to_bytes(8, "big"))
            digest.update(body)
        return digest.hexdigest()


__all__ = [
    "MAX_PROVIDER_PLAN_COMPONENTS",
    "ProviderComponentResult",
    "ProviderRequestComponent",
    "ProviderRequestPlan",
]
