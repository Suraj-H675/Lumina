"""Bounded recursive JSON storage contracts shared by provider caches."""

from __future__ import annotations

import math
from types import MappingProxyType

import pytest
from lumina.provenance.composition import (
    nasa_apod_runtime_config,
    nasa_neows_runtime_config,
    nasa_runtime_config,
)
from lumina.provenance.domain.runtime import (
    FRAMEWORK_MAX_RAW_RESPONSE_BYTES,
    MAX_NORMALIZED_JSON_DEPTH,
    MAX_NORMALIZED_PAYLOAD_BYTES,
    MAX_RESPONSE_BYTES,
    NEOWS_MAX_RESPONSE_BYTES,
    validate_normalized_payload,
)


def _nested_object(depth: int) -> object:
    value: object = True
    for _ in range(depth):
        value = {"child": value}
    return value


def test_nested_json_accepts_bounded_depth_and_returns_plain_json() -> None:
    value = _nested_object(MAX_NORMALIZED_JSON_DEPTH - 1)

    validated = validate_normalized_payload({"root": value})

    assert isinstance(validated, dict)
    assert validated == {"root": value}


def test_nested_json_rejects_depth_size_cycles_nonfinite_and_custom_objects() -> None:
    with pytest.raises(ValueError, match="nesting"):
        validate_normalized_payload({"root": _nested_object(MAX_NORMALIZED_JSON_DEPTH)})

    with pytest.raises(ValueError, match="storage bound"):
        validate_normalized_payload({"value": "x" * MAX_NORMALIZED_PAYLOAD_BYTES})

    cyclic: list[object] = []
    cyclic.append(cyclic)
    with pytest.raises(ValueError, match="cycle"):
        validate_normalized_payload({"value": cyclic})

    with pytest.raises(ValueError, match="finite"):
        validate_normalized_payload({"value": math.inf})
    with pytest.raises(ValueError, match="64-bit"):
        validate_normalized_payload({"value": 2**63})
    with pytest.raises(ValueError, match="custom|non-JSON"):
        validate_normalized_payload({"value": MappingProxyType({"child": True})})


def test_normalized_payload_size_bound_accepts_a_payload_just_below_the_limit() -> None:
    value = {"value": "x" * (MAX_NORMALIZED_PAYLOAD_BYTES - 32)}

    validated = validate_normalized_payload(value)

    assert validated == value


def test_provider_raw_response_caps_are_provider_specific_without_widening_frozen_providers() -> (
    None
):
    assert FRAMEWORK_MAX_RAW_RESPONSE_BYTES == NEOWS_MAX_RESPONSE_BYTES
    assert nasa_runtime_config().max_response_bytes == MAX_RESPONSE_BYTES
    assert nasa_apod_runtime_config().max_response_bytes == MAX_RESPONSE_BYTES
    assert nasa_neows_runtime_config().max_response_bytes == NEOWS_MAX_RESPONSE_BYTES
