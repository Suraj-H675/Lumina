"""Private object-storage port for temporary identification uploads."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol

_OBJECT_KEY = re.compile(r"[0-9a-f]{32}", re.ASCII)


class PrivateStorageError(RuntimeError):
    """Fixed storage failure that retains no path, bytes, or object identity."""

    def __init__(self) -> None:
        super().__init__("Private upload storage failed.")

    def __repr__(self) -> str:
        return "PrivateStorageError(<redacted>)"


class PrivateObjectKeyError(ValueError):
    def __init__(self) -> None:
        super().__init__("Private object key is invalid.")


@dataclass(frozen=True, slots=True, repr=False)
class PrivateObjectKey:
    value: str = field(repr=False)

    def __post_init__(self) -> None:
        if type(self.value) is not str or _OBJECT_KEY.fullmatch(self.value) is None:
            raise PrivateObjectKeyError()

    def __repr__(self) -> str:
        return "PrivateObjectKey(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


@dataclass(frozen=True, slots=True, repr=False)
class StoredPrivateObject:
    key: PrivateObjectKey = field(repr=False)
    byte_size: int
    sha256: str = field(repr=False)

    def __repr__(self) -> str:
        return "StoredPrivateObject(<redacted>)"


class PrivateObjectStore(Protocol):
    def put(self, content: bytes) -> StoredPrivateObject: ...

    def read(self, key: PrivateObjectKey, *, maximum_bytes: int) -> bytes: ...

    def delete(self, key: PrivateObjectKey) -> bool: ...
