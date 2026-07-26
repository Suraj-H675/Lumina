"""Exact enqueue scalar validation contracts."""

from __future__ import annotations

import pytest
from lumina.jobs.domain.models import (
    JobStatus,
    JobType,
    JobValidationError,
    validate_idempotency_key,
    validate_job_type,
    validate_max_attempts,
    validate_priority,
)


def test_exact_job_state_and_type_inventory() -> None:
    assert {status.value for status in JobStatus} == {
        "queued",
        "running",
        "succeeded",
        "failed",
        "dead_letter",
    }
    assert list(JobType) == [JobType.SYSTEM_NOOP]


@pytest.mark.parametrize(
    "key",
    [
        "a",
        "A" * 255,
        "a.b",
        "a_b",
        "a:b",
        "a-b",
        "A0._:-z9",
    ],
)
def test_valid_idempotency_keys(key: str) -> None:
    assert validate_idempotency_key(key) == key


@pytest.mark.parametrize(
    "key",
    [
        "",
        ".leading",
        "_leading",
        ":leading",
        "-leading",
        "contains space",
        "contains\ttab",
        "contains\nnewline",
        "contains\x00nul",
        "unicode-é",
        "quote'",
        'quote"',
        "slash/value",
        "backslash\\value",
        "shell$value",
        "sql;value",
        "a" * 256,
    ],
)
def test_invalid_idempotency_keys(key: str) -> None:
    with pytest.raises(JobValidationError, match="idempotency key is invalid"):
        validate_idempotency_key(key)


def test_nullable_idempotency_key() -> None:
    assert validate_idempotency_key(None) is None


@pytest.mark.parametrize("priority", [-32_768, -1, 0, 1, 32_767])
def test_priority_accepts_exact_smallint_range(priority: int) -> None:
    assert validate_priority(priority) == priority


@pytest.mark.parametrize("priority", [-32_769, 32_768, True])
def test_priority_rejects_values_outside_smallint(priority: int) -> None:
    with pytest.raises(JobValidationError, match="smallint"):
        validate_priority(priority)


@pytest.mark.parametrize("attempts", [1, 2, 3, 4, 5])
def test_max_attempts_accepts_existing_constraint(attempts: int) -> None:
    assert validate_max_attempts(attempts) == attempts


@pytest.mark.parametrize("attempts", [0, 6, True])
def test_max_attempts_rejects_existing_constraint_violations(attempts: int) -> None:
    with pytest.raises(JobValidationError, match="between 1 and 5"):
        validate_max_attempts(attempts)


def test_only_noop_job_type_is_accepted() -> None:
    assert validate_job_type("system.noop") is JobType.SYSTEM_NOOP
    with pytest.raises(JobValidationError, match="not supported"):
        validate_job_type("system.unknown")
