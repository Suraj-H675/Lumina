"""Offline Gaia DR3 adapter tests for the fixed reviewed artifact."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest
from lumina.catalog.domain.reviewed_slice import (
    REVIEWED_SLICE_ID,
    ReviewedSlicePolicyRejected,
    ReviewedSliceValidationRejected,
    load_reviewed_slice,
    read_reviewed_artifact,
)
from lumina.catalog.infrastructure import gaia_dr3

_FICTIONAL_FIXTURE = Path("apps/api/tests/fixtures/provider/gaia_dr3_fictional.csv")


def test_production_artifact_builds_five_ordered_records_with_exact_lexemes() -> None:
    commands = gaia_dr3.build_reviewed_gaia_commands(load_reviewed_slice(REVIEWED_SLICE_ID))

    assert [command.source_record.provider_record_id for command in commands] == [
        "1779546757669063552",
        "2079000330051813504",
        "2079597124345617280",
        "2835207319109249920",
        "3910747531814692736",
    ]
    first = {item.source_fact_key: item for item in commands[0].source_record.measurements}
    assert first["phot_g_mean_mag"].value_numeric == Decimal("7.5212455")
    assert first["phot_g_mean_mag"].original_value == "7.5212455"
    assert [
        measurement.original_value
        for command in commands
        for measurement in command.source_record.measurements
    ] == [
        "7.7932835",
        "7.5212455",
        "7.080288",
        "15.51225",
        "14.583239",
        "13.631706",
        "13.772195",
        "13.392909",
        "12.851425",
        "5.6174655",
        "5.283212",
        "4.7888722",
        "13.71137",
        "12.400764",
        "11.269744",
    ]
    assert all(
        item.original_unit == "mag"
        for command in commands
        for item in command.source_record.measurements
    )


def test_quality_and_numeric_sentinel_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    slice_contract = load_reviewed_slice(REVIEWED_SLICE_ID)
    artifact = read_reviewed_artifact(slice_contract)
    monkeypatch.setattr(
        gaia_dr3,
        "read_reviewed_artifact",
        lambda _slice_contract, **_kwargs: artifact.replace(b"false", b"truex", 1),
    )
    with pytest.raises(ReviewedSlicePolicyRejected):
        gaia_dr3.build_reviewed_gaia_commands(slice_contract)

    monkeypatch.setattr(
        gaia_dr3,
        "read_reviewed_artifact",
        lambda _slice_contract, **_kwargs: artifact.replace(b"7.5212455", b"NaNxxxxxx", 1),
    )
    with pytest.raises(ReviewedSliceValidationRejected):
        gaia_dr3.build_reviewed_gaia_commands(slice_contract)


def test_fictional_fixture_preserves_decimal_edge_lexemes_without_claiming_provider_truth() -> None:
    slice_contract = load_reviewed_slice(REVIEWED_SLICE_ID)

    rows = gaia_dr3._parse_rows(  # noqa: SLF001 - exercises the strict adapter boundary.
        slice_contract, _FICTIONAL_FIXTURE.read_bytes()
    )

    assert rows[0]["phot_g_mean_mag"] == "1.2300"
    assert rows[0]["phot_bp_mean_mag"] == "1E+2"
    assert rows[0]["phot_rp_mean_mag"] == "-1"
    assert rows[1]["phot_g_mean_mag"] == "-0"
    assert rows[-1]["designation"].startswith("FICTIONAL TEST STAR")
