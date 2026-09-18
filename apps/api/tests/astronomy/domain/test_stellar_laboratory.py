from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.stellar_laboratory import (
    NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K,
    StellarLaboratoryInput,
    StellarLaboratoryModelError,
    StellarLaboratoryResult,
    calculate_stellar_laboratory,
    load_reviewed_stellar_laboratory_artifact,
)


def _calculate(mass: float) -> StellarLaboratoryResult:
    return calculate_stellar_laboratory(StellarLaboratoryInput(initial_mass_msun=mass))


def test_solar_mass_returns_typical_finite_main_sequence_values() -> None:
    result = _calculate(1.0)
    assert result.luminosity_lsun == pytest.approx(10**-0.007)
    assert result.radius_rsun == pytest.approx(0.438 + 0.479 + 0.075)
    assert 5_000 < result.effective_temperature_k < 6_500
    assert result.main_sequence_lifetime_years > 0
    assert result.expected_remnant == "carbon-oxygen white dwarf"
    assert "grid" in result.metallicity_scope


@pytest.mark.parametrize(
    ("mass", "alpha", "beta"),
    [
        (0.45, 2.028, -0.976),
        (0.72, 4.572, -0.102),
        (1.05, 5.743, -0.007),
        (2.4, 4.329, 0.010),
        (7.0, 3.967, 0.093),
        (29.669, 2.865, 1.105),
    ],
)
def test_mass_luminosity_breakpoints_use_declared_segments(
    mass: float,
    alpha: float,
    beta: float,
) -> None:
    result = _calculate(mass)
    expected = 10 ** (alpha * math.log10(mass) + beta)
    assert result.luminosity_lsun == pytest.approx(expected, rel=1.0e-14)


def test_low_mass_branch_obeys_stefan_boltzmann_ratio() -> None:
    result = _calculate(0.8)
    reconstructed = (
        NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K
        * (result.luminosity_lsun / result.radius_rsun**2) ** 0.25
    )
    assert result.effective_temperature_k == pytest.approx(reconstructed, rel=1.0e-14)


def test_high_mass_branch_obeys_stefan_boltzmann_ratio() -> None:
    result = _calculate(5.0)
    reconstructed_radius = (
        math.sqrt(result.luminosity_lsun)
        / (result.effective_temperature_k / NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K) ** 2
    )
    assert result.radius_rsun == pytest.approx(reconstructed_radius, rel=1.0e-14)


def test_exact_colour_anchor_is_preserved() -> None:
    result = _calculate(1.031)
    assert result.nearest_spectral_type_anchor == "G5"
    assert result.colour_anchor_mass_msun == 1.031
    assert result.approximate_b_minus_v_mag == 0.68


@pytest.mark.parametrize(
    ("mass", "years"),
    [
        (0.4, 200_000_000_000.0),
        (0.8, 14_000_000_000.0),
        (1.1, 9_000_000_000.0),
        (1.7, 2_700_000_000.0),
        (3.3, 500_000_000.0),
        (16.0, 10_000_000.0),
    ],
)
def test_exact_lifetime_anchors_are_preserved(mass: float, years: float) -> None:
    assert _calculate(mass).main_sequence_lifetime_years == years


def test_interpolated_lifetime_decreases_with_mass() -> None:
    masses = (0.5, 1.0, 2.0, 5.0, 12.0, 25.0)
    lifetimes = [_calculate(mass).main_sequence_lifetime_years for mass in masses]
    assert all(left > right for left, right in zip(lifetimes, lifetimes[1:], strict=False))


@pytest.mark.parametrize(
    ("mass", "remnant"),
    [
        (7.999, "carbon-oxygen white dwarf"),
        (8.0, "oxygen-neon-magnesium white dwarf"),
        (9.999, "oxygen-neon-magnesium white dwarf"),
        (10.0, "neutron star"),
        (29.669, "neutron star"),
    ],
)
def test_remnant_boundaries_are_deterministic(mass: float, remnant: str) -> None:
    result = _calculate(mass)
    assert result.expected_remnant == remnant
    assert result.evolutionary_path[-1] == remnant
    assert "boundaries may change" in result.remnant_boundary_note


def test_calculation_is_exactly_deterministic() -> None:
    inputs = StellarLaboratoryInput(initial_mass_msun=6.25)
    assert calculate_stellar_laboratory(inputs) == calculate_stellar_laboratory(inputs)


@pytest.mark.parametrize(
    "mass",
    [
        0.3999,
        29.67,
        float("nan"),
        float("inf"),
    ],
)
def test_input_domain_rejects_invalid_states(mass: float) -> None:
    with pytest.raises(StellarLaboratoryModelError):
        StellarLaboratoryInput(initial_mass_msun=mass)


def test_bool_numeric_input_is_rejected() -> None:
    with pytest.raises(StellarLaboratoryModelError):
        StellarLaboratoryInput(initial_mass_msun=True)


def test_artifact_validation_rejects_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/stellar-laboratory-v1.json").read_text())
    artifact["constants"]["NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K"] = 6_000
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "stellar-laboratory-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(StellarLaboratoryModelError):
        load_reviewed_stellar_laboratory_artifact(repository_root=tmp_path)


def test_reviewed_artifact_is_strict_and_explicitly_approximate() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_stellar_laboratory_artifact(repository_root=repository_root)

    assert artifact["model_version"] == "stellar-laboratory-v1"
    definition = artifact["definition"]
    assert isinstance(definition, dict)
    limitations = definition["limitations"]
    assert isinstance(limitations, list)
    assert any("approximate" in str(item).lower() for item in limitations)
    sources = artifact["sources"]
    assert isinstance(sources, list)
    assert {source["id"] for source in sources if isinstance(source, dict)} == {
        "eker-2018-main-sequence-relations",
        "iau-2015-resolution-b3",
        "openstax-astronomy-2e-main-sequence-lifetimes",
        "openstax-astronomy-2e-low-mass-death",
        "openstax-astronomy-2e-stellar-end-states",
    }
