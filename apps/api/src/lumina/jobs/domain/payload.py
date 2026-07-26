"""Validated, bounded JSON-object job payloads."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]

_MAX_NESTING_DEPTH = 32
_INVALID_MESSAGE = "Job payload must be a valid JSON object."
_SIZE_MESSAGE = "Job payload exceeds the configured size limit."


class JobPayloadInvalid(ValueError):
    """Raised when a payload cannot be represented safely as a JSON object."""


class JobPayloadTooLarge(ValueError):
    """Raised when a payload exceeds an application or database bound."""


@dataclass(frozen=True, repr=False)
class JsonObjectPayload:
    """An immutable canonical serialization safe to bind as PostgreSQL JSONB."""

    _canonical_json: str = field(repr=False)
    utf8_size: int

    @property
    def database_json(self) -> str:
        """Return the validated JSON text used only as a bound database value."""
        return self._canonical_json


def validate_json_object(payload: object, *, max_bytes: int) -> JsonObjectPayload:
    """Validate supported JSON values, nesting, Unicode, and serialized size."""
    if not isinstance(payload, dict):
        raise JobPayloadInvalid(_INVALID_MESSAGE)
    _validate_value(payload, depth=1, active_containers=set())
    try:
        canonical = json.dumps(
            payload,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        encoded = canonical.encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError, RecursionError):
        raise JobPayloadInvalid(_INVALID_MESSAGE) from None
    if len(encoded) > max_bytes:
        raise JobPayloadTooLarge(_SIZE_MESSAGE)
    return JsonObjectPayload(canonical, len(encoded))


def _validate_value(value: object, *, depth: int, active_containers: set[int]) -> None:
    if value is None or isinstance(value, bool | int):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise JobPayloadInvalid(_INVALID_MESSAGE)
        return
    if isinstance(value, str):
        _validate_string(value)
        return
    if isinstance(value, dict):
        if depth > _MAX_NESTING_DEPTH:
            raise JobPayloadInvalid(_INVALID_MESSAGE)
        identity = id(value)
        if identity in active_containers:
            raise JobPayloadInvalid(_INVALID_MESSAGE)
        active_containers.add(identity)
        try:
            for key, item in value.items():
                if not isinstance(key, str):
                    raise JobPayloadInvalid(_INVALID_MESSAGE)
                _validate_string(key)
                _validate_value(
                    item,
                    depth=depth + 1 if isinstance(item, dict | list) else depth,
                    active_containers=active_containers,
                )
        finally:
            active_containers.remove(identity)
        return
    if isinstance(value, list):
        if depth > _MAX_NESTING_DEPTH:
            raise JobPayloadInvalid(_INVALID_MESSAGE)
        identity = id(value)
        if identity in active_containers:
            raise JobPayloadInvalid(_INVALID_MESSAGE)
        active_containers.add(identity)
        try:
            for item in value:
                _validate_value(
                    item,
                    depth=depth + 1 if isinstance(item, dict | list) else depth,
                    active_containers=active_containers,
                )
        finally:
            active_containers.remove(identity)
        return
    raise JobPayloadInvalid(_INVALID_MESSAGE)


def _validate_string(value: str) -> None:
    if "\x00" in value:
        raise JobPayloadInvalid(_INVALID_MESSAGE)
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise JobPayloadInvalid(_INVALID_MESSAGE) from None
