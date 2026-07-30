"""Atomic stale-job recovery domain contracts."""

from __future__ import annotations

import inspect
from dataclasses import FrozenInstanceError
from typing import cast

import pytest
from lumina.jobs.domain.recovery import (
    RECOVERY_BATCH_SIZE,
    JobRecoveryOutcomeUnknown,
    JobRecoveryValidationError,
    JobStaleThresholdSeconds,
    RecoverStaleJobsRequest,
    RecoverStaleJobsResult,
    validate_recover_stale_jobs_request,
)


@pytest.mark.parametrize("value", [2, 120, 86_400])
def test_stale_threshold_accepts_exact_integer_boundaries(value: int) -> None:
    threshold = JobStaleThresholdSeconds(value)

    assert threshold.value == value
    assert repr(threshold) == str(threshold) == "JobStaleThresholdSeconds(<redacted>)"


@pytest.mark.parametrize(
    "value",
    [True, False, 1, 86_401, 2.0, "120", None, object()],
)
def test_stale_threshold_rejects_non_exact_or_out_of_range_values(value: object) -> None:
    with pytest.raises(JobRecoveryValidationError):
        JobStaleThresholdSeconds(cast(int, value))


def test_request_contains_only_threshold_and_is_immutable_and_redacted() -> None:
    request = RecoverStaleJobsRequest(JobStaleThresholdSeconds(120))

    assert tuple(request.__dataclass_fields__) == ("stale_threshold",)
    assert repr(request) == str(request) == "RecoverStaleJobsRequest(<redacted>)"
    with pytest.raises(FrozenInstanceError):
        request.__setattr__("stale_threshold", JobStaleThresholdSeconds(60))


@pytest.mark.parametrize(
    ("requeued", "dead_lettered", "total"),
    [(0, 0, 0), (100, 0, 100), (0, 100, 100), (63, 37, 100)],
)
def test_result_is_aggregate_only_immutable_and_redacted(
    requeued: int,
    dead_lettered: int,
    total: int,
) -> None:
    result = RecoverStaleJobsResult(requeued, dead_lettered)

    assert tuple(result.__dataclass_fields__) == (
        "requeued_count",
        "dead_lettered_count",
    )
    assert result.total_count == total
    assert not hasattr(result, "selected_count")
    assert repr(result) == str(result) == "RecoverStaleJobsResult(<redacted>)"
    with pytest.raises(FrozenInstanceError):
        result.__setattr__("requeued_count", 1)


@pytest.mark.parametrize(
    ("requeued", "dead_lettered"),
    [
        (-1, 0),
        (0, -1),
        (101, 0),
        (50, 51),
        (True, 0),
        (0, False),
        (1.0, 0),
        (0, "1"),
    ],
)
def test_result_rejects_malformed_or_oversized_aggregate_counts(
    requeued: object,
    dead_lettered: object,
) -> None:
    with pytest.raises(JobRecoveryValidationError):
        RecoverStaleJobsResult(cast(int, requeued), cast(int, dead_lettered))


def test_defensive_request_validation_rejects_forged_threshold() -> None:
    request = RecoverStaleJobsRequest(JobStaleThresholdSeconds(120))
    object.__setattr__(request.stale_threshold, "value", True)

    with pytest.raises(JobRecoveryValidationError):
        validate_recover_stale_jobs_request(request)


def test_batch_size_is_fixed_and_not_part_of_request_construction() -> None:
    assert RECOVERY_BATCH_SIZE == 100
    assert list(inspect.signature(RecoverStaleJobsRequest).parameters) == ["stale_threshold"]


def test_outcome_unknown_is_fixed_cause_free_fatal_and_redacted() -> None:
    error = JobRecoveryOutcomeUnknown()

    assert error.args == ("Job recovery outcome is unknown.",)
    assert repr(error) == "JobRecoveryOutcomeUnknown(<redacted>)"
    assert error.__cause__ is None
    assert error.__context__ is None
