"""Deterministic Phase 6A fake plate-solver job handler."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Protocol
from uuid import UUID

from lumina.identification.domain.storage import PrivateObjectStore, PrivateStorageError
from lumina.identification.domain.submissions import (
    IdentificationSubmission,
    SubmissionNotFound,
    SubmissionStorageFailure,
)
from lumina.jobs.domain.handler import (
    IncompatibleHandlerPayload,
    NonRetryableHandlerFailure,
    RetryableHandlerFailure,
)
from lumina.jobs.domain.payload import PersistedJobPayload

_FAKE_RESULT = {
    "outcome": "fixture_solved",
    "solver_type": "fake",
    "solver_version": "phase6a-fixture-v1",
    "synthetic": True,
}


class SubmissionReader(Protocol):
    async def read(self, submission_id: UUID) -> IdentificationSubmission: ...


class FakePlateSolverHandler:
    """Verify private bytes, then return a clearly synthetic fixed result."""

    def __init__(self, repository: SubmissionReader, store: PrivateObjectStore) -> None:
        self._repository = repository
        self._store = store

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        _submission_id(payload)

    async def handle(self, payload: PersistedJobPayload) -> object:
        submission_id = _submission_id(payload)
        try:
            submission = await self._repository.read(submission_id)
        except SubmissionNotFound:
            raise NonRetryableHandlerFailure() from None
        except SubmissionStorageFailure:
            raise RetryableHandlerFailure() from None

        if submission.deleted or submission.storage_object_key is None or submission.sha256 is None:
            raise NonRetryableHandlerFailure()
        if submission.job_id is None:
            raise RetryableHandlerFailure()

        try:
            content = self._store.read(
                submission.storage_object_key,
                maximum_bytes=submission.byte_size,
            )
        except PrivateStorageError:
            raise RetryableHandlerFailure() from None

        if len(content) != submission.byte_size:
            raise NonRetryableHandlerFailure()
        if hashlib.sha256(content).hexdigest() != submission.sha256:
            raise NonRetryableHandlerFailure()
        return dict(_FAKE_RESULT)

    def __repr__(self) -> str:
        return "FakePlateSolverHandler(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def _submission_id(payload: PersistedJobPayload) -> UUID:
    value = payload.value
    if not isinstance(value, Mapping) or set(value) != {"submission_id"}:
        raise IncompatibleHandlerPayload()
    raw = value.get("submission_id")
    if type(raw) is not str:
        raise IncompatibleHandlerPayload()
    try:
        identifier = UUID(raw)
    except ValueError:
        raise IncompatibleHandlerPayload() from None
    if identifier.version != 4 or str(identifier) != raw:
        raise IncompatibleHandlerPayload()
    return identifier


__all__ = ["FakePlateSolverHandler", "SubmissionReader"]
