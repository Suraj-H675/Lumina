"""Deterministic Keplerian stellar-reflex model for Radial Velocity Lab v1.

The canonical orbital phase and radial-velocity calculation lives here. The
browser may validate and render returned values, but it must not reimplement
Kepler's equation, the RV relation, or the spectroscopic mass function.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final
from urllib.parse import urlparse

RADIAL_VELOCITY_MODEL_VERSION: Final = "radial-velocity-v1"
RADIAL_VELOCITY_SCHEMA_VERSION: Final = 1
RADIAL_VELOCITY_SHARE_SCHEMA_VERSION: Final = 1
RADIAL_VELOCITY_ARTIFACT_VERSION: Final = 1
RADIAL_VELOCITY_ARTIFACT_PATH: Final = "data/seed/radial-velocity-v1.json"

G_M3_KG_S2: Final = 6.67430e-11
CURVE_POINTS: Final = 301
MIN_STELLAR_MASS_KG: Final = 1.0e28
MAX_STELLAR_MASS_KG: Final = 1.0e32
MIN_PLANET_MASS_KG: Final = 1.0e18
MAX_PLANET_MASS_KG: Final = 1.0e29
MAX_PLANET_TO_STAR_MASS_RATIO: Final = 0.1
MIN_ORBITAL_PERIOD_S: Final = 3600.0
MAX_ORBITAL_PERIOD_S: Final = 1.0e10
MAX_ECCENTRICITY: Final = 0.95
MIN_INCLINATION_DEG: Final = 0.0
MAX_INCLINATION_DEG: Final = 90.0
KEPLER_TOLERANCE_RAD: Final = 1.0e-13
KEPLER_MAX_NEWTON_ITERATIONS: Final = 32
KEPLER_BISECTION_ITERATIONS: Final = 64
MINIMUM_MASS_BISECTION_ITERATIONS: Final = 96

_TAU: Final = 2.0 * math.pi
_SOURCE_IDS: Final = frozenset(
    {
        "murray-correia-2010-keplerian-orbits",
        "wright-gaudi-2013-detection-methods",
        "nist-codata-2022",
    }
)
_SOURCE_URLS: Final = {
    "murray-correia-2010-keplerian-orbits": "https://arxiv.org/abs/1009.1738",
    "wright-gaudi-2013-detection-methods": "https://arxiv.org/abs/1210.2471",
    "nist-codata-2022": "https://physics.nist.gov/cuu/pdf/all.pdf",
}
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "circular-edge-on-quarter-phases",
        "inclination-sine-scaling",
        "face-on-zero-signal",
        "eccentric-periastron-apoastron",
        "mass-function-edge-on-solution",
        "high-eccentricity-finite-curve",
        "deterministic-repeat",
        "domain-rejection",
        "artifact-mutation",
    }
)


class RadialVelocityModelError(ValueError):
    """Raised when RV inputs, numerics, or artifacts leave the reviewed v1 domain."""


@dataclass(frozen=True, slots=True)
class RadialVelocityInput:
    stellar_mass_kg: float
    planet_mass_kg: float
    orbital_period_s: float
    eccentricity: float
    inclination_deg: float
    stellar_argument_of_periastron_deg: float
    mean_anomaly_at_epoch_deg: float

    def __post_init__(self) -> None:
        stellar_mass = _validated_number(
            self.stellar_mass_kg,
            minimum=MIN_STELLAR_MASS_KG,
            maximum=MAX_STELLAR_MASS_KG,
        )
        planet_mass = _validated_number(
            self.planet_mass_kg,
            minimum=MIN_PLANET_MASS_KG,
            maximum=MAX_PLANET_MASS_KG,
        )
        orbital_period = _validated_number(
            self.orbital_period_s,
            minimum=MIN_ORBITAL_PERIOD_S,
            maximum=MAX_ORBITAL_PERIOD_S,
        )
        eccentricity = _validated_number(
            self.eccentricity,
            minimum=0.0,
            maximum=MAX_ECCENTRICITY,
        )
        inclination = _validated_number(
            self.inclination_deg,
            minimum=MIN_INCLINATION_DEG,
            maximum=MAX_INCLINATION_DEG,
        )
        stellar_argument = _validated_half_open_angle(self.stellar_argument_of_periastron_deg)
        mean_anomaly = _validated_half_open_angle(self.mean_anomaly_at_epoch_deg)

        if planet_mass > MAX_PLANET_TO_STAR_MASS_RATIO * stellar_mass:
            raise RadialVelocityModelError()

        object.__setattr__(self, "stellar_mass_kg", stellar_mass)
        object.__setattr__(self, "planet_mass_kg", planet_mass)
        object.__setattr__(self, "orbital_period_s", orbital_period)
        object.__setattr__(self, "eccentricity", eccentricity)
        object.__setattr__(self, "inclination_deg", inclination)
        object.__setattr__(self, "stellar_argument_of_periastron_deg", stellar_argument)
        object.__setattr__(self, "mean_anomaly_at_epoch_deg", mean_anomaly)


@dataclass(frozen=True, slots=True)
class RadialVelocityCurvePoint:
    time_s: float
    orbital_phase: float
    radial_velocity_m_s: float


@dataclass(frozen=True, slots=True)
class RadialVelocityResult:
    model_version: str
    schema_version: int
    inputs: RadialVelocityInput
    inclination_projection: float
    semi_amplitude_m_s: float
    projected_planet_mass_kg: float
    mass_function_kg: float
    edge_on_minimum_mass_kg: float
    curve: tuple[RadialVelocityCurvePoint, ...]


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RadialVelocityModelError()
    try:
        numeric = float(value)
    except (OverflowError, TypeError, ValueError):
        raise RadialVelocityModelError() from None
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise RadialVelocityModelError()
    return 0.0 if numeric == 0.0 else numeric


def _validated_half_open_angle(value: object) -> float:
    numeric = _validated_number(value, minimum=0.0, maximum=360.0)
    if numeric >= 360.0:
        raise RadialVelocityModelError()
    return numeric


def _signed_mean_anomaly(mean_anomaly_rad: float) -> float:
    normalized = math.fmod(mean_anomaly_rad, _TAU)
    if normalized < 0.0:
        normalized += _TAU
    if normalized > math.pi:
        normalized -= _TAU
    return 0.0 if normalized == 0.0 else normalized


def _solve_eccentric_anomaly(mean_anomaly_rad: float, eccentricity: float) -> float:
    """Solve M = E - e*sin(E) with deterministic Newton plus bracket fallback."""

    mean_anomaly = _signed_mean_anomaly(mean_anomaly_rad)
    if eccentricity == 0.0:
        return mean_anomaly

    if eccentricity < 0.8 or abs(mean_anomaly) < 0.25:
        eccentric_anomaly = mean_anomaly
    else:
        eccentric_anomaly = math.copysign(math.pi, mean_anomaly)

    for _ in range(KEPLER_MAX_NEWTON_ITERATIONS):
        residual = eccentric_anomaly - eccentricity * math.sin(eccentric_anomaly) - mean_anomaly
        derivative = 1.0 - eccentricity * math.cos(eccentric_anomaly)
        if derivative <= 0.0 or not math.isfinite(derivative):
            break
        delta = residual / derivative
        candidate = eccentric_anomaly - delta
        if not math.isfinite(candidate):
            break
        eccentric_anomaly = candidate
        if abs(delta) <= KEPLER_TOLERANCE_RAD:
            return eccentric_anomaly

    lower = -math.pi
    upper = math.pi
    for _ in range(KEPLER_BISECTION_ITERATIONS):
        midpoint = 0.5 * (lower + upper)
        residual = midpoint - eccentricity * math.sin(midpoint) - mean_anomaly
        if abs(residual) <= KEPLER_TOLERANCE_RAD:
            return midpoint
        if residual < 0.0:
            lower = midpoint
        else:
            upper = midpoint
    midpoint = 0.5 * (lower + upper)
    if abs(midpoint - eccentricity * math.sin(midpoint) - mean_anomaly) > 1.0e-11:
        raise RadialVelocityModelError()
    return midpoint


def _true_anomaly(eccentric_anomaly: float, eccentricity: float) -> float:
    denominator = 1.0 - eccentricity * math.cos(eccentric_anomaly)
    if denominator <= 0.0:
        raise RadialVelocityModelError()
    sin_true = (
        math.sqrt(1.0 - eccentricity * eccentricity) * math.sin(eccentric_anomaly) / denominator
    )
    cos_true = (math.cos(eccentric_anomaly) - eccentricity) / denominator
    true_anomaly = math.atan2(sin_true, cos_true)
    if not math.isfinite(true_anomaly):
        raise RadialVelocityModelError()
    return true_anomaly


def _semi_amplitude(inputs: RadialVelocityInput, inclination_projection: float) -> float:
    total_mass = inputs.stellar_mass_kg + inputs.planet_mass_kg
    eccentricity_factor = math.sqrt(1.0 - inputs.eccentricity * inputs.eccentricity)
    semi_amplitude = (
        (_TAU * G_M3_KG_S2 / inputs.orbital_period_s) ** (1.0 / 3.0)
        * inputs.planet_mass_kg
        * inclination_projection
        / (total_mass ** (2.0 / 3.0) * eccentricity_factor)
    )
    if not math.isfinite(semi_amplitude) or semi_amplitude < 0.0:
        raise RadialVelocityModelError()
    return 0.0 if semi_amplitude == 0.0 else semi_amplitude


def _mass_function(
    *,
    semi_amplitude_m_s: float,
    period_s: float,
    eccentricity: float,
) -> float:
    if semi_amplitude_m_s == 0.0:
        return 0.0
    value = float(
        period_s
        * semi_amplitude_m_s**3
        * (1.0 - eccentricity * eccentricity) ** 1.5
        / (_TAU * G_M3_KG_S2)
    )
    if not math.isfinite(value) or value < 0.0:
        raise RadialVelocityModelError()
    return value


def _edge_on_minimum_mass(*, stellar_mass_kg: float, mass_function_kg: float) -> float:
    if mass_function_kg == 0.0:
        return 0.0

    def residual(companion_mass: float) -> float:
        return companion_mass**3 / (stellar_mass_kg + companion_mass) ** 2 - mass_function_kg

    lower = 0.0
    upper = stellar_mass_kg
    if residual(upper) <= 0.0:
        raise RadialVelocityModelError()
    for _ in range(MINIMUM_MASS_BISECTION_ITERATIONS):
        midpoint = 0.5 * (lower + upper)
        if residual(midpoint) < 0.0:
            lower = midpoint
        else:
            upper = midpoint
    minimum_mass = 0.5 * (lower + upper)
    if not math.isfinite(minimum_mass) or minimum_mass < 0.0:
        raise RadialVelocityModelError()
    return minimum_mass


def calculate_radial_velocity(inputs: RadialVelocityInput) -> RadialVelocityResult:
    """Return the reviewed deterministic one-period stellar-reflex RV result."""

    inclination_rad = math.radians(inputs.inclination_deg)
    inclination_projection = math.sin(inclination_rad)
    semi_amplitude = _semi_amplitude(inputs, inclination_projection)
    projected_mass = inputs.planet_mass_kg * inclination_projection
    mass_function = _mass_function(
        semi_amplitude_m_s=semi_amplitude,
        period_s=inputs.orbital_period_s,
        eccentricity=inputs.eccentricity,
    )
    minimum_mass = _edge_on_minimum_mass(
        stellar_mass_kg=inputs.stellar_mass_kg,
        mass_function_kg=mass_function,
    )

    stellar_argument = math.radians(inputs.stellar_argument_of_periastron_deg)
    mean_anomaly_at_epoch = math.radians(inputs.mean_anomaly_at_epoch_deg)
    points: list[RadialVelocityCurvePoint] = []
    denominator = CURVE_POINTS - 1
    for index in range(CURVE_POINTS):
        phase = index / denominator
        time_s = inputs.orbital_period_s * phase
        mean_anomaly = mean_anomaly_at_epoch + _TAU * phase
        eccentric_anomaly = _solve_eccentric_anomaly(mean_anomaly, inputs.eccentricity)
        true_anomaly = _true_anomaly(eccentric_anomaly, inputs.eccentricity)
        radial_velocity = semi_amplitude * (
            math.cos(true_anomaly + stellar_argument)
            + inputs.eccentricity * math.cos(stellar_argument)
        )
        if not math.isfinite(radial_velocity):
            raise RadialVelocityModelError()
        if abs(radial_velocity) < 1.0e-15:
            radial_velocity = 0.0
        points.append(
            RadialVelocityCurvePoint(
                time_s=time_s,
                orbital_phase=phase,
                radial_velocity_m_s=radial_velocity,
            )
        )

    return RadialVelocityResult(
        model_version=RADIAL_VELOCITY_MODEL_VERSION,
        schema_version=RADIAL_VELOCITY_SCHEMA_VERSION,
        inputs=inputs,
        inclination_projection=inclination_projection,
        semi_amplitude_m_s=semi_amplitude,
        projected_planet_mass_kg=projected_mass,
        mass_function_kg=mass_function,
        edge_on_minimum_mass_kg=minimum_mass,
        curve=tuple(points),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise RadialVelocityModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise RadialVelocityModelError()
    return value


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise RadialVelocityModelError()
    return value


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RadialVelocityModelError()
    numeric = float(value)
    if not math.isfinite(numeric):
        raise RadialVelocityModelError()
    return numeric


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise RadialVelocityModelError()


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
        raise RadialVelocityModelError()
    parsed = urlparse(_string(source["url"]))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise RadialVelocityModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def load_reviewed_radial_velocity_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and strictly validate the checked-in Radial Velocity v1 artifact."""

    path = repository_root / RADIAL_VELOCITY_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, RadialVelocityModelError):
        raise RadialVelocityModelError() from None

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
        artifact["artifact_version"] != RADIAL_VELOCITY_ARTIFACT_VERSION
        or artifact["model_version"] != RADIAL_VELOCITY_MODEL_VERSION
        or artifact["schema_version"] != RADIAL_VELOCITY_SCHEMA_VERSION
        or artifact["share_schema_version"] != RADIAL_VELOCITY_SHARE_SCHEMA_VERSION
    ):
        raise RadialVelocityModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "radial-velocity"
        or definition.get("model_version") != RADIAL_VELOCITY_MODEL_VERSION
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("share_schema_version") != RADIAL_VELOCITY_SHARE_SCHEMA_VERSION
    ):
        raise RadialVelocityModelError()
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
            raise RadialVelocityModelError()
    references = definition["references"]
    fixtures = definition["validation_fixtures"]
    if not isinstance(references, list) or set(references) != _SOURCE_IDS:
        raise RadialVelocityModelError()
    if not isinstance(fixtures, list) or set(fixtures) != _VALIDATION_FIXTURE_IDS:
        raise RadialVelocityModelError()
    equations = _mapping(definition.get("equations"))
    _exact_keys(
        equations,
        frozenset(
            {
                "mean_motion",
                "mean_anomaly",
                "kepler_equation",
                "true_anomaly",
                "semi_amplitude",
                "stellar_reflex_velocity",
                "mass_function",
                "edge_on_minimum_mass",
            }
        ),
    )
    for equation in equations.values():
        _string(equation)

    raw_sources = artifact["sources"]
    if (
        not isinstance(raw_sources, list)
        or {_validate_source(source) for source in raw_sources} != _SOURCE_IDS
    ):
        raise RadialVelocityModelError()

    constants = _mapping(artifact["constants"])
    expected_constants = {
        "G_M3_KG_S2": G_M3_KG_S2,
        "CURVE_POINTS": float(CURVE_POINTS),
        "MIN_STELLAR_MASS_KG": MIN_STELLAR_MASS_KG,
        "MAX_STELLAR_MASS_KG": MAX_STELLAR_MASS_KG,
        "MIN_PLANET_MASS_KG": MIN_PLANET_MASS_KG,
        "MAX_PLANET_MASS_KG": MAX_PLANET_MASS_KG,
        "MAX_PLANET_TO_STAR_MASS_RATIO": MAX_PLANET_TO_STAR_MASS_RATIO,
        "MIN_ORBITAL_PERIOD_S": MIN_ORBITAL_PERIOD_S,
        "MAX_ORBITAL_PERIOD_S": MAX_ORBITAL_PERIOD_S,
        "MAX_ECCENTRICITY": MAX_ECCENTRICITY,
        "MIN_INCLINATION_DEG": MIN_INCLINATION_DEG,
        "MAX_INCLINATION_DEG": MAX_INCLINATION_DEG,
        "KEPLER_TOLERANCE_RAD": KEPLER_TOLERANCE_RAD,
        "KEPLER_MAX_NEWTON_ITERATIONS": float(KEPLER_MAX_NEWTON_ITERATIONS),
        "KEPLER_BISECTION_ITERATIONS": float(KEPLER_BISECTION_ITERATIONS),
        "MINIMUM_MASS_BISECTION_ITERATIONS": float(MINIMUM_MASS_BISECTION_ITERATIONS),
    }
    _exact_keys(constants, frozenset(expected_constants))
    for key, expected in expected_constants.items():
        if not math.isclose(_number(constants[key]), expected, rel_tol=1.0e-15, abs_tol=0.0):
            raise RadialVelocityModelError()

    presets = _mapping(artifact["presets"])
    _exact_keys(presets, frozenset({"illustrative-circular-edge-on"}))
    default_preset = _mapping(presets["illustrative-circular-edge-on"])
    _exact_keys(
        default_preset,
        frozenset(
            {
                "stellar_mass_kg",
                "planet_mass_kg",
                "orbital_period_s",
                "eccentricity",
                "inclination_deg",
                "stellar_argument_of_periastron_deg",
                "mean_anomaly_at_epoch_deg",
            }
        ),
    )
    preset_input = RadialVelocityInput(
        **{key: _number(value) for key, value in default_preset.items()}
    )
    preset_result = calculate_radial_velocity(preset_input)
    if (
        len(preset_result.curve) != CURVE_POINTS
        or preset_result.semi_amplitude_m_s <= 0.0
        or preset_result.curve[0].radial_velocity_m_s != preset_result.curve[-1].radial_velocity_m_s
    ):
        raise RadialVelocityModelError()

    raw_fixtures = artifact["validation_fixtures"]
    if not isinstance(raw_fixtures, list):
        raise RadialVelocityModelError()
    fixture_ids: set[str] = set()
    for raw_fixture in raw_fixtures:
        fixture = _mapping(raw_fixture)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise RadialVelocityModelError()

    validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        validation,
        frozenset({"id", "checked_at", "method", "tools", "source_ids", "test_references"}),
    )
    if validation["id"] != "radial-velocity-v1-validation":
        raise RadialVelocityModelError()
    _string(validation["checked_at"])
    _string(validation["method"])
    source_ids = validation["source_ids"]
    if not isinstance(source_ids, list) or set(source_ids) != _SOURCE_IDS:
        raise RadialVelocityModelError()
    tests = validation["test_references"]
    if (
        not isinstance(tests, list)
        or not tests
        or not all(isinstance(test, str) and test for test in tests)
    ):
        raise RadialVelocityModelError()
    tools = validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise RadialVelocityModelError()
    for raw_tool in tools:
        tool = _mapping(raw_tool)
        _exact_keys(tool, frozenset({"name", "version", "role"}))
        _string(tool["name"])
        _string(tool["version"])
        _string(tool["role"])

    return dict(artifact)


__all__ = [
    "CURVE_POINTS",
    "RADIAL_VELOCITY_ARTIFACT_PATH",
    "RADIAL_VELOCITY_ARTIFACT_VERSION",
    "RADIAL_VELOCITY_MODEL_VERSION",
    "RADIAL_VELOCITY_SCHEMA_VERSION",
    "RADIAL_VELOCITY_SHARE_SCHEMA_VERSION",
    "RadialVelocityCurvePoint",
    "RadialVelocityInput",
    "RadialVelocityModelError",
    "RadialVelocityResult",
    "calculate_radial_velocity",
    "load_reviewed_radial_velocity_artifact",
]
