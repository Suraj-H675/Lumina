"""Deterministic normalized visible-spectrum model for Spectroscopy Lab v1."""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

SPECTROSCOPY_MODEL_VERSION: Final = "spectroscopy-lab-v1"
SPECTROSCOPY_SCHEMA_VERSION: Final = 1
SPECTROSCOPY_SHARE_SCHEMA_VERSION: Final = 1
SPECTROSCOPY_ARTIFACT_VERSION: Final = 1
SPECTROSCOPY_ARTIFACT_PATH: Final = "data/seed/spectroscopy-lab-v1.json"

SPEED_OF_LIGHT_M_S: Final = 299_792_458.0
SPEED_OF_LIGHT_KM_S: Final = 299_792.458
PLANCK_CONSTANT_J_S: Final = 6.626_070_15e-34
BOLTZMANN_CONSTANT_J_K: Final = 1.380_649e-23
WIEN_WAVELENGTH_DISPLACEMENT_M_K: Final = 0.002_897_771_955

WAVELENGTH_START_NM: Final = 380.0
WAVELENGTH_END_NM: Final = 750.0
WAVELENGTH_STEP_NM: Final = 0.5
SPECTRUM_POINT_COUNT: Final = 741
MIN_TEMPERATURE_K: Final = 2500.0
MAX_TEMPERATURE_K: Final = 15000.0
MIN_RADIAL_VELOCITY_KM_S: Final = -300.0
MAX_RADIAL_VELOCITY_KM_S: Final = 300.0
MIN_RESOLVING_POWER: Final = 100.0
MAX_RESOLVING_POWER: Final = 500.0
MIN_NOISE_SIGMA: Final = 0.0
MAX_NOISE_SIGMA: Final = 0.05
MIN_NOISE_SEED: Final = 0
MAX_NOISE_SEED: Final = 4_294_967_295
ABSORPTION_DEPTH: Final = 0.6
GAUSSIAN_FWHM_TO_SIGMA: Final = 2.354_820_045_030_949_3
NOISE_ALGORITHM: Final = "sha256-box-muller-v1"

SpectroscopyMode = Literal["continuum", "emission", "absorption", "doppler", "element_match"]
ElementId = Literal["H I", "He I", "Na I", "Ca II"]

SUPPORTED_MODES: Final = (
    "continuum",
    "emission",
    "absorption",
    "doppler",
    "element_match",
)
SUPPORTED_ELEMENTS: Final = ("H I", "He I", "Na I", "Ca II")

_LINE_ROWS: Final = (
    ("H I", "H-delta representative", 410.2892, "70000"),
    ("H I", "H-gamma representative", 434.1692, "90000"),
    ("H I", "H-beta representative", 486.271, "180000"),
    ("H I", "H-alpha representative", 656.46, "500000"),
    ("He I", "He I 447.27350 nm representative", 447.2735, "200*"),
    ("He I", "He I 501.70772 nm representative", 501.70772, "100"),
    ("He I", "He I 587.7249 nm representative", 587.7249, "500*"),
    ("He I", "He I 667.9995 nm representative", 667.9995, "100"),
    ("Na I", "Na I D2 representative", 589.1583264, "80000"),
    ("Na I", "Na I D1 representative", 589.7558147, "40000"),
    ("Ca II", "Ca II K representative", 393.477, "230"),
    ("Ca II", "Ca II H representative", 396.959, "220"),
)

_SOURCE_URLS: Final = {
    "openstax-astronomy-electromagnetic-spectrum": (
        "https://openstax.org/books/astronomy-2e/pages/5-2-the-electromagnetic-spectrum"
    ),
    "openstax-astronomy-spectroscopy": (
        "https://openstax.org/books/astronomy-2e/pages/5-3-spectroscopy-in-astronomy"
    ),
    "openstax-astronomy-doppler": (
        "https://openstax.org/books/astronomy-2e/pages/5-6-the-doppler-effect"
    ),
    "nist-2022-codata": "https://physics.nist.gov/cuu/Constants/",
    "nist-asd-lines": "https://physics.nist.gov/PhysRefData/ASD/lines_form.html",
    "eso-uves-resolution": (
        "https://www.eso.org/sci/facilities/paranal/instruments/uves/overview.html"
    ),
    "stsci-nirspec-resolution": (
        "https://jwst-docs.stsci.edu/jwst-near-infrared-spectrograph/"
        "nirspec-instrumentation/nirspec-dispersers-and-filters"
    ),
}
_SOURCE_IDS: Final = frozenset(_SOURCE_URLS)
_FIXTURE_IDS: Final = frozenset(
    {
        "wien-solar-temperature",
        "continuum-normalization",
        "emission-line-centers",
        "absorption-line-depth",
        "doppler-sign-and-scale",
        "resolution-fwhm",
        "line-list-provenance",
        "deterministic-noise",
        "noise-seed-distinction",
        "mode-domain-rejection",
        "numeric-domain-rejection",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "SPEED_OF_LIGHT_M_S": SPEED_OF_LIGHT_M_S,
    "SPEED_OF_LIGHT_KM_S": SPEED_OF_LIGHT_KM_S,
    "PLANCK_CONSTANT_J_S": PLANCK_CONSTANT_J_S,
    "BOLTZMANN_CONSTANT_J_K": BOLTZMANN_CONSTANT_J_K,
    "WIEN_WAVELENGTH_DISPLACEMENT_M_K": WIEN_WAVELENGTH_DISPLACEMENT_M_K,
    "WAVELENGTH_START_NM": WAVELENGTH_START_NM,
    "WAVELENGTH_END_NM": WAVELENGTH_END_NM,
    "WAVELENGTH_STEP_NM": WAVELENGTH_STEP_NM,
    "SPECTRUM_POINT_COUNT": SPECTRUM_POINT_COUNT,
    "MIN_TEMPERATURE_K": MIN_TEMPERATURE_K,
    "MAX_TEMPERATURE_K": MAX_TEMPERATURE_K,
    "MIN_RADIAL_VELOCITY_KM_S": MIN_RADIAL_VELOCITY_KM_S,
    "MAX_RADIAL_VELOCITY_KM_S": MAX_RADIAL_VELOCITY_KM_S,
    "MIN_RESOLVING_POWER": MIN_RESOLVING_POWER,
    "MAX_RESOLVING_POWER": MAX_RESOLVING_POWER,
    "MIN_NOISE_SIGMA": MIN_NOISE_SIGMA,
    "MAX_NOISE_SIGMA": MAX_NOISE_SIGMA,
    "MIN_NOISE_SEED": MIN_NOISE_SEED,
    "MAX_NOISE_SEED": MAX_NOISE_SEED,
    "ABSORPTION_DEPTH": ABSORPTION_DEPTH,
    "GAUSSIAN_FWHM_TO_SIGMA": GAUSSIAN_FWHM_TO_SIGMA,
    "NOISE_ALGORITHM": NOISE_ALGORITHM,
}


class SpectroscopyModelError(ValueError):
    """Raised when input or provenance leaves the reviewed Spectroscopy v1 domain."""


@dataclass(frozen=True, slots=True)
class SpectroscopyInput:
    mode: SpectroscopyMode
    temperature_k: float
    selected_elements: tuple[ElementId, ...]
    radial_velocity_km_s: float
    resolving_power: float
    noise_sigma: float
    noise_seed: int

    def __post_init__(self) -> None:
        if self.mode not in SUPPORTED_MODES:
            raise SpectroscopyModelError()
        temperature = _number(
            self.temperature_k,
            minimum=MIN_TEMPERATURE_K,
            maximum=MAX_TEMPERATURE_K,
        )
        velocity = _number(
            self.radial_velocity_km_s,
            minimum=MIN_RADIAL_VELOCITY_KM_S,
            maximum=MAX_RADIAL_VELOCITY_KM_S,
        )
        resolving_power = _number(
            self.resolving_power,
            minimum=MIN_RESOLVING_POWER,
            maximum=MAX_RESOLVING_POWER,
        )
        noise_sigma = _number(
            self.noise_sigma,
            minimum=MIN_NOISE_SIGMA,
            maximum=MAX_NOISE_SIGMA,
        )
        if not isinstance(self.selected_elements, tuple):
            raise SpectroscopyModelError()
        if any(element not in SUPPORTED_ELEMENTS for element in self.selected_elements):
            raise SpectroscopyModelError()
        if len(set(self.selected_elements)) != len(self.selected_elements):
            raise SpectroscopyModelError()
        if self.mode == "continuum":
            if self.selected_elements:
                raise SpectroscopyModelError()
        elif not self.selected_elements:
            raise SpectroscopyModelError()
        if (
            isinstance(self.noise_seed, bool)
            or not isinstance(self.noise_seed, int)
            or not MIN_NOISE_SEED <= self.noise_seed <= MAX_NOISE_SEED
        ):
            raise SpectroscopyModelError()
        object.__setattr__(self, "temperature_k", temperature)
        object.__setattr__(self, "radial_velocity_km_s", velocity)
        object.__setattr__(self, "resolving_power", resolving_power)
        object.__setattr__(self, "noise_sigma", noise_sigma)


@dataclass(frozen=True, slots=True)
class SpectrumPoint:
    wavelength_nm: float
    normalized_flux: float


@dataclass(frozen=True, slots=True)
class RepresentativeLine:
    element: ElementId
    label: str
    rest_wavelength_vacuum_nm: float
    shifted_wavelength_vacuum_nm: float
    illustrative_fwhm_nm: float
    nist_relative_intensity: str


@dataclass(frozen=True, slots=True)
class ElementFingerprint:
    element: ElementId
    representative_line_count: int


@dataclass(frozen=True, slots=True)
class SpectroscopyResult:
    model_version: str
    schema_version: int
    inputs: SpectroscopyInput
    wien_peak_nm: float
    doppler_factor: float
    spectrum: tuple[SpectrumPoint, ...]
    representative_lines: tuple[RepresentativeLine, ...]
    fingerprints: tuple[ElementFingerprint, ...]
    identification_explanation: str
    continuum_note: str
    line_strength_note: str
    resolution_note: str
    noise_note: str


def _number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SpectroscopyModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise SpectroscopyModelError()
    return 0.0 if numeric == 0.0 else numeric


def _wavelength_grid() -> tuple[float, ...]:
    return tuple(
        WAVELENGTH_START_NM + index * WAVELENGTH_STEP_NM for index in range(SPECTRUM_POINT_COUNT)
    )


def _planck_shape(wavelength_nm: float, temperature_k: float) -> float:
    wavelength_m = wavelength_nm * 1e-9
    exponent = (
        PLANCK_CONSTANT_J_S
        * SPEED_OF_LIGHT_M_S
        / (wavelength_m * BOLTZMANN_CONSTANT_J_K * temperature_k)
    )
    denominator = wavelength_m**5 * math.expm1(exponent)
    if not math.isfinite(denominator) or denominator <= 0.0:
        raise SpectroscopyModelError()
    return 1.0 / denominator


def _normalized_continuum(grid: tuple[float, ...], temperature_k: float) -> tuple[float, ...]:
    values = tuple(_planck_shape(wavelength_nm, temperature_k) for wavelength_nm in grid)
    maximum = max(values)
    if not math.isfinite(maximum) or maximum <= 0.0:
        raise SpectroscopyModelError()
    return tuple(value / maximum for value in values)


def _selected_lines(inputs: SpectroscopyInput) -> tuple[RepresentativeLine, ...]:
    if inputs.mode == "continuum":
        return ()
    selected = set(inputs.selected_elements)
    doppler_factor = 1.0 + inputs.radial_velocity_km_s / SPEED_OF_LIGHT_KM_S
    lines: list[RepresentativeLine] = []
    for element, label, rest_wavelength, intensity in _LINE_ROWS:
        if element not in selected:
            continue
        shifted = rest_wavelength * doppler_factor
        lines.append(
            RepresentativeLine(
                element=element,
                label=label,
                rest_wavelength_vacuum_nm=rest_wavelength,
                shifted_wavelength_vacuum_nm=shifted,
                illustrative_fwhm_nm=shifted / inputs.resolving_power,
                nist_relative_intensity=intensity,
            )
        )
    return tuple(lines)


def _profile_at(wavelength_nm: float, lines: tuple[RepresentativeLine, ...]) -> float:
    peak = 0.0
    for line in lines:
        sigma = line.illustrative_fwhm_nm / GAUSSIAN_FWHM_TO_SIGMA
        if not math.isfinite(sigma) or sigma <= 0.0:
            raise SpectroscopyModelError()
        offset = (wavelength_nm - line.shifted_wavelength_vacuum_nm) / sigma
        value = math.exp(-0.5 * offset * offset)
        if value > peak:
            peak = value
    return peak


def _uniform_open(seed: int, index: int, lane: int) -> float:
    payload = f"{NOISE_ALGORITHM}:{seed}:{index}:{lane}".encode("ascii")
    digest = hashlib.sha256(payload).digest()
    integer = int.from_bytes(digest[:8], "big")
    return (integer + 0.5) / (2**64)


def _noise_standard_normal(seed: int, index: int) -> float:
    u1 = _uniform_open(seed, index, 0)
    u2 = _uniform_open(seed, index, 1)
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def _base_spectrum(
    inputs: SpectroscopyInput,
    grid: tuple[float, ...],
    continuum: tuple[float, ...],
    lines: tuple[RepresentativeLine, ...],
) -> tuple[float, ...]:
    if inputs.mode == "continuum":
        return continuum
    profiles = tuple(_profile_at(wavelength_nm, lines) for wavelength_nm in grid)
    if inputs.mode == "emission":
        return profiles
    return tuple(
        continuum_value * (1.0 - ABSORPTION_DEPTH * profile)
        for continuum_value, profile in zip(continuum, profiles, strict=True)
    )


def _apply_noise(values: tuple[float, ...], inputs: SpectroscopyInput) -> tuple[float, ...]:
    if inputs.noise_sigma == 0.0:
        return values
    noisy: list[float] = []
    for index, value in enumerate(values):
        sample = value + inputs.noise_sigma * _noise_standard_normal(inputs.noise_seed, index)
        noisy.append(min(1.0, max(0.0, sample)))
    return tuple(noisy)


def calculate_spectroscopy_lab(inputs: SpectroscopyInput) -> SpectroscopyResult:
    """Calculate the reviewed normalized Spectroscopy Lab v1 result."""

    grid = _wavelength_grid()
    continuum = _normalized_continuum(grid, inputs.temperature_k)
    lines = _selected_lines(inputs)
    base = _base_spectrum(inputs, grid, continuum, lines)
    flux = _apply_noise(base, inputs)
    if (
        len(grid) != SPECTRUM_POINT_COUNT
        or len(flux) != SPECTRUM_POINT_COUNT
        or any(not math.isfinite(value) or not 0.0 <= value <= 1.0 for value in flux)
    ):
        raise SpectroscopyModelError()
    points = tuple(
        SpectrumPoint(wavelength_nm=wavelength_nm, normalized_flux=normalized_flux)
        for wavelength_nm, normalized_flux in zip(grid, flux, strict=True)
    )
    fingerprints = tuple(
        ElementFingerprint(
            element=element,
            representative_line_count=sum(1 for line in lines if line.element == element),
        )
        for element in inputs.selected_elements
    )
    if inputs.mode == "continuum":
        explanation = (
            "Continuum mode contains no atomic fingerprint lines; the returned curve is only the "
            "normalized ideal blackbody teaching continuum."
        )
    elif inputs.mode == "element_match":
        explanation = (
            "Element-match mode displays the reviewed representative NIST ASD vacuum fingerprints "
            "for the selected species. Selection is user-provided; v1 does not infer abundance or "
            "classify an unknown observation."
        )
    else:
        explanation = (
            "Representative NIST ASD observed-vacuum line centers for the selected species are "
            "shifted by the reviewed first-order radial-velocity relation and rendered with equal "
            "illustrative profile strength."
        )
    return SpectroscopyResult(
        model_version=SPECTROSCOPY_MODEL_VERSION,
        schema_version=SPECTROSCOPY_SCHEMA_VERSION,
        inputs=inputs,
        wien_peak_nm=WIEN_WAVELENGTH_DISPLACEMENT_M_K / inputs.temperature_k * 1e9,
        doppler_factor=1.0 + inputs.radial_velocity_km_s / SPEED_OF_LIGHT_KM_S,
        spectrum=points,
        representative_lines=lines,
        fingerprints=fingerprints,
        identification_explanation=explanation,
        continuum_note=(
            "The continuum is an ideal Planck blackbody shape normalized to unit peak over the "
            "returned 380-750 nm interval; it is not a flux-calibrated stellar atmosphere."
        ),
        line_strength_note=(
            "Line amplitudes/depths are equal illustrative model features. NIST relative "
            "intensities are provenance context only and are not used as physical strengths."
        ),
        resolution_note=(
            "Illustrative Gaussian line FWHM is shifted vacuum wavelength divided by resolving "
            "power R; this is not a calibrated line-spread function for a real instrument."
        ),
        noise_note=(
            "Optional normalized display noise uses deterministic sha256-box-muller-v1 and is not "
            "a photon/read/sky/telluric or instrument-systematics noise model."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise SpectroscopyModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise SpectroscopyModelError()
    return value


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise SpectroscopyModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise SpectroscopyModelError()


def _validate_source(value: object) -> str:
    source = _mapping(value)
    required = frozenset(
        {
            "id",
            "title",
            "organization_or_authors",
            "url",
            "accessed_at",
            "dataset_or_release",
            "record_reference",
            "retrieved_at",
            "data_date",
            "terms_or_licence",
            "citation",
            "claim_scope",
            "source_type",
        }
    )
    _exact_keys(source, required)
    source_id = _string(source["id"])
    if source_id not in _SOURCE_IDS or _string(source["url"]) != _SOURCE_URLS[source_id]:
        raise SpectroscopyModelError()
    parsed = urlparse(_string(source["url"]))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise SpectroscopyModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def _line_tuple(value: object) -> tuple[str, str, float, str]:
    line = _mapping(value)
    _exact_keys(
        line,
        frozenset(
            {
                "element",
                "label",
                "observed_vacuum_wavelength_nm",
                "nist_relative_intensity",
            }
        ),
    )
    element = _string(line["element"])
    label = _string(line["label"])
    wavelength = _number(line["observed_vacuum_wavelength_nm"], minimum=380.0, maximum=750.0)
    intensity = _string(line["nist_relative_intensity"])
    return element, label, wavelength, intensity


def load_reviewed_spectroscopy_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and strictly validate the checked-in Spectroscopy Lab v1 artifact."""

    path = repository_root / SPECTROSCOPY_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, SpectroscopyModelError):
        raise SpectroscopyModelError() from None

    artifact = _mapping(decoded)
    _exact_keys(
        artifact,
        frozenset(
            {
                "artifact_version",
                "model_version",
                "schema_version",
                "share_schema_version",
                "generated_at",
                "definition",
                "sources",
                "constants",
                "supported_modes",
                "supported_elements",
                "representative_lines",
                "line_selection_policy",
                "presets",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != SPECTROSCOPY_ARTIFACT_VERSION
        or artifact["model_version"] != SPECTROSCOPY_MODEL_VERSION
        or artifact["schema_version"] != SPECTROSCOPY_SCHEMA_VERSION
        or artifact["share_schema_version"] != SPECTROSCOPY_SHARE_SCHEMA_VERSION
    ):
        raise SpectroscopyModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "spectroscopy-lab"
        or definition.get("title") != "Spectroscopy Lab"
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("model_version") != SPECTROSCOPY_MODEL_VERSION
        or definition.get("share_schema_version") != SPECTROSCOPY_SHARE_SCHEMA_VERSION
    ):
        raise SpectroscopyModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise SpectroscopyModelError()
    source_ids = [_validate_source(source) for source in sources]
    if frozenset(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise SpectroscopyModelError()
    references = definition.get("references")
    if references != source_ids:
        raise SpectroscopyModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise SpectroscopyModelError()
    if artifact["supported_modes"] != list(SUPPORTED_MODES):
        raise SpectroscopyModelError()
    if artifact["supported_elements"] != list(SUPPORTED_ELEMENTS):
        raise SpectroscopyModelError()

    raw_lines = artifact["representative_lines"]
    if not isinstance(raw_lines, list):
        raise SpectroscopyModelError()
    parsed_lines = tuple(_line_tuple(line) for line in raw_lines)
    if parsed_lines != _LINE_ROWS:
        raise SpectroscopyModelError()

    selection = _mapping(artifact["line_selection_policy"])
    if (
        selection.get("wavelength_medium") != "vacuum"
        or not _string(selection.get("selection"))
        or not _string(selection.get("intensity_use"))
    ):
        raise SpectroscopyModelError()

    presets = _mapping(artifact["presets"])
    if frozenset(presets) != {"solar-like-absorption", "receding-hydrogen-emission"}:
        raise SpectroscopyModelError()
    for preset_value in presets.values():
        preset = _mapping(preset_value)
        _exact_keys(
            preset,
            frozenset(
                {
                    "mode",
                    "temperature_k",
                    "selected_elements",
                    "radial_velocity_km_s",
                    "resolving_power",
                    "noise_sigma",
                    "noise_seed",
                }
            ),
        )
        elements = preset["selected_elements"]
        if not isinstance(elements, list) or any(not isinstance(item, str) for item in elements):
            raise SpectroscopyModelError()
        SpectroscopyInput(
            mode=cast(SpectroscopyMode, _string(preset["mode"])),
            temperature_k=preset["temperature_k"],  # type: ignore[arg-type]
            selected_elements=cast(tuple[ElementId, ...], tuple(elements)),
            radial_velocity_km_s=preset["radial_velocity_km_s"],  # type: ignore[arg-type]
            resolving_power=preset["resolving_power"],  # type: ignore[arg-type]
            noise_sigma=preset["noise_sigma"],  # type: ignore[arg-type]
            noise_seed=preset["noise_seed"],  # type: ignore[arg-type]
        )

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_FIXTURE_IDS):
        raise SpectroscopyModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _FIXTURE_IDS:
        raise SpectroscopyModelError()

    scientific = _mapping(artifact["scientific_validation"])
    if scientific.get("id") != "spectroscopy-lab-v1-validation":
        raise SpectroscopyModelError()
    if scientific.get("source_ids") != source_ids:
        raise SpectroscopyModelError()
    tests = scientific.get("test_references")
    if (
        not isinstance(tests, list)
        or len(tests) != 12
        or any(not isinstance(item, str) for item in tests)
    ):
        raise SpectroscopyModelError()
    return dict(artifact)


__all__ = [
    "ABSORPTION_DEPTH",
    "BOLTZMANN_CONSTANT_J_K",
    "ElementFingerprint",
    "ElementId",
    "GAUSSIAN_FWHM_TO_SIGMA",
    "MAX_NOISE_SEED",
    "NOISE_ALGORITHM",
    "PLANCK_CONSTANT_J_S",
    "RepresentativeLine",
    "SPEED_OF_LIGHT_KM_S",
    "SPECTROSCOPY_ARTIFACT_PATH",
    "SPECTROSCOPY_MODEL_VERSION",
    "SpectrumPoint",
    "SpectroscopyInput",
    "SpectroscopyMode",
    "SpectroscopyModelError",
    "SpectroscopyResult",
    "WIEN_WAVELENGTH_DISPLACEMENT_M_K",
    "calculate_spectroscopy_lab",
    "load_reviewed_spectroscopy_artifact",
]
