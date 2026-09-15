"""Application boundary for validating and privately storing one upload."""

from __future__ import annotations

from dataclasses import dataclass, field

from lumina.identification.domain.storage import PrivateObjectKey, PrivateObjectStore
from lumina.identification.domain.uploads import (
    UploadMediaType,
    UploadValidationPolicy,
    validate_raster_upload,
)


class UploadStorageIntegrityError(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Private upload storage verification failed.")


@dataclass(frozen=True, slots=True, repr=False)
class StoredValidatedUpload:
    object_key: PrivateObjectKey = field(repr=False)
    media_type: UploadMediaType
    byte_size: int
    width: int
    height: int
    sha256: str = field(repr=False)

    def __repr__(self) -> str:
        return "StoredValidatedUpload(<redacted>)"


class StoreValidatedUploadService:
    def __init__(self, store: PrivateObjectStore, policy: UploadValidationPolicy) -> None:
        self._store = store
        self._policy = policy

    def store(self, content: bytes, *, declared_media_type: str | None) -> StoredValidatedUpload:
        validated = validate_raster_upload(
            content,
            declared_media_type=declared_media_type,
            policy=self._policy,
        )
        stored = self._store.put(validated.content)
        if stored.byte_size != validated.byte_size or stored.sha256 != validated.sha256:
            try:
                self._store.delete(stored.key)
            finally:
                raise UploadStorageIntegrityError() from None
        return StoredValidatedUpload(
            object_key=stored.key,
            media_type=validated.media_type,
            byte_size=validated.byte_size,
            width=validated.width,
            height=validated.height,
            sha256=validated.sha256,
        )
