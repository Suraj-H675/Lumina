from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.radial_velocity import (
    CURVE_POINTS,
    RadialVelocityInput,
    RadialVelocityModelError,
    calculate_radial_velocity,
    load_reviewed_radial_velocity_artifact,
)

STAR_MASS_KG = 2.0e30
PLANET_MASS_KG = 2.0e27
PERIOD_S = 31_557_600.0


def _input(**overrides: float) -> RadialVelocityInput:
    values = {
        "stellar_mass_kg": STAR_MASS_KG,
        "planet_mass_kg": PLANET_MASS_KG,
        "orbital_period_s": PERIOD_S,
        "eccentricity": 0.0,
        "inclination_deg": 90.0,
        "stellar_argument_of_periastron_deg": 0.0,
        "mean_anomaly_at_epoch_deg": 0.0,
    }
    values.update(overrides)
    return RadialVelocityInput(**values)


def test_circular_edge_on_curve_matches_quarter_phase_limits() -> None:
    result = calculate_radial_velocity(_input())
    assert len(result.curve) == CURVE_POINTS
    assert result.semi_amplitude_m_s > 0.0

    expected = [
        result.semi_amplitude_m_s,
        0.0,
        -result.semi_amplitude_m_s,
        0.0,
        result.semi_amplitude_m_s,
    ]
    for index, expected_velocity in zip((0, 75, 150, 225, 300), expected, strict=True):
        assert result.curve[index].radial_velocity_m_s == pytest.approx(
            expected_velocity,
            abs=1.0e-11,
        )


def test_inclination_scales_semi_amplitude_by_sine() -> None:
    edge_on = calculate_radial_velocity(_input(inclination_deg=90.0))
    inclined = calculate_radial_velocity(_input(inclination_deg=30.0))

    assert inclined.inclination_projection == pytest.approx(0.5, abs=1.0e-15)
    assert inclined.semi_amplitude_m_s == pytest.approx(
        0.5 * edge_on.semi_amplitude_m_s,
        rel=1.0e-14,
    )
    assert inclined.projected_planet_mass_kg == pytest.approx(0.5 * PLANET_MASS_KG)


def test_face_on_orbit_has_zero_rv_signal() -> None:
    result = calculate_radial_velocity(_input(inclination_deg=0.0))

    assert result.inclination_projection == 0.0
    assert result.semi_amplitude_m_s == 0.0
    assert result.projected_planet_mass_kg == 0.0
    assert result.mass_function_kg == 0.0
    assert result.edge_on_minimum_mass_kg == 0.0
    assert all(point.radial_velocity_m_s == 0.0 for point in result.curve)


def test_eccentric_periastron_and_apoastron_limits() -> None:
    eccentricity = 0.5
    result = calculate_radial_velocity(_input(eccentricity=eccentricity))

    assert result.curve[0].radial_velocity_m_s == pytest.approx(
        result.semi_amplitude_m_s * (1.0 + eccentricity),
        rel=1.0e-13,
    )
    assert result.curve[150].radial_velocity_m_s == pytest.approx(
        result.semi_amplitude_m_s * (-1.0 + eccentricity),
        rel=1.0e-13,
    )


def test_exact_minimum_mass_satisfies_mass_function() -> None:
    result = calculate_radial_velocity(_input(inclination_deg=40.0, eccentricity=0.3))
    minimum_mass = result.edge_on_minimum_mass_kg
    reconstructed = minimum_mass**3 / (STAR_MASS_KG + minimum_mass) ** 2

    assert reconstructed == pytest.approx(result.mass_function_kg, rel=1.0e-14)
    assert minimum_mass <= PLANET_MASS_KG
    assert result.projected_planet_mass_kg < PLANET_MASS_KG


def test_projected_mass_and_exact_minimum_mass_are_distinct_concepts() -> None:
    stellar_mass = 1.0e30
    planet_mass = 9.0e28
    result = calculate_radial_velocity(
        _input(
            stellar_mass_kg=stellar_mass,
            planet_mass_kg=planet_mass,
            inclination_deg=30.0,
        )
    )

    assert result.projected_planet_mass_kg == pytest.approx(0.5 * planet_mass)
    assert result.edge_on_minimum_mass_kg != pytest.approx(
        result.projected_planet_mass_kg,
        rel=1.0e-4,
    )


def test_high_eccentricity_boundary_is_finite() -> None:
    result = calculate_radial_velocity(
        _input(
            eccentricity=0.95,
            stellar_argument_of_periastron_deg=73.0,
            mean_anomaly_at_epoch_deg=11.0,
        )
    )

    assert len(result.curve) == CURVE_POINTS
    assert result.semi_amplitude_m_s > 0.0
    assert all(math.isfinite(point.radial_velocity_m_s) for point in result.curve)


def test_calculation_is_exactly_deterministic() -> None:
    inputs = _input(
        eccentricity=0.67,
        inclination_deg=58.0,
        stellar_argument_of_periastron_deg=123.0,
        mean_anomaly_at_epoch_deg=271.0,
    )
    assert calculate_radial_velocity(inputs) == calculate_radial_velocity(inputs)


def test_curve_time_and_phase_are_bounded_and_monotonic() -> None:
    result = calculate_radial_velocity(_input(eccentricity=0.4))

    assert result.curve[0].time_s == 0.0
    assert result.curve[0].orbital_phase == 0.0
    assert result.curve[-1].time_s == PERIOD_S
    assert result.curve[-1].orbital_phase == 1.0
    assert all(
        left.time_s < right.time_s and left.orbital_phase < right.orbital_phase
        for left, right in zip(result.curve, result.curve[1:], strict=False)
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"stellar_mass_kg": 0.0},
        {"planet_mass_kg": 0.0},
        {"planet_mass_kg": 0.1000001 * STAR_MASS_KG},
        {"orbital_period_s": 3599.0},
        {"eccentricity": -0.01},
        {"eccentricity": 0.951},
        {"inclination_deg": -0.1},
        {"inclination_deg": 90.1},
        {"stellar_argument_of_periastron_deg": 360.0},
        {"mean_anomaly_at_epoch_deg": 360.0},
        {"stellar_mass_kg": float("nan")},
    ],
)
def test_input_domain_rejects_invalid_states(overrides: dict[str, float]) -> None:
    with pytest.raises(RadialVelocityModelError):
        _input(**overrides)


def test_bool_numeric_input_is_rejected() -> None:
    with pytest.raises(RadialVelocityModelError):
        RadialVelocityInput(
            stellar_mass_kg=True,
            planet_mass_kg=PLANET_MASS_KG,
            orbital_period_s=PERIOD_S,
            eccentricity=0.0,
            inclination_deg=90.0,
            stellar_argument_of_periastron_deg=0.0,
            mean_anomaly_at_epoch_deg=0.0,
        )


def test_artifact_validation_rejects_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/radial-velocity-v1.json").read_text())
    artifact["constants"]["CURVE_POINTS"] = 999
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "radial-velocity-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(RadialVelocityModelError):
        load_reviewed_radial_velocity_artifact(repository_root=tmp_path)


def test_reviewed_artifact_is_strict_and_default_is_synthetic() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_radial_velocity_artifact(repository_root=repository_root)

    assert artifact["model_version"] == "radial-velocity-v1"
    definition = artifact["definition"]
    assert isinstance(definition, dict)
    assert "synthetic" in str(definition["default_preset"]).lower()
    sources = artifact["sources"]
    assert isinstance(sources, list)
    assert {source["id"] for source in sources if isinstance(source, dict)} == {
        "murray-correia-2010-keplerian-orbits",
        "wright-gaudi-2013-detection-methods",
        "nist-codata-2022",
    }
