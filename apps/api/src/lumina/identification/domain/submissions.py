"""Private temporary identification-submission metadata contracts."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from lumina.identification.domain.storage import PrivateObjectKey
from lumina.identification.domain.uploads import UploadMediaType

_SHA256 = re.compile(r"[0-9a-f]{64}", re.ASCII)


class SubmissionValidationError(ValueError):
    def __init__(self) -> None:
        super().__init__("Identification submission metadata is invalid.")

    def __repr__(self) -> str:
        return "SubmissionValidationError(<redacted>)"


def sanitize_original_filename(value: object) -> str:
    """Return a bounded display-only filename; never use it as a storage path."""
    if not isinstance(value, str):
        raise SubmissionValidationError()
    leaf = value.replace("\\", "/").rsplit("/", 1)[-1]
    leaf = unicodedata.normalize("NFC", leaf).strip()
    if (
        not leaf
        or leaf in {".", ".."}
        or any(unicodedata.category(ch).startswith("C") for ch in leaf)
    ):
        raise SubmissionValidationError()
    encoded = leaf.encode("utf-8")
    if len(encoded) > 255:
        raise SubmissionValidationError()
    return leaf


def _utc(value: datetime) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise SubmissionValidationError()
    normalized = value.astimezone(UTC)
    if normalized.utcoffset() != UTC.utcoffset(normalized):
        raise SubmissionValidationError()
    return normalized


@dataclass(frozen=True, slots=True, repr=False)
class CreateIdentificationSubmission:
    id: UUID
    storage_object_key: PrivateObjectKey = field(repr=False)
    original_filename: str = field(repr=False)
    media_type: UploadMediaType
    byte_size: int
    width: int
    height: int
    sha256: str = field(repr=False)
    retention_until: datetime

    def __post_init__(self) -> None:
        if (
            not isinstance(self.id, UUID)
            or self.id.version != 4
            or type(self.storage_object_key) is not PrivateObjectKey
            or sanitize_original_filename(self.original_filename) != self.original_filename
            or type(self.media_type) is not UploadMediaType
            or type(self.byte_size) is not int
            or not 1 <= self.byte_size <= 100 * 1024 * 1024
            or type(self.width) is not int
            or type(self.height) is not int
            or self.width < 1
            or self.height < 1
            or self.width * self.height > 100_000_000
            or type(self.sha256) is not str
            or _SHA256.fullmatch(self.sha256) is None
        ):
            raise SubmissionValidationError()
        object.__setattr__(self, "retention_until", _utc(self.retention_until))

    def __repr__(self) -> str:
        return "CreateIdentificationSubmission(<redacted>)"


@dataclass(frozen=True, slots=True, repr=False)
class IdentificationSubmission:
    id: UUID
    job_id: UUID | None
    storage_object_key: PrivateObjectKey | None = field(repr=False)
    original_filename: str | None = field(repr=False)
    media_type: UploadMediaType
    byte_size: int
    width: int
    height: int
    sha256: str | None = field(repr=False)
    retention_until: datetime
    deleted_at: datetime | None
    created_at: datetime

    @property
    def deleted(self) -> bool:
        return self.deleted_at is not None

    def __repr__(self) -> str:
        return "IdentificationSubmission(<redacted>)"


class IdentificationSubmissionState(StrEnum):
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"
    DELETED = "deleted"


@dataclass(frozen=True, slots=True)
class FakeSolverResult:
    outcome: str = "fixture_solved"
    solver_type: str = "fake"
    solver_version: str = "phase6a-fixture-v1"
    synthetic: bool = True

    def __post_init__(self) -> None:
        if (
            self.outcome != "fixture_solved"
            or self.solver_type != "fake"
            or self.solver_version != "phase6a-fixture-v1"
            or self.synthetic is not True
        ):
            raise SubmissionValidationError()


@dataclass(frozen=True, slots=True, repr=False)
class IdentificationSubmissionStatus:
    submission_id: UUID
    job_id: UUID | None
    state: IdentificationSubmissionState
    progress: float
    result: FakeSolverResult | None
    error_code: str | None
    created_at: datetime
    completed_at: datetime | None
    deleted_at: datetime | None

    def __repr__(self) -> str:
        return "IdentificationSubmissionStatus(<redacted>)"


class SubmissionStorageFailure(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Identification submission storage failed.")

    def __repr__(self) -> str:
        return "SubmissionStorageFailure(<redacted>)"


class SubmissionNotFound(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Identification submission was not found.")


class SubmissionStateConflict(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Identification submission state changed.")
