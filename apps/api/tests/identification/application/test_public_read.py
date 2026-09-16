from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from lumina.identification.application.public_read import IdentificationPublicReadService
from lumina.identification.domain.nova import NovaJobId, NovaSubmissionId
from lumina.identification.domain.public_read import (
    IdentificationPublicState,
    IdentificationSolutionNotReady,
    StoredSolutionSlice,
    decode_solution_cursor,
)
from lumina.identification.domain.remote_state import (
    RemoteSolveRecord,
    RemoteSolveState,
    RemoteTransitionReason,
)
from lumina.identification.domain.solution import (
    AstrometricFrame,
    NormalizedWcs,
    PlateAnnotation,
    PlateCalibration,
)
from lumina.identification.domain.storage import PrivateObjectKey
from lumina.identification.domain.submissions import (
    FakeSolverResult,
    IdentificationSolverType,
    IdentificationSubmission,
    IdentificationSubmissionState,
    IdentificationSubmissionStatus,
)
from lumina.identification.domain.uploads import UploadMediaType

_SUBMISSION_ID = UUID("77000000-0000-4000-8000-000000000001")
_JOB_ID = UUID("78000000-0000-4000-8000-000000000001")
_NOW = datetime(2026, 9, 16, 3, 0, tzinfo=UTC)


def _submission(solver: IdentificationSolverType) -> IdentificationSubmission:
    return IdentificationSubmission(
        id=_SUBMISSION_ID,
        job_id=_JOB_ID if solver is IdentificationSolverType.FAKE else None,
        storage_object_key=PrivateObjectKey("a" * 32),
        original_filename="night.png",
        media_type=UploadMediaType.PNG,
        byte_size=100,
        width=32,
        height=32,
        sha256="a" * 64,
        retention_until=_NOW + timedelta(hours=24),
        deleted_at=None,
        created_at=_NOW,
        solver_type=solver,
        consent_remote_processing=solver is IdentificationSolverType.NOVA,
    )


def _fake_status() -> IdentificationSubmissionStatus:
    return IdentificationSubmissionStatus(
        _SUBMISSION_ID,
        _JOB_ID,
        IdentificationSubmissionState.SUCCEEDED,
        1.0,
        FakeSolverResult(),
        None,
        _NOW,
        _NOW,
        None,
    )


def _remote(state: RemoteSolveState = RemoteSolveState.SUCCEEDED) -> RemoteSolveRecord:
    terminal = state in {
        RemoteSolveState.SUCCEEDED,
        RemoteSolveState.UNSOLVED,
        RemoteSolveState.FAILED,
        RemoteSolveState.EXPIRED,
    }
    reason = {
        RemoteSolveState.SUCCEEDED: RemoteTransitionReason.RESULTS_STORED,
        RemoteSolveState.UNSOLVED: RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION,
        RemoteSolveState.FAILED: RemoteTransitionReason.PROVIDER_REJECTED,
        RemoteSolveState.EXPIRED: RemoteTransitionReason.SOLVER_TIMEOUT,
    }.get(state)
    return RemoteSolveRecord(
        _SUBMISSION_ID,
        state,
        NovaSubmissionId(111),
        NovaJobId(222),
        None if terminal else _NOW + timedelta(seconds=5),
        _NOW + timedelta(minutes=15),
        _NOW,
        _NOW,
        _NOW if terminal else None,
        reason,
        _NOW,
        _NOW,
    )


def _slice(count: int) -> StoredSolutionSlice:
    annotations = tuple(
        PlateAnnotation("ngc", (f"NGC {index}",), float(index), 20.0, 120.0, 20.0)
        for index in range(count)
    )
    return StoredSolutionSlice(
        PlateCalibration(120.0, 20.0, 45.0, -1, 1.2, 0.5),
        NormalizedWcs(
            AstrometricFrame.FK5_J2000,
            "WCSAXES =                    2",
            "e" * 64,
            1000,
            800,
        ),
        annotations,
        tuple(range(count)),
        "astrometry.net-nova",
        None,
    )


@dataclass
class SubmissionReader:
    submission: IdentificationSubmission
    status_value: IdentificationSubmissionStatus | None = None

    async def read(self, submission_id: UUID) -> IdentificationSubmission:
        assert submission_id == _SUBMISSION_ID
        return self.submission

    async def read_status(self, submission_id: UUID) -> IdentificationSubmissionStatus:
        assert submission_id == _SUBMISSION_ID and self.status_value is not None
        return self.status_value


@dataclass
class RemoteReader:
    value: RemoteSolveRecord

    async def read(self, submission_id: UUID) -> RemoteSolveRecord:
        assert submission_id == _SUBMISSION_ID
        return self.value


@dataclass
class SolutionReader:
    value: StoredSolutionSlice
    calls: list[tuple[int | None, int]] = field(default_factory=list)

    async def read_slice(
        self, submission_id: UUID, *, after_ordinal: int | None, limit: int
    ) -> StoredSolutionSlice:
        assert submission_id == _SUBMISSION_ID
        self.calls.append((after_ordinal, limit))
        return self.value


@pytest.mark.asyncio
async def test_fake_status_preserves_real_job_progress_and_synthetic_result() -> None:
    service = IdentificationPublicReadService(
        SubmissionReader(_submission(IdentificationSolverType.FAKE), _fake_status()),
        RemoteReader(_remote()),
        SolutionReader(_slice(0)),
    )

    result = await service.status(_SUBMISSION_ID)

    assert result.state is IdentificationPublicState.SUCCEEDED
    assert result.job_id == _JOB_ID and result.progress == 1.0
    assert result.fake_result == FakeSolverResult()
    assert not result.remote_processing and not result.solution_available


@pytest.mark.asyncio
async def test_nova_status_uses_stage_without_inventing_job_or_progress() -> None:
    service = IdentificationPublicReadService(
        SubmissionReader(_submission(IdentificationSolverType.NOVA)),
        RemoteReader(_remote(RemoteSolveState.SUCCEEDED)),
        SolutionReader(_slice(0)),
    )

    result = await service.status(_SUBMISSION_ID)

    assert result.state is IdentificationPublicState.SUCCEEDED
    assert result.job_id is None and result.progress is None
    assert result.remote_processing and result.solution_available


@pytest.mark.asyncio
async def test_solution_page_caps_visible_rows_and_uses_submission_bound_cursor() -> None:
    solutions = SolutionReader(_slice(51))
    service = IdentificationPublicReadService(
        SubmissionReader(_submission(IdentificationSolverType.NOVA)),
        RemoteReader(_remote()),
        solutions,
    )

    page = await service.solution(_SUBMISSION_ID)

    assert len(page.annotations) == 50
    assert page.has_more and page.next_cursor is not None
    assert decode_solution_cursor(page.next_cursor, submission_id=_SUBMISSION_ID).ordinal == 49
    assert solutions.calls == [(None, 51)]


@pytest.mark.asyncio
async def test_solution_page_enforces_serialized_annotation_byte_budget() -> None:
    names = tuple(f"{index:02d}" + "漢" * 126 for index in range(16))
    annotations = tuple(
        PlateAnnotation("ngc", names, float(index), 20.0, 120.0, 20.0) for index in range(10)
    )
    stored = StoredSolutionSlice(
        PlateCalibration(120.0, 20.0, 45.0, -1, 1.2, 0.5),
        NormalizedWcs(
            AstrometricFrame.FK5_J2000,
            "WCSAXES =                    2",
            "e" * 64,
            1000,
            800,
        ),
        annotations,
        tuple(range(10)),
        "astrometry.net-nova",
        None,
    )
    service = IdentificationPublicReadService(
        SubmissionReader(_submission(IdentificationSolverType.NOVA)),
        RemoteReader(_remote()),
        SolutionReader(stored),
    )

    page = await service.solution(_SUBMISSION_ID)

    def serialized_size(annotation: PlateAnnotation) -> int:
        return (
            len(
                json.dumps(
                    {
                        "category": annotation.category,
                        "dec_deg": annotation.dec_deg,
                        "names": annotation.names,
                        "pixel_x": annotation.pixel_x,
                        "pixel_y": annotation.pixel_y,
                        "ra_deg": annotation.ra_deg,
                    },
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            )
            + 1
        )

    visible_bytes = sum(serialized_size(item) for item in page.annotations)
    assert 0 < visible_bytes <= 24_576
    assert len(page.annotations) < len(annotations)
    assert visible_bytes + serialized_size(annotations[len(page.annotations)]) > 24_576
    assert page.has_more and page.next_cursor is not None
    assert (
        decode_solution_cursor(page.next_cursor, submission_id=_SUBMISSION_ID).ordinal
        == len(page.annotations) - 1
    )


@pytest.mark.asyncio
async def test_solution_is_not_available_for_fake_or_non_succeeded_remote_state() -> None:
    fake = IdentificationPublicReadService(
        SubmissionReader(_submission(IdentificationSolverType.FAKE), _fake_status()),
        RemoteReader(_remote()),
        SolutionReader(_slice(0)),
    )
    waiting = IdentificationPublicReadService(
        SubmissionReader(_submission(IdentificationSolverType.NOVA)),
        RemoteReader(_remote(RemoteSolveState.SOLVING)),
        SolutionReader(_slice(0)),
    )

    with pytest.raises(IdentificationSolutionNotReady):
        await fake.solution(_SUBMISSION_ID)
    with pytest.raises(IdentificationSolutionNotReady):
        await waiting.solution(_SUBMISSION_ID)
