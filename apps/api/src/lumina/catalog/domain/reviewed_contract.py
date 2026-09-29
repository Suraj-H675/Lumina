"""Shared fail-closed parsing primitives for reviewed catalogue contracts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from typing import NoReturn
from uuid import UUID

from lumina.provenance.domain.manifests import (
    DataManifest,
    ManifestContractError,
    SourceManifest,
    parse_manifest_json,
    serialize_manifest,
)


class ReviewedSliceError(RuntimeError):
    """Base class for fixed, non-evidentiary reviewed-slice failures."""

    code: str
    safe_message: str

    def __init__(self) -> None:
        super().__init__(self.safe_message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(code={self.code!r})"


class ReviewedSliceValidationRejected(ReviewedSliceError, ValueError):
    """The immutable reviewed-slice boundary was malformed or did not match approval."""

    code = "catalog.reviewed_slice_validation_rejected"
    safe_message = "The reviewed catalogue slice was rejected."


class ReviewedSlicePolicyRejected(ReviewedSliceError):
    """The selected source content does not meet the closed review policy."""

    code = "catalog.reviewed_slice_policy_rejected"
    safe_message = "The reviewed catalogue slice does not satisfy its data policy."


class _DuplicateJsonKey(ValueError):
    pass


def _reject() -> NoReturn:
    raise ReviewedSliceValidationRejected()


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise _DuplicateJsonKey()
        result[key] = value
    return result


def _reject_json_constant(value: str) -> NoReturn:
    del value
    _reject()


def canonical_json_bytes(value: object) -> bytes:
    try:
        return (
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n"
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        _reject()


def checked_relative_path(value: object) -> str:
    if type(value) is not str or not value or value != value.strip() or not value.isascii():
        _reject()
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        _reject()
    return value


def read_regular_repository_file(root: Path, relative_path: str, *, maximum_bytes: int) -> bytes:
    relative_path = checked_relative_path(relative_path)
    root = root.resolve()
    path = root.joinpath(*PurePosixPath(relative_path).parts)
    try:
        if path.is_symlink() or not path.is_file():
            _reject()
        path.resolve(strict=True).relative_to(root)
        if path.stat().st_size > maximum_bytes:
            _reject()
        with path.open("rb") as handle:
            content = handle.read(maximum_bytes + 1)
    except (OSError, ValueError):
        _reject()
    if len(content) > maximum_bytes:
        _reject()
    return content


def parse_canonical_object(content: bytes) -> dict[str, object]:
    try:
        decoded = json.loads(
            content.decode("utf-8"),
            object_pairs_hook=_object_without_duplicate_keys,
            parse_constant=_reject_json_constant,
        )
    except (UnicodeDecodeError, ValueError, json.JSONDecodeError):
        _reject()
    if type(decoded) is not dict or canonical_json_bytes(decoded) != content:
        _reject()
    return decoded


def require_object(value: object, fields: frozenset[str]) -> dict[str, object]:
    if type(value) is not dict or set(value) != fields:
        _reject()
    return value


def require_string(value: object) -> str:
    if type(value) is not str or not value:
        _reject()
    return value


def require_int(value: object) -> int:
    if type(value) is not int:
        _reject()
    return value


def require_uuid(value: object) -> UUID:
    try:
        parsed = UUID(require_string(value))
    except ValueError:
        _reject()
    if str(parsed) != value:
        _reject()
    return parsed


def require_list(value: object, length: int) -> list[object]:
    if type(value) is not list or len(value) != length:
        _reject()
    return value


def load_manifest(
    root: Path,
    path: str,
    expected: type[SourceManifest] | type[DataManifest],
    approved_sha256: str,
) -> object:
    content = read_regular_repository_file(root, path, maximum_bytes=32_768)
    try:
        manifest = parse_manifest_json(content)
    except ManifestContractError:
        _reject()
    if (
        type(manifest) is not expected
        or serialize_manifest(manifest) != content
        or hashlib.sha256(content).hexdigest() != approved_sha256
    ):
        _reject()
    return manifest
