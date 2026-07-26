"""Bounded JSON-object payload validation."""

from __future__ import annotations

import math

import pytest
from lumina.jobs.domain.payload import (
    JobPayloadInvalid,
    JobPayloadTooLarge,
    validate_json_object,
)


def test_valid_json_object_is_canonical_and_secret_safe_in_repr() -> None:
    payload = validate_json_object(
        {
            "z": [None, True, 3, 1.25],
            "a": {"message": "phase0b"},
        },
        max_bytes=1_024,
    )

    assert payload.database_json == '{"a":{"message":"phase0b"},"z":[null,true,3,1.25]}'
    assert payload.utf8_size == len(payload.database_json.encode("utf-8"))
    assert "phase0b" not in repr(payload)


@pytest.mark.parametrize("value", [None, True, 1, 1.5, "text", [], [1, 2]])
def test_top_level_must_be_object(value: object) -> None:
    with pytest.raises(JobPayloadInvalid):
        validate_json_object(value, max_bytes=1_024)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_non_finite_numbers_are_rejected(value: float) -> None:
    with pytest.raises(JobPayloadInvalid):
        validate_json_object({"value": value}, max_bytes=1_024)


@pytest.mark.parametrize(
    "payload",
    [
        {1: "non-string-key"},
        {"value": object()},
        {"value": "nul\x00value"},
        {"\x00key": "value"},
        {"value": "\ud800"},
    ],
)
def test_unsupported_or_unsafe_json_values_are_rejected(payload: object) -> None:
    with pytest.raises(JobPayloadInvalid):
        validate_json_object(payload, max_bytes=1_024)


def test_cycles_are_rejected() -> None:
    payload: dict[str, object] = {}
    payload["self"] = payload

    with pytest.raises(JobPayloadInvalid):
        validate_json_object(payload, max_bytes=1_024)


def test_nesting_depth_is_bounded() -> None:
    accepted: dict[str, object] = {}
    cursor = accepted
    for _ in range(31):
        nested: dict[str, object] = {}
        cursor["nested"] = nested
        cursor = nested
    validate_json_object(accepted, max_bytes=2_048)

    rejected: dict[str, object] = {}
    cursor = rejected
    for _ in range(32):
        nested = {}
        cursor["nested"] = nested
        cursor = nested
    with pytest.raises(JobPayloadInvalid):
        validate_json_object(rejected, max_bytes=2_048)


def test_utf8_size_limit_is_enforced() -> None:
    with pytest.raises(JobPayloadTooLarge):
        validate_json_object({"message": "é" * 8}, max_bytes=10)
