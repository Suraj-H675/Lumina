"""Strict, immutable, and secret-safe successful job results."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import cast

_MAX_NESTING_DEPTH = 32
_SIGNED_64_BIT_MIN = -(2**63)
_SIGNED_64_BIT_MAX = 2**63 - 1
_INVALID_MESSAGE = "Job result must be a valid JSON object."
_SIZE_MESSAGE = "Job result exceeds the configured size limit."
_DATABASE_SIZE_MESSAGE = "Job result exceeds the database size limit."


class JobResultInvalid(ValueError):
    """Raised when a result is not within the accepted JSON-object domain."""


class JobResultTooLarge(ValueError):
    """Raised when a result exceeds an application or database byte bound."""


@dataclass(frozen=True, repr=False, slots=True)
class ValidatedJobResult:
    """Canonical JSON text retained without caller-owned mutable references."""

    _canonical_json: str = field(repr=False)
    utf8_size: int

    @property
    def database_json(self) -> str:
        """Return canonical text solely for use as a bound PostgreSQL value."""
        return self._canonical_json

    def __repr__(self) -> str:
        """Never include result contents or size in diagnostics."""
        return "ValidatedJobResult(<redacted>)"

    def __str__(self) -> str:
        """Keep ordinary string conversion fully redacted."""
        return self.__repr__()


def validate_job_result(result: object, *, max_bytes: int) -> ValidatedJobResult:
    """Validate, canonicalize, copy, and bound one top-level JSON object."""
    if type(result) is not dict:
        raise JobResultInvalid(_INVALID_MESSAGE)
    _validate_value(result, depth=1, active_containers=set())
    try:
        canonical = json.dumps(
            result,
            ensure_ascii=False,
            allow_nan=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        encoded = canonical.encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError, RecursionError):
        raise JobResultInvalid(_INVALID_MESSAGE) from None
    if len(encoded) > max_bytes:
        raise JobResultTooLarge(_SIZE_MESSAGE)
    return ValidatedJobResult(canonical, len(encoded))


def database_result_too_large() -> JobResultTooLarge:
    """Construct the fixed database-representation size failure."""
    return JobResultTooLarge(_DATABASE_SIZE_MESSAGE)


def _validate_value(
    value: object,
    *,
    depth: int,
    active_containers: set[int],
) -> None:
    value_type = type(value)
    if value is None or value_type is bool:
        return
    if value_type is int:
        if not _SIGNED_64_BIT_MIN <= cast(int, value) <= _SIGNED_64_BIT_MAX:
            raise JobResultInvalid(_INVALID_MESSAGE)
        return
    if value_type is float:
        if not math.isfinite(cast(float, value)):
            raise JobResultInvalid(_INVALID_MESSAGE)
        return
    if value_type is str:
        _validate_string(cast(str, value))
        return
    if value_type is dict:
        if depth > _MAX_NESTING_DEPTH:
            raise JobResultInvalid(_INVALID_MESSAGE)
        identity = id(value)
        if identity in active_containers:
            raise JobResultInvalid(_INVALID_MESSAGE)
        active_containers.add(identity)
        try:
            source = cast(Mapping[object, object], value)
            for key, item in source.items():
                if type(key) is not str:
                    raise JobResultInvalid(_INVALID_MESSAGE)
                _validate_string(key)
                _validate_value(
                    item,
                    depth=depth + 1 if type(item) in {dict, list} else depth,
                    active_containers=active_containers,
                )
        finally:
            active_containers.remove(identity)
        return
    if value_type is list:
        if depth > _MAX_NESTING_DEPTH:
            raise JobResultInvalid(_INVALID_MESSAGE)
        identity = id(value)
        if identity in active_containers:
            raise JobResultInvalid(_INVALID_MESSAGE)
        active_containers.add(identity)
        try:
            for item in cast(list[object], value):
                _validate_value(
                    item,
                    depth=depth + 1 if type(item) in {dict, list} else depth,
                    active_containers=active_containers,
                )
        finally:
            active_containers.remove(identity)
        return
    raise JobResultInvalid(_INVALID_MESSAGE)


def _validate_string(value: str) -> None:
    if "\x00" in value:
        raise JobResultInvalid(_INVALID_MESSAGE)
    try:
        value.encode("utf-8")
    except UnicodeEncodeError:
        raise JobResultInvalid(_INVALID_MESSAGE) from None
