from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import UUID

import pytest
from astropy.io import fits
from lumina.identification.application.remote_polling import RemoteSolvePollingService
from lumina.identification.domain.nova import (
    NovaAnnotation,
    NovaCalibration,
    NovaJobId,
    NovaJobState,
    NovaSession,
    NovaSubmissionId,
    NovaSubmissionSnapshot,
    RemoteAstrometryBusy,
    RemoteAstrometryTimeout,
    RemoteAstrometryUnavailable,
)
from lumina.identification.domain.remote_raster import SanitizedRemoteRaster
from lumina.identification.domain.remote_state import (
    RemoteFinalizationOutcome,
    RemoteLeaseToken,
    RemoteSolveClaim,
    RemoteSolveRecord,
    RemoteSolveState,
    RemoteTransitionReason,
)
from lumina.identification.domain.solution import NormalizedPlateSolution, SolutionStorageFailure
from lumina.identification.domain.storage import PrivateObjectKey
from lumina.identification.domain.submissions import (
    IdentificationSolverType,
    IdentificationSubmission,
)
from lumina.identification.domain.uploads import UploadMediaType, UploadValidationPolicy

_NOW = datetime(2026, 9, 15, 17, 0, tzinfo=UTC)
_SUBMISSION_ID = UUID("73000000-0000-4000-8000-000000000001")
_KEY = PrivateObjectKey("b" * 32)


def _chunk(kind: bytes, data: bytes) -> bytes:
    checksum = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", checksum)


def _png_with_metadata() -> bytes:
    ihdr = struct.pack(">IIBBBBB", 32, 32, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"tEXt", b"Comment\x00private-metadata")
        + _chunk(b"IDAT", b"fixture")
        + _chunk(b"IEND", b"")
    )


def _wcs_bytes() -> bytes:
    header = fits.Header()
    header["WCSAXES"] = 2
    header["CTYPE1"] = "RA---TAN"
    header["CTYPE2"] = "DEC--TAN"
    header["EQUINOX"] = 2000.0
    header["CRPIX1"] = 16.5
    header["CRPIX2"] = 16.5
    header["CRVAL1"] = 120.0
    header["CRVAL2"] = 20.0
    header["CD1_1"] = -1.0 / 3600.0
    header["CD1_2"] = 0.0
    header["CD2_1"] = 0.0
    header["CD2_2"] = 1.0 / 3600.0
    header["IMAGEW"] = 32
    header["IMAGEH"] = 32
    output = BytesIO()
    fits.PrimaryHDU(header=header).writeto(output)
    return output.getvalue()


def _record(
    state: RemoteSolveState,
    *,
    external_submission_id: NovaSubmissionId | None = None,
    external_job_id: NovaJobId | None = None,
    upload_attempted_at: datetime | None = None,
    deadline_at: datetime | None = None,
) -> RemoteSolveRecord:
    return RemoteSolveRecord(
        submission_id=_SUBMISSION_ID,
        state=state,
        external_submission_id=external_submission_id,
        external_job_id=external_job_id,
        next_poll_at=_NOW,
        deadline_at=deadline_at or _NOW + timedelta(minutes=15),
        last_polled_at=None,
        upload_attempted_at=upload_attempted_at,
        terminal_at=None,
        safe_reason=None,
        created_at=_NOW - timedelta(minutes=1),
        updated_at=_NOW - timedelta(seconds=1),
    )


def _claim(record: RemoteSolveRecord) -> RemoteSolveClaim:
    return RemoteSolveClaim(
        record=record,
        lease_token=RemoteLeaseToken("c" * 64),
        database_claimed_at=_NOW,
        lease_expires_at=_NOW + timedelta(minutes=3),
    )


def _submission(content: bytes) -> IdentificationSubmission:
    return IdentificationSubmission(
        id=_SUBMISSION_ID,
        job_id=None,
        storage_object_key=_KEY,
        original_filename="night.png",
        media_type=UploadMediaType.PNG,
        byte_size=len(content),
        width=32,
        height=32,
        sha256=hashlib.sha256(content).hexdigest(),
        retention_until=_NOW + timedelta(hours=24),
        deleted_at=None,
        created_at=_NOW - timedelta(minutes=1),
        solver_type=IdentificationSolverType.NOVA,
        consent_remote_processing=True,
    )


@dataclass
class FakeRemoteRepository:
    claim: RemoteSolveClaim | None
    events: list[tuple[str, object]] = field(default_factory=list)

    async def claim_due(
        self, *, lease_token: RemoteLeaseToken, lease_seconds: int
    ) -> RemoteSolveClaim | None:
        self.events.append(("claim", lease_seconds))
        return self.claim

    async def mark_upload_attempt(self, claim: RemoteSolveClaim) -> RemoteFinalizationOutcome:
        self.events.append(("mark-upload", claim.record.state))
        return RemoteFinalizationOutcome.APPLIED

    async def reschedule(
        self,
        claim: RemoteSolveClaim,
        *,
        poll_seconds: int,
        polled: bool,
        safe_reason: RemoteTransitionReason | None = None,
    ) -> RemoteFinalizationOutcome:
        self.events.append(("reschedule", (claim.record.state, poll_seconds, polled, safe_reason)))
        return RemoteFinalizationOutcome.APPLIED

    async def transition(
        self,
        claim: RemoteSolveClaim,
        *,
        to_state: RemoteSolveState,
        reason: RemoteTransitionReason,
        poll_seconds: int | None = None,
        external_submission_id: NovaSubmissionId | None = None,
        external_job_id: NovaJobId | None = None,
    ) -> RemoteFinalizationOutcome:
        self.events.append(
            (
                "transition",
                (to_state, reason, poll_seconds, external_submission_id, external_job_id),
            )
        )
        return RemoteFinalizationOutcome.APPLIED


@dataclass
class FakeSubmissionReader:
    submission: IdentificationSubmission

    async def read(self, submission_id: object) -> IdentificationSubmission:
        assert submission_id == _SUBMISSION_ID
        return self.submission


@dataclass
class FakeStore:
    content: bytes

    def read(self, key: PrivateObjectKey, *, maximum_bytes: int) -> bytes:
        assert key == _KEY
        assert maximum_bytes == len(self.content)
        return self.content

    def put(self, content: bytes):  # type: ignore[no-untyped-def]
        raise AssertionError(content)

    def delete(self, key: PrivateObjectKey) -> bool:
        raise AssertionError(key)


@dataclass
class FakeNova:
    login_error: Exception | None = None
    upload_error: Exception | None = None
    result_error: Exception | None = None
    snapshot: NovaSubmissionSnapshot = NovaSubmissionSnapshot(jobs=(), calibrated_jobs=())
    job_state: NovaJobState = NovaJobState.SOLVING
    calibration_result: NovaCalibration = NovaCalibration(
        ra_deg=120.0,
        dec_deg=20.0,
        orientation_deg=0.0,
        parity=-1,
        pixel_scale_arcsec_per_pixel=1.0,
        radius_deg=0.1,
    )
    annotations_result: tuple[NovaAnnotation, ...] = (
        NovaAnnotation(category="hd", names=("HD 1",), pixel_x=16.0, pixel_y=16.0),
    )
    wcs_result: bytes = field(default_factory=_wcs_bytes)
    events: list[str] = field(default_factory=list)
    uploaded: SanitizedRemoteRaster | None = None

    async def login(self) -> NovaSession:
        self.events.append("login")
        if self.login_error is not None:
            raise self.login_error
        return NovaSession("session-token")

    async def upload(self, session: NovaSession, raster: SanitizedRemoteRaster) -> NovaSubmissionId:
        assert type(session) is NovaSession
        self.events.append("upload")
        self.uploaded = raster
        if self.upload_error is not None:
            raise self.upload_error
        return NovaSubmissionId(101)

    async def submission_status(
        self, session: NovaSession, submission_id: NovaSubmissionId
    ) -> NovaSubmissionSnapshot:
        assert type(session) is NovaSession and submission_id == NovaSubmissionId(101)
        self.events.append("submission-status")
        return self.snapshot

    async def job_status(self, session: NovaSession, job_id: NovaJobId) -> NovaJobState:
        assert type(session) is NovaSession and job_id == NovaJobId(202)
        self.events.append("job-status")
        return self.job_state

    async def calibration(self, session: NovaSession, job_id: NovaJobId) -> NovaCalibration:
        assert type(session) is NovaSession and job_id == NovaJobId(202)
        self.events.append("calibration")
        if self.result_error is not None:
            raise self.result_error
        return self.calibration_result

    async def annotations(
        self, session: NovaSession, job_id: NovaJobId
    ) -> tuple[NovaAnnotation, ...]:
        assert type(session) is NovaSession and job_id == NovaJobId(202)
        self.events.append("annotations")
        if self.result_error is not None:
            raise self.result_error
        return self.annotations_result

    async def wcs_file(self, job_id: NovaJobId) -> bytes:
        assert job_id == NovaJobId(202)
        self.events.append("wcs")
        if self.result_error is not None:
            raise self.result_error
        return self.wcs_result


@dataclass
class FakeSolutionFinalizer:
    error: Exception | None = None
    outcome: RemoteFinalizationOutcome = RemoteFinalizationOutcome.APPLIED
    stored: NormalizedPlateSolution | None = None

    async def store_and_succeed(
        self, claim: RemoteSolveClaim, solution: NormalizedPlateSolution
    ) -> RemoteFinalizationOutcome:
        assert claim.record.state is RemoteSolveState.FETCHING_RESULTS
        if self.error is not None:
            raise self.error
        self.stored = solution
        return self.outcome


def _service(
    repository: FakeRemoteRepository,
    nova: FakeNova,
    content: bytes,
    *,
    finalizer: FakeSolutionFinalizer | None = None,
) -> RemoteSolvePollingService:
    return RemoteSolvePollingService(
        repository,
        FakeSubmissionReader(_submission(content)),
        FakeStore(content),
        nova,
        UploadValidationPolicy(max_bytes=1024 * 1024, max_pixels=1_000_000, min_dimension=32),
        finalizer,
        poll_seconds=5,
        token_factory=lambda: "c" * 64,
    )


@pytest.mark.asyncio
async def test_recovered_upload_marker_never_calls_nova_again() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(RemoteSolveState.SUBMITTING, upload_attempted_at=_NOW - timedelta(seconds=2))
        )
    )
    nova = FakeNova()

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == []
    assert repository.events[-1][1][0:2] == (  # type: ignore[index]
        RemoteSolveState.FAILED,
        RemoteTransitionReason.REMOTE_SUBMISSION_OUTCOME_UNKNOWN,
    )


@pytest.mark.asyncio
async def test_login_outage_reschedules_before_upload_attempt_marker() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(_claim(_record(RemoteSolveState.SUBMITTING)))
    nova = FakeNova(login_error=RemoteAstrometryUnavailable())

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == ["login"]
    assert repository.events[-1] == (
        "reschedule",
        (
            RemoteSolveState.SUBMITTING,
            5,
            False,
            RemoteTransitionReason.PROVIDER_UNAVAILABLE,
        ),
    )


@pytest.mark.asyncio
async def test_login_capacity_reschedules_as_provider_busy_before_upload_marker() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(_claim(_record(RemoteSolveState.SUBMITTING)))
    nova = FakeNova(login_error=RemoteAstrometryBusy())

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == ["login"]
    assert repository.events[-1] == (
        "reschedule",
        (RemoteSolveState.SUBMITTING, 5, False, RemoteTransitionReason.PROVIDER_BUSY),
    )


@pytest.mark.asyncio
async def test_successful_submit_strips_metadata_marks_once_then_waits() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(_claim(_record(RemoteSolveState.SUBMITTING)))
    nova = FakeNova()

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == ["login", "upload"]
    assert nova.uploaded is not None
    assert b"private-metadata" not in nova.uploaded.content
    assert [name for name, _ in repository.events] == ["claim", "mark-upload", "transition"]
    transition = repository.events[-1][1]
    assert transition[0:4] == (  # type: ignore[index]
        RemoteSolveState.WAITING_FOR_SOLVER,
        RemoteTransitionReason.REMOTE_UPLOAD_ACCEPTED,
        5,
        NovaSubmissionId(101),
    )


@pytest.mark.asyncio
async def test_upload_capacity_after_marker_is_definite_provider_busy_failure() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(_claim(_record(RemoteSolveState.SUBMITTING)))
    nova = FakeNova(upload_error=RemoteAstrometryBusy())

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == ["login", "upload"]
    transition = repository.events[-1][1]
    assert transition[0:2] == (  # type: ignore[index]
        RemoteSolveState.FAILED,
        RemoteTransitionReason.PROVIDER_BUSY,
    )


@pytest.mark.asyncio
async def test_upload_timeout_after_marker_becomes_outcome_unknown_without_retry() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(_claim(_record(RemoteSolveState.SUBMITTING)))
    nova = FakeNova(upload_error=RemoteAstrometryTimeout())

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == ["login", "upload"]
    transition = repository.events[-1][1]
    assert transition[0:2] == (  # type: ignore[index]
        RemoteSolveState.FAILED,
        RemoteTransitionReason.REMOTE_SUBMISSION_OUTCOME_UNKNOWN,
    )


@pytest.mark.asyncio
async def test_waiting_submission_without_job_reschedules_as_polled() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.WAITING_FOR_SOLVER,
                external_submission_id=NovaSubmissionId(101),
                upload_attempted_at=_NOW - timedelta(seconds=20),
            )
        )
    )
    nova = FakeNova()

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == ["login", "submission-status"]
    assert repository.events[-1] == (
        "reschedule",
        (RemoteSolveState.WAITING_FOR_SOLVER, 5, True, None),
    )


@pytest.mark.asyncio
async def test_waiting_submission_resolves_exactly_one_job() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.WAITING_FOR_SOLVER,
                external_submission_id=NovaSubmissionId(101),
                upload_attempted_at=_NOW - timedelta(seconds=20),
            )
        )
    )
    nova = FakeNova(snapshot=NovaSubmissionSnapshot(jobs=(NovaJobId(202),), calibrated_jobs=()))

    assert await _service(repository, nova, content).advance() == 1
    transition = repository.events[-1][1]
    assert transition[0:5] == (  # type: ignore[index]
        RemoteSolveState.SOLVING,
        RemoteTransitionReason.REMOTE_JOB_RESOLVED,
        5,
        None,
        NovaJobId(202),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_state", "target", "reason"),
    [
        (
            NovaJobState.SUCCESS,
            RemoteSolveState.FETCHING_RESULTS,
            RemoteTransitionReason.REMOTE_JOB_SUCCEEDED,
        ),
        (
            NovaJobState.FAILURE,
            RemoteSolveState.UNSOLVED,
            RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION,
        ),
    ],
)
async def test_solving_maps_nova_terminal_state_without_fabricating_solution(
    job_state: NovaJobState,
    target: RemoteSolveState,
    reason: RemoteTransitionReason,
) -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.SOLVING,
                external_submission_id=NovaSubmissionId(101),
                external_job_id=NovaJobId(202),
                upload_attempted_at=_NOW - timedelta(seconds=30),
            )
        )
    )
    nova = FakeNova(job_state=job_state)

    assert await _service(repository, nova, content).advance() == 1
    transition = repository.events[-1][1]
    assert transition[0:2] == (target, reason)  # type: ignore[index]


@pytest.mark.asyncio
async def test_deadline_expires_before_any_remote_request() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(_record(RemoteSolveState.SUBMITTING, deadline_at=_NOW))
    )
    nova = FakeNova()

    assert await _service(repository, nova, content).advance() == 1
    assert nova.events == []
    transition = repository.events[-1][1]
    assert transition[0:2] == (  # type: ignore[index]
        RemoteSolveState.EXPIRED,
        RemoteTransitionReason.SOLVER_TIMEOUT,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "state",
    [RemoteSolveState.WAITING_FOR_SOLVER, RemoteSolveState.SOLVING],
)
async def test_local_delete_stops_remote_polling_before_any_provider_request(
    state: RemoteSolveState,
) -> None:
    content = _png_with_metadata()
    record = _record(
        state,
        external_submission_id=NovaSubmissionId(101),
        external_job_id=NovaJobId(202) if state is RemoteSolveState.SOLVING else None,
        upload_attempted_at=_NOW - timedelta(seconds=30),
    )
    repository = FakeRemoteRepository(_claim(record))
    deleted = replace(
        _submission(content),
        storage_object_key=None,
        original_filename=None,
        sha256=None,
        deleted_at=_NOW - timedelta(seconds=1),
    )
    nova = FakeNova()
    service = RemoteSolvePollingService(
        repository,
        FakeSubmissionReader(deleted),
        FakeStore(content),
        nova,
        UploadValidationPolicy(max_bytes=1024 * 1024, max_pixels=1_000_000, min_dimension=32),
        poll_seconds=5,
        token_factory=lambda: "c" * 64,
    )

    assert await service.advance() == 1
    assert nova.events == []
    transition = repository.events[-1][1]
    assert transition[0:2] == (  # type: ignore[index]
        RemoteSolveState.DELETED,
        RemoteTransitionReason.LOCAL_DELETED,
    )


@pytest.mark.asyncio
async def test_fetching_results_normalizes_wcs_and_finalizes_atomically() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.FETCHING_RESULTS,
                external_submission_id=NovaSubmissionId(101),
                external_job_id=NovaJobId(202),
                upload_attempted_at=_NOW - timedelta(seconds=30),
            )
        )
    )
    nova = FakeNova()
    finalizer = FakeSolutionFinalizer()

    assert await _service(repository, nova, content, finalizer=finalizer).advance() == 1
    assert nova.events == ["login", "calibration", "annotations", "wcs"]
    assert finalizer.stored is not None
    assert finalizer.stored.wcs.frame.value == "fk5_j2000"
    assert finalizer.stored.wcs.image_width == 32
    assert len(finalizer.stored.annotations) == 1
    assert finalizer.stored.annotations[0].names == ("HD 1",)
    assert [name for name, _ in repository.events] == ["claim"]


@pytest.mark.asyncio
async def test_fetching_result_outage_is_retryable_without_terminal_transition() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.FETCHING_RESULTS,
                external_submission_id=NovaSubmissionId(101),
                external_job_id=NovaJobId(202),
                upload_attempted_at=_NOW - timedelta(seconds=30),
            )
        )
    )
    nova = FakeNova(result_error=RemoteAstrometryUnavailable())
    finalizer = FakeSolutionFinalizer()

    assert await _service(repository, nova, content, finalizer=finalizer).advance() == 1
    assert nova.events == ["login", "calibration"]
    assert finalizer.stored is None
    assert repository.events[-1] == (
        "reschedule",
        (RemoteSolveState.FETCHING_RESULTS, 5, True, RemoteTransitionReason.PROVIDER_UNAVAILABLE),
    )


@pytest.mark.asyncio
async def test_invalid_result_becomes_provider_protocol_failure() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.FETCHING_RESULTS,
                external_submission_id=NovaSubmissionId(101),
                external_job_id=NovaJobId(202),
                upload_attempted_at=_NOW - timedelta(seconds=30),
            )
        )
    )
    nova = FakeNova(wcs_result=b"not-a-fits-wcs")
    finalizer = FakeSolutionFinalizer()

    assert await _service(repository, nova, content, finalizer=finalizer).advance() == 1
    assert finalizer.stored is None
    transition = repository.events[-1][1]
    assert transition[0:2] == (  # type: ignore[index]
        RemoteSolveState.FAILED,
        RemoteTransitionReason.PROVIDER_PROTOCOL_ERROR,
    )


@pytest.mark.asyncio
async def test_result_storage_failure_fails_worker_instead_of_losing_solution() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.FETCHING_RESULTS,
                external_submission_id=NovaSubmissionId(101),
                external_job_id=NovaJobId(202),
                upload_attempted_at=_NOW - timedelta(seconds=30),
            )
        )
    )
    finalizer = FakeSolutionFinalizer(error=SolutionStorageFailure())

    with pytest.raises(Exception, match="Remote identification polling failed"):
        await _service(repository, FakeNova(), content, finalizer=finalizer).advance()


@pytest.mark.asyncio
async def test_local_delete_before_result_fetch_makes_zero_provider_requests() -> None:
    content = _png_with_metadata()
    repository = FakeRemoteRepository(
        _claim(
            _record(
                RemoteSolveState.FETCHING_RESULTS,
                external_submission_id=NovaSubmissionId(101),
                external_job_id=NovaJobId(202),
                upload_attempted_at=_NOW - timedelta(seconds=30),
            )
        )
    )
    deleted = replace(
        _submission(content),
        storage_object_key=None,
        original_filename=None,
        sha256=None,
        deleted_at=_NOW - timedelta(seconds=1),
    )
    nova = FakeNova()
    finalizer = FakeSolutionFinalizer()
    service = RemoteSolvePollingService(
        repository,
        FakeSubmissionReader(deleted),
        FakeStore(content),
        nova,
        UploadValidationPolicy(max_bytes=1024 * 1024, max_pixels=1_000_000, min_dimension=32),
        finalizer,
        poll_seconds=5,
        token_factory=lambda: "c" * 64,
    )

    assert await service.advance() == 1
    assert nova.events == []
    assert finalizer.stored is None
    transition = repository.events[-1][1]
    assert transition[0:2] == (  # type: ignore[index]
        RemoteSolveState.DELETED,
        RemoteTransitionReason.LOCAL_DELETED,
    )
