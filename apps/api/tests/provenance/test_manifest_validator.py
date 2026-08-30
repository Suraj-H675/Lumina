"""Read-only manifest-root validator and standalone command tests."""

from __future__ import annotations

import importlib
import json
import shutil
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from lumina.provenance.domain.manifests import parse_manifest_json, serialize_manifest

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "manifests"
_VALIDATOR_PARENT = _REPOSITORY_ROOT / "scripts" / "data"
sys.path.insert(0, str(_VALIDATOR_PARENT))
try:
    _validator = importlib.import_module("validate_manifests")
finally:
    sys.path.remove(str(_VALIDATOR_PARENT))

PRODUCTION_MANIFEST_ROOT = _validator.PRODUCTION_MANIFEST_ROOT
main = _validator.main
validate_manifest_root = _validator.validate_manifest_root


def _layout(root: Path) -> None:
    for name in ("assets", "data", "sources"):
        (root / name).mkdir(parents=True, exist_ok=True)


def _copy_complete_set(root: Path) -> None:
    _layout(root)
    shutil.copyfile(_FIXTURES / "sources/fictional-source.json", root / "sources/source.json")
    shutil.copyfile(_FIXTURES / "data/fictional-data.json", root / "data/data.json")
    shutil.copyfile(_FIXTURES / "assets/fictional-asset.json", root / "assets/asset.json")


def _document(kind: str) -> dict[str, object]:
    names = {
        "asset": "assets/fictional-asset.json",
        "data": "data/fictional-data.json",
        "source": "sources/fictional-source.json",
    }
    decoded = json.loads((_FIXTURES / names[kind]).read_bytes())
    assert isinstance(decoded, dict)
    return decoded


def _write_canonical(path: Path, document: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest = parse_manifest_json(json.dumps(document, ensure_ascii=False))
    path.write_bytes(serialize_manifest(manifest))


def test_empty_temporary_root_and_approved_production_manifests_are_valid(
    capsys: pytest.CaptureFixture[str], tmp_path: Path
) -> None:
    result = validate_manifest_root(tmp_path)
    assert result.is_valid
    assert result.manifests == ()
    assert result.diagnostics == ()

    assert (PRODUCTION_MANIFEST_ROOT / ".gitkeep").is_file()
    production = validate_manifest_root(PRODUCTION_MANIFEST_ROOT)
    assert production.is_valid
    assert len(production.manifests) == 6
    assert {manifest.manifest_type for manifest in production.manifests} == {"source", "data"}
    assert main([]) == 0
    output = capsys.readouterr()
    assert output.err == ""
    assert output.out == "Lumina manifest validation passed: 6 manifest files.\n"


def test_messier_manifests_are_canonical_and_review_evidence_is_pinned() -> None:
    data_path = PRODUCTION_MANIFEST_ROOT / "data/simbad-messier-j2000-v1.json"
    source_path = PRODUCTION_MANIFEST_ROOT / "sources/cds-simbad.json"
    review_path = _REPOSITORY_ROOT / "data/reviews/simbad-messier-j2000-v1.json"

    data_content = data_path.read_bytes()
    source_content = source_path.read_bytes()
    review = json.loads(review_path.read_bytes())

    assert data_content == serialize_manifest(parse_manifest_json(data_content))
    assert source_content == serialize_manifest(parse_manifest_json(source_content))
    assert review_path.parent != PRODUCTION_MANIFEST_ROOT
    assert review["dataset_id"] == "messier-j2000"
    assert review["data_manifest_sha256"] == (
        "ae95d19fcacc8a35b636f879270be6fd00e4282180ce0de79634fc0eaa721370"
    )
    assert review["source_manifest_sha256"] == (
        "eb45de6ef052d19b415741c8ea34e403c4469a6cfa43d4c5806674e74d5aaccb"
    )
    assert json.loads(data_content)["checksum"] == (
        "sha256:b29a5c8b3bf58eb3c7649f18f1f64446c6b3b12dbbb3d59c4e639befe2fbf0e9"
    )


def test_exact_committed_fictional_manifest_set_is_valid(tmp_path: Path) -> None:
    _copy_complete_set(tmp_path)
    first = validate_manifest_root(tmp_path)
    second = validate_manifest_root(tmp_path)
    assert first == second
    assert first.is_valid
    assert len(first.manifests) == 3


def test_one_source_can_own_multiple_exact_releases(tmp_path: Path) -> None:
    _layout(tmp_path)
    shutil.copyfile(_FIXTURES / "sources/fictional-source.json", tmp_path / "sources/source.json")
    first = _document("data")
    second = _document("data")
    second["release_version"] = "fixture-release-v2"
    _write_canonical(tmp_path / "data/release-v1.json", first)
    _write_canonical(tmp_path / "data/release-v2.json", second)
    assert validate_manifest_root(tmp_path).is_valid


def test_one_provider_can_own_multiple_reviewed_adapter_manifests(tmp_path: Path) -> None:
    _layout(tmp_path)
    first_path = tmp_path / "sources/photometry.json"
    second_path = tmp_path / "sources/astrometry.json"
    first = json.loads((_FIXTURES / "sources/fictional-source.json").read_text(encoding="utf-8"))
    second = dict(first)
    second["adapter_id"] = "fictional-source-astrometry"
    second["purpose"] = "A second independently reviewed adapter contract."
    _write_canonical(first_path, first)
    _write_canonical(second_path, second)
    assert validate_manifest_root(tmp_path).is_valid


def test_missing_source_reference_is_rejected_without_raw_identity(tmp_path: Path) -> None:
    _layout(tmp_path)
    data = _document("data")
    data["source_id"] = "private-missing-source"
    _write_canonical(tmp_path / "data/data.json", data)
    result = validate_manifest_root(tmp_path)
    assert [diagnostic.code for diagnostic in result.diagnostics] == [
        "manifest.source_reference_missing"
    ]
    rendered = result.diagnostics[0].render()
    assert "private-missing-source" not in rendered
    assert str(tmp_path) not in rendered


@pytest.mark.parametrize(
    ("kind", "directory", "code"),
    [
        ("source", "sources", "manifest.source_duplicate"),
        ("data", "data", "manifest.data_duplicate"),
        ("asset", "assets", "manifest.asset_duplicate"),
    ],
)
def test_duplicate_logical_identities_are_rejected(
    kind: str,
    directory: str,
    code: str,
    tmp_path: Path,
) -> None:
    _layout(tmp_path)
    if kind == "data":
        shutil.copyfile(
            _FIXTURES / "sources/fictional-source.json", tmp_path / "sources/source.json"
        )
    source = (
        _FIXTURES
        / {
            "source": "sources/fictional-source.json",
            "data": "data/fictional-data.json",
            "asset": "assets/fictional-asset.json",
        }[kind]
    )
    shutil.copyfile(source, tmp_path / directory / "a.json")
    shutil.copyfile(source, tmp_path / directory / "b.json")
    result = validate_manifest_root(tmp_path)
    assert [diagnostic.code for diagnostic in result.diagnostics].count(code) == 2


@pytest.mark.parametrize(
    ("content", "code"),
    [
        (b"{not-json\n", "manifest.json_invalid"),
        (b'{"manifest_type":"source","manifest_type":"source"}\n', "manifest.json_duplicate_key"),
    ],
)
def test_malformed_and_duplicate_key_json_are_rejected(
    content: bytes,
    code: str,
    tmp_path: Path,
) -> None:
    _layout(tmp_path)
    (tmp_path / "sources/bad.json").write_bytes(content)
    result = validate_manifest_root(tmp_path)
    assert [diagnostic.code for diagnostic in result.diagnostics] == [code]


@pytest.mark.parametrize(
    ("change", "code"),
    [
        ({"unknown_private_field": "private-value"}, "manifest.schema_invalid"),
        ({"manifest_schema_version": 9}, "manifest.schema_invalid"),
        ({"local_file": "../private-value"}, "manifest.schema_invalid"),
    ],
)
def test_schema_version_unknown_field_and_unsafe_path_are_rejected_safely(
    change: dict[str, object],
    code: str,
    tmp_path: Path,
) -> None:
    _layout(tmp_path)
    document = _document("data")
    document.update(change)
    content = f"{json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True)}\n".encode()
    (tmp_path / "data/bad.json").write_bytes(content)
    result = validate_manifest_root(tmp_path)
    assert any(diagnostic.code == code for diagnostic in result.diagnostics)
    rendered = "\n".join(diagnostic.render() for diagnostic in result.diagnostics)
    assert "private-value" not in rendered
    assert str(tmp_path) not in rendered


def test_wrong_directory_and_noncanonical_json_are_rejected(tmp_path: Path) -> None:
    _layout(tmp_path)
    source_content = (_FIXTURES / "sources/fictional-source.json").read_bytes()
    (tmp_path / "data/wrong.json").write_bytes(source_content)
    (tmp_path / "sources/noncanonical.json").write_text(
        json.dumps(_document("source"), ensure_ascii=False),
        encoding="utf-8",
    )
    result = validate_manifest_root(tmp_path)
    assert {diagnostic.code for diagnostic in result.diagnostics} == {
        "manifest.directory_type_mismatch",
        "manifest.json_noncanonical",
        "manifest.source_duplicate",
    }


def test_unsupported_files_nested_paths_and_symlinks_are_rejected(tmp_path: Path) -> None:
    _layout(tmp_path)
    (tmp_path / "extra.txt").write_text("unsupported", encoding="utf-8")
    (tmp_path / "other").mkdir()
    (tmp_path / "sources/nested").mkdir()
    (tmp_path / "sources/nested/value.json").write_text("{}", encoding="utf-8")
    (tmp_path / "sources/link.json").symlink_to(_FIXTURES / "sources/fictional-source.json")
    result = validate_manifest_root(tmp_path)
    codes = {diagnostic.code for diagnostic in result.diagnostics}
    assert "manifest.unsupported_file" in codes
    assert "manifest.unsupported_directory" in codes
    assert "manifest.path_symlink" in codes


@pytest.mark.parametrize("failed_location", ["root", "sources"])
def test_directory_enumeration_failures_are_fixed_and_path_safe(
    failed_location: str,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _layout(tmp_path)
    original_iterdir = Path.iterdir
    target = tmp_path if failed_location == "root" else tmp_path / "sources"

    def fail_selected_directory(path: Path) -> Iterator[Path]:
        if path == target:
            raise PermissionError("private-enumeration-value")
        return original_iterdir(path)

    monkeypatch.setattr(Path, "iterdir", fail_selected_directory)
    result = validate_manifest_root(tmp_path)
    matching = [
        diagnostic
        for diagnostic in result.diagnostics
        if diagnostic.code == "manifest.directory_unreadable"
    ]
    assert len(matching) == 1
    rendered = matching[0].render()
    assert "private-enumeration-value" not in rendered
    assert str(tmp_path) not in rendered


def test_diagnostics_are_sorted_and_creation_order_independent(tmp_path: Path) -> None:
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"
    _layout(first_root)
    _layout(second_root)
    files = (
        ("sources/z.json", b"{bad"),
        ("assets/a.txt", b"unsupported"),
        ("data/m.json", b"[]"),
    )
    for relative, content in files:
        (first_root / relative).write_bytes(content)
    for relative, content in reversed(files):
        (second_root / relative).write_bytes(content)
    first = validate_manifest_root(first_root)
    second = validate_manifest_root(second_root)
    first_evidence = [(item.path, item.code, item.field_path) for item in first.diagnostics]
    second_evidence = [(item.path, item.code, item.field_path) for item in second.diagnostics]
    assert first_evidence == second_evidence == sorted(first_evidence)


def test_package_command_is_standalone_and_cli_cannot_select_a_fixture_root(
    capsys: pytest.CaptureFixture[str],
) -> None:
    package = json.loads((_REPOSITORY_ROOT / "package.json").read_bytes())
    scripts = package["scripts"]
    assert scripts["manifests:check"] == "uv run python scripts/data/validate_manifests.py"
    assert "pnpm run manifests:check" in scripts["check"]

    assert main(["--root", "private-fixture-root"]) == 2
    output = capsys.readouterr()
    assert output.out == ""
    assert "private-fixture-root" not in output.err
    assert "manifest.cli_arguments_invalid" in output.err
