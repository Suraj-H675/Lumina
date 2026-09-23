"""Deterministic fake plate-solver handler contracts."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from lumina.identification.application.fake_solver import (
    DisabledIdentificationHandler,
    FakePlateSolverHandler,
)
from lumina.identification.domain.storage import (
    PrivateObjectKey,
    PrivateStorageError,
    StoredPrivateObject,
)
from lumina.identification.domain.submissions import (
    IdentificationSubmission,
    SubmissionNotFound,
    SubmissionStorageFailure,
)
from lumina.identification.domain.uploads import UploadMediaType
from lumina.jobs.domain.handler import (
    IncompatibleHandlerPayload,
    NonRetryableHandlerFailure,
    RetryableHandlerFailure,
)
from lumina.jobs.domain.payload import PersistedJobPayload

_SUBMISSION_ID = UUID("11111111-1111-4111-8111-111111111111")
_JOB_ID = UUID("22222222-2222-4222-8222-222222222222")
_KEY = PrivateObjectKey("a" * 32)
_NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)
_CONTENT = b"fixture-private-image-bytes"


class Repository:
    def __init__(self, submission: IdentificationSubmission | BaseException) -> None:
        self.submission = submission
        self.calls: list[UUID] = []

    async def read(self, submission_id: UUID) -> IdentificationSubmission:
        self.calls.append(submission_id)
        if isinstance(self.submission, BaseException):
            raise self.submission
        return self.submission


class Store:
    def __init__(self, content: bytes | BaseException) -> None:
        self.content = content
        self.reads: list[tuple[PrivateObjectKey, int]] = []

    def put(self, content: bytes) -> StoredPrivateObject:
        raise AssertionError(content)

    def read(self, key: PrivateObjectKey, *, maximum_bytes: int) -> bytes:
        self.reads.append((key, maximum_bytes))
        if isinstance(self.content, BaseException):
            raise self.content
        return self.content

    def delete(self, key: PrivateObjectKey) -> bool:
        raise AssertionError(key)


def _submission(
    *,
    job_id: UUID | None = _JOB_ID,
    deleted: bool = False,
    sha256: str | None = None,
    byte_size: int | None = None,
) -> IdentificationSubmission:
    return IdentificationSubmission(
        id=_SUBMISSION_ID,
        job_id=job_id,
        storage_object_key=None if deleted else _KEY,
        original_filename=None if deleted else "night.png",
        media_type=UploadMediaType.PNG,
        byte_size=len(_CONTENT) if byte_size is None else byte_size,
        width=64,
        height=64,
        sha256=None if deleted else (sha256 or hashlib.sha256(_CONTENT).hexdigest()),
        retention_until=_NOW + timedelta(hours=24),
        deleted_at=_NOW if deleted else None,
        created_at=_NOW,
    )


def _payload(value: object | None = None) -> PersistedJobPayload:
    return PersistedJobPayload.from_decoded(
        {"submission_id": str(_SUBMISSION_ID)} if value is None else value
    )


@pytest.mark.asyncio
async def test_fake_solver_verifies_private_bytes_and_returns_only_synthetic_result() -> None:
    repository = Repository(_submission())
    store = Store(_CONTENT)
    handler = FakePlateSolverHandler(repository, store)

    handler.validate_payload(_payload())
    result = await handler.handle(_payload())

    assert repository.calls == [_SUBMISSION_ID]
    assert store.reads == [(_KEY, len(_CONTENT))]
    assert result == {
        "outcome": "fixture_solved",
        "solver_type": "fake",
        "solver_version": "phase6a-fixture-v1",
        "synthetic": True,
    }
    assert all(key not in result for key in ("ra", "dec", "wcs", "annotations", "objects"))


@pytest.mark.parametrize(
    "value",
    [
        {},
        {"submission_id": str(_SUBMISSION_ID), "url": "https://private.invalid"},
        {"submission_id": 1},
        {"submission_id": "not-a-uuid"},
        {"submission_id": str(UUID("11111111-1111-1111-8111-111111111111"))},
        {"submission_id": "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"},
        [],
    ],
)
def test_fake_solver_payload_is_exact_and_canonical(value: object) -> None:
    handler = FakePlateSolverHandler(Repository(_submission()), Store(_CONTENT))
    with pytest.raises(IncompatibleHandlerPayload):
        handler.validate_payload(_payload(value))


@pytest.mark.asyncio
async def test_missing_submission_is_non_retryable() -> None:
    handler = FakePlateSolverHandler(Repository(SubmissionNotFound()), Store(_CONTENT))
    with pytest.raises(NonRetryableHandlerFailure):
        await handler.handle(_payload())


@pytest.mark.asyncio
async def test_submission_storage_failure_is_retryable() -> None:
    handler = FakePlateSolverHandler(Repository(SubmissionStorageFailure()), Store(_CONTENT))
    with pytest.raises(RetryableHandlerFailure):
        await handler.handle(_payload())


@pytest.mark.asyncio
async def test_unattached_submission_retries_to_close_enqueue_attach_race() -> None:
    store = Store(_CONTENT)
    handler = FakePlateSolverHandler(Repository(_submission(job_id=None)), store)
    with pytest.raises(RetryableHandlerFailure):
        await handler.handle(_payload())
    assert store.reads == []


@pytest.mark.asyncio
async def test_deleted_submission_is_terminal_and_never_reads_private_storage() -> None:
    store = Store(_CONTENT)
    handler = FakePlateSolverHandler(Repository(_submission(deleted=True)), store)
    with pytest.raises(NonRetryableHandlerFailure):
        await handler.handle(_payload())
    assert store.reads == []


@pytest.mark.asyncio
async def test_private_storage_failure_is_retryable_without_reflecting_path_or_key() -> None:
    handler = FakePlateSolverHandler(Repository(_submission()), Store(PrivateStorageError()))
    with pytest.raises(RetryableHandlerFailure) as failure:
        await handler.handle(_payload())
    assert _KEY.value not in repr(failure.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "submission",
    [
        _submission(byte_size=len(_CONTENT) + 1),
        _submission(sha256="f" * 64),
    ],
)
async def test_size_or_hash_mismatch_is_non_retryable(submission: IdentificationSubmission) -> None:
    handler = FakePlateSolverHandler(Repository(submission), Store(_CONTENT))
    with pytest.raises(NonRetryableHandlerFailure):
        await handler.handle(_payload())


def test_fake_solver_representation_is_redacted() -> None:
    handler = FakePlateSolverHandler(Repository(_submission()), Store(_CONTENT))
    assert repr(handler) == "FakePlateSolverHandler(<redacted>)"
    assert _SUBMISSION_ID.hex not in repr(handler)


@pytest.mark.asyncio
async def test_disabled_handler_rejects_persisted_work_without_inspection() -> None:
    handler = DisabledIdentificationHandler()
    payload = PersistedJobPayload.from_decoded({"private": "sentinel"})

    with pytest.raises(NonRetryableHandlerFailure):
        handler.validate_payload(payload)
    with pytest.raises(NonRetryableHandlerFailure):
        await handler.handle(payload)

    assert repr(handler) == "DisabledIdentificationHandler(<redacted>)"
