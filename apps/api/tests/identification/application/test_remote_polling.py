from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from lumina.identification.application.remote_polling import RemoteSolvePollingService
from lumina.identification.domain.nova import (
    NovaJobId,
    NovaJobState,
    NovaSession,
    NovaSubmissionId,
    NovaSubmissionSnapshot,
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
        self, claim: RemoteSolveClaim, *, poll_seconds: int, polled: bool
    ) -> RemoteFinalizationOutcome:
        self.events.append(("reschedule", (claim.record.state, poll_seconds, polled)))
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
    snapshot: NovaSubmissionSnapshot = NovaSubmissionSnapshot(jobs=(), calibrated_jobs=())
    job_state: NovaJobState = NovaJobState.SOLVING
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


def _service(
    repository: FakeRemoteRepository,
    nova: FakeNova,
    content: bytes,
) -> RemoteSolvePollingService:
    return RemoteSolvePollingService(
        repository,
        FakeSubmissionReader(_submission(content)),
        FakeStore(content),
        nova,
        UploadValidationPolicy(max_bytes=1024 * 1024, max_pixels=1_000_000, min_dimension=32),
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
    assert [name for name, _ in repository.events] == ["claim", "reschedule"]


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
        (RemoteSolveState.WAITING_FOR_SOLVER, 5, True),
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
