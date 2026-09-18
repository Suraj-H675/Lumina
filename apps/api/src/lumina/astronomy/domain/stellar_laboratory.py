"""Approximate source-backed main-sequence mapping for Stellar Laboratory v1."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.parse import urlparse

STELLAR_LABORATORY_MODEL_VERSION: Final = "stellar-laboratory-v1"
STELLAR_LABORATORY_SCHEMA_VERSION: Final = 1
STELLAR_LABORATORY_SHARE_SCHEMA_VERSION: Final = 1
STELLAR_LABORATORY_ARTIFACT_VERSION: Final = 1
STELLAR_LABORATORY_ARTIFACT_PATH: Final = "data/seed/stellar-laboratory-v1.json"

MIN_INITIAL_MASS_MSUN: Final = 0.4
MAX_INITIAL_MASS_MSUN: Final = 29.669
LOW_MASS_RADIUS_MAX_MSUN: Final = 1.5
NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K: Final = 5772.0
LIFETIME_SIGNIFICANT_DIGITS: Final = 2

_MLR_SEGMENTS: Final = (
    (0.179, 0.45, 2.028, -0.976),
    (0.45, 0.72, 4.572, -0.102),
    (0.72, 1.05, 5.743, -0.007),
    (1.05, 2.4, 4.329, 0.010),
    (2.4, 7.0, 3.967, 0.093),
    (7.0, 31.0, 2.865, 1.105),
)
_LOW_MASS_RADIUS: Final = (0.438, 0.479, 0.075)
_HIGH_MASS_TEMPERATURE: Final = (-0.170, 0.888, 3.671)
_LIFETIME_ANCHORS: Final = (
    (0.4, 200_000_000_000.0),
    (0.8, 14_000_000_000.0),
    (1.1, 9_000_000_000.0),
    (1.7, 2_700_000_000.0),
    (3.3, 500_000_000.0),
    (16.0, 10_000_000.0),
    (40.0, 1_000_000.0),
)
_COLOUR_ANCHORS: Final = (
    ("M4", 0.323, 3148.0, 1.56),
    ("M3", 0.462, 3350.0, 1.53),
    ("M2", 0.492, 3499.0, 1.49),
    ("M1", 0.524, 3648.0, 1.47),
    ("M0", 0.558, 3802.0, 1.40),
    ("K5", 0.736, 4345.0, 1.15),
    ("K3", 0.813, 4732.0, 0.96),
    ("K0", 0.922, 5248.0, 0.81),
    ("G5", 1.031, 5741.0, 0.68),
    ("G0", 1.161, 6026.0, 0.59),
    ("F5", 1.354, 6397.0, 0.45),
    ("F0", 1.643, 7161.0, 0.31),
    ("A5", 1.952, 8222.0, 0.15),
    ("A0", 2.478, 9886.0, -0.01),
    ("B9", 2.743, 10666.0, -0.07),
    ("B8", 3.234, 12023.0, -0.11),
    ("B5", 4.516, 15136.0, -0.17),
    ("B3", 6.123, 18408.0, -0.21),
    ("B2", 7.699, 21135.0, -0.24),
    ("B1", 10.459, 25119.0, -0.28),
    ("B0", 14.277, 29512.0, -0.31),
    ("O9", 17.123, 32211.0, -0.32),
    ("O7", 21.660, 35810.0, -0.33),
    ("O5", 29.669, 40738.0, -0.33),
)
_SOURCE_IDS: Final = frozenset(
    {
        "eker-2018-main-sequence-relations",
        "iau-2015-resolution-b3",
        "openstax-astronomy-2e-main-sequence-lifetimes",
        "openstax-astronomy-2e-low-mass-death",
        "openstax-astronomy-2e-stellar-end-states",
    }
)
_SOURCE_URLS: Final = {
    "eker-2018-main-sequence-relations": "https://arxiv.org/abs/1807.02568",
    "iau-2015-resolution-b3": "https://arxiv.org/abs/1510.07674",
    "openstax-astronomy-2e-main-sequence-lifetimes": (
        "https://openstax.org/books/astronomy-2e/pages/"
        "22-1-evolution-from-the-main-sequence-to-red-giants"
    ),
    "openstax-astronomy-2e-low-mass-death": (
        "https://openstax.org/books/astronomy-2e/pages/23-1-the-death-of-low-mass-stars"
    ),
    "openstax-astronomy-2e-stellar-end-states": (
        "https://openstax.org/books/astronomy-2e/pages/"
        "23-2-evolution-of-massive-stars-an-explosive-finish"
    ),
}
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "solar-mass-typical-main-sequence",
        "mlr-breakpoint-selection",
        "low-mass-stefan-boltzmann-bridge",
        "high-mass-stefan-boltzmann-bridge",
        "source-colour-anchor",
        "lifetime-source-anchors",
        "lifetime-monotonicity",
        "remnant-band-boundaries",
        "deterministic-repeat",
        "domain-rejection",
        "artifact-mutation",
    }
)


class StellarLaboratoryModelError(ValueError):
    """Raised when Stellar Laboratory inputs or artifacts leave the reviewed v1 domain."""


@dataclass(frozen=True, slots=True)
class StellarLaboratoryInput:
    initial_mass_msun: float

    def __post_init__(self) -> None:
        value = _validated_number(
            self.initial_mass_msun,
            minimum=MIN_INITIAL_MASS_MSUN,
            maximum=MAX_INITIAL_MASS_MSUN,
        )
        object.__setattr__(self, "initial_mass_msun", value)


@dataclass(frozen=True, slots=True)
class StellarLaboratoryResult:
    model_version: str
    schema_version: int
    inputs: StellarLaboratoryInput
    luminosity_lsun: float
    radius_rsun: float
    effective_temperature_k: float
    nearest_spectral_type_anchor: str
    colour_anchor_mass_msun: float
    approximate_b_minus_v_mag: float
    main_sequence_lifetime_years: float
    evolutionary_path: tuple[str, ...]
    expected_remnant: str
    remnant_boundary_note: str
    metallicity_scope: str


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise StellarLaboratoryModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise StellarLaboratoryModelError()
    return numeric


def _mass_luminosity(initial_mass_msun: float) -> float:
    log_mass = math.log10(initial_mass_msun)
    for minimum_exclusive, maximum_inclusive, alpha, beta in _MLR_SEGMENTS:
        if initial_mass_msun > minimum_exclusive and initial_mass_msun <= maximum_inclusive:
            luminosity = float(10.0 ** (alpha * log_mass + beta))
            if not math.isfinite(luminosity) or luminosity <= 0.0:
                raise StellarLaboratoryModelError()
            return luminosity
    raise StellarLaboratoryModelError()


def _main_sequence_radius_temperature(
    initial_mass_msun: float,
    luminosity_lsun: float,
) -> tuple[float, float]:
    if initial_mass_msun <= LOW_MASS_RADIUS_MAX_MSUN:
        quadratic, linear, constant = _LOW_MASS_RADIUS
        radius = quadratic * initial_mass_msun**2 + linear * initial_mass_msun + constant
        temperature = NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K * (luminosity_lsun / radius**2) ** 0.25
    else:
        squared, linear, constant = _HIGH_MASS_TEMPERATURE
        log_mass = math.log10(initial_mass_msun)
        temperature = 10.0 ** (squared * log_mass**2 + linear * log_mass + constant)
        radius = (
            math.sqrt(luminosity_lsun) / (temperature / NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K) ** 2
        )
    if (
        not math.isfinite(radius)
        or radius <= 0.0
        or not math.isfinite(temperature)
        or temperature <= 0.0
    ):
        raise StellarLaboratoryModelError()
    return radius, temperature


def _nearest_colour_anchor(initial_mass_msun: float) -> tuple[str, float, float]:
    spectral_type, anchor_mass, _temperature, b_minus_v = min(
        _COLOUR_ANCHORS,
        key=lambda anchor: (abs(anchor[1] - initial_mass_msun), anchor[1]),
    )
    return spectral_type, anchor_mass, b_minus_v


def _round_significant(value: float, digits: int) -> float:
    if value <= 0.0 or not math.isfinite(value):
        raise StellarLaboratoryModelError()
    magnitude = math.floor(math.log10(value))
    scale = 10.0 ** (magnitude - digits + 1)
    return round(value / scale) * scale


def _main_sequence_lifetime(initial_mass_msun: float) -> float:
    for mass, years in _LIFETIME_ANCHORS:
        if initial_mass_msun == mass:
            return years
    for (lower_mass, lower_years), (upper_mass, upper_years) in zip(
        _LIFETIME_ANCHORS,
        _LIFETIME_ANCHORS[1:],
        strict=True,
    ):
        if lower_mass < initial_mass_msun < upper_mass:
            fraction = (math.log10(initial_mass_msun) - math.log10(lower_mass)) / (
                math.log10(upper_mass) - math.log10(lower_mass)
            )
            log_years = math.log10(lower_years) + fraction * (
                math.log10(upper_years) - math.log10(lower_years)
            )
            return _round_significant(10.0**log_years, LIFETIME_SIGNIFICANT_DIGITS)
    raise StellarLaboratoryModelError()


def _evolutionary_outcome(initial_mass_msun: float) -> tuple[tuple[str, ...], str]:
    if initial_mass_msun < 8.0:
        return (
            (
                "main sequence",
                "red giant evolution",
                "planetary nebula",
                "carbon-oxygen white dwarf",
            ),
            "carbon-oxygen white dwarf",
        )
    if initial_mass_msun < 10.0:
        return (
            (
                "main sequence",
                "giant or supergiant evolution",
                "oxygen-neon-magnesium white dwarf",
            ),
            "oxygen-neon-magnesium white dwarf",
        )
    return (
        (
            "main sequence",
            "massive-star supergiant evolution",
            "core-collapse supernova",
            "neutron star",
        ),
        "neutron star",
    )


def calculate_stellar_laboratory(inputs: StellarLaboratoryInput) -> StellarLaboratoryResult:
    """Return a deterministic approximate main-sequence educational mapping."""

    luminosity = _mass_luminosity(inputs.initial_mass_msun)
    radius, temperature = _main_sequence_radius_temperature(inputs.initial_mass_msun, luminosity)
    spectral_type, colour_anchor_mass, b_minus_v = _nearest_colour_anchor(inputs.initial_mass_msun)
    lifetime = _main_sequence_lifetime(inputs.initial_mass_msun)
    evolutionary_path, expected_remnant = _evolutionary_outcome(inputs.initial_mass_msun)
    return StellarLaboratoryResult(
        model_version=STELLAR_LABORATORY_MODEL_VERSION,
        schema_version=STELLAR_LABORATORY_SCHEMA_VERSION,
        inputs=inputs,
        luminosity_lsun=luminosity,
        radius_rsun=radius,
        effective_temperature_k=temperature,
        nearest_spectral_type_anchor=spectral_type,
        colour_anchor_mass_msun=colour_anchor_mass,
        approximate_b_minus_v_mag=b_minus_v,
        main_sequence_lifetime_years=lifetime,
        evolutionary_path=evolutionary_path,
        expected_remnant=expected_remnant,
        remnant_boundary_note=(
            "Broad OpenStax Astronomy 2e Table 23.1 initial-mass bands; the source explicitly "
            "notes that these boundaries may change as stellar models improve."
        ),
        metallicity_scope=(
            "Approximately Solar-neighbourhood main-sequence calibration; v1 has no metallicity "
            "control and is not a stellar-evolution grid."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise StellarLaboratoryModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise StellarLaboratoryModelError()
    return value


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise StellarLaboratoryModelError()
    return value


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise StellarLaboratoryModelError()
    numeric = float(value)
    if not math.isfinite(numeric):
        raise StellarLaboratoryModelError()
    return numeric


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise StellarLaboratoryModelError()


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
        raise StellarLaboratoryModelError()
    parsed = urlparse(_string(source["url"]))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise StellarLaboratoryModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def load_reviewed_stellar_laboratory_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and strictly validate the checked-in Stellar Laboratory v1 artifact."""

    path = repository_root / STELLAR_LABORATORY_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, StellarLaboratoryModelError):
        raise StellarLaboratoryModelError() from None

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
                "calibrations",
                "presets",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != STELLAR_LABORATORY_ARTIFACT_VERSION
        or artifact["model_version"] != STELLAR_LABORATORY_MODEL_VERSION
        or artifact["schema_version"] != STELLAR_LABORATORY_SCHEMA_VERSION
        or artifact["share_schema_version"] != STELLAR_LABORATORY_SHARE_SCHEMA_VERSION
    ):
        raise StellarLaboratoryModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "stellar-laboratory"
        or definition.get("model_version") != STELLAR_LABORATORY_MODEL_VERSION
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("share_schema_version") != STELLAR_LABORATORY_SHARE_SCHEMA_VERSION
    ):
        raise StellarLaboratoryModelError()
    for key in (
        "learning_objectives",
        "prerequisite_concepts",
        "assumptions",
        "limitations",
        "references",
        "validation_fixtures",
    ):
        values = definition.get(key)
        if (
            not isinstance(values, list)
            or not values
            or not all(isinstance(item, str) and item for item in values)
        ):
            raise StellarLaboratoryModelError()
    references = definition["references"]
    fixtures = definition["validation_fixtures"]
    if not isinstance(references, list) or set(references) != _SOURCE_IDS:
        raise StellarLaboratoryModelError()
    if not isinstance(fixtures, list) or set(fixtures) != _VALIDATION_FIXTURE_IDS:
        raise StellarLaboratoryModelError()

    raw_sources = artifact["sources"]
    if (
        not isinstance(raw_sources, list)
        or {_validate_source(source) for source in raw_sources} != _SOURCE_IDS
    ):
        raise StellarLaboratoryModelError()

    constants = _mapping(artifact["constants"])
    expected_constants = {
        "MIN_INITIAL_MASS_MSUN": MIN_INITIAL_MASS_MSUN,
        "MAX_INITIAL_MASS_MSUN": MAX_INITIAL_MASS_MSUN,
        "LOW_MASS_RADIUS_MAX_MSUN": LOW_MASS_RADIUS_MAX_MSUN,
        "NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K": NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K,
        "LIFETIME_SIGNIFICANT_DIGITS": float(LIFETIME_SIGNIFICANT_DIGITS),
    }
    _exact_keys(constants, frozenset(expected_constants))
    for key, expected in expected_constants.items():
        if not math.isclose(_number(constants[key]), expected, rel_tol=1.0e-15, abs_tol=0.0):
            raise StellarLaboratoryModelError()

    calibrations = _mapping(artifact["calibrations"])
    _exact_keys(
        calibrations,
        frozenset(
            {
                "mass_luminosity_segments",
                "low_mass_radius",
                "high_mass_temperature",
                "lifetime_anchors",
                "colour_anchors",
            }
        ),
    )
    raw_mlr = calibrations["mass_luminosity_segments"]
    if not isinstance(raw_mlr, list) or len(raw_mlr) != len(_MLR_SEGMENTS):
        raise StellarLaboratoryModelError()
    for raw_segment, expected_segment in zip(raw_mlr, _MLR_SEGMENTS, strict=True):
        segment = _mapping(raw_segment)
        _exact_keys(
            segment,
            frozenset({"minimum_exclusive_msun", "maximum_inclusive_msun", "alpha", "beta"}),
        )
        actual = (
            _number(segment["minimum_exclusive_msun"]),
            _number(segment["maximum_inclusive_msun"]),
            _number(segment["alpha"]),
            _number(segment["beta"]),
        )
        if actual != expected_segment:
            raise StellarLaboratoryModelError()

    low_radius = _mapping(calibrations["low_mass_radius"])
    _exact_keys(low_radius, frozenset({"quadratic", "linear", "constant"}))
    if tuple(_number(low_radius[key]) for key in ("quadratic", "linear", "constant")) != (
        _LOW_MASS_RADIUS
    ):
        raise StellarLaboratoryModelError()
    high_temperature = _mapping(calibrations["high_mass_temperature"])
    _exact_keys(
        high_temperature,
        frozenset({"log_mass_squared", "log_mass", "constant"}),
    )
    if (
        tuple(
            _number(high_temperature[key]) for key in ("log_mass_squared", "log_mass", "constant")
        )
        != _HIGH_MASS_TEMPERATURE
    ):
        raise StellarLaboratoryModelError()

    raw_lifetime = calibrations["lifetime_anchors"]
    if not isinstance(raw_lifetime, list) or len(raw_lifetime) != len(_LIFETIME_ANCHORS):
        raise StellarLaboratoryModelError()
    lifetime = tuple(
        (
            _number(_mapping(item)["mass_msun"]),
            _number(_mapping(item)["years"]),
        )
        for item in raw_lifetime
    )
    if lifetime != _LIFETIME_ANCHORS:
        raise StellarLaboratoryModelError()

    raw_colours = calibrations["colour_anchors"]
    if not isinstance(raw_colours, list) or len(raw_colours) != len(_COLOUR_ANCHORS):
        raise StellarLaboratoryModelError()
    colours: list[tuple[str, float, float, float]] = []
    for raw_anchor in raw_colours:
        anchor = _mapping(raw_anchor)
        _exact_keys(
            anchor,
            frozenset(
                {
                    "spectral_type",
                    "mass_msun",
                    "effective_temperature_k",
                    "b_minus_v_mag",
                }
            ),
        )
        colours.append(
            (
                _string(anchor["spectral_type"]),
                _number(anchor["mass_msun"]),
                _number(anchor["effective_temperature_k"]),
                _number(anchor["b_minus_v_mag"]),
            )
        )
    if tuple(colours) != _COLOUR_ANCHORS:
        raise StellarLaboratoryModelError()

    presets = _mapping(artifact["presets"])
    _exact_keys(presets, frozenset({"illustrative-solar-mass"}))
    preset = _mapping(presets["illustrative-solar-mass"])
    _exact_keys(preset, frozenset({"initial_mass_msun"}))
    preset_result = calculate_stellar_laboratory(
        StellarLaboratoryInput(initial_mass_msun=_number(preset["initial_mass_msun"]))
    )
    if preset_result.luminosity_lsun <= 0.0 or preset_result.effective_temperature_k <= 0.0:
        raise StellarLaboratoryModelError()

    raw_fixtures = artifact["validation_fixtures"]
    if not isinstance(raw_fixtures, list):
        raise StellarLaboratoryModelError()
    fixture_ids: set[str] = set()
    for raw_fixture in raw_fixtures:
        fixture = _mapping(raw_fixture)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise StellarLaboratoryModelError()

    validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        validation,
        frozenset({"id", "checked_at", "method", "tools", "source_ids", "test_references"}),
    )
    if validation["id"] != "stellar-laboratory-v1-validation":
        raise StellarLaboratoryModelError()
    _string(validation["checked_at"])
    _string(validation["method"])
    source_ids = validation["source_ids"]
    if not isinstance(source_ids, list) or set(source_ids) != _SOURCE_IDS:
        raise StellarLaboratoryModelError()
    tests = validation["test_references"]
    if (
        not isinstance(tests, list)
        or not tests
        or not all(isinstance(test, str) and test for test in tests)
    ):
        raise StellarLaboratoryModelError()
    tools = validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise StellarLaboratoryModelError()
    for raw_tool in tools:
        tool = _mapping(raw_tool)
        _exact_keys(tool, frozenset({"name", "version", "role"}))
        _string(tool["name"])
        _string(tool["version"])
        _string(tool["role"])

    return dict(artifact)


__all__ = [
    "MAX_INITIAL_MASS_MSUN",
    "MIN_INITIAL_MASS_MSUN",
    "NOMINAL_SOLAR_EFFECTIVE_TEMPERATURE_K",
    "STELLAR_LABORATORY_ARTIFACT_PATH",
    "STELLAR_LABORATORY_ARTIFACT_VERSION",
    "STELLAR_LABORATORY_MODEL_VERSION",
    "STELLAR_LABORATORY_SCHEMA_VERSION",
    "STELLAR_LABORATORY_SHARE_SCHEMA_VERSION",
    "StellarLaboratoryInput",
    "StellarLaboratoryModelError",
    "StellarLaboratoryResult",
    "calculate_stellar_laboratory",
    "load_reviewed_stellar_laboratory_artifact",
]
