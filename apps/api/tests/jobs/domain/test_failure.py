"""Closed job-failure domain contracts."""

from __future__ import annotations

import inspect
from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from enum import Enum
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.failure import (
    FailJobRequest,
    FailureClassification,
    FailureReason,
    JobFailureOutcomeUnknown,
    JobFailureValidationError,
    RetryScheduled,
    TerminalFailureRecorded,
    retry_delay_seconds,
    validate_fail_job_request,
)
from lumina.jobs.domain.heartbeat import JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt, JobStatus

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_OWNER = "worker.failure-secret"
_TIMESTAMP = datetime(2026, 7, 30, 10, tzinfo=UTC)


def test_production_catalog_is_exact_and_closed() -> None:
    expected = {
        FailureReason.HANDLER_RETRYABLE: (
            "job.handler_retryable",
            "Job handler reported a retryable failure.",
            FailureClassification.RETRYABLE,
        ),
        FailureReason.HANDLER_NON_RETRYABLE: (
            "job.handler_non_retryable",
            "Job handler reported a non-retryable failure.",
            FailureClassification.NON_RETRYABLE,
        ),
        FailureReason.HANDLER_TIMEOUT: (
            "job.handler_timeout",
            "Job handler exceeded its execution deadline.",
            FailureClassification.RETRYABLE,
        ),
        FailureReason.HANDLER_CANCELLED: (
            "job.handler_cancelled",
            "Job handler execution was cancelled.",
            FailureClassification.RETRYABLE,
        ),
        FailureReason.HANDLER_UNEXPECTED: (
            "job.handler_unexpected",
            "Job handler failed unexpectedly.",
            FailureClassification.NON_RETRYABLE,
        ),
        FailureReason.HANDLER_INVALID_RESULT: (
            "job.handler_invalid_result",
            "Job handler returned an invalid result.",
            FailureClassification.NON_RETRYABLE,
        ),
        FailureReason.UNSUPPORTED_TYPE: (
            "job.unsupported_type",
            "Persisted job type is unsupported.",
            FailureClassification.NON_RETRYABLE,
        ),
        FailureReason.INCOMPATIBLE_PAYLOAD: (
            "job.incompatible_payload",
            "Persisted job payload is incompatible.",
            FailureClassification.NON_RETRYABLE,
        ),
        FailureReason.HEARTBEAT_FAILED: (
            "job.heartbeat_failed",
            "Job heartbeat failed during execution.",
            FailureClassification.RETRYABLE,
        ),
        FailureReason.STALE_ATTEMPTS_EXHAUSTED: (
            "job.stale_attempts_exhausted",
            "Stale job exhausted its maximum attempts.",
            FailureClassification.TERMINAL_RECOVERY,
        ),
    }

    assert set(FailureReason) == set(expected)
    for reason, (code, message, classification) in expected.items():
        assert reason.code == code
        assert reason.message == message
        assert reason.classification is classification
        assert repr(reason) == str(reason) == "FailureReason(<redacted>)"


@pytest.mark.parametrize(
    ("attempt", "delay"),
    [(1, 2), (2, 4), (3, 8), (4, 16), (5, 32)],
)
def test_retry_delay_is_derived_only_from_expected_attempt(attempt: int, delay: int) -> None:
    assert retry_delay_seconds(ExpectedJobAttempt(attempt)) == delay


def test_request_factory_is_the_only_public_construction_and_has_no_delay_argument() -> None:
    with pytest.raises(JobFailureValidationError):
        FailJobRequest()

    assert list(inspect.signature(FailJobRequest.create).parameters) == [
        "job_id",
        "owner",
        "expected_attempt",
        "reason",
    ]


def test_retryable_and_non_retryable_requests_derive_exact_internal_policy() -> None:
    retryable = FailJobRequest.create(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        expected_attempt=ExpectedJobAttempt(3),
        reason=FailureReason.HANDLER_TIMEOUT,
    )
    terminal = FailJobRequest.create(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        expected_attempt=ExpectedJobAttempt(3),
        reason=FailureReason.UNSUPPORTED_TYPE,
    )

    assert retryable.classification is FailureClassification.RETRYABLE
    assert retryable.retry_delay_seconds == 8
    assert terminal.classification is FailureClassification.NON_RETRYABLE
    assert terminal.retry_delay_seconds is None
    assert repr(retryable) == str(retryable) == "FailJobRequest(<redacted>)"
    for sentinel in (str(_JOB_ID), _OWNER, "8", FailureReason.HANDLER_TIMEOUT.code):
        assert sentinel not in repr(retryable)


def test_stale_recovery_reason_and_enum_like_values_are_rejected() -> None:
    class FixtureReason(Enum):
        HANDLER_TIMEOUT = FailureReason.HANDLER_TIMEOUT.value

    for reason in (
        FailureReason.STALE_ATTEMPTS_EXHAUSTED,
        FixtureReason.HANDLER_TIMEOUT,
        cast(FailureReason, object()),
    ):
        with pytest.raises(JobFailureValidationError):
            FailJobRequest.create(
                job_id=_JOB_ID,
                owner=JobOwnerToken(_OWNER),
                expected_attempt=ExpectedJobAttempt(1),
                reason=cast(FailureReason, reason),
            )


def test_defensive_validation_rejects_forged_classification_and_delay() -> None:
    request = FailJobRequest.create(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
        reason=FailureReason.HANDLER_RETRYABLE,
    )

    object.__setattr__(request, "_retry_delay_seconds", 31)
    with pytest.raises(JobFailureValidationError):
        validate_fail_job_request(request)

    object.__setattr__(request, "_retry_delay_seconds", 4)
    object.__setattr__(request, "_classification", FailureClassification.NON_RETRYABLE)
    with pytest.raises(JobFailureValidationError):
        validate_fail_job_request(request)


def test_mutated_enum_value_before_request_creation_cannot_change_catalog_policy() -> None:
    reason = FailureReason.HANDLER_RETRYABLE
    original = object.__getattribute__(reason, "_value_")
    forged = (
        "job.forged_secret",
        "FORGED-CATALOG-SECRET",
        FailureClassification.NON_RETRYABLE,
        False,
    )
    try:
        object.__setattr__(reason, "_value_", forged)
        request = FailJobRequest.create(
            job_id=_JOB_ID,
            owner=JobOwnerToken(_OWNER),
            expected_attempt=ExpectedJobAttempt(3),
            reason=reason,
        )
        validated = validate_fail_job_request(request)

        assert reason.code == "job.handler_retryable"
        assert reason.message == "Job handler reported a retryable failure."
        assert reason.classification is FailureClassification.RETRYABLE
        assert request.classification is FailureClassification.RETRYABLE
        assert request.retry_delay_seconds == 8
        assert validated.code == "job.handler_retryable"
        assert validated.message == "Job handler reported a retryable failure."
        assert validated.retryable is True
        assert validated.retry_delay_seconds == 8
    finally:
        object.__setattr__(reason, "_value_", original)


def test_mutated_recovery_enum_value_cannot_make_it_c1_eligible() -> None:
    reason = FailureReason.STALE_ATTEMPTS_EXHAUSTED
    original = object.__getattribute__(reason, "_value_")
    try:
        object.__setattr__(
            reason,
            "_value_",
            (
                "job.handler_retryable",
                "Job handler reported a retryable failure.",
                FailureClassification.RETRYABLE,
                True,
            ),
        )
        with pytest.raises(JobFailureValidationError):
            FailJobRequest.create(
                job_id=_JOB_ID,
                owner=JobOwnerToken(_OWNER),
                expected_attempt=ExpectedJobAttempt(1),
                reason=reason,
            )
    finally:
        object.__setattr__(reason, "_value_", original)


def test_results_are_typed_immutable_aware_and_redacted() -> None:
    retry = RetryScheduled(
        job_id=_JOB_ID,
        expected_attempt=ExpectedJobAttempt(2),
        available_at=_TIMESTAMP,
    )
    terminal = TerminalFailureRecorded(
        job_id=_JOB_ID,
        expected_attempt=ExpectedJobAttempt(2),
        status=JobStatus.FAILED,
        completed_at=_TIMESTAMP,
    )

    assert repr(retry) == str(retry) == "RetryScheduled(<redacted>)"
    assert repr(terminal) == str(terminal) == "TerminalFailureRecorded(<redacted>)"
    with pytest.raises(FrozenInstanceError):
        retry.__setattr__("available_at", datetime.now(UTC))


def test_outcome_unknown_is_fixed_cause_free_and_non_evidentiary() -> None:
    error = JobFailureOutcomeUnknown()
    serialized = str(error) + repr(error) + repr(error.args)

    assert error.args == ("Job failure outcome is unknown.",)
    assert repr(error) == "JobFailureOutcomeUnknown(<redacted>)"
    assert error.__cause__ is None
    assert error.__context__ is None
    for sentinel in (str(_JOB_ID), _OWNER, str(_TIMESTAMP), "31"):
        assert sentinel not in serialized
