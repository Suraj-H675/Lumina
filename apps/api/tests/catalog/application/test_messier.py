"""Focused tests for the reviewed Messier application boundary."""

from __future__ import annotations

from pathlib import Path

from lumina.catalog.infrastructure.postgresql.messier_selection import _fingerprint
from lumina.catalog.infrastructure.simbad_messier import (
    ARTIFACT_SHA256,
    EXPECTED_DATASET,
    EXPECTED_PROVIDER,
    EXPECTED_RELEASE,
    build_reviewed_simbad_commands,
)
from lumina.provenance.domain.manifests import DataManifest, parse_manifest_json


def test_reviewed_messier_commands_are_exactly_110_by_220() -> None:
    commands = build_reviewed_simbad_commands(repository_root=Path.cwd())

    assert len(commands) == 110
    assert sum(len(command.source_record.measurements) for command in commands) == 220
    assert all(command.source_manifest.source_id == EXPECTED_PROVIDER for command in commands)
    assert all(command.data_manifest.dataset_id == EXPECTED_DATASET for command in commands)
    assert all(command.data_manifest.release_version == EXPECTED_RELEASE for command in commands)


def test_messier_fingerprint_is_order_independent_and_semantic() -> None:
    first: dict[str, object] = {
        "slug": "messier-31",
        "quantity_code": "icrs_right_ascension_j2000",
        "original_value": "10.6847",
        "source_fact_key": "ra",
    }
    second: dict[str, object] = {
        "slug": "messier-31",
        "quantity_code": "icrs_declination_j2000",
        "original_value": "41.2688",
        "source_fact_key": "dec",
    }

    assert _fingerprint([first, second]) == _fingerprint([second, first])
    changed = {**first, "original_value": "10.6848"}
    assert _fingerprint([changed, second]) != _fingerprint([first, second])


def test_messier_data_manifest_persists_dataset_code() -> None:
    manifest = parse_manifest_json(
        Path("data/manifests/data/simbad-messier-j2000-v1.json").read_bytes()
    )

    assert isinstance(manifest, DataManifest)
    assert manifest.source_id == EXPECTED_PROVIDER
    assert manifest.dataset_id == EXPECTED_DATASET
    assert manifest.release_version == EXPECTED_RELEASE
    assert manifest.checksum == f"sha256:{ARTIFACT_SHA256}"
