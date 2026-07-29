"""Strict successful-result JSON-object validation."""

from __future__ import annotations

import math
from dataclasses import FrozenInstanceError
from typing import cast

import pytest
from lumina.jobs.domain.result import (
    JobResultInvalid,
    JobResultTooLarge,
    validate_job_result,
)


def test_empty_and_nested_objects_are_canonical_and_unicode_preserving() -> None:
    assert validate_job_result({}, max_bytes=64).database_json == "{}"

    result = validate_job_result(
        {
            "z": [None, True, False, -7, 1.25, {"unicode": "प्रकाश"}],
            "a": {"message": "complete"},
        },
        max_bytes=1_024,
    )

    assert result.database_json == (
        '{"a":{"message":"complete"},"z":[null,true,false,-7,1.25,{"unicode":"प्रकाश"}]}'
    )
    assert "\\u" not in result.database_json
    assert result.utf8_size == len(result.database_json.encode("utf-8"))


@pytest.mark.parametrize("value", [None, True, 1, 1.5, "text", [], [1, 2]])
def test_top_level_must_be_an_object(value: object) -> None:
    with pytest.raises(JobResultInvalid):
        validate_job_result(value, max_bytes=1_024)


@pytest.mark.parametrize("value", [-(2**63), 2**63 - 1])
def test_signed_64_bit_integer_boundaries_are_accepted(value: int) -> None:
    assert validate_job_result({"value": value}, max_bytes=128).database_json


@pytest.mark.parametrize("value", [-(2**63) - 1, 2**63])
def test_integers_outside_signed_64_bit_are_rejected(value: int) -> None:
    with pytest.raises(JobResultInvalid):
        validate_job_result({"value": value}, max_bytes=128)


@pytest.mark.parametrize("value", [0.0, -1.5, 1.7976931348623157e308])
def test_finite_floats_are_accepted(value: float) -> None:
    assert validate_job_result({"value": value}, max_bytes=128).database_json


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_non_finite_floats_are_rejected(value: float) -> None:
    with pytest.raises(JobResultInvalid):
        validate_job_result({"value": value}, max_bytes=128)


class _CustomObject:
    pass


class _CustomInteger(int):
    pass


@pytest.mark.parametrize(
    "result",
    [
        {1: "non-string-key"},
        {"value": b"bytes"},
        {"value": bytearray(b"bytes")},
        {"value": _CustomObject()},
        {"value": _CustomInteger(1)},
        {"value": "nul\x00value"},
        {"nul\x00key": "value"},
        {"value": "\ud800"},
    ],
)
def test_unsupported_or_unsafe_values_are_rejected(result: object) -> None:
    with pytest.raises(JobResultInvalid) as failure:
        validate_job_result(result, max_bytes=1_024)

    assert failure.value.args == ("Job result must be a valid JSON object.",)
    assert failure.value.__cause__ is None


def test_cycles_are_rejected() -> None:
    result: dict[str, object] = {}
    result["self"] = result

    with pytest.raises(JobResultInvalid):
        validate_job_result(result, max_bytes=128)


def test_nesting_depth_matches_the_accepted_enqueue_boundary() -> None:
    accepted: dict[str, object] = {}
    cursor = accepted
    for _ in range(31):
        nested: dict[str, object] = {}
        cursor["nested"] = nested
        cursor = nested
    validate_job_result(accepted, max_bytes=2_048)

    rejected: dict[str, object] = {}
    cursor = rejected
    for _ in range(32):
        nested = {}
        cursor["nested"] = nested
        cursor = nested
    with pytest.raises(JobResultInvalid):
        validate_job_result(rejected, max_bytes=2_048)


def test_canonical_utf8_byte_limit_is_inclusive() -> None:
    canonical = '{"x":"é"}'
    size = len(canonical.encode("utf-8"))

    accepted = validate_job_result({"x": "é"}, max_bytes=size)
    assert accepted.utf8_size == size

    with pytest.raises(JobResultTooLarge) as failure:
        validate_job_result({"x": "é"}, max_bytes=size - 1)
    assert failure.value.args == ("Job result exceeds the configured size limit.",)


def test_caller_mutation_does_not_change_the_validated_result() -> None:
    original: dict[str, object] = {"nested": {"items": ["secret", 1]}}
    result = validate_job_result(original, max_bytes=128)
    canonical = result.database_json

    nested = cast(dict[str, object], original["nested"])
    items = cast(list[object], nested["items"])
    items[0] = "changed"
    original["added"] = True

    assert result.database_json == canonical
    assert "changed" not in result.database_json
    assert "added" not in result.database_json


def test_result_is_immutable_and_fully_redacted() -> None:
    sentinel = "RESULT-REPRESENTATION-SENTINEL"
    result = validate_job_result({"secret": sentinel}, max_bytes=128)

    assert repr(result) == "ValidatedJobResult(<redacted>)"
    assert str(result) == "ValidatedJobResult(<redacted>)"
    assert sentinel not in repr(result)
    assert str(result.utf8_size) not in repr(result)
    with pytest.raises(FrozenInstanceError):
        result.utf8_size = 1  # type: ignore[misc]
