"""Small strict-JSON hooks shared across external trust boundaries."""

from __future__ import annotations

from typing import NoReturn


def object_without_duplicate_keys(
    pairs: list[tuple[str, object]],
) -> dict[str, object]:
    """Build a JSON object while rejecting duplicate member names."""
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def reject_json_constant(_value: str) -> NoReturn:
    """Reject NaN and infinity extensions that are outside strict JSON."""
    raise ValueError("non-finite JSON number")
