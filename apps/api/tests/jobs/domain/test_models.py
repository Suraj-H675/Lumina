"""Exact enqueue scalar validation contracts."""

from __future__ import annotations

from dataclasses import fields
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.models import (
    ClaimedJob,
    ExpectedJobAttempt,
    JobAttemptValidationError,
    JobClaimValidationError,
    JobStatus,
    JobType,
    JobValidationError,
    PersistedJobTypeName,
    validate_claimed_by,
    validate_idempotency_key,
    validate_job_type,
    validate_max_attempts,
    validate_priority,
)
from lumina.jobs.domain.payload import PersistedJobPayload


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


@pytest.mark.parametrize(
    "claimed_by",
    ["worker", "worker.1", "worker_1", "worker-1", "a" * 128],
)
def test_valid_claimant_identifiers(claimed_by: str) -> None:
    assert validate_claimed_by(claimed_by) == claimed_by


@pytest.mark.parametrize(
    "claimed_by",
    ["", "Worker", ".worker", "worker:1", "worker/1", "a" * 129],
)
def test_invalid_claimant_identifiers(claimed_by: str) -> None:
    with pytest.raises(JobClaimValidationError, match="claimant identifier is invalid"):
        validate_claimed_by(claimed_by)


def test_claimed_job_has_exact_fields_and_redacts_payload() -> None:
    sentinel = "CLAIMED-JOB-PAYLOAD-SENTINEL"
    timestamp = datetime(2026, 7, 26, tzinfo=UTC)
    claimed = ClaimedJob(
        id=UUID("12345678-1234-4234-9234-123456789abc"),
        job_type=PersistedJobTypeName("system.legacy"),
        payload=PersistedJobPayload.from_decoded({"secret": sentinel}),
        attempts=1,
        max_attempts=5,
        claimed_at=timestamp,
        heartbeat_at=timestamp,
    )

    assert [field.name for field in fields(ClaimedJob)] == [
        "id",
        "job_type",
        "payload",
        "attempts",
        "max_attempts",
        "claimed_at",
        "heartbeat_at",
    ]
    assert sentinel not in repr(claimed)


@pytest.mark.parametrize("attempt", [1, 2, 3, 4, 5])
def test_expected_attempt_matches_the_schema_and_redacts_evidence(attempt: int) -> None:
    expected = ExpectedJobAttempt(attempt)

    assert expected.value == attempt
    assert repr(expected) == str(expected) == "ExpectedJobAttempt(<redacted>)"
    assert str(attempt) not in repr(expected)


@pytest.mark.parametrize("attempt", [0, 6, -1, True, False, 1.0, "1", None])
def test_invalid_expected_attempt_is_fixed_and_rejects_boolean_coercion(attempt: object) -> None:
    with pytest.raises(JobAttemptValidationError) as failure:
        ExpectedJobAttempt(cast(int, attempt))

    assert failure.value.args == ("Job expected attempt is invalid.",)
    assert repr(failure.value) == "JobAttemptValidationError(<redacted>)"
