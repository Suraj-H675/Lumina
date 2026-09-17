from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.orbit_sandbox import (
    GRAVITATIONAL_CONSTANT_M3_KG_S2,
    OrbitSandboxInput,
    OrbitSandboxModelError,
    calculate_orbit_sandbox,
    load_reviewed_orbit_artifact,
)

EARTH_MASS_KG = 5.9722e24
EARTH_RADIUS_M = 6_371_000.0
ORBIT_RADIUS_M = 7_000_000.0
MU_EARTH = GRAVITATIONAL_CONSTANT_M3_KG_S2 * EARTH_MASS_KG
CIRCULAR_SPEED_M_S = math.sqrt(MU_EARTH / ORBIT_RADIUS_M)
CIRCULAR_PERIOD_S = 2.0 * math.pi * math.sqrt(ORBIT_RADIUS_M**3 / MU_EARTH)


def _input(**overrides: float) -> OrbitSandboxInput:
    values = {
        "central_mass_kg": EARTH_MASS_KG,
        "central_radius_m": EARTH_RADIUS_M,
        "orbiting_body_mass_kg": 0.0,
        "position_x_m": ORBIT_RADIUS_M,
        "position_y_m": 0.0,
        "velocity_x_m_s": 0.0,
        "velocity_y_m_s": CIRCULAR_SPEED_M_S,
        "duration_s": 5_000.0,
        "time_step_s": 10.0,
    }
    values.update(overrides)
    return OrbitSandboxInput(**values)


def test_circular_orbit_matches_independent_two_body_reference() -> None:
    result = calculate_orbit_sandbox(_input())

    assert result.classification == "bound"
    assert result.eccentricity == pytest.approx(0.0, abs=1e-12)
    assert result.semi_major_axis_m == pytest.approx(ORBIT_RADIUS_M, rel=1e-12)
    assert result.periapsis_m == pytest.approx(ORBIT_RADIUS_M, rel=1e-12)
    assert result.apoapsis_m == pytest.approx(ORBIT_RADIUS_M, rel=1e-12)
    assert result.period_s == pytest.approx(CIRCULAR_PERIOD_S, rel=1e-12)
    assert result.specific_orbital_energy_j_per_kg == pytest.approx(
        -MU_EARTH / (2.0 * ORBIT_RADIUS_M), rel=1e-12
    )
    assert result.max_specific_energy_drift_fraction < 1e-6
    assert result.max_specific_angular_momentum_drift_fraction < 1e-12


def test_known_elliptical_apsides_match_vis_viva_reference() -> None:
    periapsis = 7_000_000.0
    apoapsis = 14_000_000.0
    semi_major = 0.5 * (periapsis + apoapsis)
    eccentricity = (apoapsis - periapsis) / (apoapsis + periapsis)
    periapsis_speed = math.sqrt(MU_EARTH * (2.0 / periapsis - 1.0 / semi_major))

    result = calculate_orbit_sandbox(
        _input(
            position_x_m=periapsis,
            velocity_y_m_s=periapsis_speed,
            duration_s=4_000.0,
            time_step_s=10.0,
        )
    )

    assert result.classification == "bound"
    assert result.eccentricity == pytest.approx(eccentricity, rel=1e-12)
    assert result.semi_major_axis_m == pytest.approx(semi_major, rel=1e-12)
    assert result.periapsis_m == pytest.approx(periapsis, rel=1e-12)
    assert result.apoapsis_m == pytest.approx(apoapsis, rel=1e-12)


def test_escape_velocity_is_explicitly_parabolic_near() -> None:
    escape_speed = math.sqrt(2.0 * MU_EARTH / ORBIT_RADIUS_M)
    result = calculate_orbit_sandbox(_input(velocity_y_m_s=escape_speed, duration_s=1_000.0))

    assert result.classification == "parabolic_near"
    assert result.eccentricity == pytest.approx(1.0, rel=1e-12)
    assert result.semi_major_axis_m is None
    assert result.period_s is None
    assert result.apoapsis_m is None


def test_faster_than_escape_is_classified_as_escape() -> None:
    escape_speed = math.sqrt(2.0 * MU_EARTH / ORBIT_RADIUS_M)
    result = calculate_orbit_sandbox(_input(velocity_y_m_s=escape_speed * 1.05, duration_s=1_000.0))

    assert result.classification == "escape"
    assert result.eccentricity > 1.0
    assert result.semi_major_axis_m is None


def test_radial_infall_detects_central_radius_collision_within_window() -> None:
    result = calculate_orbit_sandbox(
        _input(
            position_x_m=EARTH_RADIUS_M + 100_000.0,
            velocity_y_m_s=0.0,
            velocity_x_m_s=-1_000.0,
            duration_s=400.0,
            time_step_s=1.0,
        )
    )

    assert result.classification == "collision"
    assert result.collision_time_s is not None
    assert 0.0 < result.collision_time_s < 400.0
    assert result.trajectory[-1].distance_m == pytest.approx(EARTH_RADIUS_M, rel=1e-9)


def test_nonzero_secondary_mass_uses_relative_two_body_mu_and_total_invariants() -> None:
    secondary_mass = 1.0e20
    mu = GRAVITATIONAL_CONSTANT_M3_KG_S2 * (EARTH_MASS_KG + secondary_mass)
    speed = math.sqrt(mu / ORBIT_RADIUS_M)
    result = calculate_orbit_sandbox(
        _input(orbiting_body_mass_kg=secondary_mass, velocity_y_m_s=speed)
    )
    reduced_mass = EARTH_MASS_KG * secondary_mass / (EARTH_MASS_KG + secondary_mass)

    assert result.gravitational_parameter_m3_s2 == pytest.approx(mu, rel=1e-15)
    assert result.reduced_mass_kg == pytest.approx(reduced_mass, rel=1e-15)
    assert result.orbital_energy_j == pytest.approx(
        reduced_mass * result.specific_orbital_energy_j_per_kg, rel=1e-15
    )
    assert result.angular_momentum_kg_m2_per_s == pytest.approx(
        reduced_mass * result.specific_angular_momentum_m2_per_s, rel=1e-15
    )


def test_immediate_collision_returns_only_initial_sample() -> None:
    result = calculate_orbit_sandbox(_input(position_x_m=EARTH_RADIUS_M - 1.0))

    assert result.classification == "collision"
    assert result.collision_time_s == 0.0
    assert len(result.trajectory) == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"central_mass_kg": 0.0},
        {"central_radius_m": 0.0},
        {"orbiting_body_mass_kg": EARTH_MASS_KG * 2.0},
        {"position_x_m": 0.0, "position_y_m": 0.0},
        {"velocity_x_m_s": 2.2e6, "velocity_y_m_s": 2.2e6},
        {"duration_s": 50_000.0, "time_step_s": 1.0},
        {"time_step_s": 100.0},
    ],
)
def test_invalid_or_unreviewed_domains_are_rejected(overrides: dict[str, float]) -> None:
    with pytest.raises(OrbitSandboxModelError):
        _input(**overrides)


def test_reviewed_artifact_is_strict_and_default_preset_is_circular() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_orbit_artifact(repository_root=repository_root)

    assert artifact["model_version"] == "orbit-sandbox-v1"
    sources = artifact["sources"]
    assert isinstance(sources, list)
    source_ids: set[str] = set()
    for source in sources:
        assert isinstance(source, dict)
        source_id = source.get("id")
        assert isinstance(source_id, str)
        source_ids.add(source_id)
    assert source_ids == {
        "nist-codata-2022",
        "nasa-earth-fact-sheet",
        "openstax-gravitation-orbits",
    }


def test_reviewed_artifact_rejects_mutated_constants(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/orbit-sandbox-v1.json").read_text())
    artifact["constants"]["GRAVITATIONAL_CONSTANT_M3_KG_S2"] = 6.7e-11
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "orbit-sandbox-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(OrbitSandboxModelError):
        load_reviewed_orbit_artifact(repository_root=tmp_path)
