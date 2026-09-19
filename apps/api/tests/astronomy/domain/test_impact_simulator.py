from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.impact_simulator import (
    CRYSTALLINE_ROCK_DENSITY_KG_M3,
    EJECTA_THICKNESS_THRESHOLDS_M,
    MAX_DIAMETER_M,
    MAX_EJECTA_MODEL_RADIUS_M,
    MAX_IMPACT_ANGLE_DEG,
    MAX_IMPACTOR_DENSITY_KG_M3,
    MAX_SPEED_KM_S,
    MIN_DIAMETER_M,
    MIN_IMPACT_ANGLE_DEG,
    MIN_IMPACTOR_DENSITY_KG_M3,
    MIN_SPEED_KM_S,
    SEDIMENTARY_ROCK_DENSITY_KG_M3,
    TNT_MEGATON_J,
    TRANSIENT_CRATER_COEFFICIENT_BEST,
    TRANSIENT_CRATER_COEFFICIENT_HIGH,
    TRANSIENT_CRATER_COEFFICIENT_LOW,
    ImpactSimulatorInput,
    ImpactSimulatorModelError,
    calculate_impact_simulator,
    load_reviewed_impact_simulator_artifact,
)


def _input(
    *,
    diameter_m: float = 1_500.0,
    impactor_density_kg_m3: float = 3_000.0,
    speed_km_s: float = 17.0,
    impact_angle_deg: float = 45.0,
    target_material: str = "sedimentary_rock",
) -> ImpactSimulatorInput:
    return ImpactSimulatorInput(
        diameter_m=diameter_m,
        impactor_density_kg_m3=impactor_density_kg_m3,
        speed_km_s=speed_km_s,
        impact_angle_deg=impact_angle_deg,
        target_material=target_material,  # type: ignore[arg-type]
    )


def test_source_rounded_validation_case_matches_author_calculator() -> None:
    result = calculate_impact_simulator(
        _input(
            impactor_density_kg_m3=1_500.0,
            target_material="crystalline_rock",
        )
    )
    assert result.kinetic_energy_j == pytest.approx(3.83028866811893e20, rel=0, abs=1e6)
    assert result.kinetic_energy_j / 1e20 == pytest.approx(3.83, rel=0.01)
    assert result.best_estimate_crater.transient_diameter_m / 1_000.0 == pytest.approx(
        11.1,
        abs=0.1,
    )
    assert result.best_estimate_crater.final_diameter_m / 1_000.0 == pytest.approx(
        15.3,
        abs=0.1,
    )


def test_spherical_mass_and_kinetic_energy_are_exactly_the_reviewed_equations() -> None:
    inputs = _input()
    result = calculate_impact_simulator(inputs)
    expected_mass = math.pi / 6.0 * inputs.impactor_density_kg_m3 * inputs.diameter_m**3
    expected_energy = 0.5 * expected_mass * (inputs.speed_km_s * 1_000.0) ** 2
    assert result.impactor_mass_kg == pytest.approx(expected_mass, rel=0, abs=1e-6)
    assert result.kinetic_energy_j == pytest.approx(expected_energy, rel=0, abs=1e6)
    assert result.tnt_equivalent_megatons == pytest.approx(
        expected_energy / TNT_MEGATON_J,
        rel=0,
        abs=1e-9,
    )


def test_default_best_crater_matches_independent_known_values() -> None:
    result = calculate_impact_simulator(_input())
    assert result.target_density_kg_m3 == SEDIMENTARY_ROCK_DENSITY_KG_M3
    assert result.best_estimate_crater.scaling_coefficient == TRANSIENT_CRATER_COEFFICIENT_BEST
    assert result.best_estimate_crater.transient_diameter_m == pytest.approx(
        14_508.944797012044,
        rel=0,
        abs=1e-8,
    )
    assert result.best_estimate_crater.final_diameter_m == pytest.approx(
        20_661.64286713185,
        rel=0,
        abs=1e-8,
    )
    assert result.best_estimate_crater.classification == "complex"


def test_coefficient_sensitivity_uses_exact_published_coefficients_and_is_ordered() -> None:
    result = calculate_impact_simulator(_input())
    low, best, high = result.coefficient_sensitivity
    assert [row.scaling_coefficient for row in result.coefficient_sensitivity] == [
        TRANSIENT_CRATER_COEFFICIENT_LOW,
        TRANSIENT_CRATER_COEFFICIENT_BEST,
        TRANSIENT_CRATER_COEFFICIENT_HIGH,
    ]
    assert low.transient_diameter_m < best.transient_diameter_m < high.transient_diameter_m
    assert low.final_diameter_m < best.final_diameter_m < high.final_diameter_m
    assert "not a complete statistical confidence interval" in result.uncertainty_note


def test_target_material_is_a_closed_density_preset() -> None:
    sedimentary = calculate_impact_simulator(_input(target_material="sedimentary_rock"))
    crystalline = calculate_impact_simulator(_input(target_material="crystalline_rock"))
    assert sedimentary.target_density_kg_m3 == SEDIMENTARY_ROCK_DENSITY_KG_M3
    assert crystalline.target_density_kg_m3 == CRYSTALLINE_ROCK_DENSITY_KG_M3
    assert (
        sedimentary.best_estimate_crater.transient_diameter_m
        > crystalline.best_estimate_crater.transient_diameter_m
    )


def test_ejecta_thresholds_are_fixed_lower_bound_radii_outside_final_crater() -> None:
    result = calculate_impact_simulator(_input())
    rows = result.ejecta_thickness_radii
    assert tuple(row.thickness_m for row in rows) == EJECTA_THICKNESS_THRESHOLDS_M
    assert all(row.radius_m > result.best_estimate_crater.final_diameter_m / 2.0 for row in rows)
    assert all(row.radius_m <= MAX_EJECTA_MODEL_RADIUS_M for row in rows)
    assert [row.radius_m for row in rows] == sorted(row.radius_m for row in rows)
    for row in rows:
        recovered_thickness = result.best_estimate_crater.transient_diameter_m**4 / (
            112.0 * row.radius_m**3
        )
        assert recovered_thickness == pytest.approx(row.thickness_m, rel=0, abs=1e-12)
    assert "lower-bound deposit estimates" in result.model_note


def test_lower_domain_corner_remains_complex_for_low_coefficient_and_ejecta_valid() -> None:
    result = calculate_impact_simulator(
        _input(
            diameter_m=MIN_DIAMETER_M,
            impactor_density_kg_m3=MIN_IMPACTOR_DENSITY_KG_M3,
            speed_km_s=MIN_SPEED_KM_S,
            impact_angle_deg=MIN_IMPACT_ANGLE_DEG,
            target_material="crystalline_rock",
        )
    )
    assert result.coefficient_sensitivity[0].transient_diameter_m > 2_560.0
    assert all(
        row.radius_m > result.best_estimate_crater.final_diameter_m / 2
        for row in result.ejecta_thickness_radii
    )


def test_upper_domain_corner_remains_finite_and_inside_ejecta_range() -> None:
    result = calculate_impact_simulator(
        _input(
            diameter_m=MAX_DIAMETER_M,
            impactor_density_kg_m3=MAX_IMPACTOR_DENSITY_KG_M3,
            speed_km_s=MAX_SPEED_KM_S,
            impact_angle_deg=MAX_IMPACT_ANGLE_DEG,
        )
    )
    numeric = [
        result.impactor_mass_kg,
        result.kinetic_energy_j,
        result.tnt_equivalent_megatons,
        result.best_estimate_crater.transient_diameter_m,
        result.best_estimate_crater.final_diameter_m,
        *(row.radius_m for row in result.ejecta_thickness_radii),
    ]
    assert all(math.isfinite(value) and value > 0 for value in numeric)
    assert max(row.radius_m for row in result.ejecta_thickness_radii) < MAX_EJECTA_MODEL_RADIUS_M


def test_result_is_exactly_deterministic() -> None:
    inputs = _input()
    assert calculate_impact_simulator(inputs) == calculate_impact_simulator(inputs)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("diameter_m", 1_499.99),
        ("diameter_m", 20_000.01),
        ("impactor_density_kg_m3", 499.99),
        ("impactor_density_kg_m3", 8_000.01),
        ("speed_km_s", 10.99),
        ("speed_km_s", 72.01),
        ("impact_angle_deg", 14.99),
        ("impact_angle_deg", 90.01),
        ("diameter_m", float("nan")),
        ("impactor_density_kg_m3", float("inf")),
        ("speed_km_s", True),
        ("impact_angle_deg", True),
        ("target_material", "water"),
    ],
)
def test_input_domain_rejects_invalid_states(field: str, value: object) -> None:
    kwargs: dict[str, object] = {
        "diameter_m": 1_500.0,
        "impactor_density_kg_m3": 3_000.0,
        "speed_km_s": 17.0,
        "impact_angle_deg": 45.0,
        "target_material": "sedimentary_rock",
    }
    kwargs[field] = value
    with pytest.raises(ImpactSimulatorModelError):
        ImpactSimulatorInput(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize("value", [None, "1500", [], {}, object()])
def test_numeric_input_types_are_strict(value: object) -> None:
    with pytest.raises(ImpactSimulatorModelError):
        ImpactSimulatorInput(
            diameter_m=value,  # type: ignore[arg-type]
            impactor_density_kg_m3=3_000.0,
            speed_km_s=17.0,
            impact_angle_deg=45.0,
            target_material="sedimentary_rock",
        )


def test_calculation_requires_validated_input_type() -> None:
    with pytest.raises(ImpactSimulatorModelError):
        calculate_impact_simulator(object())  # type: ignore[arg-type]


def test_reviewed_artifact_is_strict_and_matches_contract() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_impact_simulator_artifact(repository_root=repository_root)
    assert artifact["model_version"] == "impact-simulator-v1"
    constants = artifact["constants"]
    assert isinstance(constants, dict)
    assert constants["TRANSIENT_CRATER_COEFFICIENT_BEST"] == 1.161
    assert constants["MAX_EJECTA_MODEL_RADIUS_M"] == 10_000_000.0


@pytest.mark.parametrize(
    ("section", "key", "value"),
    [
        ("constants", "TRANSIENT_CRATER_COEFFICIENT_BEST", 1.16),
        ("constants", "MAX_DIAMETER_M", 20_001.0),
    ],
)
def test_reviewed_artifact_rejects_constant_mutation(
    tmp_path: Path,
    section: str,
    key: str,
    value: object,
) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/impact-simulator-v1.json").read_text())
    artifact[section][key] = value
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "impact-simulator-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(ImpactSimulatorModelError):
        load_reviewed_impact_simulator_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_source_or_preset_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/impact-simulator-v1.json").read_text())
    artifact["sources"][0]["url"] = "https://example.com/not-reviewed"
    artifact["preset"]["target_material"] = "water"
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "impact-simulator-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(ImpactSimulatorModelError):
        load_reviewed_impact_simulator_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_duplicate_json_keys(tmp_path: Path) -> None:
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "impact-simulator-v1.json").write_text('{"artifact_version":1,"artifact_version":1}')
    with pytest.raises(ImpactSimulatorModelError):
        load_reviewed_impact_simulator_artifact(repository_root=tmp_path)
