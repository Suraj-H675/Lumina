"""Read-only validation for the fixed production provenance-manifest root."""

from __future__ import annotations

import sys
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from lumina.provenance.domain.manifests import (
    AssetManifest,
    DataManifest,
    Manifest,
    ManifestContractError,
    SourceManifest,
    parse_manifest_json,
    serialize_manifest,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
PRODUCTION_MANIFEST_ROOT = _REPOSITORY_ROOT / "data" / "manifests"
_ALLOWED_DIRECTORIES = {"assets", "data", "sources"}
_EXPECTED_TYPES = {
    "assets": "asset",
    "data": "data",
    "sources": "source",
}

_DIAGNOSTIC_MESSAGES = {
    "manifest.root_invalid": "The manifest root was missing or invalid.",
    "manifest.path_symlink": "Manifest validation does not permit symbolic links.",
    "manifest.path_escape": "A manifest path escaped the selected root.",
    "manifest.unsupported_directory": "The manifest root contained an unsupported directory.",
    "manifest.unsupported_file": "The manifest root contained an unsupported file.",
    "manifest.directory_unreadable": "A manifest directory could not be read.",
    "manifest.file_unreadable": "A manifest file could not be read.",
    "manifest.directory_type_mismatch": "A manifest discriminator did not match its directory.",
    "manifest.json_noncanonical": "A manifest file was not canonical JSON.",
    "manifest.source_duplicate": "A source manifest identity was duplicated.",
    "manifest.data_duplicate": "A data manifest release identity was duplicated.",
    "manifest.asset_duplicate": "An asset manifest identity was duplicated.",
    "manifest.source_reference_missing": "A data manifest referenced an absent source manifest.",
    "manifest.cli_arguments_invalid": "The manifest validator accepts no arguments.",
}

_EMPTY_SUCCESS_MESSAGE = "Lumina manifest validation passed: no production manifests are approved."


@dataclass(frozen=True, order=True, slots=True)
class ManifestDiagnostic:
    """One deterministic diagnostic containing no raw or absolute-path evidence."""

    path: str
    code: str
    field_path: str
    safe_message: str

    def render(self) -> str:
        return f"{self.path}: {self.code}: {self.safe_message} Field: {self.field_path}."


@dataclass(frozen=True, slots=True)
class ManifestValidationResult:
    """Immutable validation outcome for one explicitly selected manifest root."""

    manifests: tuple[Manifest, ...]
    diagnostics: tuple[ManifestDiagnostic, ...]

    @property
    def is_valid(self) -> bool:
        return not self.diagnostics


@dataclass(frozen=True, slots=True)
class _LoadedManifest:
    path: str
    manifest: Manifest


def _diagnostic(
    path: str,
    code: str,
    *,
    field_path: str = "$",
    safe_message: str | None = None,
) -> ManifestDiagnostic:
    return ManifestDiagnostic(
        path=path,
        code=code,
        field_path=field_path,
        safe_message=safe_message or _DIAGNOSTIC_MESSAGES[code],
    )


def _display_path(root: Path, relative: Path) -> str:
    relative_text = relative.as_posix()
    try:
        is_production_root = root.resolve() == PRODUCTION_MANIFEST_ROOT.resolve()
    except OSError:
        is_production_root = False
    if is_production_root:
        return f"data/manifests/{relative_text}" if relative_text != "." else "data/manifests"
    return relative_text


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
    except (OSError, ValueError):
        return False
    return True


def _scan_manifest_files(
    root: Path,
) -> tuple[list[tuple[str, str, Path]], list[ManifestDiagnostic]]:
    files: list[tuple[str, str, Path]] = []
    diagnostics: list[ManifestDiagnostic] = []
    if root.is_symlink() or not root.is_dir():
        diagnostics.append(_diagnostic(_display_path(root, Path(".")), "manifest.root_invalid"))
        return files, diagnostics

    try:
        root_entries = sorted(root.iterdir(), key=lambda path: path.name)
    except OSError:
        diagnostics.append(
            _diagnostic(_display_path(root, Path(".")), "manifest.directory_unreadable")
        )
        return files, diagnostics

    for entry in root_entries:
        relative = Path(entry.name)
        display = _display_path(root, relative)
        if entry.is_symlink():
            diagnostics.append(_diagnostic(display, "manifest.path_symlink"))
            continue
        if entry.name == "README.md" and entry.is_file():
            continue
        if entry.is_file():
            diagnostics.append(_diagnostic(display, "manifest.unsupported_file"))
            continue
        if not entry.is_dir() or entry.name not in _ALLOWED_DIRECTORIES:
            diagnostics.append(_diagnostic(display, "manifest.unsupported_directory"))
            continue

        try:
            child_entries = sorted(entry.iterdir(), key=lambda path: path.name)
        except OSError:
            diagnostics.append(_diagnostic(display, "manifest.directory_unreadable"))
            continue
        for child in child_entries:
            child_relative = relative / child.name
            child_display = _display_path(root, child_relative)
            if child.is_symlink():
                diagnostics.append(_diagnostic(child_display, "manifest.path_symlink"))
            elif not _path_is_within(child, root):
                diagnostics.append(_diagnostic(child_display, "manifest.path_escape"))
            elif not child.is_file() or child.suffix != ".json":
                code = (
                    "manifest.unsupported_directory"
                    if child.is_dir()
                    else "manifest.unsupported_file"
                )
                diagnostics.append(_diagnostic(child_display, code))
            else:
                files.append((child_display, entry.name, child))
    return files, diagnostics


def _load_manifest(
    display_path: str,
    directory: str,
    path: Path,
) -> tuple[_LoadedManifest | None, list[ManifestDiagnostic]]:
    try:
        content = path.read_bytes()
    except OSError:
        return None, [_diagnostic(display_path, "manifest.file_unreadable")]
    try:
        manifest = parse_manifest_json(content)
    except ManifestContractError as error:
        return None, [
            _diagnostic(
                display_path,
                error.code,
                field_path=error.field_path,
                safe_message=error.safe_message,
            )
        ]

    diagnostics: list[ManifestDiagnostic] = []
    if manifest.manifest_type != _EXPECTED_TYPES[directory]:
        diagnostics.append(
            _diagnostic(
                display_path,
                "manifest.directory_type_mismatch",
                field_path="manifest_type",
            )
        )
    if content != serialize_manifest(manifest):
        diagnostics.append(_diagnostic(display_path, "manifest.json_noncanonical"))
    return _LoadedManifest(display_path, manifest), diagnostics


def _identity_diagnostics(loaded: list[_LoadedManifest]) -> list[ManifestDiagnostic]:
    source_paths: defaultdict[str, list[str]] = defaultdict(list)
    data_paths: defaultdict[tuple[str, str, str], list[str]] = defaultdict(list)
    asset_paths: defaultdict[str, list[str]] = defaultdict(list)
    for item in loaded:
        manifest = item.manifest
        if isinstance(manifest, SourceManifest):
            source_paths[manifest.source_id].append(item.path)
        elif isinstance(manifest, DataManifest):
            data_paths[(manifest.source_id, manifest.dataset_id, manifest.release_version)].append(
                item.path
            )
        elif isinstance(manifest, AssetManifest):
            asset_paths[manifest.id].append(item.path)

    diagnostics: list[ManifestDiagnostic] = []
    for path_group, code, field_path in (
        (source_paths.values(), "manifest.source_duplicate", "source_id"),
        (data_paths.values(), "manifest.data_duplicate", "source_id,dataset_id,release_version"),
        (asset_paths.values(), "manifest.asset_duplicate", "id"),
    ):
        for paths in path_group:
            if len(paths) > 1:
                diagnostics.extend(
                    _diagnostic(path, code, field_path=field_path) for path in sorted(paths)
                )

    known_sources = set(source_paths)
    diagnostics.extend(
        _diagnostic(
            item.path,
            "manifest.source_reference_missing",
            field_path="source_id",
        )
        for item in loaded
        if isinstance(item.manifest, DataManifest) and item.manifest.source_id not in known_sources
    )
    return diagnostics


def validate_manifest_root(root: Path) -> ManifestValidationResult:
    """Validate one explicit root for tests without changing the production CLI root."""
    files, diagnostics = _scan_manifest_files(root)
    loaded: list[_LoadedManifest] = []
    for display_path, directory, path in files:
        item, file_diagnostics = _load_manifest(display_path, directory, path)
        diagnostics.extend(file_diagnostics)
        if item is not None:
            loaded.append(item)
    diagnostics.extend(_identity_diagnostics(loaded))
    return ManifestValidationResult(
        manifests=tuple(item.manifest for item in loaded),
        diagnostics=tuple(sorted(diagnostics)),
    )


def main(arguments: Sequence[str] | None = None) -> int:
    """Validate only the committed production root and emit fixed safe diagnostics."""
    supplied_arguments = tuple(sys.argv[1:] if arguments is None else arguments)
    if supplied_arguments:
        print(
            _diagnostic("data/manifests", "manifest.cli_arguments_invalid").render(),
            file=sys.stderr,
        )
        return 2

    result = validate_manifest_root(PRODUCTION_MANIFEST_ROOT)
    if result.diagnostics:
        for diagnostic in result.diagnostics:
            print(diagnostic.render(), file=sys.stderr)
        return 1
    if not result.manifests:
        print(_EMPTY_SUCCESS_MESSAGE)
    else:
        print(f"Lumina manifest validation passed: {len(result.manifests)} manifest files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
