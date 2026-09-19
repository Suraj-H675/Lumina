from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.black_hole_relativity import (
    EVENT_HORIZON_RADIUS_RS,
    ISCO_RADIUS_RS,
    MAX_MASS_NOMINAL_SOLAR,
    MAX_STATIC_OBSERVER_RADIUS_RS,
    MIN_MASS_NOMINAL_SOLAR,
    MIN_STATIC_OBSERVER_RADIUS_RS,
    NOMINAL_SOLAR_MASS_PARAMETER_M3_S2,
    PHOTON_SPHERE_RADIUS_RS,
    SPEED_OF_LIGHT_M_S,
    BlackHoleRelativityInput,
    BlackHoleRelativityModelError,
    calculate_black_hole_relativity,
    load_reviewed_black_hole_relativity_artifact,
)


def _input(
    *,
    mass_nominal_solar: float = 10.0,
    static_observer_radius_rs: float = 2.0,
) -> BlackHoleRelativityInput:
    return BlackHoleRelativityInput(
        mass_nominal_solar=mass_nominal_solar,
        static_observer_radius_rs=static_observer_radius_rs,
    )


def test_openstax_rounded_solar_radius_validation() -> None:
    result = calculate_black_hole_relativity(_input(mass_nominal_solar=1.0))
    expected = 2.0 * NOMINAL_SOLAR_MASS_PARAMETER_M3_S2 / SPEED_OF_LIGHT_M_S**2
    assert result.schwarzschild_radius_m == pytest.approx(expected, rel=0, abs=1e-12)
    assert result.schwarzschild_radius_m == pytest.approx(2_950.0, abs=5.0)


def test_default_static_clock_matches_exact_sqrt_half_relations() -> None:
    result = calculate_black_hole_relativity(_input())
    root_half = math.sqrt(0.5)
    root_two = math.sqrt(2.0)
    assert result.proper_time_rate_vs_infinity == pytest.approx(root_half, rel=0, abs=1e-15)
    assert result.frequency_ratio_at_infinity == pytest.approx(root_half, rel=0, abs=1e-15)
    assert result.far_away_interval_per_local_interval == pytest.approx(
        root_two,
        rel=0,
        abs=1e-15,
    )
    assert result.gravitational_redshift_z == pytest.approx(root_two - 1.0, rel=0, abs=1e-15)
    assert result.static_observer_areal_radius_m == pytest.approx(
        2.0 * result.schwarzschild_radius_m,
        rel=0,
        abs=1e-10,
    )


def test_schwarzschild_landmarks_have_frozen_ratios_and_semantics() -> None:
    result = calculate_black_hole_relativity(_input())
    assert [row.id for row in result.landmarks] == ["event_horizon", "photon_sphere", "isco"]
    assert [row.radius_rs for row in result.landmarks] == [
        EVENT_HORIZON_RADIUS_RS,
        PHOTON_SPHERE_RADIUS_RS,
        ISCO_RADIUS_RS,
    ]
    for row in result.landmarks:
        assert row.radius_m == pytest.approx(
            row.radius_rs * result.schwarzschild_radius_m,
            rel=0,
            abs=1e-10,
        )
    assert "null-geodesic" in result.landmarks[1].interpretation
    assert "timelike-geodesic" in result.landmarks[2].interpretation


def test_gravitational_parameter_and_meter_landmarks_scale_linearly_with_mass() -> None:
    one = calculate_black_hole_relativity(_input(mass_nominal_solar=1.0))
    ten = calculate_black_hole_relativity(_input(mass_nominal_solar=10.0))
    assert ten.gravitational_parameter_m3_s2 == pytest.approx(
        10.0 * one.gravitational_parameter_m3_s2,
        rel=0,
        abs=1.0,
    )
    assert ten.schwarzschild_radius_m == pytest.approx(
        10.0 * one.schwarzschild_radius_m,
        rel=0,
        abs=1e-10,
    )
    assert [row.radius_m for row in ten.landmarks] == pytest.approx(
        [10.0 * row.radius_m for row in one.landmarks],
        rel=0,
        abs=1e-9,
    )


@pytest.mark.parametrize("radius_rs", [1.01, 1.5, 2.0, 3.0, 10.0, 100.0])
def test_dimensionless_clock_and_redshift_are_mass_invariant_at_fixed_rs_multiple(
    radius_rs: float,
) -> None:
    stellar = calculate_black_hole_relativity(
        _input(mass_nominal_solar=10.0, static_observer_radius_rs=radius_rs)
    )
    supermassive = calculate_black_hole_relativity(
        _input(mass_nominal_solar=1.0e9, static_observer_radius_rs=radius_rs)
    )
    assert stellar.proper_time_rate_vs_infinity == pytest.approx(
        supermassive.proper_time_rate_vs_infinity,
        rel=0,
        abs=1e-15,
    )
    assert stellar.gravitational_redshift_z == pytest.approx(
        supermassive.gravitational_redshift_z,
        rel=0,
        abs=1e-15,
    )


def test_near_horizon_public_bound_remains_finite_and_exterior() -> None:
    result = calculate_black_hole_relativity(
        _input(
            mass_nominal_solar=MIN_MASS_NOMINAL_SOLAR,
            static_observer_radius_rs=MIN_STATIC_OBSERVER_RADIUS_RS,
        )
    )
    assert result.static_observer_areal_radius_m > result.schwarzschild_radius_m
    assert 0.0 < result.proper_time_rate_vs_infinity < 1.0
    assert math.isfinite(result.far_away_interval_per_local_interval)
    assert math.isfinite(result.gravitational_redshift_z)
    assert result.gravitational_redshift_z > 9.0


def test_far_radius_public_bound_tends_toward_asymptotic_reference_without_equaling_it() -> None:
    result = calculate_black_hole_relativity(
        _input(static_observer_radius_rs=MAX_STATIC_OBSERVER_RADIUS_RS)
    )
    assert 0.99 < result.proper_time_rate_vs_infinity < 1.0
    assert 1.0 < result.far_away_interval_per_local_interval < 1.01
    assert 0.0 < result.gravitational_redshift_z < 0.01


def test_maximum_mass_bound_keeps_all_meter_scale_outputs_finite() -> None:
    result = calculate_black_hole_relativity(
        _input(
            mass_nominal_solar=MAX_MASS_NOMINAL_SOLAR,
            static_observer_radius_rs=MAX_STATIC_OBSERVER_RADIUS_RS,
        )
    )
    values = [
        result.gravitational_parameter_m3_s2,
        result.schwarzschild_radius_m,
        result.static_observer_areal_radius_m,
        *(row.radius_m for row in result.landmarks),
    ]
    assert all(math.isfinite(value) and value > 0.0 for value in values)


def test_observer_and_model_notes_keep_frame_and_visual_boundaries_explicit() -> None:
    result = calculate_black_hole_relativity(_input())
    assert "accelerated" in result.observer_note
    assert "not freely falling" in result.observer_note
    assert "not a circular geodesic" in result.observer_note
    assert "areal radius" in result.model_note
    assert "ray tracing" in result.model_note
    assert "observed-source fitting" in result.model_note


def test_result_is_exactly_deterministic() -> None:
    inputs = _input()
    assert calculate_black_hole_relativity(inputs) == calculate_black_hole_relativity(inputs)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("mass_nominal_solar", 0.999),
        ("mass_nominal_solar", 1.0e10 + 1.0),
        ("static_observer_radius_rs", 1.0),
        ("static_observer_radius_rs", 100.001),
        ("mass_nominal_solar", float("nan")),
        ("mass_nominal_solar", float("inf")),
        ("static_observer_radius_rs", float("-inf")),
        ("mass_nominal_solar", True),
        ("static_observer_radius_rs", True),
    ],
)
def test_input_domain_rejects_invalid_states(field: str, value: object) -> None:
    kwargs: dict[str, object] = {
        "mass_nominal_solar": 10.0,
        "static_observer_radius_rs": 2.0,
    }
    kwargs[field] = value
    with pytest.raises(BlackHoleRelativityModelError):
        BlackHoleRelativityInput(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize("value", [None, "10", [], {}, object()])
def test_numeric_input_types_are_strict(value: object) -> None:
    with pytest.raises(BlackHoleRelativityModelError):
        BlackHoleRelativityInput(
            mass_nominal_solar=value,  # type: ignore[arg-type]
            static_observer_radius_rs=2.0,
        )


def test_calculation_requires_validated_input_type() -> None:
    with pytest.raises(BlackHoleRelativityModelError):
        calculate_black_hole_relativity(object())  # type: ignore[arg-type]


def test_reviewed_artifact_is_strict_and_matches_frozen_contract() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_black_hole_relativity_artifact(repository_root=repository_root)
    assert artifact["model_version"] == "black-hole-relativity-v1"
    constants = artifact["constants"]
    assert isinstance(constants, dict)
    assert constants["NOMINAL_SOLAR_MASS_PARAMETER_M3_S2"] == 1.3271244e20
    assert constants["SPEED_OF_LIGHT_M_S"] == 299_792_458.0


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("NOMINAL_SOLAR_MASS_PARAMETER_M3_S2", 1.3271245e20),
        ("PHOTON_SPHERE_RADIUS_RS", 1.6),
        ("MIN_STATIC_OBSERVER_RADIUS_RS", 1.0),
    ],
)
def test_reviewed_artifact_rejects_constant_mutation(
    tmp_path: Path,
    key: str,
    value: object,
) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/black-hole-relativity-v1.json").read_text())
    artifact["constants"][key] = value
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "black-hole-relativity-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(BlackHoleRelativityModelError):
        load_reviewed_black_hole_relativity_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_source_landmark_or_preset_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/black-hole-relativity-v1.json").read_text())
    artifact["sources"][0]["url"] = "https://example.com/not-reviewed"
    artifact["landmark_definitions"][1]["radius_rs"] = 1.6
    artifact["preset"]["static_observer_radius_rs"] = 1.0
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "black-hole-relativity-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(BlackHoleRelativityModelError):
        load_reviewed_black_hole_relativity_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_validation_identity_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/black-hole-relativity-v1.json").read_text())
    artifact["scientific_validation"]["independent_validation_case"][
        "reported_schwarzschild_radius_m"
    ] = 3_000.0
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "black-hole-relativity-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(BlackHoleRelativityModelError):
        load_reviewed_black_hole_relativity_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_duplicate_json_keys(tmp_path: Path) -> None:
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "black-hole-relativity-v1.json").write_text(
        '{"artifact_version":1,"artifact_version":1}'
    )
    with pytest.raises(BlackHoleRelativityModelError):
        load_reviewed_black_hole_relativity_artifact(repository_root=tmp_path)
