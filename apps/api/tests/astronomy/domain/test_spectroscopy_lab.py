from __future__ import annotations

import json
import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.spectroscopy_lab import (
    SPEED_OF_LIGHT_KM_S,
    WIEN_WAVELENGTH_DISPLACEMENT_M_K,
    SpectroscopyInput,
    SpectroscopyModelError,
    SpectroscopyResult,
    calculate_spectroscopy_lab,
    load_reviewed_spectroscopy_artifact,
)


def _input(
    *,
    mode: str = "absorption",
    temperature_k: float = 5772.0,
    selected_elements: tuple[str, ...] = ("H I", "Na I", "Ca II"),
    radial_velocity_km_s: float = 0.0,
    resolving_power: float = 500.0,
    noise_sigma: float = 0.0,
    noise_seed: int = 42,
) -> SpectroscopyInput:
    return SpectroscopyInput(
        mode=mode,  # type: ignore[arg-type]
        temperature_k=temperature_k,
        selected_elements=selected_elements,  # type: ignore[arg-type]
        radial_velocity_km_s=radial_velocity_km_s,
        resolving_power=resolving_power,
        noise_sigma=noise_sigma,
        noise_seed=noise_seed,
    )


def _nearest_flux(result: SpectroscopyResult, wavelength_nm: float) -> float:
    point = min(result.spectrum, key=lambda item: abs(item.wavelength_nm - wavelength_nm))
    return point.normalized_flux


def test_wien_peak_uses_reviewed_constant() -> None:
    result = calculate_spectroscopy_lab(
        _input(mode="continuum", selected_elements=(), temperature_k=5772.0)
    )
    expected = WIEN_WAVELENGTH_DISPLACEMENT_M_K / 5772.0 * 1e9
    assert result.wien_peak_nm == pytest.approx(expected, rel=0, abs=1e-12)
    assert result.wien_peak_nm == pytest.approx(502.04, abs=0.05)


def test_continuum_is_normalized_and_deterministic() -> None:
    inputs = _input(mode="continuum", selected_elements=(), temperature_k=6000.0)
    first = calculate_spectroscopy_lab(inputs)
    second = calculate_spectroscopy_lab(inputs)

    assert first == second
    assert len(first.spectrum) == 741
    assert first.spectrum[0].wavelength_nm == 380.0
    assert first.spectrum[-1].wavelength_nm == 750.0
    assert max(point.normalized_flux for point in first.spectrum) == 1.0
    assert all(0.0 < point.normalized_flux <= 1.0 for point in first.spectrum)
    assert first.representative_lines == ()
    assert first.fingerprints == ()


def test_emission_metadata_preserves_nist_rest_centers() -> None:
    result = calculate_spectroscopy_lab(
        _input(
            mode="emission",
            selected_elements=("H I",),
            radial_velocity_km_s=0.0,
            resolving_power=300.0,
        )
    )
    assert [line.rest_wavelength_vacuum_nm for line in result.representative_lines] == [
        410.2892,
        434.1692,
        486.271,
        656.46,
    ]
    assert all(
        line.shifted_wavelength_vacuum_nm == line.rest_wavelength_vacuum_nm
        for line in result.representative_lines
    )
    assert max(point.normalized_flux for point in result.spectrum) <= 1.0
    assert _nearest_flux(result, 656.46) > _nearest_flux(result, 620.0)


def test_absorption_lowers_continuum_near_selected_lines() -> None:
    continuum = calculate_spectroscopy_lab(
        _input(mode="continuum", selected_elements=(), temperature_k=5772.0)
    )
    absorption = calculate_spectroscopy_lab(
        _input(
            mode="absorption",
            selected_elements=("Na I",),
            temperature_k=5772.0,
            resolving_power=500.0,
        )
    )

    assert _nearest_flux(absorption, 589.1583264) < _nearest_flux(continuum, 589.1583264)
    assert _nearest_flux(absorption, 700.0) == pytest.approx(
        _nearest_flux(continuum, 700.0),
        abs=1e-12,
    )


def test_doppler_sign_and_scale() -> None:
    receding = calculate_spectroscopy_lab(
        _input(
            mode="doppler",
            selected_elements=("Na I",),
            radial_velocity_km_s=300.0,
        )
    )
    approaching = calculate_spectroscopy_lab(
        _input(
            mode="doppler",
            selected_elements=("Na I",),
            radial_velocity_km_s=-300.0,
        )
    )

    rest = receding.representative_lines[0].rest_wavelength_vacuum_nm
    expected_red = rest * (1.0 + 300.0 / SPEED_OF_LIGHT_KM_S)
    expected_blue = rest * (1.0 - 300.0 / SPEED_OF_LIGHT_KM_S)
    assert receding.representative_lines[0].shifted_wavelength_vacuum_nm == pytest.approx(
        expected_red,
        rel=0,
        abs=1e-12,
    )
    assert approaching.representative_lines[0].shifted_wavelength_vacuum_nm == pytest.approx(
        expected_blue,
        rel=0,
        abs=1e-12,
    )
    assert receding.representative_lines[0].shifted_wavelength_vacuum_nm > rest
    assert approaching.representative_lines[0].shifted_wavelength_vacuum_nm < rest


def test_resolution_controls_line_fwhm() -> None:
    low = calculate_spectroscopy_lab(
        _input(mode="emission", selected_elements=("H I",), resolving_power=100.0)
    )
    high = calculate_spectroscopy_lab(
        _input(mode="emission", selected_elements=("H I",), resolving_power=500.0)
    )
    assert low.representative_lines[0].illustrative_fwhm_nm == pytest.approx(
        low.representative_lines[0].shifted_wavelength_vacuum_nm / 100.0
    )
    assert high.representative_lines[0].illustrative_fwhm_nm == pytest.approx(
        high.representative_lines[0].shifted_wavelength_vacuum_nm / 500.0
    )
    assert low.representative_lines[0].illustrative_fwhm_nm == pytest.approx(
        5.0 * high.representative_lines[0].illustrative_fwhm_nm
    )


def test_reviewed_line_list_is_exact() -> None:
    result = calculate_spectroscopy_lab(
        _input(
            mode="element_match",
            selected_elements=("H I", "He I", "Na I", "Ca II"),
        )
    )
    actual = [
        (line.element, line.rest_wavelength_vacuum_nm) for line in result.representative_lines
    ]
    assert actual == [
        ("H I", 410.2892),
        ("H I", 434.1692),
        ("H I", 486.271),
        ("H I", 656.46),
        ("He I", 447.2735),
        ("He I", 501.70772),
        ("He I", 587.7249),
        ("He I", 667.9995),
        ("Na I", 589.1583264),
        ("Na I", 589.7558147),
        ("Ca II", 393.477),
        ("Ca II", 396.959),
    ]
    assert [(item.element, item.representative_line_count) for item in result.fingerprints] == [
        ("H I", 4),
        ("He I", 4),
        ("Na I", 2),
        ("Ca II", 2),
    ]


def test_seeded_noise_is_deterministic() -> None:
    inputs = _input(
        mode="absorption",
        selected_elements=("H I",),
        noise_sigma=0.02,
        noise_seed=123456,
    )
    first = calculate_spectroscopy_lab(inputs)
    second = calculate_spectroscopy_lab(inputs)
    assert first == second
    assert all(math.isfinite(point.normalized_flux) for point in first.spectrum)


def test_different_noise_seed_changes_spectrum() -> None:
    first = calculate_spectroscopy_lab(
        _input(
            mode="absorption",
            selected_elements=("H I",),
            noise_sigma=0.02,
            noise_seed=1,
        )
    )
    second = calculate_spectroscopy_lab(
        _input(
            mode="absorption",
            selected_elements=("H I",),
            noise_sigma=0.02,
            noise_seed=2,
        )
    )
    assert first.spectrum != second.spectrum


@pytest.mark.parametrize(
    "kwargs",
    [
        {"mode": "unknown", "selected_elements": ("H I",)},
        {"mode": "continuum", "selected_elements": ("H I",)},
        {"mode": "emission", "selected_elements": ()},
        {"mode": "emission", "selected_elements": ("H I", "H I")},
        {"mode": "emission", "selected_elements": ("Fe I",)},
    ],
)
def test_mode_domain_rejects_unsupported_states(kwargs: dict[str, object]) -> None:
    with pytest.raises(SpectroscopyModelError):
        _input(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"temperature_k": 2499.9},
        {"temperature_k": 15000.1},
        {"temperature_k": float("nan")},
        {"radial_velocity_km_s": -300.1},
        {"radial_velocity_km_s": 300.1},
        {"resolving_power": 99.9},
        {"resolving_power": 500.1},
        {"noise_sigma": -0.001},
        {"noise_sigma": 0.051},
        {"noise_seed": -1},
        {"noise_seed": 4294967296},
        {"noise_seed": True},
    ],
)
def test_numeric_domain_rejects_unsupported_states(kwargs: dict[str, object]) -> None:
    with pytest.raises(SpectroscopyModelError):
        _input(**kwargs)  # type: ignore[arg-type]


def test_reviewed_artifact_is_strict() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_spectroscopy_artifact(repository_root=repository_root)
    assert artifact["model_version"] == "spectroscopy-lab-v1"
    assert artifact["supported_elements"] == ["H I", "He I", "Na I", "Ca II"]
    assert len(artifact["representative_lines"]) == 12  # type: ignore[arg-type]


def test_reviewed_artifact_rejects_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/spectroscopy-lab-v1.json").read_text())
    artifact["representative_lines"][0]["observed_vacuum_wavelength_nm"] = 411.0
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "spectroscopy-lab-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(SpectroscopyModelError):
        load_reviewed_spectroscopy_artifact(repository_root=tmp_path)
