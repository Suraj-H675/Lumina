from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.planetary_system_builder import (
    ASTRONOMICAL_UNIT_M,
    NOMINAL_EARTH_MASS_PARAMETER_M3_S2,
    NOMINAL_SOLAR_MASS_PARAMETER_M3_S2,
    PAIRWISE_HILL_REFERENCE_THRESHOLD,
    PlanetarySystemBuilderInput,
    PlanetarySystemBuilderModelError,
    PlanetarySystemPlanetInput,
    calculate_planetary_system_builder,
    load_reviewed_planetary_system_builder_artifact,
)


def _planet(mass_mearth: float, semi_major_axis_au: float) -> PlanetarySystemPlanetInput:
    return PlanetarySystemPlanetInput(
        mass_mearth=mass_mearth,
        semi_major_axis_au=semi_major_axis_au,
    )


def _input(
    *,
    stellar_mass_msun: float = 1.0,
    stellar_luminosity_lsun: float = 1.0,
    stellar_effective_temperature_k: float = 5780.0,
    planets: tuple[PlanetarySystemPlanetInput, ...] | None = None,
) -> PlanetarySystemBuilderInput:
    return PlanetarySystemBuilderInput(
        stellar_mass_msun=stellar_mass_msun,
        stellar_luminosity_lsun=stellar_luminosity_lsun,
        stellar_effective_temperature_k=stellar_effective_temperature_k,
        planets=planets
        if planets is not None
        else (
            _planet(1.0, 0.7),
            _planet(1.0, 1.0),
            _planet(1.0, 2.0),
        ),
    )


def test_solar_reference_habitable_zone_matches_reviewed_coefficients() -> None:
    result = calculate_planetary_system_builder(_input())
    assert result.habitable_zone.inner_effective_flux == pytest.approx(1.107, rel=0, abs=1e-15)
    assert result.habitable_zone.outer_effective_flux == pytest.approx(0.356, rel=0, abs=1e-15)
    assert result.habitable_zone.inner_edge_au == pytest.approx(
        0.950443247520335,
        rel=0,
        abs=1e-15,
    )
    assert result.habitable_zone.outer_edge_au == pytest.approx(
        1.6760038078849773,
        rel=0,
        abs=1e-15,
    )
    assert "does not establish habitability" in result.habitable_zone.habitability_note


def test_nominal_earth_orbit_period_uses_two_body_mass_sum() -> None:
    result = calculate_planetary_system_builder(_input(planets=(_planet(1.0, 1.0),)))
    expected_s = (
        2.0
        * math.pi
        * math.sqrt(
            ASTRONOMICAL_UNIT_M**3
            / (NOMINAL_SOLAR_MASS_PARAMETER_M3_S2 + NOMINAL_EARTH_MASS_PARAMETER_M3_S2)
        )
    )
    assert result.planets[0].orbital_period_s == pytest.approx(expected_s, rel=0, abs=1e-9)
    assert result.planets[0].orbital_period_days == pytest.approx(
        365.25634986267556,
        rel=0,
        abs=1e-12,
    )


@pytest.mark.parametrize("temperature_k", [2600.0, 7200.0])
def test_habitable_zone_source_temperature_boundaries_are_finite(
    temperature_k: float,
) -> None:
    result = calculate_planetary_system_builder(
        _input(stellar_effective_temperature_k=temperature_k)
    )
    assert math.isfinite(result.habitable_zone.inner_edge_au)
    assert math.isfinite(result.habitable_zone.outer_edge_au)
    assert 0.0 < result.habitable_zone.inner_edge_au < result.habitable_zone.outer_edge_au


def test_planets_are_classified_relative_to_reference_habitable_zone() -> None:
    result = calculate_planetary_system_builder(_input())
    assert [planet.habitable_zone_relation for planet in result.planets] == [
        "interior_to_reference_hz",
        "inside_reference_hz",
        "exterior_to_reference_hz",
    ]


def test_mutual_hill_spacing_matches_reviewed_equation() -> None:
    inputs = _input(planets=(_planet(1.0, 1.0), _planet(2.0, 1.5)))
    result = calculate_planetary_system_builder(inputs)
    pair = result.adjacent_pairs[0]
    expected_hill = (
        3.0 * NOMINAL_EARTH_MASS_PARAMETER_M3_S2 / (3.0 * NOMINAL_SOLAR_MASS_PARAMETER_M3_S2)
    ) ** (1.0 / 3.0) * 1.25
    expected_delta = 0.5 / expected_hill
    assert pair.mutual_hill_radius_au == pytest.approx(expected_hill, rel=0, abs=1e-15)
    assert pair.separation_mutual_hill == pytest.approx(expected_delta, rel=0, abs=1e-12)
    assert pair.pairwise_reference_threshold == pytest.approx(
        PAIRWISE_HILL_REFERENCE_THRESHOLD,
        rel=0,
        abs=1e-15,
    )


def test_close_pair_emits_warning_without_stability_verdict() -> None:
    result = calculate_planetary_system_builder(
        _input(planets=(_planet(1.0, 1.0), _planet(1.0, 1.03)))
    )
    pair = result.adjacent_pairs[0]
    assert pair.separation_mutual_hill < PAIRWISE_HILL_REFERENCE_THRESHOLD
    assert pair.spacing_assessment == "pairwise_close_warning"
    assert "Further dynamical analysis is required" in pair.interpretation
    assert "no long-term multi-planet stability claim" in result.stability_note


def test_wide_pair_emits_no_warning_but_preserves_caveat() -> None:
    result = calculate_planetary_system_builder(
        _input(planets=(_planet(1.0, 1.0), _planet(1.0, 2.0)))
    )
    pair = result.adjacent_pairs[0]
    assert pair.separation_mutual_hill > PAIRWISE_HILL_REFERENCE_THRESHOLD
    assert pair.spacing_assessment == "no_pairwise_hill_warning"
    assert "not a long-term or whole-system stability guarantee" in pair.interpretation


def test_single_planet_has_no_adjacent_pair_diagnostic() -> None:
    result = calculate_planetary_system_builder(_input(planets=(_planet(10.0, 1.0),)))
    assert result.adjacent_pairs == ()


@pytest.mark.parametrize(
    "planets",
    [
        (_planet(1.0, 1.0), _planet(1.0, 1.0)),
        (_planet(1.0, 2.0), _planet(1.0, 1.0)),
    ],
)
def test_semimajor_axes_must_be_strictly_increasing(
    planets: tuple[PlanetarySystemPlanetInput, ...],
) -> None:
    with pytest.raises(PlanetarySystemBuilderModelError):
        _input(planets=planets)


def test_calculation_is_exactly_deterministic() -> None:
    inputs = _input()
    assert calculate_planetary_system_builder(inputs) == calculate_planetary_system_builder(inputs)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("stellar_mass_msun", 0.099),
        ("stellar_mass_msun", 2.001),
        ("stellar_mass_msun", float("nan")),
        ("stellar_mass_msun", True),
        ("stellar_luminosity_lsun", 0.0009),
        ("stellar_luminosity_lsun", 20.01),
        ("stellar_effective_temperature_k", 2599.0),
        ("stellar_effective_temperature_k", 7201.0),
    ],
)
def test_input_domain_rejects_invalid_states(field: str, value: object) -> None:
    kwargs: dict[str, object] = {
        "stellar_mass_msun": 1.0,
        "stellar_luminosity_lsun": 1.0,
        "stellar_effective_temperature_k": 5780.0,
        "planets": (_planet(1.0, 1.0),),
    }
    kwargs[field] = value
    with pytest.raises(PlanetarySystemBuilderModelError):
        PlanetarySystemBuilderInput(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("mass", "axis"),
    [
        (0.009, 1.0),
        (320.1, 1.0),
        (1.0, 0.009),
        (1.0, 20.01),
        (float("inf"), 1.0),
        (1.0, float("nan")),
        (True, 1.0),
        (1.0, True),
    ],
)
def test_planet_input_domain_rejects_invalid_states(
    mass: float | bool,
    axis: float | bool,
) -> None:
    with pytest.raises(PlanetarySystemBuilderModelError):
        PlanetarySystemPlanetInput(
            mass_mearth=mass,
            semi_major_axis_au=axis,
        )


def test_planet_count_and_container_are_strict() -> None:
    with pytest.raises(PlanetarySystemBuilderModelError):
        _input(planets=())
    with pytest.raises(PlanetarySystemBuilderModelError):
        _input(planets=tuple(_planet(1.0, 0.1 + index) for index in range(9)))
    with pytest.raises(PlanetarySystemBuilderModelError):
        PlanetarySystemBuilderInput(
            stellar_mass_msun=1.0,
            stellar_luminosity_lsun=1.0,
            stellar_effective_temperature_k=5780.0,
            planets=[_planet(1.0, 1.0)],  # type: ignore[arg-type]
        )


def test_reviewed_artifact_is_strict() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_planetary_system_builder_artifact(repository_root=repository_root)
    assert artifact["model_version"] == "planetary-system-builder-v1"
    constants = artifact["constants"]
    assert isinstance(constants, dict)
    assert constants["PAIRWISE_HILL_REFERENCE_THRESHOLD"] == pytest.approx(2.0 * math.sqrt(3.0))


def test_reviewed_artifact_rejects_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads(
        (repository_root / "data/seed/planetary-system-builder-v1.json").read_text()
    )
    artifact["constants"]["HZ_INNER_SEFF_SUN"] = 1.2
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "planetary-system-builder-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(PlanetarySystemBuilderModelError):
        load_reviewed_planetary_system_builder_artifact(repository_root=tmp_path)
