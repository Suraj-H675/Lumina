from __future__ import annotations

import pytest
from lumina.identification.domain.nova import (
    NovaJobId,
    NovaJobState,
    NovaSession,
    NovaSubmissionId,
    NovaSubmissionSnapshot,
    RemoteAstrometryProtocolError,
)


def test_remote_identifiers_and_session_are_bounded_and_secret_safe() -> None:
    session = NovaSession("fixture-session-123")
    submission = NovaSubmissionId(12)
    job = NovaJobId(34)

    assert repr(session) == str(session) == "NovaSession(<redacted>)"
    assert session.value not in repr(session)
    assert submission.value == 12
    assert job.value == 34
    assert NovaJobState.SOLVING.value == "solving"


@pytest.mark.parametrize("value", ["", " space", "space ", "line\nfeed", "é", "x" * 257])
def test_session_rejects_malformed_or_unsafe_values(value: str) -> None:
    with pytest.raises(ValueError, match="Nova session is invalid"):
        NovaSession(value)


@pytest.mark.parametrize("kind", [NovaSubmissionId, NovaJobId])
@pytest.mark.parametrize("value", [0, -1, True, 2**63, "1"])
def test_remote_identifiers_reject_noncanonical_values(kind: type[object], value: object) -> None:
    with pytest.raises(ValueError):
        kind(value)  # type: ignore[call-arg]


def test_submission_snapshot_requires_unique_calibrated_subset() -> None:
    first = NovaJobId(10)
    second = NovaJobId(11)
    snapshot = NovaSubmissionSnapshot(jobs=(first, second), calibrated_jobs=(second,))
    assert snapshot.jobs == (first, second)

    with pytest.raises(ValueError):
        NovaSubmissionSnapshot(jobs=(first, first), calibrated_jobs=())
    with pytest.raises(ValueError):
        NovaSubmissionSnapshot(jobs=(first,), calibrated_jobs=(second,))


def test_remote_errors_never_retain_provider_evidence() -> None:
    error = RemoteAstrometryProtocolError()
    assert str(error) == "Remote astrometry returned an incompatible response."
    assert repr(error) == "RemoteAstrometryProtocolError(<redacted>)"
    assert error.__cause__ is None
    assert error.__context__ is None
