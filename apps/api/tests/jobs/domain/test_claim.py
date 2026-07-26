"""Typed passive claim outcome and secrecy contracts."""

from __future__ import annotations

import logging
import sys
from collections.abc import Mapping
from dataclasses import fields
from datetime import UTC, datetime
from uuid import UUID

import pytest
from lumina.jobs.domain.models import (
    ClaimedJob,
    ClaimJobOutcome,
    NoEligibleJob,
    PersistedJobTypeName,
)
from lumina.jobs.domain.payload import PersistedJobPayload

_ID_SENTINEL = UUID("12345678-1234-4234-9234-123456789abc")
_TIME_SENTINEL = datetime(2026, 7, 26, 12, 34, 56, tzinfo=UTC)


def _claimed() -> ClaimedJob:
    return ClaimedJob(
        id=_ID_SENTINEL,
        job_type=PersistedJobTypeName("secret.type"),
        payload=PersistedJobPayload.from_decoded(
            {"secret": [{"nested": "CLAIM-PAYLOAD-SENTINEL"}]}
        ),
        attempts=3,
        max_attempts=5,
        claimed_at=_TIME_SENTINEL,
        heartbeat_at=_TIME_SENTINEL,
    )


def test_claimed_job_keeps_exact_seven_field_boundary() -> None:
    assert [item.name for item in fields(ClaimedJob)] == [
        "id",
        "job_type",
        "payload",
        "attempts",
        "max_attempts",
        "claimed_at",
        "heartbeat_at",
    ]


def test_claim_values_are_fully_redacted_from_repr_and_str(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    claimed = _claimed()
    values = (
        str(_ID_SENTINEL),
        "secret.type",
        "CLAIM-PAYLOAD-SENTINEL",
        "attempts=3",
        "max_attempts=5",
        _TIME_SENTINEL.isoformat(),
    )

    print(claimed)
    print(claimed.job_type)
    print(claimed.payload)
    print(claimed, file=sys.stderr)
    logging.getLogger("lumina.tests.claim-secrecy").warning(
        "%s %s %s",
        claimed,
        claimed.job_type,
        claimed.payload,
    )
    captured = capsys.readouterr()
    serialized = (
        repr(claimed)
        + str(claimed)
        + repr(claimed.job_type)
        + str(claimed.job_type)
        + repr(claimed.payload)
        + str(claimed.payload)
        + captured.out
        + captured.err
        + caplog.text
    )

    assert repr(claimed) == "ClaimedJob(<redacted>)"
    assert repr(claimed.job_type) == "PersistedJobTypeName(<redacted>)"
    assert repr(claimed.payload) == "PersistedJobPayload(<redacted>)"
    for value in values:
        assert value not in serialized


def test_nested_payload_has_no_mutable_reference() -> None:
    payload = _claimed().payload.value
    assert isinstance(payload, Mapping)
    nested_array = payload["secret"]
    assert isinstance(nested_array, tuple)
    nested_object = nested_array[0]
    assert isinstance(nested_object, Mapping)

    with pytest.raises(TypeError):
        payload["new"] = "forbidden"  # type: ignore[index]
    with pytest.raises(TypeError):
        nested_array[0] = "forbidden"  # type: ignore[index]
    with pytest.raises(TypeError):
        nested_object["nested"] = "forbidden"  # type: ignore[index]


def test_no_eligible_job_is_a_fieldless_typed_outcome() -> None:
    outcome: ClaimJobOutcome = NoEligibleJob()

    assert isinstance(outcome, NoEligibleJob)
    assert fields(outcome) == ()
