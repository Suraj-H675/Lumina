"""Tests for the independently pinned Gaia DR3 astrometry contract."""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from lumina.catalog.domain.astrometry_slice import (
    ASTROMETRY_ARTIFACT_BYTES,
    ASTROMETRY_ARTIFACT_SHA256,
    ASTROMETRY_REFERENCE_EPOCH,
    ASTROMETRY_SLICE_ID,
    load_astrometry_slice,
    read_astrometry_artifact,
)
from lumina.catalog.domain.reviewed_slice import ReviewedSliceValidationRejected

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _copy_reviewed_data(tmp_path: Path) -> Path:
    shutil.copytree(_REPOSITORY_ROOT / "data", tmp_path / "data")
    return tmp_path


def test_exact_astrometry_contract_and_artifact_are_loadable() -> None:
    slice_contract = load_astrometry_slice(ASTROMETRY_SLICE_ID)

    assert slice_contract.artifact.byte_length == ASTROMETRY_ARTIFACT_BYTES == 747
    assert slice_contract.artifact.sha256 == ASTROMETRY_ARTIFACT_SHA256
    assert slice_contract.reference_epoch == ASTROMETRY_REFERENCE_EPOCH == "2016.0"
    assert slice_contract.reference_epoch_unit == "Julian year"
    assert [entity.provider_record_id for entity in slice_contract.entities] == [
        "1779546757669063552",
        "2079000330051813504",
        "2079597124345617280",
        "2835207319109249920",
        "3910747531814692736",
    ]
    assert [
        (quantity.code, quantity.source_fact_key) for quantity in slice_contract.quantities
    ] == [
        ("gaia_icrs_declination", "dec"),
        ("gaia_icrs_right_ascension", "ra"),
    ]
    assert slice_contract.unit.code == slice_contract.unit.symbol == "deg"
    assert len(slice_contract.compatibility_pairs) == 2
    assert slice_contract.expected.source_records == 5
    assert slice_contract.expected.measurements == 10
    assert (
        read_astrometry_artifact(slice_contract)
        == (_REPOSITORY_ROOT / slice_contract.artifact.path).read_bytes()
    )


def test_astrometry_artifact_checksum_and_symlink_boundary_fail_closed(tmp_path: Path) -> None:
    root = _copy_reviewed_data(tmp_path)
    slice_contract = load_astrometry_slice(ASTROMETRY_SLICE_ID, repository_root=root)
    artifact = root / slice_contract.artifact.path
    artifact.write_bytes(
        artifact.read_bytes().replace(b"330.79502626424147", b"330.79502626424148", 1)
    )

    with pytest.raises(ReviewedSliceValidationRejected):
        read_astrometry_artifact(slice_contract, repository_root=root)

    root = _copy_reviewed_data(tmp_path / "symlink")
    slice_contract = load_astrometry_slice(ASTROMETRY_SLICE_ID, repository_root=root)
    artifact = root / slice_contract.artifact.path
    original = root / "data/seed/original.csv"
    artifact.replace(original)
    artifact.symlink_to(original.name)

    with pytest.raises(ReviewedSliceValidationRejected):
        read_astrometry_artifact(slice_contract, repository_root=root)
