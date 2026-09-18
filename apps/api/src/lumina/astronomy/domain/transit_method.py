"""Deterministic circular-orbit transit model for Transit Method Lab v1.

The canonical light-curve calculation lives here. The browser may validate
and render returned values, but it must not reimplement the transit geometry
or occultation equations.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

TRANSIT_METHOD_MODEL_VERSION: Final = "transit-method-v1"
TRANSIT_METHOD_SCHEMA_VERSION: Final = 1
TRANSIT_METHOD_SHARE_SCHEMA_VERSION: Final = 1
TRANSIT_METHOD_ARTIFACT_VERSION: Final = 1
TRANSIT_METHOD_ARTIFACT_PATH: Final = "data/seed/transit-method-v1.json"

MIN_STELLAR_RADIUS_M: Final = 1.0e5
MAX_STELLAR_RADIUS_M: Final = 1.0e12
MIN_PLANET_RADIUS_M: Final = 1.0
MAX_SEMIMAJOR_AXIS_M: Final = 1.0e15
MIN_ORBITAL_PERIOD_S: Final = 60.0
MAX_ORBITAL_PERIOD_S: Final = 1.0e9
MIN_INCLINATION_DEG: Final = 0.0
MAX_INCLINATION_DEG: Final = 90.0
LIGHT_CURVE_POINTS: Final = 301
NUMERICAL_TOLERANCE: Final = 1.0e-12

_SOURCE_IDS: Final = frozenset(
    {
        "winn-2010-transits-occultations",
        "mandel-agol-2002-analytic-lightcurves",
    }
)
_SOURCE_URLS: Final = {
    "winn-2010-transits-occultations": "https://arxiv.org/abs/1001.2010",
    "mandel-agol-2002-analytic-lightcurves": "https://arxiv.org/abs/astro-ph/0210099",
}
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "central-full-transit",
        "grazing-transit",
        "no-transit",
        "central-depth-ratio",
        "circular-contact-duration",
        "uniform-overlap-contact",
        "curve-time-symmetry",
        "domain-rejection",
        "artifact-mutation",
    }
)

TransitClassification = Literal["full", "grazing", "no_transit"]


class TransitMethodModelError(ValueError):
    """Raised when Transit Method inputs or artifacts leave the reviewed v1 domain."""


@dataclass(frozen=True, slots=True)
class TransitMethodInput:
    stellar_radius_m: float
    planet_radius_m: float
    semi_major_axis_m: float
    orbital_period_s: float
    inclination_deg: float

    def __post_init__(self) -> None:
        stellar_radius = _validated_number(
            self.stellar_radius_m,
            minimum=MIN_STELLAR_RADIUS_M,
            maximum=MAX_STELLAR_RADIUS_M,
        )
        planet_radius = _validated_number(
            self.planet_radius_m,
            minimum=MIN_PLANET_RADIUS_M,
            maximum=MAX_STELLAR_RADIUS_M,
        )
        semi_major_axis = _validated_number(
            self.semi_major_axis_m,
            minimum=MIN_STELLAR_RADIUS_M,
            maximum=MAX_SEMIMAJOR_AXIS_M,
        )
        orbital_period = _validated_number(
            self.orbital_period_s,
            minimum=MIN_ORBITAL_PERIOD_S,
            maximum=MAX_ORBITAL_PERIOD_S,
        )
        inclination = _validated_number(
            self.inclination_deg,
            minimum=MIN_INCLINATION_DEG,
            maximum=MAX_INCLINATION_DEG,
        )

        if planet_radius >= stellar_radius:
            raise TransitMethodModelError()
        if semi_major_axis <= stellar_radius + planet_radius:
            raise TransitMethodModelError()

        object.__setattr__(self, "stellar_radius_m", stellar_radius)
        object.__setattr__(self, "planet_radius_m", planet_radius)
        object.__setattr__(self, "semi_major_axis_m", semi_major_axis)
        object.__setattr__(self, "orbital_period_s", orbital_period)
        object.__setattr__(self, "inclination_deg", inclination)


@dataclass(frozen=True, slots=True)
class TransitLightCurvePoint:
    time_from_mid_transit_s: float
    orbital_phase: float
    projected_separation_stellar_radii: float
    relative_flux: float


@dataclass(frozen=True, slots=True)
class TransitMethodResult:
    model_version: str
    schema_version: int
    inputs: TransitMethodInput
    radius_ratio: float
    scaled_semi_major_axis: float
    impact_parameter: float
    classification: TransitClassification
    central_depth_approximation_fraction: float
    maximum_depth_fraction: float
    maximum_depth_ppm: float
    total_duration_s: float | None
    full_duration_s: float | None
    light_curve: tuple[TransitLightCurvePoint, ...]


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TransitMethodModelError()
    try:
        numeric = float(value)
    except (OverflowError, TypeError, ValueError):
        raise TransitMethodModelError() from None
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise TransitMethodModelError()
    return 0.0 if numeric == 0.0 else numeric


def _unit_interval(value: float) -> float:
    if value < -NUMERICAL_TOLERANCE or value > 1.0 + NUMERICAL_TOLERANCE:
        raise TransitMethodModelError()
    return min(1.0, max(0.0, value))


def _acos_argument(value: float) -> float:
    if value < -1.0 - NUMERICAL_TOLERANCE or value > 1.0 + NUMERICAL_TOLERANCE:
        raise TransitMethodModelError()
    return min(1.0, max(-1.0, value))


def _uniform_blocked_fraction(radius_ratio: float, separation: float) -> float:
    """Return Mandel & Agol uniform-source obscured flux fraction."""

    if separation >= 1.0 + radius_ratio:
        return 0.0
    if separation <= 1.0 - radius_ratio:
        return radius_ratio * radius_ratio
    if separation <= 0.0:
        return radius_ratio * radius_ratio

    denominator_star = 2.0 * separation
    denominator_planet = 2.0 * radius_ratio * separation
    kappa_star = math.acos(
        _acos_argument((1.0 - radius_ratio**2 + separation**2) / denominator_star)
    )
    kappa_planet = math.acos(
        _acos_argument((radius_ratio**2 + separation**2 - 1.0) / denominator_planet)
    )
    radicand = 4.0 * separation**2 - (1.0 + separation**2 - radius_ratio**2) ** 2
    if radicand < -NUMERICAL_TOLERANCE:
        raise TransitMethodModelError()
    overlap = (
        radius_ratio**2 * kappa_planet + kappa_star - 0.5 * math.sqrt(max(0.0, radicand))
    ) / math.pi
    maximum = radius_ratio * radius_ratio
    if overlap < -NUMERICAL_TOLERANCE or overlap > maximum + NUMERICAL_TOLERANCE:
        raise TransitMethodModelError()
    return min(maximum, max(0.0, overlap))


def _projected_separation(
    *,
    scaled_semi_major_axis: float,
    inclination_rad: float,
    time_from_mid_transit_s: float,
    orbital_period_s: float,
) -> float:
    angular_phase = 2.0 * math.pi * time_from_mid_transit_s / orbital_period_s
    sin_phase = math.sin(angular_phase)
    cos_phase = math.cos(angular_phase)
    cos_inclination = math.cos(inclination_rad)
    return scaled_semi_major_axis * math.sqrt(
        sin_phase * sin_phase + cos_inclination * cos_inclination * cos_phase * cos_phase
    )


def _contact_duration(
    *,
    contact_radius_stellar_radii: float,
    impact_parameter: float,
    scaled_semi_major_axis: float,
    inclination_rad: float,
    orbital_period_s: float,
) -> float:
    sin_inclination = math.sin(inclination_rad)
    if sin_inclination <= 0.0:
        raise TransitMethodModelError()
    radicand = contact_radius_stellar_radii**2 - impact_parameter**2
    if radicand < -NUMERICAL_TOLERANCE:
        raise TransitMethodModelError()
    argument = math.sqrt(max(0.0, radicand)) / (scaled_semi_major_axis * sin_inclination)
    return orbital_period_s / math.pi * math.asin(_unit_interval(argument))


def calculate_transit_method(inputs: TransitMethodInput) -> TransitMethodResult:
    """Calculate the reviewed circular, uniform-source Transit Method v1 result."""

    radius_ratio = inputs.planet_radius_m / inputs.stellar_radius_m
    scaled_semi_major_axis = inputs.semi_major_axis_m / inputs.stellar_radius_m
    inclination_rad = math.radians(inputs.inclination_deg)
    impact_parameter = scaled_semi_major_axis * math.cos(inclination_rad)

    outer_contact = 1.0 + radius_ratio
    inner_contact = 1.0 - radius_ratio

    if impact_parameter >= outer_contact:
        classification: TransitClassification = "no_transit"
        total_duration = None
        full_duration = None
        maximum_depth = 0.0
        half_window = inputs.orbital_period_s / 4.0
    else:
        total_duration = _contact_duration(
            contact_radius_stellar_radii=outer_contact,
            impact_parameter=impact_parameter,
            scaled_semi_major_axis=scaled_semi_major_axis,
            inclination_rad=inclination_rad,
            orbital_period_s=inputs.orbital_period_s,
        )
        if impact_parameter >= inner_contact:
            classification = "grazing"
            full_duration = None
        else:
            classification = "full"
            full_duration = _contact_duration(
                contact_radius_stellar_radii=inner_contact,
                impact_parameter=impact_parameter,
                scaled_semi_major_axis=scaled_semi_major_axis,
                inclination_rad=inclination_rad,
                orbital_period_s=inputs.orbital_period_s,
            )
        maximum_depth = _uniform_blocked_fraction(radius_ratio, impact_parameter)
        half_window = total_duration

    interval = 2.0 * half_window / (LIGHT_CURVE_POINTS - 1)
    points: list[TransitLightCurvePoint] = []
    for index in range(LIGHT_CURVE_POINTS):
        time_from_mid_transit = -half_window + interval * index
        if index == LIGHT_CURVE_POINTS // 2:
            time_from_mid_transit = 0.0
        separation = _projected_separation(
            scaled_semi_major_axis=scaled_semi_major_axis,
            inclination_rad=inclination_rad,
            time_from_mid_transit_s=time_from_mid_transit,
            orbital_period_s=inputs.orbital_period_s,
        )
        blocked = _uniform_blocked_fraction(radius_ratio, separation)
        points.append(
            TransitLightCurvePoint(
                time_from_mid_transit_s=time_from_mid_transit,
                orbital_phase=time_from_mid_transit / inputs.orbital_period_s,
                projected_separation_stellar_radii=separation,
                relative_flux=1.0 - blocked,
            )
        )

    return TransitMethodResult(
        model_version=TRANSIT_METHOD_MODEL_VERSION,
        schema_version=TRANSIT_METHOD_SCHEMA_VERSION,
        inputs=inputs,
        radius_ratio=radius_ratio,
        scaled_semi_major_axis=scaled_semi_major_axis,
        impact_parameter=impact_parameter,
        classification=classification,
        central_depth_approximation_fraction=radius_ratio * radius_ratio,
        maximum_depth_fraction=maximum_depth,
        maximum_depth_ppm=maximum_depth * 1_000_000.0,
        total_duration_s=total_duration,
        full_duration_s=full_duration,
        light_curve=tuple(points),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise TransitMethodModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise TransitMethodModelError()
    return value


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise TransitMethodModelError()
    return value


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TransitMethodModelError()
    numeric = float(value)
    if not math.isfinite(numeric):
        raise TransitMethodModelError()
    return numeric


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise TransitMethodModelError()


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
        raise TransitMethodModelError()
    parsed = urlparse(_string(source["url"]))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise TransitMethodModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def load_reviewed_transit_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and strictly validate the checked-in Transit Method model artifact."""

    path = repository_root / TRANSIT_METHOD_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, TransitMethodModelError):
        raise TransitMethodModelError() from None

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
                "presets",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != TRANSIT_METHOD_ARTIFACT_VERSION
        or artifact["model_version"] != TRANSIT_METHOD_MODEL_VERSION
        or artifact["schema_version"] != TRANSIT_METHOD_SCHEMA_VERSION
        or artifact["share_schema_version"] != TRANSIT_METHOD_SHARE_SCHEMA_VERSION
    ):
        raise TransitMethodModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "transit-method"
        or definition.get("model_version") != TRANSIT_METHOD_MODEL_VERSION
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("share_schema_version") != TRANSIT_METHOD_SHARE_SCHEMA_VERSION
    ):
        raise TransitMethodModelError()
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
            or not all(isinstance(v, str) and v for v in values)
        ):
            raise TransitMethodModelError()
    reference_values = definition["references"]
    fixture_values = definition["validation_fixtures"]
    if not isinstance(reference_values, list) or not all(
        isinstance(value, str) for value in reference_values
    ):
        raise TransitMethodModelError()
    if not isinstance(fixture_values, list) or not all(
        isinstance(value, str) for value in fixture_values
    ):
        raise TransitMethodModelError()
    if set(reference_values) != _SOURCE_IDS:
        raise TransitMethodModelError()
    if set(fixture_values) != _VALIDATION_FIXTURE_IDS:
        raise TransitMethodModelError()
    equations = _mapping(definition.get("equations"))
    expected_equations = frozenset(
        {
            "radius_ratio",
            "impact_parameter_circular",
            "projected_separation_circular",
            "uniform_source_flux",
            "total_duration_circular",
            "full_duration_circular",
            "central_depth_approximation",
        }
    )
    _exact_keys(equations, expected_equations)
    for value in equations.values():
        _string(value)

    raw_sources = artifact["sources"]
    if (
        not isinstance(raw_sources, list)
        or {_validate_source(v) for v in raw_sources} != _SOURCE_IDS
    ):
        raise TransitMethodModelError()

    constants = _mapping(artifact["constants"])
    expected_constants = {
        "LIGHT_CURVE_POINTS": float(LIGHT_CURVE_POINTS),
        "NUMERICAL_TOLERANCE": NUMERICAL_TOLERANCE,
        "MIN_STELLAR_RADIUS_M": MIN_STELLAR_RADIUS_M,
        "MAX_STELLAR_RADIUS_M": MAX_STELLAR_RADIUS_M,
        "MIN_PLANET_RADIUS_M": MIN_PLANET_RADIUS_M,
        "MAX_SEMIMAJOR_AXIS_M": MAX_SEMIMAJOR_AXIS_M,
        "MIN_ORBITAL_PERIOD_S": MIN_ORBITAL_PERIOD_S,
        "MAX_ORBITAL_PERIOD_S": MAX_ORBITAL_PERIOD_S,
        "MIN_INCLINATION_DEG": MIN_INCLINATION_DEG,
        "MAX_INCLINATION_DEG": MAX_INCLINATION_DEG,
    }
    _exact_keys(constants, frozenset(expected_constants))
    for key, expected in expected_constants.items():
        if not math.isclose(_number(constants[key]), expected, rel_tol=1e-15, abs_tol=0.0):
            raise TransitMethodModelError()

    presets = _mapping(artifact["presets"])
    _exact_keys(presets, frozenset({"illustrative-central-transit"}))
    default_preset = _mapping(presets["illustrative-central-transit"])
    _exact_keys(
        default_preset,
        frozenset(
            {
                "stellar_radius_m",
                "planet_radius_m",
                "semi_major_axis_m",
                "orbital_period_s",
                "inclination_deg",
            }
        ),
    )
    preset_input = TransitMethodInput(
        **{key: _number(value) for key, value in default_preset.items()}
    )
    preset_result = calculate_transit_method(preset_input)
    if (
        preset_result.classification != "full"
        or not math.isclose(preset_result.radius_ratio, 0.1, rel_tol=0.0, abs_tol=1e-15)
        or not math.isclose(
            preset_result.maximum_depth_fraction,
            0.01,
            rel_tol=0.0,
            abs_tol=1e-15,
        )
    ):
        raise TransitMethodModelError()

    raw_fixtures = artifact["validation_fixtures"]
    if not isinstance(raw_fixtures, list):
        raise TransitMethodModelError()
    fixture_ids: set[str] = set()
    for raw_fixture in raw_fixtures:
        fixture = _mapping(raw_fixture)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise TransitMethodModelError()

    validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        validation,
        frozenset({"id", "checked_at", "method", "tools", "source_ids", "test_references"}),
    )
    if validation["id"] != "transit-method-independent-validation-v1":
        raise TransitMethodModelError()
    _string(validation["checked_at"])
    _string(validation["method"])
    if (
        not isinstance(validation["source_ids"], list)
        or set(validation["source_ids"]) != _SOURCE_IDS
    ):
        raise TransitMethodModelError()
    tests = validation["test_references"]
    if not isinstance(tests, list) or not tests or not all(isinstance(v, str) and v for v in tests):
        raise TransitMethodModelError()
    tools = validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise TransitMethodModelError()
    for raw_tool in tools:
        tool = _mapping(raw_tool)
        _exact_keys(tool, frozenset({"name", "version", "role"}))
        _string(tool["name"])
        _string(tool["version"])
        _string(tool["role"])

    return dict(artifact)


__all__ = [
    "LIGHT_CURVE_POINTS",
    "TRANSIT_METHOD_ARTIFACT_PATH",
    "TRANSIT_METHOD_ARTIFACT_VERSION",
    "TRANSIT_METHOD_MODEL_VERSION",
    "TRANSIT_METHOD_SCHEMA_VERSION",
    "TRANSIT_METHOD_SHARE_SCHEMA_VERSION",
    "TransitClassification",
    "TransitLightCurvePoint",
    "TransitMethodInput",
    "TransitMethodModelError",
    "TransitMethodResult",
    "calculate_transit_method",
    "load_reviewed_transit_artifact",
]
