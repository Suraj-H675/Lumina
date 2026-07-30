"""Successful-completion domain contracts."""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.completion import (
    CompleteJobRequest,
    JobCompletionOutcomeUnknown,
    JobCompletionValidationError,
    SuccessfulJobCompletion,
)
from lumina.jobs.domain.heartbeat import JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt
from lumina.jobs.domain.result import validate_job_result

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_OWNER = "worker.completion-secret"
_COMPLETED_AT = datetime(2026, 7, 28, 10, 30, tzinfo=UTC)
_RESULT_SENTINEL = "COMPLETION-DOMAIN-RESULT-SENTINEL"


def test_request_and_success_are_immutable_and_fully_redacted() -> None:
    result = validate_job_result({"secret": _RESULT_SENTINEL}, max_bytes=256)
    request = CompleteJobRequest(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
        result=result,
    )
    completed = SuccessfulJobCompletion(
        job_id=_JOB_ID,
        completed_at=_COMPLETED_AT,
    )

    assert request.job_id == _JOB_ID
    assert request.owner.value == _OWNER
    assert request.expected_attempt.value == 2
    assert request.result is result
    assert completed.job_id == _JOB_ID
    assert completed.completed_at == _COMPLETED_AT
    assert repr(request) == str(request) == "CompleteJobRequest(<redacted>)"
    assert repr(completed) == str(completed) == "SuccessfulJobCompletion(<redacted>)"
    for sentinel in (str(_JOB_ID), _OWNER, _RESULT_SENTINEL, str(_COMPLETED_AT)):
        assert sentinel not in repr(request)
        assert sentinel not in repr(completed)

    with pytest.raises(FrozenInstanceError):
        request.job_id = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        completed.completed_at = datetime.now(UTC)  # type: ignore[misc]


@pytest.mark.parametrize(
    ("job_id", "completed_at"),
    [
        ("not-a-uuid", _COMPLETED_AT),
        (_JOB_ID, datetime(2026, 7, 28, 10, 30)),
    ],
)
def test_invalid_success_values_are_rejected(
    job_id: UUID | str,
    completed_at: datetime,
) -> None:
    with pytest.raises(JobCompletionValidationError):
        SuccessfulJobCompletion(
            job_id=cast(UUID, job_id),
            completed_at=completed_at,
        )


def test_outcome_unknown_is_fixed_fatal_and_non_evidentiary() -> None:
    error = JobCompletionOutcomeUnknown()
    serialized = str(error) + repr(error) + repr(error.args)

    assert str(error) == "Job completion outcome is unknown."
    assert repr(error) == "JobCompletionOutcomeUnknown(<redacted>)"
    assert error.args == ("Job completion outcome is unknown.",)
    assert error.__cause__ is None
    assert error.__context__ is None
    for sentinel in (str(_JOB_ID), _OWNER, _RESULT_SENTINEL, str(_COMPLETED_AT)):
        assert sentinel not in serialized
