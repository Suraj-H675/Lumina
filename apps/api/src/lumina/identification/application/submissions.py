"""Application lifecycle for temporary private identification submissions."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol
from uuid import UUID, uuid4

from lumina.identification.application.uploads import StoreValidatedUploadService
from lumina.identification.domain.storage import PrivateObjectKey, PrivateObjectStore
from lumina.identification.domain.submissions import (
    CreateIdentificationSubmission,
    IdentificationSolverType,
    IdentificationSubmission,
    IdentificationSubmissionStatus,
    SubmissionStateConflict,
    sanitize_original_filename,
)
from lumina.jobs.domain.models import EnqueueJobOutcome, JobType

_DEFAULT_RETENTION = timedelta(hours=24)


class SubmissionRepository(Protocol):
    async def create(self, command: CreateIdentificationSubmission) -> IdentificationSubmission: ...

    async def read(self, submission_id: UUID) -> IdentificationSubmission: ...

    async def read_status(self, submission_id: UUID) -> IdentificationSubmissionStatus: ...

    async def attach_job(self, submission_id: UUID, job_id: UUID) -> IdentificationSubmission: ...

    async def scrub_deleted(
        self,
        submission_id: UUID,
        *,
        expected_key: PrivateObjectKey,
        deleted_at: datetime,
    ) -> IdentificationSubmission: ...

    async def retention_due(
        self,
        *,
        now: datetime,
        limit: int,
        terminal_retention: timedelta,
    ) -> tuple[IdentificationSubmission, ...]: ...


class IdentificationJobEnqueue(Protocol):
    async def enqueue(
        self,
        *,
        job_type: str | JobType,
        payload: object,
        idempotency_key: str | None = None,
        priority: int = 0,
        max_attempts: int | None = None,
    ) -> EnqueueJobOutcome: ...


class SubmissionCleanupFailure(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Identification submission cleanup failed.")


@dataclass(frozen=True, slots=True, repr=False)
class CreatedSubmission:
    submission: IdentificationSubmission

    def __repr__(self) -> str:
        return "CreatedSubmission(<redacted>)"


class CreateSubmissionService:
    def __init__(
        self,
        uploads: StoreValidatedUploadService,
        repository: SubmissionRepository,
        store: PrivateObjectStore,
        *,
        now: Callable[[], datetime],
        uuid_factory: Callable[[], UUID] = uuid4,
        provisional_retention: timedelta = _DEFAULT_RETENTION,
    ) -> None:
        if provisional_retention <= timedelta(0) or provisional_retention > timedelta(days=7):
            raise ValueError("Identification provisional retention is invalid.")
        self._uploads = uploads
        self._repository = repository
        self._store = store
        self._now = now
        self._uuid_factory = uuid_factory
        self._provisional_retention = provisional_retention

    async def create(
        self,
        content: bytes,
        *,
        original_filename: object,
        declared_media_type: str | None,
        solver_type: IdentificationSolverType = IdentificationSolverType.FAKE,
        consent_remote_processing: bool = False,
    ) -> CreatedSubmission:
        filename = sanitize_original_filename(original_filename)
        stored = self._uploads.store(content, declared_media_type=declared_media_type)
        submission_id = self._uuid_factory()
        if not isinstance(submission_id, UUID) or submission_id.version != 4:
            self._cleanup_or_raise(stored.object_key)
            raise ValueError("Identification submission identifiers must be UUIDv4.")
        now = _utc_now(self._now())
        command = CreateIdentificationSubmission(
            id=submission_id,
            storage_object_key=stored.object_key,
            original_filename=filename,
            media_type=stored.media_type,
            byte_size=stored.byte_size,
            width=stored.width,
            height=stored.height,
            sha256=stored.sha256,
            retention_until=now + self._provisional_retention,
            solver_type=solver_type,
            consent_remote_processing=consent_remote_processing,
        )
        try:
            submission = await self._repository.create(command)
        except BaseException:
            self._cleanup_or_raise(stored.object_key)
            raise
        return CreatedSubmission(submission=submission)

    def _cleanup_or_raise(self, key: PrivateObjectKey) -> None:
        try:
            self._store.delete(key)
        except BaseException:
            raise SubmissionCleanupFailure() from None


class RemoteSolveStateCreator(Protocol):
    async def create(self, submission_id: UUID, *, timeout_seconds: int) -> object: ...


@dataclass(frozen=True, slots=True)
class StartedRemoteIdentification:
    submission_id: UUID


class StartRemoteIdentificationService:
    """Create a consented Nova submission plus durable remote lifecycle state."""

    def __init__(
        self,
        create: CreateSubmissionService,
        remote_state: RemoteSolveStateCreator,
        delete: DeleteSubmissionService,
        *,
        timeout_seconds: int,
    ) -> None:
        if type(timeout_seconds) is not int or not 60 <= timeout_seconds <= 3_600:
            raise ValueError("Remote identification timeout is invalid.")
        self._create = create
        self._remote_state = remote_state
        self._delete = delete
        self._timeout_seconds = timeout_seconds

    async def start(
        self,
        content: bytes,
        *,
        original_filename: object,
        declared_media_type: str | None,
    ) -> StartedRemoteIdentification:
        created = await self._create.create(
            content,
            original_filename=original_filename,
            declared_media_type=declared_media_type,
            solver_type=IdentificationSolverType.NOVA,
            consent_remote_processing=True,
        )
        try:
            await self._remote_state.create(
                created.submission.id,
                timeout_seconds=self._timeout_seconds,
            )
        except BaseException:
            try:
                await self._delete.delete(created.submission.id)
            except BaseException:
                raise SubmissionCleanupFailure() from None
            raise
        return StartedRemoteIdentification(submission_id=created.submission.id)


@dataclass(frozen=True, slots=True)
class SubmittedIdentification:
    submission_id: UUID
    job_id: UUID


class SubmitIdentificationService:
    """Store one private upload, enqueue the fixed fake solve, and attach it safely."""

    def __init__(
        self,
        create: CreateSubmissionService,
        enqueue: IdentificationJobEnqueue,
        repository: SubmissionRepository,
        delete: DeleteSubmissionService,
    ) -> None:
        self._create = create
        self._enqueue = enqueue
        self._repository = repository
        self._delete = delete

    async def submit(
        self,
        content: bytes,
        *,
        original_filename: object,
        declared_media_type: str | None,
    ) -> SubmittedIdentification:
        created = await self._create.create(
            content,
            original_filename=original_filename,
            declared_media_type=declared_media_type,
        )
        submission_id = created.submission.id
        try:
            enqueued = await self._enqueue.enqueue(
                job_type=JobType.IDENTIFICATION_SOLVE,
                payload={"submission_id": str(submission_id)},
                idempotency_key=f"identification.solve:{submission_id}",
                max_attempts=2,
            )
        except BaseException:
            await self._cleanup_failed_submit(submission_id)
            raise
        try:
            await self._repository.attach_job(submission_id, enqueued.id)
        except BaseException:
            await self._cleanup_failed_submit(submission_id)
            raise
        return SubmittedIdentification(submission_id=submission_id, job_id=enqueued.id)

    async def _cleanup_failed_submit(self, submission_id: UUID) -> None:
        try:
            await self._delete.delete(submission_id)
        except BaseException:
            raise SubmissionCleanupFailure() from None


class ReadIdentificationStatusService:
    def __init__(self, repository: SubmissionRepository) -> None:
        self._repository = repository

    async def read(self, submission_id: UUID) -> IdentificationSubmissionStatus:
        return await self._repository.read_status(submission_id)


class DeleteSubmissionService:
    def __init__(
        self,
        repository: SubmissionRepository,
        store: PrivateObjectStore,
        *,
        now: Callable[[], datetime],
    ) -> None:
        self._repository = repository
        self._store = store
        self._now = now

    async def delete(self, submission_id: UUID) -> IdentificationSubmission:
        submission = await self._repository.read(submission_id)
        if submission.deleted:
            return submission
        key = submission.storage_object_key
        if key is None:
            raise SubmissionStateConflict()
        try:
            self._store.delete(key)
        except BaseException:
            raise SubmissionCleanupFailure() from None
        return await self._repository.scrub_deleted(
            submission_id,
            expected_key=key,
            deleted_at=_utc_now(self._now()),
        )


class RetentionCleanupService:
    def __init__(
        self,
        repository: SubmissionRepository,
        store: PrivateObjectStore,
        *,
        now: Callable[[], datetime],
        terminal_retention: timedelta = _DEFAULT_RETENTION,
    ) -> None:
        if terminal_retention <= timedelta(0) or terminal_retention > timedelta(days=7):
            raise ValueError("Identification terminal retention is invalid.")
        self._repository = repository
        self._store = store
        self._now = now
        self._terminal_retention = terminal_retention

    async def cleanup(self, *, limit: int = 50) -> int:
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError("Identification cleanup limit is invalid.")
        now = _utc_now(self._now())
        candidates = await self._repository.retention_due(
            now=now,
            limit=limit,
            terminal_retention=self._terminal_retention,
        )
        cleaned = 0
        for submission in candidates:
            key = submission.storage_object_key
            if submission.deleted or key is None:
                raise SubmissionStateConflict()
            try:
                self._store.delete(key)
            except BaseException:
                raise SubmissionCleanupFailure() from None
            await self._repository.scrub_deleted(
                submission.id,
                expected_key=key,
                deleted_at=now,
            )
            cleaned += 1
        return cleaned


def _utc_now(value: datetime) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise ValueError("Identification clock must return an aware timestamp.")
    return value.astimezone(UTC)
