"""Scientific acceptance for the pinned Gaia DR3 bright-star context."""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path

import pytest
from lumina.sky_context.domain.bright_star_artifact import (
    BRIGHT_STAR_ADQL,
    BRIGHT_STAR_ARTIFACT_BYTES,
    BRIGHT_STAR_ARTIFACT_PATH,
    BRIGHT_STAR_ARTIFACT_SHA256,
    BRIGHT_STAR_COLUMNS,
    BRIGHT_STAR_DATASET_ID,
    BRIGHT_STAR_REFERENCE_EPOCH_LABEL,
    BRIGHT_STAR_ROW_COUNT,
    BRIGHT_STAR_SOLUTION_ID,
    BrightStarArtifactRejected,
    load_bright_star_manifest,
    parse_bright_star_artifact,
    validate_bright_star_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
_HEADER = ",".join(BRIGHT_STAR_COLUMNS)
_ROW_ONE = "10,1636148068921376768,Gaia DR3 10,2016.0,0.25,-45.5,1.5,false"
_ROW_TWO = "20,1636148068921376768,Gaia DR3 20,2016.0,359.75,90,5.5,false"


def _artifact(*rows: str, header: str = _HEADER) -> bytes:
    return ("\n".join((header, *rows)) + "\n").encode()


def _copy_contract(tmp_path: Path) -> Path:
    manifest_source = _REPOSITORY_ROOT / "data/sky/gaia-dr3-bright-sky-context-v1.json"
    artifact_source = _REPOSITORY_ROOT / BRIGHT_STAR_ARTIFACT_PATH
    manifest_target = tmp_path / "data/sky/gaia-dr3-bright-sky-context-v1.json"
    artifact_target = tmp_path / BRIGHT_STAR_ARTIFACT_PATH
    manifest_target.parent.mkdir(parents=True)
    artifact_target.parent.mkdir(parents=True)
    shutil.copyfile(manifest_source, manifest_target)
    shutil.copyfile(artifact_source, artifact_target)
    return tmp_path


def test_canonical_manifest_and_artifact_are_exactly_pinned() -> None:
    manifest = load_bright_star_manifest()
    review = validate_bright_star_artifact()
    artifact = (_REPOSITORY_ROOT / manifest.artifact_path).read_bytes()

    assert manifest.dataset_id == BRIGHT_STAR_DATASET_ID
    assert manifest.adql == BRIGHT_STAR_ADQL
    assert manifest.columns == BRIGHT_STAR_COLUMNS
    assert manifest.row_count == BRIGHT_STAR_ROW_COUNT == 3_690
    assert manifest.artifact_byte_count == BRIGHT_STAR_ARTIFACT_BYTES == 474_384
    assert manifest.artifact_sha256 == BRIGHT_STAR_ARTIFACT_SHA256
    assert hashlib.sha256(artifact).hexdigest() == BRIGHT_STAR_ARTIFACT_SHA256
    assert manifest.reference_epoch_label == BRIGHT_STAR_REFERENCE_EPOCH_LABEL == "J2016.0"
    assert manifest.solution_id == BRIGHT_STAR_SOLUTION_ID
    assert len(review.rows) == BRIGHT_STAR_ROW_COUNT
    assert review.minimum_g_magnitude.as_tuple() == (0, (1, 7, 3, 1, 6, 0, 7), -6)
    assert str(review.maximum_g_magnitude) == "5.499884"
    assert str(review.minimum_right_ascension) == "0.26897723368536064"
    assert str(review.maximum_right_ascension) == "359.97959090235906"
    assert str(review.minimum_declination) == "-88.9564785619393"
    assert str(review.maximum_declination) == "89.03768852287028"
    assert len({row.source_id for row in review.rows}) == BRIGHT_STAR_ROW_COUNT
    assert {row.solution_id for row in review.rows} == {BRIGHT_STAR_SOLUTION_ID}
    assert {row.ref_epoch for row in review.rows} == {"2016.0"}
    assert {row.duplicated_source for row in review.rows} == {"false"}
    assert BRIGHT_STAR_ARTIFACT_BYTES <= 2 * 1024 * 1024
    assert BRIGHT_STAR_ROW_COUNT <= 10_000


def test_checksum_and_regular_file_boundary_fail_closed(tmp_path: Path) -> None:
    root = _copy_contract(tmp_path)
    artifact = root / BRIGHT_STAR_ARTIFACT_PATH
    artifact.write_bytes(artifact.read_bytes().replace(b"1.731607", b"1.731608", 1))
    with pytest.raises(BrightStarArtifactRejected):
        validate_bright_star_artifact(repository_root=root)

    root = _copy_contract(tmp_path / "symlink")
    artifact = root / BRIGHT_STAR_ARTIFACT_PATH
    original = artifact.with_name("original.csv")
    artifact.replace(original)
    artifact.symlink_to(original.name)
    with pytest.raises(BrightStarArtifactRejected):
        validate_bright_star_artifact(repository_root=root)


@pytest.mark.parametrize(
    ("content", "expected_rows"),
    [
        (_artifact(_ROW_ONE, _ROW_TWO, header="bad," + _HEADER), 2),
        (_artifact(_ROW_ONE, _ROW_TWO, header=",".join(BRIGHT_STAR_COLUMNS[:-1])), 2),
        (_artifact(_ROW_ONE, _ROW_TWO, header=_HEADER + ",unexpected"), 2),
        (_artifact(_ROW_ONE.replace(",0.25,", ",bad,"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.replace(",0.25,", ",NaN,"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.replace(",0.25,", ",Infinity,"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.replace(",0.25,", ",360,"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.replace(",-45.5,", ",90.1,"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.replace(",1.5,false", ",5.50001,false"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE, _ROW_ONE), 2),
        (_artifact(_ROW_ONE.replace(",false", ",true"), _ROW_TWO), 2),
        (_artifact(_ROW_TWO, _ROW_ONE), 2),
        (_artifact(_ROW_ONE.replace(BRIGHT_STAR_SOLUTION_ID, "1"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.replace("2016.0", "2015.5"), _ROW_TWO), 2),
        (_artifact(_ROW_ONE.rsplit(",", 1)[0], _ROW_TWO), 2),
        (_artifact(_ROW_ONE), 2),
    ],
    ids=(
        "bad-header",
        "missing-column",
        "extra-column",
        "bad-decimal",
        "nan",
        "infinity",
        "ra-range",
        "dec-range",
        "magnitude-threshold",
        "duplicate-source-id",
        "bad-boolean",
        "wrong-order",
        "wrong-solution-id",
        "wrong-ref-epoch",
        "truncated-row",
        "wrong-row-count",
    ),
)
def test_parser_rejects_malformed_artifacts(content: bytes, expected_rows: int) -> None:
    with pytest.raises(BrightStarArtifactRejected):
        parse_bright_star_artifact(content, expected_row_count=expected_rows)


def test_parser_accepts_closed_valid_csv_and_preserves_numeric_lexemes() -> None:
    review = parse_bright_star_artifact(_artifact(_ROW_ONE, _ROW_TWO), expected_row_count=2)

    assert [row.source_id for row in review.rows] == ["10", "20"]
    assert review.rows[0].right_ascension == "0.25"
    assert review.rows[0].declination == "-45.5"
    assert review.rows[1].g_magnitude == "5.5"
