"""Application tests for private validated upload storage."""

from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass

import pytest
from lumina.identification.application.uploads import (
    StoreValidatedUploadService,
    UploadStorageIntegrityError,
)
from lumina.identification.domain.storage import PrivateObjectKey, StoredPrivateObject
from lumina.identification.domain.uploads import UploadTooLarge, UploadValidationPolicy


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
class FakeStore:
    corrupt: bool = False
    put_calls: int = 0
    deleted: list[PrivateObjectKey] | None = None

    def __post_init__(self) -> None:
        self.deleted = []

    def put(self, content: bytes) -> StoredPrivateObject:
        self.put_calls += 1
        return StoredPrivateObject(
            key=PrivateObjectKey("d" * 32),
            byte_size=len(content),
            sha256="0" * 64 if self.corrupt else hashlib.sha256(content).hexdigest(),
        )

    def read(self, key: PrivateObjectKey, *, maximum_bytes: int) -> bytes:
        raise AssertionError("read is not used by this service")

    def delete(self, key: PrivateObjectKey) -> bool:
        assert self.deleted is not None
        self.deleted.append(key)
        return True


def _service(store: FakeStore, *, max_bytes: int = 1_000_000) -> StoreValidatedUploadService:
    return StoreValidatedUploadService(
        store,
        UploadValidationPolicy(max_bytes=max_bytes, max_pixels=1_000_000, min_dimension=8),
    )


def test_validation_precedes_storage_and_returns_only_safe_metadata() -> None:
    store = FakeStore()
    content = _png()
    result = _service(store).store(content, declared_media_type="image/png")

    assert store.put_calls == 1
    assert result.media_type.value == "image/png"
    assert (result.width, result.height, result.byte_size) == (8, 8, len(content))
    assert repr(result) == "StoredValidatedUpload(<redacted>)"


def test_rejected_upload_never_reaches_private_store() -> None:
    store = FakeStore()
    content = _png()
    with pytest.raises(UploadTooLarge):
        _service(store, max_bytes=len(content) - 1).store(content, declared_media_type="image/png")
    assert store.put_calls == 0


def test_storage_integrity_mismatch_is_deleted_and_fails_closed() -> None:
    store = FakeStore(corrupt=True)
    with pytest.raises(UploadStorageIntegrityError):
        _service(store).store(_png(), declared_media_type="image/png")
    assert store.deleted == [PrivateObjectKey("d" * 32)]
