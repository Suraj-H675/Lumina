"""Strict manifest contract and canonical serialization tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from lumina.provenance.domain.manifests import (
    AssetManifest,
    DataManifest,
    ManifestContractError,
    SourceManifest,
    parse_manifest_json,
    serialize_manifest,
)
from pydantic import ValidationError

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "manifests"


def _fixture(kind: str) -> bytes:
    names = {
        "asset": "assets/fictional-asset.json",
        "data": "data/fictional-data.json",
        "source": "sources/fictional-source.json",
    }
    return (_FIXTURES / names[kind]).read_bytes()


def _document(kind: str) -> dict[str, object]:
    decoded = json.loads(_fixture(kind))
    assert isinstance(decoded, dict)
    return decoded


def _parse_document(document: dict[str, object]) -> SourceManifest | DataManifest | AssetManifest:
    return parse_manifest_json(json.dumps(document, ensure_ascii=False))


def test_each_manifest_constructs_independently_and_union_discriminates() -> None:
    source = parse_manifest_json(_fixture("source"))
    data = parse_manifest_json(_fixture("data"))
    asset = parse_manifest_json(_fixture("asset"))

    assert type(source) is SourceManifest
    assert type(data) is DataManifest
    assert type(asset) is AssetManifest
    assert SourceManifest.model_validate(source.model_dump()) == source
    assert DataManifest.model_validate(data.model_dump()) == data
    assert AssetManifest.model_validate(asset.model_dump()) == asset
    with pytest.raises(ValidationError):
        source.source_id = "changed"


@pytest.mark.parametrize(
    ("change", "expected_field"),
    [
        ({"manifest_type": "provider"}, "manifest_type"),
        ({"manifest_schema_version": 2}, "manifest_schema_version"),
        ({"manifest_schema_version": "1"}, "manifest_schema_version"),
        ({"source_id": 1}, "source_id"),
        ({"source_id": "bad/token"}, "source_id"),
        ({"source_name": " padded"}, "source_name"),
        ({"purpose": "bad\ntext"}, "purpose"),
        ({"official_documentation_url": "relative/path"}, "official_documentation_url"),
        (
            {"terms_or_licence_url": "https://user:secret@fixtures.invalid/terms"},
            "terms_or_licence_url",
        ),
        ({"last_verified_at": "2026-01-15T01:00:00+01:00"}, "last_verified_at"),
        ({"capabilities": ["lookup", "lookup"]}, "capabilities"),
        ({"normalized_fields": ["fixture_id", "fixture_id"]}, "normalized_fields"),
        ({"unexpected": "do-not-expose-this-value"}, "unexpected"),
    ],
)
def test_source_manifest_rejects_invalid_strict_inputs(
    change: dict[str, object],
    expected_field: str,
) -> None:
    document = _document("source")
    document.update(change)
    with pytest.raises(ManifestContractError) as captured:
        _parse_document(document)
    assert captured.value.code == "manifest.schema_invalid"
    assert expected_field in captured.value.field_path
    assert "do-not-expose-this-value" not in str(captured.value)


def test_missing_discriminator_and_unknown_fields_fail_each_contract() -> None:
    source = _document("source")
    del source["manifest_type"]
    with pytest.raises(ManifestContractError):
        _parse_document(source)

    for kind in ("data", "asset"):
        document = _document(kind)
        document["unexpected"] = "private-raw-value"
        with pytest.raises(ManifestContractError) as captured:
            _parse_document(document)
        assert captured.value.code == "manifest.schema_invalid"
        assert "private-raw-value" not in str(captured.value)


def test_unknown_control_character_key_cannot_forge_a_diagnostic_line() -> None:
    document = _document("source")
    document["forged\nmanifest.json_invalid"] = "private-value"
    with pytest.raises(ManifestContractError) as captured:
        _parse_document(document)
    assert captured.value.field_path == "$"
    assert "forged" not in str(captured.value)
    assert "\n" not in str(captured.value)


@pytest.mark.parametrize("unsafe", ["/absolute/file", "../escape", "a/../b", "C:/file", "a\\b"])
def test_repository_paths_reject_unsafe_forms(unsafe: str) -> None:
    data = _document("data")
    data["local_file"] = unsafe
    with pytest.raises(ManifestContractError) as captured:
        _parse_document(data)
    assert captured.value.field_path.endswith("local_file")

    asset = _document("asset")
    asset["local_path_or_url"] = unsafe
    with pytest.raises(ManifestContractError):
        _parse_document(asset)


def test_identifiers_are_case_sensitive_and_never_normalized() -> None:
    document = _document("source")
    document["source_id"] = "Lumina-Fixture-Source"
    manifest = _parse_document(document)
    assert isinstance(manifest, SourceManifest)
    assert manifest.source_id == "Lumina-Fixture-Source"


def test_direct_construction_rejects_non_utf8_surrogate_text() -> None:
    source = parse_manifest_json(_fixture("source"))
    values = source.model_dump()
    values["source_name"] = "Fictional \ud800 source"
    with pytest.raises(ValidationError):
        SourceManifest.model_validate(values)


def test_nullable_fields_and_empty_collections_remain_explicit() -> None:
    source = parse_manifest_json(_fixture("source"))
    data = parse_manifest_json(_fixture("data"))
    asset = parse_manifest_json(_fixture("asset"))

    source_json = json.loads(serialize_manifest(source))
    data_json = json.loads(serialize_manifest(data))
    asset_json = json.loads(serialize_manifest(asset))
    assert source_json["endpoint_or_base_url"] is None
    assert source_json["contact_or_user_agent_requirement"] is None
    assert source_json["known_limitations"] == []
    assert data_json["local_file"] is None
    assert data_json["checksum"] is None
    assert asset_json["licence_url"] is None
    assert asset_json["downloaded_at"] is None
    assert asset_json["checksum"] is None
    assert asset_json["modifications"] == []
    assert asset_json["entity_ids"] == []


def test_free_descriptive_fields_and_independent_checksum_combinations() -> None:
    source_document = _document("source")
    source_document["authentication_method"] = "A fictional prose-only mechanism, not an enum."
    source = _parse_document(source_document)
    assert isinstance(source, SourceManifest)
    assert source.authentication_method.startswith("A fictional")

    asset_document = _document("asset")
    asset_document["review_status"] = "A deliberately open fictional review phrase."
    asset = _parse_document(asset_document)
    assert isinstance(asset, AssetManifest)
    assert asset.review_status.startswith("A deliberately")

    for local_file, checksum in (
        (None, "fictional-checksum-without-file"),
        ("apps/api/tests/fixtures/provider/fictional-payload.json", None),
    ):
        data_document = _document("data")
        data_document["local_file"] = local_file
        data_document["checksum"] = checksum
        parsed = _parse_document(data_document)
        assert isinstance(parsed, DataManifest)
        assert parsed.local_file == local_file
        assert parsed.checksum == checksum


def test_canonical_json_is_stable_unicode_preserving_and_round_trippable() -> None:
    manifest = parse_manifest_json(_fixture("source"))
    first = serialize_manifest(manifest)
    second = serialize_manifest(manifest)

    assert first == second == _fixture("source")
    assert first.endswith(b"\n")
    assert "Étoile" in first.decode("utf-8")
    assert b"\\u00c9" not in first
    decoded = json.loads(first)
    assert list(decoded) == sorted(decoded)
    assert decoded["capabilities"] == ["batch_fetch", "lookup"]
    assert parse_manifest_json(first) == manifest


def test_set_like_fields_canonicalize_lexically_while_documentary_order_is_preserved() -> None:
    source_document = _document("source")
    source_document["capabilities"] = ["lookup", "batch_fetch"]
    source_document["normalized_fields"] = ["zeta", "alpha"]
    source_document["known_limitations"] = ["Second authored note.", "First authored note."]
    source = _parse_document(source_document)
    assert isinstance(source, SourceManifest)
    assert source.capabilities == ("batch_fetch", "lookup")
    assert source.normalized_fields == ("alpha", "zeta")
    assert source.known_limitations == ("Second authored note.", "First authored note.")

    asset_document = _document("asset")
    asset_document["modifications"] = ["Second authored change.", "First authored change."]
    asset_document["entity_ids"] = ["opaque-B", "opaque-A"]
    asset = _parse_document(asset_document)
    assert isinstance(asset, AssetManifest)
    assert asset.modifications == ("Second authored change.", "First authored change.")
    assert asset.entity_ids == ("opaque-B", "opaque-A")


def test_malformed_duplicate_non_object_and_nonfinite_json_have_safe_codes() -> None:
    cases = (
        (b"{not-json", "manifest.json_invalid"),
        (b'{"manifest_type":"source","manifest_type":"source"}', "manifest.json_duplicate_key"),
        (b"[]", "manifest.top_level_invalid"),
        (b'{"manifest_type":"source","value":NaN}', "manifest.json_invalid"),
    )
    for content, code in cases:
        with pytest.raises(ManifestContractError) as captured:
            parse_manifest_json(content)
        assert captured.value.code == code
        assert content.decode("utf-8", errors="ignore") not in str(captured.value)


def test_manifest_contracts_do_not_prebuild_deferred_scientific_models() -> None:
    field_names = set(SourceManifest.model_fields)
    field_names.update(DataManifest.model_fields)
    field_names.update(AssetManifest.model_fields)
    assert field_names.isdisjoint(
        {
            "canonical_entity_id",
            "conflicting_claims",
            "coordinate_frame",
            "epoch",
            "measurement",
            "quantity_code",
            "source_record_id",
            "uncertainty",
            "unit",
        }
    )
