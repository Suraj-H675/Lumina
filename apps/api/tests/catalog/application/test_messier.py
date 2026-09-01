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
    read_messier_artifact,
)
from lumina.catalog.infrastructure.simbad_messier_v2 import (
    ARTIFACT_BYTES as V2_ARTIFACT_BYTES,
)
from lumina.catalog.infrastructure.simbad_messier_v2 import (
    ARTIFACT_SHA256 as V2_ARTIFACT_SHA256,
)
from lumina.catalog.infrastructure.simbad_messier_v2 import (
    COORDINATE_ROLE,
    build_reviewed_simbad_v2_commands,
    read_messier_v2_artifact,
)
from lumina.catalog.infrastructure.simbad_messier_v2 import (
    EXPECTED_RELEASE as V2_RELEASE,
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


def test_v2_artifact_freezes_target_semantics_without_rewriting_simbad_evidence() -> None:
    v1_rows = read_messier_artifact(repository_root=Path.cwd())
    rows = read_messier_v2_artifact(repository_root=Path.cwd())

    assert len(rows) == 110
    assert {row.number for row in rows} == set(range(1, 111))
    assert [
        (
            row.number,
            row.requested_identifier,
            row.oid,
            row.main_id,
            row.otype,
            row.ra,
            row.dec,
            row.coordinate_quality,
            row.coordinate_bibcode,
        )
        for row in rows
    ] == [
        (
            row.number,
            row.requested_identifier,
            row.oid,
            row.main_id,
            row.otype,
            row.ra,
            row.dec,
            row.coordinate_quality,
            row.coordinate_bibcode,
        )
        for row in v1_rows
    ]
    assert all(row.coordinate_role == COORDINATE_ROLE for row in rows)
    assert all(row.coordinate_bibcode is None or row.coordinate_bibcode.strip() for row in rows)
    special_rows = [
        (row.number, row.canonical_entity_type, row.target_scope)
        for row in rows
        if row.number in {8, 16, 17, 20}
    ]
    assert special_rows == [
        (8, "nebula", "extended"),
        (16, "nebula", "compound"),
        (17, "nebula", "extended"),
        (20, "nebula", "extended"),
    ]


def test_v2_commands_use_a_distinct_release_and_preserve_the_coordinate_pair() -> None:
    commands = build_reviewed_simbad_v2_commands(repository_root=Path.cwd())

    assert len(commands) == 110
    assert sum(len(command.source_record.measurements) for command in commands) == 220
    assert all(command.data_manifest.release_version == V2_RELEASE for command in commands)
    assert all(
        {measurement.source_fact_key for measurement in command.source_record.measurements}
        == {"ra", "dec"}
        for command in commands
    )
    assert Path("data/seed/simbad-messier-j2000-v2.csv").stat().st_size == V2_ARTIFACT_BYTES
    assert len(V2_ARTIFACT_SHA256) == 64
