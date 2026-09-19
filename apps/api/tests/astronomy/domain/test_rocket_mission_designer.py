from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.rocket_mission_designer import (
    EARTH_200_MILE_ORBIT_REFERENCE_M_S,
    EARTH_EQUATORIAL_ESCAPE_SPEED_M_S,
    EARTH_SURFACE_GRAVITY_M_S2,
    MARS_EQUATORIAL_ESCAPE_SPEED_M_S,
    MARS_SURFACE_GRAVITY_M_S2,
    STANDARD_GRAVITY_M_S2,
    RocketMissionDesignerInput,
    RocketMissionDesignerModelError,
    RocketStageInput,
    calculate_rocket_mission_designer,
    load_reviewed_rocket_mission_designer_artifact,
)


def _stage(
    *,
    dry_mass_kg: float = 30_000.0,
    propellant_mass_kg: float = 400_000.0,
    specific_impulse_s: float = 300.0,
    thrust_n: float = 7_000_000.0,
) -> RocketStageInput:
    return RocketStageInput(
        dry_mass_kg=dry_mass_kg,
        propellant_mass_kg=propellant_mass_kg,
        specific_impulse_s=specific_impulse_s,
        thrust_n=thrust_n,
    )


def _input(
    *,
    gravity_body: str = "earth",
    delta_v_reference_id: str = "earth_200_mile_orbit_example",
    payload_mass_kg: float = 5_000.0,
    stages: tuple[RocketStageInput, ...] | None = None,
) -> RocketMissionDesignerInput:
    return RocketMissionDesignerInput(
        gravity_body=gravity_body,  # type: ignore[arg-type]
        delta_v_reference_id=delta_v_reference_id,  # type: ignore[arg-type]
        payload_mass_kg=payload_mass_kg,
        stages=stages
        if stages is not None
        else (
            _stage(),
            _stage(
                dry_mass_kg=8_000.0,
                propellant_mass_kg=40_000.0,
                specific_impulse_s=350.0,
                thrust_n=1_000_000.0,
            ),
        ),
    )


def test_single_stage_matches_ideal_rocket_equation() -> None:
    stage = _stage(
        dry_mass_kg=1_000.0,
        propellant_mass_kg=4_000.0,
        specific_impulse_s=300.0,
        thrust_n=100_000.0,
    )
    result = calculate_rocket_mission_designer(_input(payload_mass_kg=1_000.0, stages=(stage,)))
    expected = 300.0 * STANDARD_GRAVITY_M_S2 * math.log(6_000.0 / 2_000.0)
    assert result.stages[0].ideal_delta_v_m_s == pytest.approx(expected, rel=0, abs=1e-12)
    assert result.total_ideal_delta_v_m_s == pytest.approx(expected, rel=0, abs=1e-12)


def test_two_stage_bookkeeping_jettisons_only_spent_stage_dry_mass() -> None:
    first = _stage(
        dry_mass_kg=100.0,
        propellant_mass_kg=400.0,
        specific_impulse_s=250.0,
        thrust_n=20_000.0,
    )
    second = _stage(
        dry_mass_kg=50.0,
        propellant_mass_kg=150.0,
        specific_impulse_s=300.0,
        thrust_n=8_000.0,
    )
    result = calculate_rocket_mission_designer(_input(payload_mass_kg=50.0, stages=(first, second)))
    assert result.stages[0].ignition_mass_kg == 750.0
    assert result.stages[0].burnout_before_jettison_mass_kg == 350.0
    assert result.stages[1].ignition_mass_kg == 250.0
    assert result.stages[1].burnout_before_jettison_mass_kg == 100.0
    expected = 250.0 * STANDARD_GRAVITY_M_S2 * math.log(
        750.0 / 350.0
    ) + 300.0 * STANDARD_GRAVITY_M_S2 * math.log(250.0 / 100.0)
    assert result.total_ideal_delta_v_m_s == pytest.approx(expected, rel=0, abs=1e-12)


def test_specific_impulse_always_uses_standard_gravity_not_selected_body() -> None:
    stage = _stage(
        dry_mass_kg=1_000.0,
        propellant_mass_kg=4_000.0,
        specific_impulse_s=300.0,
        thrust_n=100_000.0,
    )
    earth = calculate_rocket_mission_designer(
        _input(gravity_body="earth", payload_mass_kg=1_000.0, stages=(stage,))
    )
    mars = calculate_rocket_mission_designer(
        _input(gravity_body="mars", payload_mass_kg=1_000.0, stages=(stage,))
    )
    assert earth.total_ideal_delta_v_m_s == mars.total_ideal_delta_v_m_s
    assert earth.stages[0].effective_exhaust_velocity_m_s == pytest.approx(
        300.0 * STANDARD_GRAVITY_M_S2
    )


def test_surface_gravity_changes_twr_reference_only() -> None:
    stage = _stage(
        dry_mass_kg=1_000.0,
        propellant_mass_kg=4_000.0,
        thrust_n=120_000.0,
    )
    earth = calculate_rocket_mission_designer(
        _input(gravity_body="earth", payload_mass_kg=1_000.0, stages=(stage,))
    )
    mars = calculate_rocket_mission_designer(
        _input(gravity_body="mars", payload_mass_kg=1_000.0, stages=(stage,))
    )
    assert earth.selected_surface_gravity_m_s2 == EARTH_SURFACE_GRAVITY_M_S2
    assert mars.selected_surface_gravity_m_s2 == MARS_SURFACE_GRAVITY_M_S2
    assert earth.stages[0].surface_gravity_thrust_to_weight == pytest.approx(
        120_000.0 / (6_000.0 * EARTH_SURFACE_GRAVITY_M_S2)
    )
    assert mars.stages[0].surface_gravity_thrust_to_weight == pytest.approx(
        120_000.0 / (6_000.0 * MARS_SURFACE_GRAVITY_M_S2)
    )
    assert mars.stages[0].surface_gravity_thrust_to_weight > (
        earth.stages[0].surface_gravity_thrust_to_weight
    )


def test_mass_fractions_close_exact_vehicle_partition() -> None:
    result = calculate_rocket_mission_designer(_input())
    fractions = result.mass_fractions
    assert fractions.launch_mass_kg == 483_000.0
    assert fractions.total_stage_dry_mass_kg == 38_000.0
    assert fractions.total_propellant_mass_kg == 440_000.0
    assert fractions.payload_mass_kg == 5_000.0
    assert (
        fractions.stage_dry_fraction_of_launch_mass
        + fractions.propellant_fraction_of_launch_mass
        + fractions.payload_fraction_of_launch_mass
    ) == pytest.approx(1.0, rel=0, abs=1e-15)
    for stage in result.stages:
        assert stage.stage_dry_fraction + stage.stage_propellant_fraction == pytest.approx(
            1.0,
            rel=0,
            abs=1e-15,
        )


def test_payload_tradeoff_is_fixed_and_monotonically_reduces_ideal_delta_v() -> None:
    result = calculate_rocket_mission_designer(_input())
    assert [point.payload_multiplier for point in result.payload_tradeoff] == [
        0.0,
        0.5,
        1.0,
        1.5,
        2.0,
    ]
    assert result.payload_tradeoff[2].total_ideal_delta_v_m_s == pytest.approx(
        result.total_ideal_delta_v_m_s,
        rel=0,
        abs=1e-12,
    )
    delta_vs = [point.total_ideal_delta_v_m_s for point in result.payload_tradeoff]
    assert delta_vs == sorted(delta_vs, reverse=True)
    assert len(set(delta_vs)) == len(delta_vs)


@pytest.mark.parametrize(
    ("reference_id", "expected"),
    [
        ("earth_200_mile_orbit_example", EARTH_200_MILE_ORBIT_REFERENCE_M_S),
        ("earth_equatorial_escape_speed", EARTH_EQUATORIAL_ESCAPE_SPEED_M_S),
        ("mars_equatorial_escape_speed", MARS_EQUATORIAL_ESCAPE_SPEED_M_S),
    ],
)
def test_reference_comparison_uses_reviewed_fixed_values(
    reference_id: str,
    expected: float,
) -> None:
    result = calculate_rocket_mission_designer(_input(delta_v_reference_id=reference_id))
    comparison = result.reference_comparison
    assert comparison.reference_value_m_s == expected
    assert comparison.ideal_delta_v_difference_m_s == pytest.approx(
        result.total_ideal_delta_v_m_s - expected
    )
    assert "not a mission delta-v requirement" in comparison.interpretation
    assert "feasibility" in comparison.interpretation


def test_result_is_exactly_deterministic() -> None:
    inputs = _input()
    assert calculate_rocket_mission_designer(inputs) == calculate_rocket_mission_designer(inputs)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("dry_mass_kg", 0.99),
        ("dry_mass_kg", 2_000_001.0),
        ("propellant_mass_kg", 0.99),
        ("propellant_mass_kg", 5_000_001.0),
        ("specific_impulse_s", 49.99),
        ("specific_impulse_s", 500.01),
        ("thrust_n", 999.0),
        ("thrust_n", 100_000_001.0),
        ("dry_mass_kg", float("nan")),
        ("propellant_mass_kg", float("inf")),
        ("specific_impulse_s", True),
        ("thrust_n", True),
    ],
)
def test_stage_numeric_domain_rejects_invalid_states(field: str, value: object) -> None:
    kwargs: dict[str, object] = {
        "dry_mass_kg": 100.0,
        "propellant_mass_kg": 400.0,
        "specific_impulse_s": 300.0,
        "thrust_n": 20_000.0,
    }
    kwargs[field] = value
    with pytest.raises(RocketMissionDesignerModelError):
        RocketStageInput(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("payload_mass_kg", 0.99),
        ("payload_mass_kg", 300_001.0),
        ("payload_mass_kg", float("nan")),
        ("payload_mass_kg", True),
        ("gravity_body", "venus"),
        ("delta_v_reference_id", "custom"),
    ],
)
def test_input_domain_rejects_invalid_states(field: str, value: object) -> None:
    kwargs: dict[str, object] = {
        "gravity_body": "earth",
        "delta_v_reference_id": "earth_200_mile_orbit_example",
        "payload_mass_kg": 5_000.0,
        "stages": (_stage(),),
    }
    kwargs[field] = value
    with pytest.raises(RocketMissionDesignerModelError):
        RocketMissionDesignerInput(**kwargs)  # type: ignore[arg-type]


def test_stage_container_and_count_are_strict() -> None:
    with pytest.raises(RocketMissionDesignerModelError):
        _input(stages=())
    with pytest.raises(RocketMissionDesignerModelError):
        _input(stages=tuple(_stage() for _ in range(5)))
    with pytest.raises(RocketMissionDesignerModelError):
        RocketMissionDesignerInput(
            gravity_body="earth",
            delta_v_reference_id="earth_200_mile_orbit_example",
            payload_mass_kg=5_000.0,
            stages=[_stage()],  # type: ignore[arg-type]
        )


def test_total_submitted_launch_mass_guard_fails_closed() -> None:
    huge = _stage(
        dry_mass_kg=2_000_000.0,
        propellant_mass_kg=5_000_000.0,
        thrust_n=100_000_000.0,
        specific_impulse_s=500.0,
    )
    with pytest.raises(RocketMissionDesignerModelError):
        _input(payload_mass_kg=300_000.0, stages=(huge, huge))


def test_reviewed_artifact_is_strict() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_rocket_mission_designer_artifact(repository_root=repository_root)
    assert artifact["model_version"] == "rocket-mission-designer-v1"
    constants = artifact["constants"]
    assert isinstance(constants, dict)
    assert constants["STANDARD_GRAVITY_M_S2"] == 9.80665


def test_reviewed_artifact_rejects_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads(
        (repository_root / "data/seed/rocket-mission-designer-v1.json").read_text()
    )
    artifact["constants"]["STANDARD_GRAVITY_M_S2"] = 9.8
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "rocket-mission-designer-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(RocketMissionDesignerModelError):
        load_reviewed_rocket_mission_designer_artifact(repository_root=tmp_path)
