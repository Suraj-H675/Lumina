"""Immutable reviewed Gaia slice contract tests."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest
from lumina.catalog.domain.reviewed_slice import (
    REVIEWED_ARTIFACT_BYTES,
    REVIEWED_ARTIFACT_SHA256,
    REVIEWED_SLICE_ID,
    ReviewedSliceValidationRejected,
    load_reviewed_slice,
    read_reviewed_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _copy_reviewed_data(tmp_path: Path) -> Path:
    shutil.copytree(_REPOSITORY_ROOT / "data", tmp_path / "data")
    return tmp_path


def test_exact_reviewed_contract_and_artifact_are_loadable() -> None:
    slice_contract = load_reviewed_slice(REVIEWED_SLICE_ID)

    assert slice_contract.artifact.byte_length == REVIEWED_ARTIFACT_BYTES
    assert slice_contract.artifact.sha256 == REVIEWED_ARTIFACT_SHA256
    assert [entity.provider_record_id for entity in slice_contract.entities] == [
        "1779546757669063552",
        "2079000330051813504",
        "2079597124345617280",
        "2835207319109249920",
        "3910747531814692736",
    ]
    assert {quantity.code for quantity in slice_contract.quantities} == {
        "gaia_g_mean_magnitude",
        "gaia_bp_mean_magnitude",
        "gaia_rp_mean_magnitude",
    }
    assert (
        read_reviewed_artifact(slice_contract)
        == (_REPOSITORY_ROOT / slice_contract.artifact.path).read_bytes()
    )


def test_unknown_slice_and_noncanonical_contract_are_rejected(tmp_path: Path) -> None:
    with pytest.raises(ReviewedSliceValidationRejected):
        load_reviewed_slice("private-unapproved-slice")

    root = _copy_reviewed_data(tmp_path)
    path = root / "data/seed/gaia-dr3-exoplanet-host-photometry-v1.json"
    document = json.loads(path.read_text(encoding="utf-8"))
    document["unreviewed_private_field"] = "not approved"
    path.write_text(
        f"{json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True)}\n",
        encoding="utf-8",
    )

    with pytest.raises(ReviewedSliceValidationRejected):
        load_reviewed_slice(REVIEWED_SLICE_ID, repository_root=root)

    root = _copy_reviewed_data(tmp_path / "changed-manifest")
    source_path = root / "data/manifests/sources/esa-gaia.json"
    source_document = json.loads(source_path.read_text(encoding="utf-8"))
    source_document["purpose"] = "changed but otherwise valid review text."
    source_path.write_text(
        f"{json.dumps(source_document, ensure_ascii=False, indent=2, sort_keys=True)}\n",
        encoding="utf-8",
    )

    with pytest.raises(ReviewedSliceValidationRejected):
        load_reviewed_slice(REVIEWED_SLICE_ID, repository_root=root)


def test_artifact_checksum_and_symlink_boundary_fail_closed(tmp_path: Path) -> None:
    root = _copy_reviewed_data(tmp_path)
    slice_contract = load_reviewed_slice(REVIEWED_SLICE_ID, repository_root=root)
    artifact = root / slice_contract.artifact.path
    artifact.write_bytes(artifact.read_bytes().replace(b"7.5212455", b"7.5212456", 1))

    with pytest.raises(ReviewedSliceValidationRejected):
        read_reviewed_artifact(slice_contract, repository_root=root)

    root = _copy_reviewed_data(tmp_path / "symlink")
    slice_contract = load_reviewed_slice(REVIEWED_SLICE_ID, repository_root=root)
    artifact = root / slice_contract.artifact.path
    original = root / "data/seed/original.csv"
    artifact.replace(original)
    artifact.symlink_to(original.name)

    with pytest.raises(ReviewedSliceValidationRejected):
        read_reviewed_artifact(slice_contract, repository_root=root)
