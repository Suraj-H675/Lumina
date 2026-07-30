"""Immutable explicit registry and the internal ``system.noop`` handler."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from types import MappingProxyType

from lumina.jobs.domain.handler import (
    IncompatibleHandlerPayload,
    JobHandler,
)
from lumina.jobs.domain.models import PersistedJobTypeName
from lumina.jobs.domain.payload import PersistedJobPayload


class StaticHandlerRegistry:
    """An immutable exact-name registry built only from an explicit mapping."""

    def __init__(
        self,
        handlers: Mapping[str, JobHandler],
        *,
        payload_validators: Mapping[str, Callable[[PersistedJobPayload], None]] | None = None,
    ) -> None:
        self._handlers = MappingProxyType(dict(handlers))
        self._payload_validators = MappingProxyType(dict(payload_validators or {}))

    def resolve(self, job_type: PersistedJobTypeName) -> JobHandler | None:
        """Resolve the exact passive persisted type without dynamic discovery."""
        return self._handlers.get(job_type.value)

    def validate_payload(
        self,
        job_type: PersistedJobTypeName,
        payload: PersistedJobPayload,
    ) -> None:
        """Run only an explicitly registered synchronous preflight validator."""
        validator = self._payload_validators.get(job_type.value)
        if validator is not None:
            validator(payload)

    @property
    def registered_types(self) -> frozenset[str]:
        """Expose only immutable type names for architecture verification."""
        return frozenset(self._handlers)

    def __repr__(self) -> str:
        """Do not expose fixture type names or handler representations."""
        return "StaticHandlerRegistry(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class SystemNoopHandler:
    """Internal deterministic handler that accepts any top-level JSON object."""

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        """Accept a mapping without inspecting or copying any of its fields."""
        _validate_noop_payload(payload)

    async def handle(self, payload: PersistedJobPayload) -> object:
        """Return exactly an empty object without I/O or payload mutation."""
        self.validate_payload(payload)
        return {}

    def __repr__(self) -> str:
        """Keep handler diagnostics independent of payload and registry state."""
        return "SystemNoopHandler(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def production_handler_registry() -> StaticHandlerRegistry:
    """Construct the production registry from its sole literal registration."""
    return StaticHandlerRegistry(
        {"system.noop": SystemNoopHandler()},
        payload_validators={"system.noop": _validate_noop_payload},
    )


def _validate_noop_payload(payload: PersistedJobPayload) -> None:
    if not isinstance(payload.value, Mapping):
        raise IncompatibleHandlerPayload()
