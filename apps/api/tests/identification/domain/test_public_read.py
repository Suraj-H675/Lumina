from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

import pytest
from lumina.identification.domain.public_read import (
    IdentificationPublicReadFailure,
    IdentificationPublicState,
    IdentificationReadValidationError,
    PublicIdentificationStatus,
    PublicSolutionPage,
    SolutionAnnotationCursor,
    decode_solution_cursor,
    encode_solution_cursor,
)
from lumina.identification.domain.solution import (
    AstrometricFrame,
    NormalizedWcs,
    PlateAnnotation,
    PlateCalibration,
)
from lumina.identification.domain.submissions import FakeSolverResult, IdentificationSolverType

_SUBMISSION_ID = UUID("75000000-0000-4000-8000-000000000001")
_OTHER_ID = UUID("75000000-0000-4000-8000-000000000002")
_JOB_ID = UUID("76000000-0000-4000-8000-000000000001")
_NOW = datetime(2026, 9, 16, 2, 0, tzinfo=UTC)


def _calibration() -> PlateCalibration:
    return PlateCalibration(120.0, 20.0, 45.0, -1, 1.2, 0.5)


def _wcs() -> NormalizedWcs:
    return NormalizedWcs(
        AstrometricFrame.FK5_J2000,
        "WCSAXES =                    2",
        "e" * 64,
        1000,
        800,
    )


def _annotation() -> PlateAnnotation:
    return PlateAnnotation("ngc", ("NGC 1",), 10.0, 20.0, 119.99, 20.01)


def test_fake_and_nova_public_statuses_are_solver_coherent() -> None:
    fake = PublicIdentificationStatus(
        _SUBMISSION_ID,
        _JOB_ID,
        IdentificationSolverType.FAKE,
        False,
        IdentificationPublicState.SUCCEEDED,
        1.0,
        FakeSolverResult(),
        None,
        False,
        _NOW,
        _NOW,
        None,
    )
    nova = PublicIdentificationStatus(
        _SUBMISSION_ID,
        None,
        IdentificationSolverType.NOVA,
        True,
        IdentificationPublicState.SUCCEEDED,
        None,
        None,
        None,
        True,
        _NOW,
        _NOW,
        None,
    )

    assert fake.job_id == _JOB_ID and fake.progress == 1.0
    assert nova.job_id is None and nova.progress is None and nova.solution_available


@pytest.mark.parametrize(
    "kwargs",
    [
        {"job_id": _JOB_ID},
        {"progress": 0.5},
        {"remote_processing": False},
        {"solution_available": False},
    ],
)
def test_nova_status_rejects_invented_or_incoherent_fields(kwargs: dict[str, object]) -> None:
    values: dict[str, object] = {
        "submission_id": _SUBMISSION_ID,
        "job_id": None,
        "solver_type": IdentificationSolverType.NOVA,
        "remote_processing": True,
        "state": IdentificationPublicState.SUCCEEDED,
        "progress": None,
        "fake_result": None,
        "error_code": None,
        "solution_available": True,
        "created_at": _NOW,
        "completed_at": _NOW,
        "deleted_at": None,
    }
    values.update(kwargs)
    with pytest.raises(IdentificationPublicReadFailure):
        PublicIdentificationStatus(**values)  # type: ignore[arg-type]


def test_solution_cursor_round_trips_and_is_submission_bound() -> None:
    encoded = encode_solution_cursor(SolutionAnnotationCursor(_SUBMISSION_ID, 49))

    assert decode_solution_cursor(encoded, submission_id=_SUBMISSION_ID).ordinal == 49
    with pytest.raises(IdentificationReadValidationError):
        decode_solution_cursor(encoded, submission_id=_OTHER_ID)


def test_solution_page_requires_cursor_exactly_when_more_annotations_exist() -> None:
    cursor = encode_solution_cursor(SolutionAnnotationCursor(_SUBMISSION_ID, 0))
    page = PublicSolutionPage(
        _SUBMISSION_ID,
        _calibration(),
        _wcs(),
        (_annotation(),),
        "astrometry.net-nova",
        None,
        cursor,
        True,
    )
    assert page.has_more

    with pytest.raises(IdentificationPublicReadFailure):
        PublicSolutionPage(
            _SUBMISSION_ID,
            _calibration(),
            _wcs(),
            (_annotation(),),
            "astrometry.net-nova",
            None,
            None,
            True,
        )
