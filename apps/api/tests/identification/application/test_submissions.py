"""Failure-safe application lifecycle for temporary private submissions."""

from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from lumina.identification.application.submissions import (
    CreateSubmissionService,
    DeleteSubmissionService,
    RetentionCleanupService,
    StartRemoteIdentificationService,
    SubmissionCleanupFailure,
)
from lumina.identification.application.uploads import StoreValidatedUploadService
from lumina.identification.domain.storage import (
    PrivateObjectKey,
    StoredPrivateObject,
)
from lumina.identification.domain.submissions import (
    CreateIdentificationSubmission,
    IdentificationSolverType,
    IdentificationSubmission,
    IdentificationSubmissionStatus,
    SubmissionStateConflict,
    SubmissionStorageFailure,
)
from lumina.identification.domain.uploads import UploadMediaType, UploadValidationPolicy

_NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)
_SUBMISSION_ID = UUID("61000000-0000-4000-8000-000000000001")
_DEFAULT_KEY = PrivateObjectKey("e" * 32)


def _chunk(kind: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)


def _png() -> bytes:
    width = height = 8
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + b"\x00" * (width * 3) for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", zlib.compress(rows))
        + _chunk(b"IEND", b"")
    )


@dataclass
class MemoryPrivateStore:
    objects: dict[str, bytes] = field(default_factory=dict)
    next_key: str = "e" * 32

    def put(self, content: bytes) -> StoredPrivateObject:
        key = PrivateObjectKey(self.next_key)
        self.objects[key.value] = content
        return StoredPrivateObject(
            key=key,
            byte_size=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )

    def read(self, key: PrivateObjectKey, *, maximum_bytes: int) -> bytes:
        content = self.objects[key.value]
        if len(content) > maximum_bytes:
            raise RuntimeError()
        return content

    def delete(self, key: PrivateObjectKey) -> bool:
        return self.objects.pop(key.value, None) is not None


def _submission(
    *,
    key: PrivateObjectKey | None = _DEFAULT_KEY,
    deleted_at: datetime | None = None,
) -> IdentificationSubmission:
    deleted = deleted_at is not None
    return IdentificationSubmission(
        id=_SUBMISSION_ID,
        job_id=None,
        storage_object_key=None if deleted else key,
        original_filename=None if deleted else "night.png",
        media_type=UploadMediaType.PNG,
        byte_size=123,
        width=8,
        height=8,
        sha256=None if deleted else "a" * 64,
        retention_until=_NOW + timedelta(hours=24),
        solver_type=IdentificationSolverType.NOVA,
        consent_remote_processing=True,
        deleted_at=deleted_at,
        created_at=_NOW,
    )


@dataclass
class FakeRepository:
    current: IdentificationSubmission | None = None
    create_failure: bool = False
    scrub_failures: int = 0
    created_command: CreateIdentificationSubmission | None = None
    due: tuple[IdentificationSubmission, ...] = ()
    terminal_retention: timedelta = timedelta(hours=24)

    async def create(self, command: CreateIdentificationSubmission) -> IdentificationSubmission:
        self.created_command = command
        if self.create_failure:
            raise SubmissionStorageFailure()
        self.current = IdentificationSubmission(
            id=command.id,
            job_id=None,
            storage_object_key=command.storage_object_key,
            original_filename=command.original_filename,
            media_type=command.media_type,
            byte_size=command.byte_size,
            width=command.width,
            height=command.height,
            sha256=command.sha256,
            retention_until=command.retention_until,
            solver_type=command.solver_type,
            consent_remote_processing=command.consent_remote_processing,
            deleted_at=None,
            created_at=_NOW,
        )
        return self.current

    async def read(self, submission_id: UUID) -> IdentificationSubmission:
        assert submission_id == _SUBMISSION_ID
        assert self.current is not None
        return self.current

    async def read_status(self, submission_id: UUID) -> IdentificationSubmissionStatus:
        raise AssertionError(submission_id)

    async def scrub_deleted(
        self,
        submission_id: UUID,
        *,
        expected_key: PrivateObjectKey,
        deleted_at: datetime,
    ) -> IdentificationSubmission:
        assert submission_id == _SUBMISSION_ID
        assert self.current is not None
        if self.scrub_failures:
            self.scrub_failures -= 1
            raise SubmissionStateConflict()
        assert self.current.storage_object_key == expected_key
        self.current = IdentificationSubmission(
            id=self.current.id,
            job_id=self.current.job_id,
            storage_object_key=None,
            original_filename=None,
            media_type=self.current.media_type,
            byte_size=self.current.byte_size,
            width=self.current.width,
            height=self.current.height,
            sha256=None,
            retention_until=self.current.retention_until,
            deleted_at=deleted_at,
            created_at=self.current.created_at,
            solver_type=self.current.solver_type,
            consent_remote_processing=self.current.consent_remote_processing,
        )
        return self.current

    async def retention_due(
        self,
        *,
        now: datetime,
        limit: int,
        terminal_retention: timedelta,
    ) -> tuple[IdentificationSubmission, ...]:
        assert now == _NOW
        assert terminal_retention == self.terminal_retention
        return self.due[:limit]


@dataclass
class FakeSolutionPurger:
    failure: BaseException | None = None
    calls: list[UUID] = field(default_factory=list)

    async def purge(self, submission_id: UUID) -> bool:
        self.calls.append(submission_id)
        if self.failure is not None:
            raise self.failure
        return True


def _uploads(store: MemoryPrivateStore) -> StoreValidatedUploadService:
    return StoreValidatedUploadService(
        store,
        UploadValidationPolicy(max_bytes=1_000_000, max_pixels=1_000_000, min_dimension=8),
    )


@pytest.mark.asyncio
async def test_create_stores_first_then_persists_bounded_private_metadata() -> None:
    store = MemoryPrivateStore()
    repository = FakeRepository()
    service = CreateSubmissionService(
        _uploads(store),
        repository,
        store,
        now=lambda: _NOW,
        uuid_factory=lambda: _SUBMISSION_ID,
    )

    result = await service.create(
        _png(),
        original_filename=r"C:\private\night.png",
        declared_media_type="image/png",
    )

    assert result.submission.id == _SUBMISSION_ID
    assert result.submission.original_filename == "night.png"
    assert result.submission.retention_until == _NOW + timedelta(hours=24)
    assert repository.created_command is not None
    assert repository.created_command.storage_object_key.value in store.objects
    assert repr(result) == "CreatedSubmission(<redacted>)"


@pytest.mark.asyncio
async def test_database_create_failure_removes_already_written_private_object() -> None:
    store = MemoryPrivateStore()
    repository = FakeRepository(create_failure=True)
    service = CreateSubmissionService(
        _uploads(store),
        repository,
        store,
        now=lambda: _NOW,
        uuid_factory=lambda: _SUBMISSION_ID,
    )

    with pytest.raises(SubmissionStorageFailure):
        await service.create(
            _png(),
            original_filename="night.png",
            declared_media_type="image/png",
        )

    assert store.objects == {}


@pytest.mark.asyncio
async def test_delete_treats_missing_physical_object_as_already_removed_then_scrubs_metadata() -> (
    None
):
    store = MemoryPrivateStore()
    repository = FakeRepository(current=_submission())
    service = DeleteSubmissionService(repository, store, now=lambda: _NOW + timedelta(hours=1))

    deleted = await service.delete(_SUBMISSION_ID)

    assert deleted.deleted is True
    assert deleted.storage_object_key is None
    assert deleted.original_filename is None
    assert deleted.sha256 is None


@pytest.mark.asyncio
async def test_delete_can_retry_after_file_removed_but_database_scrub_conflicted() -> None:
    store = MemoryPrivateStore(objects={"e" * 32: b"private"})
    repository = FakeRepository(current=_submission(), scrub_failures=1)
    service = DeleteSubmissionService(repository, store, now=lambda: _NOW + timedelta(hours=1))

    with pytest.raises(SubmissionStateConflict):
        await service.delete(_SUBMISSION_ID)
    assert store.objects == {}
    assert repository.current is not None and not repository.current.deleted

    deleted = await service.delete(_SUBMISSION_ID)
    assert deleted.deleted is True


@pytest.mark.asyncio
async def test_delete_purges_normalized_solution_before_metadata_scrub() -> None:
    store = MemoryPrivateStore(objects={"e" * 32: b"private"})
    repository = FakeRepository(current=_submission())
    solutions = FakeSolutionPurger()
    service = DeleteSubmissionService(
        repository,
        store,
        now=lambda: _NOW + timedelta(hours=1),
        solutions=solutions,
    )

    deleted = await service.delete(_SUBMISSION_ID)

    assert deleted.deleted is True
    assert store.objects == {}
    assert solutions.calls == [_SUBMISSION_ID]


@pytest.mark.asyncio
async def test_solution_purge_failure_leaves_submission_retryable_after_bytes_are_removed() -> None:
    store = MemoryPrivateStore(objects={"e" * 32: b"private"})
    repository = FakeRepository(current=_submission())
    solutions = FakeSolutionPurger(failure=RuntimeError("fixture"))
    service = DeleteSubmissionService(
        repository,
        store,
        now=lambda: _NOW + timedelta(hours=1),
        solutions=solutions,
    )

    with pytest.raises(SubmissionCleanupFailure):
        await service.delete(_SUBMISSION_ID)
    assert store.objects == {}
    assert repository.current is not None and repository.current.deleted is False

    solutions.failure = None
    deleted = await service.delete(_SUBMISSION_ID)
    assert deleted.deleted is True
    assert solutions.calls == [_SUBMISSION_ID, _SUBMISSION_ID]


@pytest.mark.asyncio
async def test_retention_cleanup_is_bounded_and_scrubs_each_removed_object() -> None:
    first = _submission()
    second = IdentificationSubmission(
        id=UUID("61000000-0000-4000-8000-000000000002"),
        job_id=None,
        storage_object_key=PrivateObjectKey("f" * 32),
        original_filename="second.png",
        media_type=UploadMediaType.PNG,
        byte_size=123,
        width=8,
        height=8,
        sha256="b" * 64,
        retention_until=_NOW,
        deleted_at=None,
        created_at=_NOW - timedelta(days=1),
        solver_type=IdentificationSolverType.NOVA,
        consent_remote_processing=True,
    )
    store = MemoryPrivateStore(objects={"e" * 32: b"one", "f" * 32: b"two"})

    class CleanupRepository(FakeRepository):
        async def scrub_deleted(
            self,
            submission_id: UUID,
            *,
            expected_key: PrivateObjectKey,
            deleted_at: datetime,
        ) -> IdentificationSubmission:
            return IdentificationSubmission(
                id=submission_id,
                job_id=None,
                storage_object_key=None,
                original_filename=None,
                media_type=UploadMediaType.PNG,
                byte_size=123,
                width=8,
                height=8,
                sha256=None,
                retention_until=_NOW,
                deleted_at=deleted_at,
                created_at=_NOW - timedelta(days=1),
                solver_type=IdentificationSolverType.NOVA,
                consent_remote_processing=True,
            )

    repository = CleanupRepository(due=(first, second))
    solutions = FakeSolutionPurger()
    service = RetentionCleanupService(repository, store, now=lambda: _NOW, solutions=solutions)

    assert await service.cleanup(limit=2) == 2
    assert store.objects == {}
    assert solutions.calls == [first.id, second.id]
    with pytest.raises(ValueError):
        await service.cleanup(limit=0)


@pytest.mark.asyncio
async def test_retention_cleanup_passes_configured_terminal_duration() -> None:
    store = MemoryPrivateStore()
    repository = FakeRepository(terminal_retention=timedelta(hours=36))
    service = RetentionCleanupService(
        repository,
        store,
        now=lambda: _NOW,
        terminal_retention=timedelta(hours=36),
    )

    assert await service.cleanup() == 0


@dataclass
class FakeRemoteStateCreator:
    failure: BaseException | None = None
    calls: list[tuple[UUID, int]] = field(default_factory=list)

    async def create(self, submission_id: UUID, *, timeout_seconds: int) -> object:
        self.calls.append((submission_id, timeout_seconds))
        if self.failure is not None:
            raise self.failure
        return object()


def _remote_start_service(
    store: MemoryPrivateStore,
    repository: FakeRepository,
    remote_state: FakeRemoteStateCreator,
) -> StartRemoteIdentificationService:
    create = CreateSubmissionService(
        _uploads(store),
        repository,
        store,
        now=lambda: _NOW,
        uuid_factory=lambda: _SUBMISSION_ID,
    )
    delete = DeleteSubmissionService(repository, store, now=lambda: _NOW)
    return StartRemoteIdentificationService(
        create,
        remote_state,
        delete,
        timeout_seconds=900,
    )


@pytest.mark.asyncio
async def test_remote_start_creates_exact_nova_consent_pair_and_remote_state() -> None:
    store = MemoryPrivateStore()
    repository = FakeRepository()
    remote_state = FakeRemoteStateCreator()

    result = await _remote_start_service(store, repository, remote_state).start(
        _png(),
        original_filename="night.png",
        declared_media_type="image/png",
    )

    assert result.submission_id == _SUBMISSION_ID
    assert repository.created_command is not None
    assert repository.created_command.solver_type is IdentificationSolverType.NOVA
    assert repository.created_command.consent_remote_processing is True
    assert remote_state.calls == [(_SUBMISSION_ID, 900)]
    assert len(store.objects) == 1


@pytest.mark.asyncio
async def test_remote_state_creation_failure_deletes_private_upload_and_scrubs_metadata() -> None:
    store = MemoryPrivateStore()
    repository = FakeRepository()
    remote_state = FakeRemoteStateCreator(failure=RuntimeError("remote-state-failed"))

    with pytest.raises(RuntimeError, match="remote-state-failed"):
        await _remote_start_service(store, repository, remote_state).start(
            _png(),
            original_filename="night.png",
            declared_media_type="image/png",
        )

    assert store.objects == {}
    assert repository.current is not None and repository.current.deleted
