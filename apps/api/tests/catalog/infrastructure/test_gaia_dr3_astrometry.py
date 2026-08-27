"""Tests for the closed Gaia DR3 astrometry adapter."""

from __future__ import annotations

from lumina.catalog.domain.astrometry_slice import ASTROMETRY_SLICE_ID, load_astrometry_slice
from lumina.catalog.infrastructure.gaia_dr3_astrometry import (
    build_reviewed_gaia_astrometry_commands,
)


def test_adapter_emits_exact_paired_ra_dec_measurements() -> None:
    slice_contract = load_astrometry_slice(ASTROMETRY_SLICE_ID)
    commands = build_reviewed_gaia_astrometry_commands(slice_contract)

    assert [command.source_record.provider_record_id for command in commands] == [
        "1779546757669063552",
        "2079000330051813504",
        "2079597124345617280",
        "2835207319109249920",
        "3910747531814692736",
    ]
    assert sum(len(command.source_record.measurements) for command in commands) == 10
    for command in commands:
        assert command.source_record.provider_version == "1636148068921376768"
        assert {
            measurement.source_fact_key for measurement in command.source_record.measurements
        } == {
            "ra",
            "dec",
        }
        assert {measurement.unit_code for measurement in command.source_record.measurements} == {
            "deg"
        }
        assert {
            measurement.original_unit for measurement in command.source_record.measurements
        } == {"deg"}
        assert all(measurement.original_value for measurement in command.source_record.measurements)


def test_adapter_retains_distinct_astrometry_dataset_identity() -> None:
    slice_contract = load_astrometry_slice(ASTROMETRY_SLICE_ID)
    command = build_reviewed_gaia_astrometry_commands(slice_contract)[0]

    assert command.data_manifest.dataset_id == "gaia-source-astrometry"
    assert command.data_manifest.dataset_id != "gaia-source"
    assert command.data_manifest.local_file == (
        "data/seed/gaia-dr3-exoplanet-host-astrometry-v1.csv"
    )
