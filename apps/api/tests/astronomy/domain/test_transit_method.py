from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.transit_method import (
    LIGHT_CURVE_POINTS,
    TransitMethodInput,
    TransitMethodModelError,
    calculate_transit_method,
    load_reviewed_transit_artifact,
)

STAR_RADIUS_M = 1.0e9
PLANET_RADIUS_M = 1.0e8
SEMI_MAJOR_AXIS_M = 1.0e10
PERIOD_S = 259_200.0


def _input(**overrides: float) -> TransitMethodInput:
    values = {
        "stellar_radius_m": STAR_RADIUS_M,
        "planet_radius_m": PLANET_RADIUS_M,
        "semi_major_axis_m": SEMI_MAJOR_AXIS_M,
        "orbital_period_s": PERIOD_S,
        "inclination_deg": 90.0,
    }
    values.update(overrides)
    return TransitMethodInput(**values)


def test_central_full_transit_has_expected_depth_and_midpoint() -> None:
    result = calculate_transit_method(_input())

    assert result.classification == "full"
    assert result.impact_parameter == pytest.approx(0.0, abs=1e-14)
    assert result.radius_ratio == pytest.approx(0.1)
    assert result.maximum_depth_fraction == pytest.approx(0.01, abs=1e-15)
    assert result.maximum_depth_ppm == pytest.approx(10_000.0)
    assert result.central_depth_approximation_fraction == pytest.approx(0.01)
    assert result.total_duration_s is not None
    assert result.full_duration_s is not None
    assert len(result.light_curve) == LIGHT_CURVE_POINTS
    midpoint = result.light_curve[LIGHT_CURVE_POINTS // 2]
    assert midpoint.time_from_mid_transit_s == 0.0
    assert midpoint.projected_separation_stellar_radii == pytest.approx(0.0, abs=1e-14)
    assert midpoint.relative_flux == pytest.approx(0.99, abs=1e-15)


def test_circular_contact_duration_matches_winn_equation_14() -> None:
    result = calculate_transit_method(_input())
    expected_total = PERIOD_S / math.pi * math.asin(0.1 * 1.1)
    expected_full = PERIOD_S / math.pi * math.asin(0.1 * 0.9)

    assert result.total_duration_s == pytest.approx(expected_total, rel=1e-14)
    assert result.full_duration_s == pytest.approx(expected_full, rel=1e-14)


def test_grazing_transit_has_partial_depth_and_no_full_duration() -> None:
    desired_impact = 0.95
    inclination = math.degrees(math.acos(desired_impact / 10.0))
    result = calculate_transit_method(_input(inclination_deg=inclination))

    assert result.classification == "grazing"
    assert result.impact_parameter == pytest.approx(desired_impact, rel=1e-14)
    assert 0.0 < result.maximum_depth_fraction < 0.01
    assert result.total_duration_s is not None
    assert result.full_duration_s is None


def test_no_transit_is_flat_and_has_no_contact_duration() -> None:
    result = calculate_transit_method(_input(inclination_deg=80.0))

    assert result.classification == "no_transit"
    assert result.impact_parameter > 1.1
    assert result.maximum_depth_fraction == 0.0
    assert result.maximum_depth_ppm == 0.0
    assert result.total_duration_s is None
    assert result.full_duration_s is None
    assert len(result.light_curve) == LIGHT_CURVE_POINTS
    assert all(point.relative_flux == 1.0 for point in result.light_curve)


def test_uniform_source_curve_hits_first_and_fourth_contact() -> None:
    result = calculate_transit_method(_input())
    assert result.total_duration_s is not None

    first_contact = result.light_curve[75]
    fourth_contact = result.light_curve[225]
    assert first_contact.time_from_mid_transit_s == pytest.approx(-result.total_duration_s / 2.0)
    assert fourth_contact.time_from_mid_transit_s == pytest.approx(result.total_duration_s / 2.0)
    assert first_contact.projected_separation_stellar_radii == pytest.approx(1.1, rel=1e-13)
    assert fourth_contact.projected_separation_stellar_radii == pytest.approx(1.1, rel=1e-13)
    assert first_contact.relative_flux == pytest.approx(1.0, abs=1e-14)
    assert fourth_contact.relative_flux == pytest.approx(1.0, abs=1e-14)


def test_light_curve_is_time_symmetric_for_circular_orbit() -> None:
    result = calculate_transit_method(_input(inclination_deg=87.0))
    for left, right in zip(result.light_curve, reversed(result.light_curve), strict=True):
        assert left.time_from_mid_transit_s == pytest.approx(-right.time_from_mid_transit_s)
        assert left.relative_flux == pytest.approx(right.relative_flux, abs=1e-14)
        assert left.projected_separation_stellar_radii == pytest.approx(
            right.projected_separation_stellar_radii,
            abs=1e-14,
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"stellar_radius_m": 0.0},
        {"planet_radius_m": 0.0},
        {"planet_radius_m": STAR_RADIUS_M},
        {"semi_major_axis_m": STAR_RADIUS_M + PLANET_RADIUS_M},
        {"orbital_period_s": 0.0},
        {"inclination_deg": -0.1},
        {"inclination_deg": 90.1},
        {"stellar_radius_m": float("nan")},
    ],
)
def test_invalid_domains_are_rejected(overrides: dict[str, float]) -> None:
    with pytest.raises(TransitMethodModelError):
        _input(**overrides)


def test_reviewed_artifact_is_strict_and_default_preset_is_synthetic() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_transit_artifact(repository_root=repository_root)

    assert artifact["model_version"] == "transit-method-v1"
    sources = artifact["sources"]
    assert isinstance(sources, list)
    source_ids: set[str] = set()
    for source in sources:
        assert isinstance(source, dict)
        source_id = source.get("id")
        assert isinstance(source_id, str)
        source_ids.add(source_id)
    assert source_ids == {
        "winn-2010-transits-occultations",
        "mandel-agol-2002-analytic-lightcurves",
    }


def test_reviewed_artifact_rejects_mutated_constants(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/transit-method-v1.json").read_text())
    artifact["constants"]["LIGHT_CURVE_POINTS"] = 999
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "transit-method-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(TransitMethodModelError):
        load_reviewed_transit_artifact(repository_root=tmp_path)
