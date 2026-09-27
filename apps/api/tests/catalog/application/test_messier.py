"""Focused tests for the current Messier adapter and superseded-source provenance."""

from __future__ import annotations

import csv
import hashlib
from io import StringIO
from pathlib import Path

from lumina.catalog.infrastructure.postgresql.messier_selection import _fingerprint
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

_V1_ARTIFACT = Path("data/seed/simbad-messier-j2000-v1.csv")
_V1_ARTIFACT_SHA256 = "b29a5c8b3bf58eb3c7649f18f1f64446c6b3b12dbbb3d59c4e639befe2fbf0e9"
_V1_RAW_FIELDS = (
    "requested_identifier",
    "oid",
    "main_id",
    "otype",
    "ra",
    "dec",
    "coo_qual",
    "coo_bibcode",
)


def _historical_v1_evidence() -> list[tuple[str, ...]]:
    content = _V1_ARTIFACT.read_bytes()
    assert hashlib.sha256(content).hexdigest() == _V1_ARTIFACT_SHA256
    reader = csv.DictReader(StringIO(content.decode("utf-8"), newline=""), strict=True)
    assert reader.fieldnames == [
        "messier_number",
        "canonical_name",
        "slug",
        "entity_type",
        *_V1_RAW_FIELDS,
    ]
    rows = list(reader)
    assert len(rows) == 110
    return [tuple(row[field] for field in _V1_RAW_FIELDS) for row in rows]


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
    assert manifest.source_id == "cds-simbad"
    assert manifest.dataset_id == "messier-j2000"
    assert manifest.release_version == "v1"
    assert manifest.checksum == f"sha256:{_V1_ARTIFACT_SHA256}"


def test_v2_artifact_freezes_target_semantics_without_rewriting_simbad_evidence() -> None:
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
        (number, *evidence[:-1], evidence[-1] or None)
        for number, evidence in enumerate(_historical_v1_evidence(), start=1)
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
