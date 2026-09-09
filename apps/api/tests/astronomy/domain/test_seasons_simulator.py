from __future__ import annotations

import json
import math
from pathlib import Path
from typing import cast

import pytest
from lumina.astronomy.domain.seasons_simulator import (
    EARTH_ECCENTRICITY,
    EARTH_OBLIQUITY_J2000_DEG,
    EARTH_PERIHELION_LONGITUDE_DEG,
    EXAGGERATED_ECCENTRICITY,
    PERIHELION_SEASONAL_LONGITUDE_DEG,
    SeasonsEccentricityPreset,
    SeasonsLatitudeGeometry,
    SeasonsModelError,
    SeasonsSimulatorInput,
    calculate_seasons,
    load_reviewed_seasons_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
_ANGLE_TOLERANCE = 1e-9
_DAY_LENGTH_TOLERANCE = 1e-9
_RELATIVE_TOLERANCE = 1e-12


def _input(
    *,
    tilt: float = 23.43928,
    position: float = 90.0,
    latitude: float = 40.0,
    eccentricity: str = "earth",
) -> SeasonsSimulatorInput:
    return SeasonsSimulatorInput(
        axial_tilt_deg=tilt,
        orbital_position_deg=position,
        latitude_deg=latitude,
        eccentricity_preset=cast(SeasonsEccentricityPreset, eccentricity),
    )


def _assert_geometry(
    geometry: SeasonsLatitudeGeometry,
    *,
    altitude: float,
    incidence: float,
    day_length: float | None,
    polar_state: str,
) -> None:
    assert geometry.noon_sun_altitude_deg == pytest.approx(altitude, abs=_ANGLE_TOLERANCE)
    assert geometry.illumination_incidence_deg == pytest.approx(incidence, abs=_ANGLE_TOLERANCE)
    if day_length is None:
        assert geometry.day_length_hours is None
    else:
        assert geometry.day_length_hours == pytest.approx(day_length, abs=_DAY_LENGTH_TOLERANCE)
    assert geometry.polar_state == polar_state


def test_equinox_40_degree_latitudes_match_independent_reference_case() -> None:
    result = calculate_seasons(_input(position=0.0))

    assert result.solar_declination_deg == pytest.approx(0.0, abs=_ANGLE_TOLERANCE)
    _assert_geometry(
        result.selected,
        altitude=50.0,
        incidence=40.0,
        day_length=12.0,
        polar_state="none",
    )
    _assert_geometry(
        result.opposite_hemisphere,
        altitude=50.0,
        incidence=40.0,
        day_length=12.0,
        polar_state="none",
    )


def test_june_solstice_exposes_opposite_hemisphere_geometry() -> None:
    result = calculate_seasons(_input(position=90.0))

    assert result.solar_declination_deg == pytest.approx(23.43928, abs=_ANGLE_TOLERANCE)
    _assert_geometry(
        result.selected,
        altitude=73.43928,
        incidence=16.56072,
        day_length=14.8444511275,
        polar_state="none",
    )
    _assert_geometry(
        result.opposite_hemisphere,
        altitude=26.56072,
        incidence=63.43928,
        day_length=9.1555488725,
        polar_state="none",
    )


def test_december_solstice_swaps_the_equal_and_opposite_latitudes() -> None:
    result = calculate_seasons(_input(position=270.0))

    assert result.solar_declination_deg == pytest.approx(-23.43928, abs=_ANGLE_TOLERANCE)
    _assert_geometry(
        result.selected,
        altitude=26.56072,
        incidence=63.43928,
        day_length=9.1555488725,
        polar_state="none",
    )
    _assert_geometry(
        result.opposite_hemisphere,
        altitude=73.43928,
        incidence=16.56072,
        day_length=14.8444511275,
        polar_state="none",
    )


def test_equator_has_twelve_hour_geometric_day_at_solstice() -> None:
    result = calculate_seasons(_input(position=90.0, latitude=0.0))

    assert result.solar_declination_deg == pytest.approx(23.43928, abs=_ANGLE_TOLERANCE)
    _assert_geometry(
        result.selected,
        altitude=66.56072,
        incidence=23.43928,
        day_length=12.0,
        polar_state="none",
    )
    assert result.comparison_latitude_deg == 0.0


@pytest.mark.parametrize("position", [0.0, 90.0, 180.0, 270.0, 359.999999])
def test_zero_tilt_removes_seasonal_geometry_but_retains_distance_context(
    position: float,
) -> None:
    result = calculate_seasons(_input(tilt=0.0, position=position, eccentricity="exaggerated"))

    assert result.solar_declination_deg == pytest.approx(0.0, abs=_ANGLE_TOLERANCE)
    _assert_geometry(
        result.selected,
        altitude=50.0,
        incidence=40.0,
        day_length=12.0,
        polar_state="none",
    )
    _assert_geometry(
        result.opposite_hemisphere,
        altitude=50.0,
        incidence=40.0,
        day_length=12.0,
        polar_state="none",
    )
    assert result.distance_over_semimajor_axis != pytest.approx(1.0)


def test_arctic_circle_boundary_classifies_polar_day_and_polar_night() -> None:
    latitude = 66.56072
    june = calculate_seasons(_input(position=90.0, latitude=latitude))
    december = calculate_seasons(_input(position=270.0, latitude=latitude))

    assert june.selected.day_length_hours == pytest.approx(24.0, abs=_DAY_LENGTH_TOLERANCE)
    assert june.selected.polar_state == "polar_day"
    assert december.selected.day_length_hours == pytest.approx(0.0, abs=_DAY_LENGTH_TOLERANCE)
    assert december.selected.polar_state == "polar_night"
    assert december.selected.noon_sun_altitude_deg == pytest.approx(0.0, abs=_ANGLE_TOLERANCE)


@pytest.mark.parametrize("latitude", [90.0, -90.0])
def test_pole_at_equinox_is_explicit_horizon_all_day_degeneracy(latitude: float) -> None:
    result = calculate_seasons(_input(position=0.0, latitude=latitude))

    assert result.solar_declination_deg == pytest.approx(0.0, abs=_ANGLE_TOLERANCE)
    assert result.selected.noon_sun_altitude_deg == pytest.approx(0.0, abs=_ANGLE_TOLERANCE)
    assert result.selected.polar_state == "horizon_all_day"
    assert result.selected.day_length_hours is None


def test_circular_orbit_has_unit_distance_and_flux_at_all_reference_phases() -> None:
    for position in (0.0, 90.0, 180.0, 270.0, 359.999999):
        result = calculate_seasons(_input(position=position, eccentricity="circular"))
        assert result.distance_over_semimajor_axis == pytest.approx(1.0, rel=_RELATIVE_TOLERANCE)
        assert result.relative_solar_flux == pytest.approx(1.0, rel=_RELATIVE_TOLERANCE)


def test_earth_distance_context_matches_independent_perihelion_and_aphelion_values() -> None:
    perihelion = calculate_seasons(_input(position=282.93768193, eccentricity="earth"))
    aphelion = calculate_seasons(_input(position=102.93768193, eccentricity="earth"))

    assert perihelion.distance_over_semimajor_axis == pytest.approx(
        0.98328877, rel=_RELATIVE_TOLERANCE
    )
    assert perihelion.relative_solar_flux == pytest.approx(
        1.0342793210052994, rel=_RELATIVE_TOLERANCE
    )
    assert aphelion.distance_over_semimajor_axis == pytest.approx(
        1.01671123, rel=_RELATIVE_TOLERANCE
    )
    assert aphelion.relative_solar_flux == pytest.approx(
        0.9673970504389672, rel=_RELATIVE_TOLERANCE
    )


def test_exaggerated_distance_context_matches_independent_reference_values() -> None:
    perihelion = calculate_seasons(_input(position=282.93768193, eccentricity="exaggerated"))
    aphelion = calculate_seasons(_input(position=102.93768193, eccentricity="exaggerated"))

    assert perihelion.distance_over_semimajor_axis == pytest.approx(0.9, rel=_RELATIVE_TOLERANCE)
    assert perihelion.relative_solar_flux == pytest.approx(
        1.234567901234568, rel=_RELATIVE_TOLERANCE
    )
    assert aphelion.distance_over_semimajor_axis == pytest.approx(1.1, rel=_RELATIVE_TOLERANCE)
    assert aphelion.relative_solar_flux == pytest.approx(
        0.8264462809917357, rel=_RELATIVE_TOLERANCE
    )


def test_eccentricity_does_not_change_tilt_geometry_at_fixed_phase() -> None:
    circular = calculate_seasons(_input(eccentricity="circular"))
    earth = calculate_seasons(_input(eccentricity="earth"))
    exaggerated = calculate_seasons(_input(eccentricity="exaggerated"))

    for result in (earth, exaggerated):
        assert result.solar_declination_deg == circular.solar_declination_deg
        assert result.selected == circular.selected
        assert result.opposite_hemisphere == circular.opposite_hemisphere


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("axial_tilt_deg", -0.0001),
        ("axial_tilt_deg", 90.0001),
        ("orbital_position_deg", -0.0001),
        ("orbital_position_deg", 360.0),
        ("latitude_deg", -90.0001),
        ("latitude_deg", 90.0001),
        ("axial_tilt_deg", math.nan),
        ("orbital_position_deg", math.inf),
        ("latitude_deg", -math.inf),
    ],
)
def test_invalid_numeric_inputs_fail_with_the_stable_domain_error(
    field: str,
    value: float,
) -> None:
    values: dict[str, object] = {
        "axial_tilt_deg": EARTH_OBLIQUITY_J2000_DEG,
        "orbital_position_deg": 90.0,
        "latitude_deg": 40.0,
        "eccentricity_preset": "earth",
    }
    values[field] = value

    with pytest.raises(SeasonsModelError, match="^SEASONS_MODEL_INVALID$"):
        SeasonsSimulatorInput(
            axial_tilt_deg=cast(float, values["axial_tilt_deg"]),
            orbital_position_deg=cast(float, values["orbital_position_deg"]),
            latitude_deg=cast(float, values["latitude_deg"]),
            eccentricity_preset=cast(SeasonsEccentricityPreset, values["eccentricity_preset"]),
        )


@pytest.mark.parametrize(
    "values",
    [
        {
            "axial_tilt_deg": True,
            "orbital_position_deg": 90.0,
            "latitude_deg": 40.0,
            "eccentricity_preset": "earth",
        },
        {
            "axial_tilt_deg": EARTH_OBLIQUITY_J2000_DEG,
            "orbital_position_deg": 90.0,
            "latitude_deg": 40.0,
            "eccentricity_preset": "unknown",
        },
        {
            "axial_tilt_deg": EARTH_OBLIQUITY_J2000_DEG,
            "orbital_position_deg": 90.0,
            "latitude_deg": 40.0,
            "eccentricity_preset": [],
        },
    ],
)
def test_boolean_and_unknown_preset_inputs_fail_closed(values: dict[str, object]) -> None:
    with pytest.raises(SeasonsModelError, match="^SEASONS_MODEL_INVALID$"):
        SeasonsSimulatorInput(
            axial_tilt_deg=cast(float, values["axial_tilt_deg"]),
            orbital_position_deg=cast(float, values["orbital_position_deg"]),
            latitude_deg=cast(float, values["latitude_deg"]),
            eccentricity_preset=cast(SeasonsEccentricityPreset, values["eccentricity_preset"]),
        )


def test_reviewed_artifact_contains_the_frozen_model_contract() -> None:
    artifact = load_reviewed_seasons_artifact(repository_root=_REPOSITORY_ROOT)

    assert artifact["model_version"] == "seasons-simulator-v1"
    assert artifact["schema_version"] == 1
    assert artifact["share_schema_version"] == 1
    assert artifact["constants"] == {
        "EARTH_OBLIQUITY_J2000_DEG": EARTH_OBLIQUITY_J2000_DEG,
        "EARTH_ECCENTRICITY": EARTH_ECCENTRICITY,
        "EARTH_PERIHELION_LONGITUDE_DEG": EARTH_PERIHELION_LONGITUDE_DEG,
        "PERIHELION_SEASONAL_LONGITUDE_DEG": PERIHELION_SEASONAL_LONGITUDE_DEG,
        "MEAN_SOLAR_DAY_HOURS": 24.0,
        "CIRCULAR_ECCENTRICITY": 0.0,
        "EXAGGERATED_ECCENTRICITY": EXAGGERATED_ECCENTRICITY,
    }
    presets = artifact["presets"]
    assert isinstance(presets, dict)
    assert presets == {"circular": 0.0, "earth": EARTH_ECCENTRICITY, "exaggerated": 0.1}
    fixture_ids = {
        fixture["id"] for fixture in cast(list[dict[str, object]], artifact["validation_fixtures"])
    }
    assert fixture_ids == {
        "equinox-40-north",
        "june-solstice-40-north",
        "december-solstice-40-north",
        "equator-june-solstice",
        "zero-tilt-distance-only",
        "arctic-circle-boundary",
        "pole-equinox-degeneracy",
        "circular-orbit",
        "earth-perihelion-distance",
        "earth-aphelion-distance",
        "exaggerated-eccentricity-distance",
    }


def test_reviewed_artifact_rejects_duplicate_json_keys(tmp_path: Path) -> None:
    artifact_path = tmp_path / "data/seed/seasons-simulator-v1.json"
    artifact_path.parent.mkdir(parents=True)
    artifact_path.write_text('{"model_version":"seasons-simulator-v1","model_version":"bad"}')

    with pytest.raises(SeasonsModelError, match="^SEASONS_MODEL_INVALID$"):
        load_reviewed_seasons_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_rebound_source_metadata(tmp_path: Path) -> None:
    artifact_path = tmp_path / "data/seed/seasons-simulator-v1.json"
    artifact_path.parent.mkdir(parents=True)

    for field, value in (
        ("title", "A different official page"),
        ("url", "https://science.nasa.gov/earth/facts/"),
    ):
        artifact = cast(
            dict[str, object],
            json.loads(
                (_REPOSITORY_ROOT / "data/seed/seasons-simulator-v1.json").read_text(
                    encoding="utf-8"
                )
            ),
        )
        sources = artifact["sources"]
        assert isinstance(sources, list)
        source = sources[0]
        assert isinstance(source, dict)
        source[field] = value
        artifact_path.write_text(json.dumps(artifact), encoding="utf-8")

        with pytest.raises(SeasonsModelError, match="^SEASONS_MODEL_INVALID$"):
            load_reviewed_seasons_artifact(repository_root=tmp_path)


def test_reviewed_artifact_is_valid_json_for_independent_readers() -> None:
    artifact_path = _REPOSITORY_ROOT / "data/seed/seasons-simulator-v1.json"
    decoded = json.loads(artifact_path.read_text(encoding="utf-8"))
    assert isinstance(decoded, dict)
