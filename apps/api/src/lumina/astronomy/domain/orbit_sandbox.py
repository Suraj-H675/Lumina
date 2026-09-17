"""Deterministic Newtonian two-body model for Orbit Sandbox v1.

The canonical calculation lives here. The browser only validates serialized
state and renders returned values; it does not reproduce the orbital physics.
Relative position and velocity are expressed in a central-body-centred frame.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

ORBIT_SANDBOX_MODEL_VERSION: Final = "orbit-sandbox-v1"
ORBIT_SANDBOX_SCHEMA_VERSION: Final = 1
ORBIT_SANDBOX_SHARE_SCHEMA_VERSION: Final = 1
ORBIT_SANDBOX_ARTIFACT_VERSION: Final = 1
ORBIT_SANDBOX_ARTIFACT_PATH: Final = "data/seed/orbit-sandbox-v1.json"

GRAVITATIONAL_CONSTANT_M3_KG_S2: Final = 6.67430e-11
SPEED_OF_LIGHT_M_S: Final = 299_792_458.0

MIN_CENTRAL_MASS_KG: Final = 1.0e10
MAX_CENTRAL_MASS_KG: Final = 1.0e32
MIN_CENTRAL_RADIUS_M: Final = 1.0
MAX_CENTRAL_RADIUS_M: Final = 1.0e10
MAX_ORBITING_BODY_MASS_KG: Final = 1.0e30
MAX_ABS_POSITION_COMPONENT_M: Final = 1.0e13
MAX_ABS_VELOCITY_COMPONENT_M_S: Final = 3.0e6
MIN_DURATION_S: Final = 0.01
MAX_DURATION_S: Final = 1.0e8
MIN_TIME_STEP_S: Final = 0.001
MAX_TIME_STEP_S: Final = 1.0e6
MAX_TRAJECTORY_POINTS: Final = 4096
MAX_INITIAL_SPEED_FRACTION_OF_C: Final = 0.01
MIN_CENTRAL_RADIUS_SCHWARZSCHILD_MULTIPLE: Final = 100.0
MAX_STEP_FRACTION_OF_INITIAL_DYNAMICAL_TIME: Final = 0.05
PARABOLIC_NORMALIZED_ENERGY_TOLERANCE: Final = 1.0e-10

_SOURCE_IDS: Final = frozenset(
    {
        "nist-codata-2022",
        "nasa-earth-fact-sheet",
        "openstax-gravitation-orbits",
    }
)
_SOURCE_URLS: Final = {
    "nist-codata-2022": "https://physics.nist.gov/cuu/pdf/all.pdf",
    "nasa-earth-fact-sheet": "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html",
    "openstax-gravitation-orbits": (
        "https://openstax.org/books/university-physics-volume-1/pages/13-key-equations"
    ),
}
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "circular-low-earth-orbit",
        "elliptical-earth-orbit",
        "parabolic-escape",
        "hyperbolic-escape",
        "radial-collision",
        "secondary-mass-relative-orbit",
        "immediate-collision",
        "domain-rejection",
    }
)

OrbitClassification = Literal["bound", "parabolic_near", "escape", "collision"]


class OrbitSandboxModelError(ValueError):
    """Raised when Orbit Sandbox inputs fall outside the reviewed v1 domain."""


@dataclass(frozen=True, slots=True)
class OrbitSandboxInput:
    central_mass_kg: float
    central_radius_m: float
    orbiting_body_mass_kg: float
    position_x_m: float
    position_y_m: float
    velocity_x_m_s: float
    velocity_y_m_s: float
    duration_s: float
    time_step_s: float

    def __post_init__(self) -> None:
        central_mass = _validated_number(
            self.central_mass_kg,
            minimum=MIN_CENTRAL_MASS_KG,
            maximum=MAX_CENTRAL_MASS_KG,
        )
        central_radius = _validated_number(
            self.central_radius_m,
            minimum=MIN_CENTRAL_RADIUS_M,
            maximum=MAX_CENTRAL_RADIUS_M,
        )
        orbiting_mass = _validated_number(
            self.orbiting_body_mass_kg,
            minimum=0.0,
            maximum=MAX_ORBITING_BODY_MASS_KG,
        )
        if orbiting_mass > central_mass:
            raise OrbitSandboxModelError()

        position_x = _validated_number(
            self.position_x_m,
            minimum=-MAX_ABS_POSITION_COMPONENT_M,
            maximum=MAX_ABS_POSITION_COMPONENT_M,
        )
        position_y = _validated_number(
            self.position_y_m,
            minimum=-MAX_ABS_POSITION_COMPONENT_M,
            maximum=MAX_ABS_POSITION_COMPONENT_M,
        )
        velocity_x = _validated_number(
            self.velocity_x_m_s,
            minimum=-MAX_ABS_VELOCITY_COMPONENT_M_S,
            maximum=MAX_ABS_VELOCITY_COMPONENT_M_S,
        )
        velocity_y = _validated_number(
            self.velocity_y_m_s,
            minimum=-MAX_ABS_VELOCITY_COMPONENT_M_S,
            maximum=MAX_ABS_VELOCITY_COMPONENT_M_S,
        )
        duration = _validated_number(
            self.duration_s,
            minimum=MIN_DURATION_S,
            maximum=MAX_DURATION_S,
        )
        time_step = _validated_number(
            self.time_step_s,
            minimum=MIN_TIME_STEP_S,
            maximum=MAX_TIME_STEP_S,
        )

        radius = math.hypot(position_x, position_y)
        if radius <= 0.0:
            raise OrbitSandboxModelError()
        speed = math.hypot(velocity_x, velocity_y)
        if speed > SPEED_OF_LIGHT_M_S * MAX_INITIAL_SPEED_FRACTION_OF_C:
            raise OrbitSandboxModelError()

        total_mass = central_mass + orbiting_mass
        mu = GRAVITATIONAL_CONSTANT_M3_KG_S2 * total_mass
        schwarzschild_radius = (
            2.0
            * GRAVITATIONAL_CONSTANT_M3_KG_S2
            * central_mass
            / (SPEED_OF_LIGHT_M_S * SPEED_OF_LIGHT_M_S)
        )
        if central_radius < schwarzschild_radius * MIN_CENTRAL_RADIUS_SCHWARZSCHILD_MULTIPLE:
            raise OrbitSandboxModelError()

        step_count = math.ceil(duration / time_step)
        if step_count + 1 > MAX_TRAJECTORY_POINTS:
            raise OrbitSandboxModelError()
        if radius > central_radius:
            dynamical_time = math.sqrt(radius**3 / mu)
            if time_step > dynamical_time * MAX_STEP_FRACTION_OF_INITIAL_DYNAMICAL_TIME:
                raise OrbitSandboxModelError()

        object.__setattr__(self, "central_mass_kg", central_mass)
        object.__setattr__(self, "central_radius_m", central_radius)
        object.__setattr__(self, "orbiting_body_mass_kg", orbiting_mass)
        object.__setattr__(self, "position_x_m", position_x)
        object.__setattr__(self, "position_y_m", position_y)
        object.__setattr__(self, "velocity_x_m_s", velocity_x)
        object.__setattr__(self, "velocity_y_m_s", velocity_y)
        object.__setattr__(self, "duration_s", duration)
        object.__setattr__(self, "time_step_s", time_step)


@dataclass(frozen=True, slots=True)
class OrbitTrajectoryPoint:
    time_s: float
    x_m: float
    y_m: float
    distance_m: float
    speed_m_s: float


@dataclass(frozen=True, slots=True)
class OrbitSandboxResult:
    model_version: str
    schema_version: int
    inputs: OrbitSandboxInput
    gravitational_parameter_m3_s2: float
    reduced_mass_kg: float | None
    specific_orbital_energy_j_per_kg: float
    orbital_energy_j: float | None
    specific_angular_momentum_m2_per_s: float
    angular_momentum_kg_m2_per_s: float | None
    eccentricity: float
    semi_major_axis_m: float | None
    period_s: float | None
    periapsis_m: float
    apoapsis_m: float | None
    classification: OrbitClassification
    collision_time_s: float | None
    trajectory: tuple[OrbitTrajectoryPoint, ...]
    max_specific_energy_drift_fraction: float
    max_specific_angular_momentum_drift_fraction: float


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise OrbitSandboxModelError()
    try:
        numeric = float(value)
    except (OverflowError, TypeError, ValueError):
        raise OrbitSandboxModelError() from None
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise OrbitSandboxModelError()
    return 0.0 if numeric == 0.0 else numeric


def _specific_invariants(
    x_m: float,
    y_m: float,
    vx_m_s: float,
    vy_m_s: float,
    mu: float,
) -> tuple[float, float]:
    radius = math.hypot(x_m, y_m)
    speed_squared = vx_m_s * vx_m_s + vy_m_s * vy_m_s
    energy = 0.5 * speed_squared - mu / radius
    angular_momentum = x_m * vy_m_s - y_m * vx_m_s
    return energy, angular_momentum


def _eccentricity(
    x_m: float,
    y_m: float,
    vx_m_s: float,
    vy_m_s: float,
    mu: float,
) -> float:
    radius = math.hypot(x_m, y_m)
    speed_squared = vx_m_s * vx_m_s + vy_m_s * vy_m_s
    radial_velocity_dot = x_m * vx_m_s + y_m * vy_m_s
    factor = speed_squared - mu / radius
    ex = (factor * x_m - radial_velocity_dot * vx_m_s) / mu
    ey = (factor * y_m - radial_velocity_dot * vy_m_s) / mu
    eccentricity = math.hypot(ex, ey)
    if not math.isfinite(eccentricity):
        raise OrbitSandboxModelError()
    return eccentricity


def _acceleration(x_m: float, y_m: float, mu: float) -> tuple[float, float]:
    radius = math.hypot(x_m, y_m)
    if radius <= 0.0:
        raise OrbitSandboxModelError()
    scale = -mu / (radius * radius * radius)
    return scale * x_m, scale * y_m


def _segment_collision_fraction(
    start_x: float,
    start_y: float,
    end_x: float,
    end_y: float,
    radius_m: float,
) -> float | None:
    if math.hypot(start_x, start_y) <= radius_m:
        return 0.0
    dx = end_x - start_x
    dy = end_y - start_y
    a = dx * dx + dy * dy
    if a == 0.0:
        return None
    b = 2.0 * (start_x * dx + start_y * dy)
    c = start_x * start_x + start_y * start_y - radius_m * radius_m
    discriminant = b * b - 4.0 * a * c
    if discriminant < 0.0:
        return None
    root = math.sqrt(max(0.0, discriminant))
    for fraction in ((-b - root) / (2.0 * a), (-b + root) / (2.0 * a)):
        if 0.0 <= fraction <= 1.0:
            return fraction
    return None


def _trajectory_point(
    *, time_s: float, x_m: float, y_m: float, vx_m_s: float, vy_m_s: float
) -> OrbitTrajectoryPoint:
    return OrbitTrajectoryPoint(
        time_s=time_s,
        x_m=x_m,
        y_m=y_m,
        distance_m=math.hypot(x_m, y_m),
        speed_m_s=math.hypot(vx_m_s, vy_m_s),
    )


def calculate_orbit_sandbox(inputs: OrbitSandboxInput) -> OrbitSandboxResult:
    if not isinstance(inputs, OrbitSandboxInput):
        raise OrbitSandboxModelError()

    mu = GRAVITATIONAL_CONSTANT_M3_KG_S2 * (inputs.central_mass_kg + inputs.orbiting_body_mass_kg)
    x = inputs.position_x_m
    y = inputs.position_y_m
    vx = inputs.velocity_x_m_s
    vy = inputs.velocity_y_m_s
    initial_radius = math.hypot(x, y)

    initial_energy, initial_h = _specific_invariants(x, y, vx, vy, mu)
    eccentricity = _eccentricity(x, y, vx, vy, mu)
    normalized_energy = initial_energy / (mu / initial_radius)

    if abs(normalized_energy) <= PARABOLIC_NORMALIZED_ENERGY_TOLERANCE:
        base_classification: OrbitClassification = "parabolic_near"
    elif initial_energy < 0.0:
        base_classification = "bound"
    else:
        base_classification = "escape"

    semi_major_axis: float | None = None
    period: float | None = None
    apoapsis: float | None = None
    if base_classification == "bound":
        semi_major_axis = -mu / (2.0 * initial_energy)
        period = 2.0 * math.pi * math.sqrt(semi_major_axis**3 / mu)
        periapsis = max(0.0, semi_major_axis * (1.0 - eccentricity))
        apoapsis = semi_major_axis * (1.0 + eccentricity)
    else:
        denominator = mu * (1.0 + eccentricity)
        periapsis = 0.0 if denominator == 0.0 else (initial_h * initial_h) / denominator

    reduced_mass: float | None = None
    orbital_energy: float | None = None
    angular_momentum: float | None = None
    if inputs.orbiting_body_mass_kg > 0.0:
        reduced_mass = (
            inputs.central_mass_kg
            * inputs.orbiting_body_mass_kg
            / (inputs.central_mass_kg + inputs.orbiting_body_mass_kg)
        )
        orbital_energy = reduced_mass * initial_energy
        angular_momentum = reduced_mass * initial_h

    trajectory: list[OrbitTrajectoryPoint] = [
        _trajectory_point(time_s=0.0, x_m=x, y_m=y, vx_m_s=vx, vy_m_s=vy)
    ]
    collision_time: float | None = 0.0 if initial_radius <= inputs.central_radius_m else None
    max_energy_drift = 0.0
    max_h_drift = 0.0
    energy_scale = mu / initial_radius
    h_scale = max(abs(initial_h), initial_radius * math.sqrt(mu / initial_radius))

    if collision_time is None:
        elapsed = 0.0
        while elapsed < inputs.duration_s:
            dt = min(inputs.time_step_s, inputs.duration_s - elapsed)
            ax, ay = _acceleration(x, y, mu)
            next_x = x + vx * dt + 0.5 * ax * dt * dt
            next_y = y + vy * dt + 0.5 * ay * dt * dt
            next_ax, next_ay = _acceleration(next_x, next_y, mu)
            next_vx = vx + 0.5 * (ax + next_ax) * dt
            next_vy = vy + 0.5 * (ay + next_ay) * dt

            fraction = _segment_collision_fraction(
                x,
                y,
                next_x,
                next_y,
                inputs.central_radius_m,
            )
            if fraction is not None:
                hit_time = elapsed + fraction * dt
                hit_x = x + (next_x - x) * fraction
                hit_y = y + (next_y - y) * fraction
                hit_vx = vx + (next_vx - vx) * fraction
                hit_vy = vy + (next_vy - vy) * fraction
                trajectory.append(
                    _trajectory_point(
                        time_s=hit_time,
                        x_m=hit_x,
                        y_m=hit_y,
                        vx_m_s=hit_vx,
                        vy_m_s=hit_vy,
                    )
                )
                collision_time = hit_time
                break

            elapsed += dt
            x, y, vx, vy = next_x, next_y, next_vx, next_vy
            trajectory.append(_trajectory_point(time_s=elapsed, x_m=x, y_m=y, vx_m_s=vx, vy_m_s=vy))
            energy, h = _specific_invariants(x, y, vx, vy, mu)
            max_energy_drift = max(max_energy_drift, abs(energy - initial_energy) / energy_scale)
            max_h_drift = max(max_h_drift, abs(h - initial_h) / h_scale)

    classification: OrbitClassification = (
        "collision" if collision_time is not None else base_classification
    )
    return OrbitSandboxResult(
        model_version=ORBIT_SANDBOX_MODEL_VERSION,
        schema_version=ORBIT_SANDBOX_SCHEMA_VERSION,
        inputs=inputs,
        gravitational_parameter_m3_s2=mu,
        reduced_mass_kg=reduced_mass,
        specific_orbital_energy_j_per_kg=initial_energy,
        orbital_energy_j=orbital_energy,
        specific_angular_momentum_m2_per_s=initial_h,
        angular_momentum_kg_m2_per_s=angular_momentum,
        eccentricity=eccentricity,
        semi_major_axis_m=semi_major_axis,
        period_s=period,
        periapsis_m=periapsis,
        apoapsis_m=apoapsis,
        classification=classification,
        collision_time_s=collision_time,
        trajectory=tuple(trajectory),
        max_specific_energy_drift_fraction=max_energy_drift,
        max_specific_angular_momentum_drift_fraction=max_h_drift,
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise OrbitSandboxModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise OrbitSandboxModelError()
    return value


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise OrbitSandboxModelError()
    return value


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise OrbitSandboxModelError()
    numeric = float(value)
    if not math.isfinite(numeric):
        raise OrbitSandboxModelError()
    return numeric


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise OrbitSandboxModelError()


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
        raise OrbitSandboxModelError()
    parsed = urlparse(_string(source["url"]))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise OrbitSandboxModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def load_reviewed_orbit_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and validate the checked-in Orbit Sandbox model artifact."""

    path = repository_root / ORBIT_SANDBOX_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, OrbitSandboxModelError):
        raise OrbitSandboxModelError() from None

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
        artifact["artifact_version"] != ORBIT_SANDBOX_ARTIFACT_VERSION
        or artifact["model_version"] != ORBIT_SANDBOX_MODEL_VERSION
        or artifact["schema_version"] != ORBIT_SANDBOX_SCHEMA_VERSION
        or artifact["share_schema_version"] != ORBIT_SANDBOX_SHARE_SCHEMA_VERSION
    ):
        raise OrbitSandboxModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "orbit-sandbox"
        or definition.get("model_version") != ORBIT_SANDBOX_MODEL_VERSION
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("share_schema_version") != ORBIT_SANDBOX_SHARE_SCHEMA_VERSION
    ):
        raise OrbitSandboxModelError()
    for key in (
        "learning_objectives",
        "prerequisite_concepts",
        "output_schema",
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
            raise OrbitSandboxModelError()
    reference_values = definition["references"]
    fixture_values = definition["validation_fixtures"]
    if not isinstance(reference_values, list) or not all(
        isinstance(value, str) for value in reference_values
    ):
        raise OrbitSandboxModelError()
    if not isinstance(fixture_values, list) or not all(
        isinstance(value, str) for value in fixture_values
    ):
        raise OrbitSandboxModelError()
    if set(reference_values) != _SOURCE_IDS:
        raise OrbitSandboxModelError()
    if set(fixture_values) != _VALIDATION_FIXTURE_IDS:
        raise OrbitSandboxModelError()

    raw_sources = artifact["sources"]
    if (
        not isinstance(raw_sources, list)
        or {_validate_source(v) for v in raw_sources} != _SOURCE_IDS
    ):
        raise OrbitSandboxModelError()

    constants = _mapping(artifact["constants"])
    expected_constants = {
        "GRAVITATIONAL_CONSTANT_M3_KG_S2": GRAVITATIONAL_CONSTANT_M3_KG_S2,
        "SPEED_OF_LIGHT_M_S": SPEED_OF_LIGHT_M_S,
        "EARTH_MASS_KG": 5.9722e24,
        "EARTH_MEAN_RADIUS_M": 6_371_000.0,
        "DEFAULT_ORBIT_RADIUS_M": 7_000_000.0,
        "DEFAULT_CIRCULAR_SPEED_M_S": math.sqrt(
            GRAVITATIONAL_CONSTANT_M3_KG_S2 * 5.9722e24 / 7_000_000.0
        ),
        "MAX_TRAJECTORY_POINTS": float(MAX_TRAJECTORY_POINTS),
        "MAX_INITIAL_SPEED_FRACTION_OF_C": MAX_INITIAL_SPEED_FRACTION_OF_C,
        "MIN_CENTRAL_RADIUS_SCHWARZSCHILD_MULTIPLE": (MIN_CENTRAL_RADIUS_SCHWARZSCHILD_MULTIPLE),
        "MAX_STEP_FRACTION_OF_INITIAL_DYNAMICAL_TIME": (
            MAX_STEP_FRACTION_OF_INITIAL_DYNAMICAL_TIME
        ),
        "PARABOLIC_NORMALIZED_ENERGY_TOLERANCE": PARABOLIC_NORMALIZED_ENERGY_TOLERANCE,
    }
    _exact_keys(constants, frozenset(expected_constants))
    for key, expected in expected_constants.items():
        if not math.isclose(_number(constants[key]), expected, rel_tol=1e-15, abs_tol=0.0):
            raise OrbitSandboxModelError()

    presets = _mapping(artifact["presets"])
    _exact_keys(presets, frozenset({"earth-low-orbit"}))
    default_preset = _mapping(presets["earth-low-orbit"])
    preset_input = OrbitSandboxInput(
        **{key: _number(value) for key, value in default_preset.items()}
    )
    default_result = calculate_orbit_sandbox(preset_input)
    if default_result.classification != "bound" or default_result.eccentricity > 1e-12:
        raise OrbitSandboxModelError()

    raw_fixtures = artifact["validation_fixtures"]
    if not isinstance(raw_fixtures, list):
        raise OrbitSandboxModelError()
    fixture_ids: set[str] = set()
    for raw_fixture in raw_fixtures:
        fixture = _mapping(raw_fixture)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise OrbitSandboxModelError()

    validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        validation,
        frozenset({"id", "checked_at", "method", "tools", "source_ids", "test_references"}),
    )
    if validation["id"] != "orbit-sandbox-independent-validation-v1":
        raise OrbitSandboxModelError()
    _string(validation["checked_at"])
    _string(validation["method"])
    if (
        not isinstance(validation["source_ids"], list)
        or set(validation["source_ids"]) != _SOURCE_IDS
    ):
        raise OrbitSandboxModelError()
    tests = validation["test_references"]
    if not isinstance(tests, list) or not tests or not all(isinstance(v, str) and v for v in tests):
        raise OrbitSandboxModelError()
    tools = validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise OrbitSandboxModelError()
    for raw_tool in tools:
        tool = _mapping(raw_tool)
        _exact_keys(tool, frozenset({"name", "version", "role"}))
        _string(tool["name"])
        _string(tool["version"])
        _string(tool["role"])

    return dict(artifact)


__all__ = [
    "GRAVITATIONAL_CONSTANT_M3_KG_S2",
    "MAX_TRAJECTORY_POINTS",
    "ORBIT_SANDBOX_ARTIFACT_PATH",
    "ORBIT_SANDBOX_ARTIFACT_VERSION",
    "ORBIT_SANDBOX_MODEL_VERSION",
    "ORBIT_SANDBOX_SCHEMA_VERSION",
    "ORBIT_SANDBOX_SHARE_SCHEMA_VERSION",
    "OrbitClassification",
    "OrbitSandboxInput",
    "OrbitSandboxModelError",
    "OrbitSandboxResult",
    "OrbitTrajectoryPoint",
    "calculate_orbit_sandbox",
    "load_reviewed_orbit_artifact",
]
