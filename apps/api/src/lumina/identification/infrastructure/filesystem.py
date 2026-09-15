"""Filesystem-backed private object store for development identification uploads."""

from __future__ import annotations

import hashlib
import os
import stat
from collections.abc import Callable
from contextlib import suppress
from pathlib import Path
from uuid import uuid4

from lumina.identification.domain.storage import (
    PrivateObjectKey,
    PrivateObjectStore,
    PrivateStorageError,
    StoredPrivateObject,
)


class FilesystemPrivateObjectStore(PrivateObjectStore):
    def __init__(
        self,
        root: Path,
        *,
        key_factory: Callable[[], PrivateObjectKey] | None = None,
    ) -> None:
        self._root = _prepare_private_root(root)
        self._key_factory = key_factory or (lambda: PrivateObjectKey(uuid4().hex))

    def put(self, content: bytes) -> StoredPrivateObject:
        if type(content) is not bytes:
            raise PrivateStorageError()
        key = self._key_factory()
        path = self._path_for(key)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor: int | None = None
        created = False
        try:
            descriptor = os.open(path, flags, 0o600)
            created = True
            view = memoryview(content)
            while view:
                written = os.write(descriptor, view)
                if written <= 0:
                    raise OSError()
                view = view[written:]
            os.fsync(descriptor)
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != len(content):
                raise OSError()
        except (OSError, ValueError):
            if descriptor is not None:
                with suppress(OSError):
                    os.close(descriptor)
                descriptor = None
            if created:
                with suppress(OSError):
                    path.unlink()
            raise PrivateStorageError() from None
        finally:
            if descriptor is not None:
                try:
                    os.close(descriptor)
                except OSError:
                    if created:
                        with suppress(OSError):
                            path.unlink()
                    raise PrivateStorageError() from None
        return StoredPrivateObject(
            key=key,
            byte_size=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )

    def read(self, key: PrivateObjectKey, *, maximum_bytes: int) -> bytes:
        if type(maximum_bytes) is not int or maximum_bytes < 1:
            raise PrivateStorageError()
        path = self._path_for(key)
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        try:
            descriptor = os.open(path, flags)
            try:
                before = os.fstat(descriptor)
                if not stat.S_ISREG(before.st_mode) or before.st_size > maximum_bytes:
                    raise OSError()
                with os.fdopen(descriptor, "rb", closefd=False) as handle:
                    content = handle.read(maximum_bytes + 1)
                after = os.fstat(descriptor)
                if (
                    len(content) > maximum_bytes
                    or before.st_dev != after.st_dev
                    or before.st_ino != after.st_ino
                    or before.st_size != after.st_size
                    or len(content) != after.st_size
                ):
                    raise OSError()
                return content
            finally:
                os.close(descriptor)
        except (FileNotFoundError, OSError, ValueError):
            raise PrivateStorageError() from None

    def delete(self, key: PrivateObjectKey) -> bool:
        path = self._path_for(key)
        try:
            metadata = path.lstat()
        except FileNotFoundError:
            return False
        except OSError:
            raise PrivateStorageError() from None
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
            raise PrivateStorageError()
        try:
            path.unlink()
        except OSError:
            raise PrivateStorageError() from None
        return True

    def _path_for(self, key: PrivateObjectKey) -> Path:
        if type(key) is not PrivateObjectKey:
            raise PrivateStorageError()
        return self._root / key.value


def _prepare_private_root(root: Path) -> Path:
    if not isinstance(root, Path) or not root.is_absolute():
        raise PrivateStorageError()
    try:
        if root.is_symlink():
            raise PrivateStorageError()
        root.mkdir(parents=True, mode=0o700, exist_ok=True)
        if root.is_symlink() or not root.is_dir():
            raise PrivateStorageError()
        resolved = root.resolve(strict=True)
        mode = resolved.stat().st_mode
        if mode & 0o077:
            raise PrivateStorageError()
        return resolved
    except PrivateStorageError:
        raise
    except (OSError, ValueError):
        raise PrivateStorageError() from None
