"""Bounded JSON-object payload validation."""

from __future__ import annotations

import math
from collections.abc import Mapping

import pytest
from lumina.jobs.domain.payload import (
    PERSISTED_JSON_NULL,
    JobPayloadInvalid,
    JobPayloadTooLarge,
    PersistedJobPayload,
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


@pytest.mark.parametrize(
    ("decoded", "expected"),
    [
        ({"z": 1, "a": ["object-sentinel"]}, {"z": 1, "a": ("object-sentinel",)}),
        (["array-sentinel", {"nested": True}], ("array-sentinel", {"nested": True})),
        ("string-sentinel", "string-sentinel"),
        (9_223_372_036_854_775_808, 9_223_372_036_854_775_808),
        (True, True),
        (None, PERSISTED_JSON_NULL),
    ],
)
def test_all_postgresql_jsonb_forms_map_passively(
    decoded: object,
    expected: object,
) -> None:
    persisted = PersistedJobPayload.from_decoded(decoded)

    assert persisted.value == expected


def test_persisted_nested_containers_are_recursively_read_only() -> None:
    persisted = PersistedJobPayload.from_decoded({"outer": [{"inner": ["payload-sentinel"]}]})

    assert isinstance(persisted.value, Mapping)
    outer = persisted.value["outer"]
    assert isinstance(outer, tuple)
    nested = outer[0]
    assert isinstance(nested, Mapping)
    inner = nested["inner"]
    assert isinstance(inner, tuple)

    with pytest.raises(TypeError):
        persisted.value["new"] = "value"  # type: ignore[index]
    with pytest.raises(TypeError):
        nested["new"] = "value"  # type: ignore[index]
    with pytest.raises(TypeError):
        inner[0] = "changed"  # type: ignore[index]


def test_deeply_nested_persisted_payload_uses_stack_safe_conversion() -> None:
    depth = 5_000
    decoded: object = "DEEP-PERSISTED-PAYLOAD-SENTINEL"
    for _ in range(depth):
        decoded = [decoded]

    persisted = PersistedJobPayload.from_decoded(decoded)

    cursor = persisted.value
    for _ in range(depth):
        assert isinstance(cursor, tuple)
        assert len(cursor) == 1
        cursor = cursor[0]
    assert cursor == "DEEP-PERSISTED-PAYLOAD-SENTINEL"
    assert repr(persisted) == "PersistedJobPayload(<redacted>)"
    assert "DEEP-PERSISTED-PAYLOAD-SENTINEL" not in repr(persisted)


def test_persisted_object_order_is_preserved_without_enqueue_canonicalization() -> None:
    persisted = PersistedJobPayload.from_decoded({"z": 1, "a": 2, "middle": 3})

    assert isinstance(persisted.value, Mapping)
    assert list(persisted.value) == ["z", "a", "middle"]
    assert not hasattr(persisted, "database_json")
    assert not hasattr(persisted, "utf8_size")


def test_persisted_payload_repr_is_fully_redacted_for_every_json_form() -> None:
    forms = [
        {"secret": "OBJECT-PAYLOAD-SENTINEL"},
        ["ARRAY-PAYLOAD-SENTINEL"],
        "STRING-PAYLOAD-SENTINEL",
        8_765_432_109_876_543_210,
        True,
        None,
    ]

    for decoded in forms:
        representation = repr(PersistedJobPayload.from_decoded(decoded))
        assert representation == "PersistedJobPayload(<redacted>)"
        assert repr(decoded) not in representation
