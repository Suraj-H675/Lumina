"""Strict enqueue payloads and passive persisted JSONB payloads."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import cast

type JsonScalar = str | int | float | bool | None
type JsonValue = JsonScalar | list[JsonValue] | dict[str, JsonValue]

_MAX_NESTING_DEPTH = 32
_INVALID_MESSAGE = "Job payload must be a valid JSON object."
_SIZE_MESSAGE = "Job payload exceeds the configured size limit."


class JobPayloadInvalid(ValueError):
    """Raised when a payload cannot be represented safely as a JSON object."""


class JobPayloadTooLarge(ValueError):
    """Raised when a payload exceeds an application or database bound."""


class PersistedJobPayloadInvalid(RuntimeError):
    """Raised when a database result is not a decoded PostgreSQL JSONB value."""

    def __init__(self) -> None:
        super().__init__("Persisted job payload could not be decoded.")


@dataclass(frozen=True, repr=False)
class JsonObjectPayload:
    """An immutable canonical serialization safe to bind as PostgreSQL JSONB."""

    _canonical_json: str = field(repr=False)
    utf8_size: int

    @property
    def database_json(self) -> str:
        """Return the validated JSON text used only as a bound database value."""
        return self._canonical_json


@dataclass(frozen=True, slots=True)
class PersistedJsonNull:
    """Explicit passive representation of a PostgreSQL JSONB null."""


PERSISTED_JSON_NULL = PersistedJsonNull()
type PersistedJsonScalar = str | int | float | bool | PersistedJsonNull
type PersistedJsonValue = (
    PersistedJsonScalar | tuple[PersistedJsonValue, ...] | Mapping[str, PersistedJsonValue]
)


@dataclass(frozen=True, repr=False, slots=True)
class PersistedJobPayload:
    """A deeply read-only, non-validating view of decoded PostgreSQL JSONB."""

    value: PersistedJsonValue = field(repr=False)

    @classmethod
    def from_decoded(cls, value: object) -> PersistedJobPayload:
        """Freeze one already-decoded JSONB value without enqueue canonicalization."""
        return cls(_freeze_persisted_value(value))

    def __repr__(self) -> str:
        """Never include persisted payload content in diagnostics."""
        return "PersistedJobPayload(<redacted>)"

    def __str__(self) -> str:
        """Keep normal string conversion as secret-safe as representation."""
        return self.__repr__()


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


def _freeze_persisted_value(value: object) -> PersistedJsonValue:
    """Freeze decoded JSONB with an explicit stack and preserved object order."""
    pending: list[tuple[object, tuple[str, ...] | None]] = [(value, None)]
    completed: list[PersistedJsonValue] = []
    active_containers: set[int] = set()

    while pending:
        current, closing_keys = pending.pop()
        if closing_keys is not None:
            identity = id(current)
            active_containers.remove(identity)
            child_count = len(cast(list[object] | dict[object, object], current))
            children = completed[-child_count:] if child_count else []
            if child_count:
                del completed[-child_count:]
            if type(current) is list:
                completed.append(tuple(children))
            else:
                completed.append(MappingProxyType(dict(zip(closing_keys, children, strict=True))))
            continue

        if current is None:
            completed.append(PERSISTED_JSON_NULL)
            continue
        if isinstance(current, bool | int | float | str):
            completed.append(current)
            continue
        if type(current) is list:
            identity = id(current)
            if identity in active_containers:
                raise PersistedJobPayloadInvalid()
            active_containers.add(identity)
            items = cast(list[object], current)
            pending.append((current, ()))
            pending.extend((item, None) for item in reversed(items))
            continue
        if type(current) is dict:
            identity = id(current)
            if identity in active_containers:
                raise PersistedJobPayloadInvalid()
            source = cast(dict[object, object], current)
            keys = tuple(source)
            if any(not isinstance(key, str) for key in keys):
                raise PersistedJobPayloadInvalid()
            string_keys = cast(tuple[str, ...], keys)
            active_containers.add(identity)
            pending.append((current, string_keys))
            pending.extend((source[key], None) for key in reversed(keys))
            continue
        raise PersistedJobPayloadInvalid()

    if len(completed) != 1:
        raise PersistedJobPayloadInvalid()
    return completed[0]


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
