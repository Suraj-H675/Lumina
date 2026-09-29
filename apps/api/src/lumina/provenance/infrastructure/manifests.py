"""Shared loading mechanics for reviewed provider source manifests."""

from __future__ import annotations

import pkgutil
from pathlib import Path

from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json


def find_repository_root(start: Path, manifest_path: str) -> Path | None:
    """Return the nearest ancestor containing the reviewed source manifest."""
    for parent in (start, *start.parents):
        if (parent / manifest_path).is_file():
            return parent
    return None


def load_source_manifest(
    repository_root: Path | None,
    *,
    manifest_path: str,
    unavailable_message: str,
) -> SourceManifest:
    """Load one reviewed source manifest from the repository or packaged resources."""
    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / manifest_path).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data("lumina", manifest_path)
        except (ImportError, OSError):
            raise ValueError(unavailable_message) from None
    if manifest_bytes is None:
        raise ValueError(unavailable_message)
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError(unavailable_message) from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError(unavailable_message)
    return manifest
