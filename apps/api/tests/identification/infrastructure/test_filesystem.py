"""Security tests for the development private filesystem store."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from lumina.identification.domain.storage import (
    PrivateObjectKey,
    PrivateObjectKeyError,
    PrivateStorageError,
)
from lumina.identification.infrastructure.filesystem import FilesystemPrivateObjectStore


def test_round_trip_uses_random_private_file_and_deletes_it(tmp_path: Path) -> None:
    root = tmp_path / "private"
    store = FilesystemPrivateObjectStore(root)
    content = b"private-image-bytes"

    stored = store.put(content)
    object_path = root / stored.key.value

    assert len(stored.key.value) == 32
    assert all(character in "0123456789abcdef" for character in stored.key.value)
    assert stored.byte_size == len(content)
    assert store.read(stored.key, maximum_bytes=1_000) == content
    assert root.stat().st_mode & 0o077 == 0
    assert object_path.stat().st_mode & 0o077 == 0
    assert store.delete(stored.key) is True
    assert store.delete(stored.key) is False
    assert not object_path.exists()
    assert repr(stored) == "StoredPrivateObject(<redacted>)"
    assert repr(stored.key) == str(stored.key) == "PrivateObjectKey(<redacted>)"


def test_object_key_grammar_cannot_encode_paths() -> None:
    for value in ("../secret", "/absolute", "a/b", "A" * 32, "a" * 31, "a" * 33):
        with pytest.raises(PrivateObjectKeyError):
            PrivateObjectKey(value)


def test_relative_or_world_readable_root_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(PrivateStorageError):
        FilesystemPrivateObjectStore(Path("relative/private"))

    open_root = tmp_path / "open"
    open_root.mkdir(mode=0o700)
    open_root.chmod(0o755)
    with pytest.raises(PrivateStorageError):
        FilesystemPrivateObjectStore(open_root)


def test_symlink_root_and_symlink_object_are_never_followed(tmp_path: Path) -> None:
    real = tmp_path / "real"
    real.mkdir(mode=0o700)
    linked = tmp_path / "linked"
    linked.symlink_to(real, target_is_directory=True)
    with pytest.raises(PrivateStorageError):
        FilesystemPrivateObjectStore(linked)

    store = FilesystemPrivateObjectStore(real)
    outside = tmp_path / "outside"
    outside.write_bytes(b"outside-secret")
    key = PrivateObjectKey("a" * 32)
    (real / key.value).symlink_to(outside)
    with pytest.raises(PrivateStorageError):
        store.read(key, maximum_bytes=1_000)
    with pytest.raises(PrivateStorageError):
        store.delete(key)
    assert outside.read_bytes() == b"outside-secret"


def test_collision_never_overwrites_or_deletes_existing_object(tmp_path: Path) -> None:
    root = tmp_path / "private"
    fixed = PrivateObjectKey("b" * 32)
    store = FilesystemPrivateObjectStore(root, key_factory=lambda: fixed)
    existing = root / fixed.value
    existing.write_bytes(b"existing")
    existing.chmod(0o600)

    with pytest.raises(PrivateStorageError):
        store.put(b"replacement")

    assert existing.read_bytes() == b"existing"


def test_failed_write_removes_only_the_new_partial_object(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = tmp_path / "private"
    fixed = PrivateObjectKey("c" * 32)
    store = FilesystemPrivateObjectStore(root, key_factory=lambda: fixed)

    def fail_fsync(_: int) -> None:
        raise OSError()

    monkeypatch.setattr(os, "fsync", fail_fsync)
    with pytest.raises(PrivateStorageError):
        store.put(b"partial")

    assert not (root / fixed.value).exists()


def test_read_limit_is_independent_from_file_size_metadata(tmp_path: Path) -> None:
    store = FilesystemPrivateObjectStore(tmp_path / "private")
    stored = store.put(b"123456")
    with pytest.raises(PrivateStorageError):
        store.read(stored.key, maximum_bytes=5)
