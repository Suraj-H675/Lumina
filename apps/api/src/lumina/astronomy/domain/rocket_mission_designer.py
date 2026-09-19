"""Deterministic educational ideal staged-rocket model."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

ROCKET_MISSION_DESIGNER_MODEL_VERSION: Final = "rocket-mission-designer-v1"
ROCKET_MISSION_DESIGNER_SCHEMA_VERSION: Final = 1
ROCKET_MISSION_DESIGNER_SHARE_SCHEMA_VERSION: Final = 1
ROCKET_MISSION_DESIGNER_ARTIFACT_VERSION: Final = 1
ROCKET_MISSION_DESIGNER_ARTIFACT_PATH: Final = "data/seed/rocket-mission-designer-v1.json"

STANDARD_GRAVITY_M_S2: Final = 9.80665

MIN_STAGE_COUNT: Final = 1
MAX_STAGE_COUNT: Final = 4
MIN_STAGE_DRY_MASS_KG: Final = 1.0
MAX_STAGE_DRY_MASS_KG: Final = 2_000_000.0
MIN_STAGE_PROPELLANT_MASS_KG: Final = 1.0
MAX_STAGE_PROPELLANT_MASS_KG: Final = 5_000_000.0
MIN_STAGE_THRUST_N: Final = 1_000.0
MAX_STAGE_THRUST_N: Final = 100_000_000.0
MIN_STAGE_SPECIFIC_IMPULSE_S: Final = 50.0
MAX_STAGE_SPECIFIC_IMPULSE_S: Final = 500.0
MIN_PAYLOAD_MASS_KG: Final = 1.0
MAX_PAYLOAD_MASS_KG: Final = 300_000.0
MAX_SUBMITTED_LAUNCH_MASS_KG: Final = 10_000_000.0

EARTH_SURFACE_GRAVITY_M_S2: Final = 9.80
MOON_SURFACE_GRAVITY_M_S2: Final = 1.63
MARS_SURFACE_GRAVITY_M_S2: Final = 3.71

EARTH_200_MILE_ORBIT_REFERENCE_M_S: Final = 7_620.0
EARTH_EQUATORIAL_ESCAPE_SPEED_M_S: Final = 11_190.0
MARS_EQUATORIAL_ESCAPE_SPEED_M_S: Final = 5_030.0

PAYLOAD_TRADEOFF_MULTIPLIERS: Final = (0.0, 0.5, 1.0, 1.5, 2.0)

GravityBody = Literal["earth", "moon", "mars"]
DeltaVReferenceId = Literal[
    "earth_200_mile_orbit_example",
    "earth_equatorial_escape_speed",
    "mars_equatorial_escape_speed",
]
ReferenceKind = Literal[
    "nasa_glenn_idealized_delta_v_example",
    "jpl_equatorial_escape_speed_reference",
]

_GRAVITY_BY_BODY: Final[dict[str, float]] = {
    "earth": EARTH_SURFACE_GRAVITY_M_S2,
    "moon": MOON_SURFACE_GRAVITY_M_S2,
    "mars": MARS_SURFACE_GRAVITY_M_S2,
}
_REFERENCE_ROWS: Final = (
    (
        "earth_200_mile_orbit_example",
        "nasa_glenn_idealized_delta_v_example",
        "NASA Glenn approximate 200-mile circular-orbit velocity-change example",
        EARTH_200_MILE_ORBIT_REFERENCE_M_S,
    ),
    (
        "earth_equatorial_escape_speed",
        "jpl_equatorial_escape_speed_reference",
        "JPL Earth equatorial escape-speed reference",
        EARTH_EQUATORIAL_ESCAPE_SPEED_M_S,
    ),
    (
        "mars_equatorial_escape_speed",
        "jpl_equatorial_escape_speed_reference",
        "JPL Mars equatorial escape-speed reference",
        MARS_EQUATORIAL_ESCAPE_SPEED_M_S,
    ),
)
_REFERENCE_BY_ID: Final = {row[0]: row for row in _REFERENCE_ROWS}

_SOURCE_URLS: Final = {
    "nasa-glenn-ideal-rocket-equation": (
        "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/"
    ),
    "nasa-glenn-specific-impulse": (
        "https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/"
    ),
    "nasa-jpl-basics-spaceflight-ch3": (
        "https://science.nasa.gov/learn/basics-of-space-flight/chapter3-2/"
    ),
    "nasa-jpl-basics-spaceflight-ch14": (
        "https://science.nasa.gov/learn/basics-of-space-flight/chapter14-1/"
    ),
    "nist-standard-gravity": "https://physics.nist.gov/cgi-bin/cuu/Value?gn",
    "jpl-planetary-physical-parameters": "https://ssd.jpl.nasa.gov/planets/phys_par.html",
    "nasa-moon-facts": "https://science.nasa.gov/moon/facts/",
}
_SOURCE_IDS: Final = tuple(_SOURCE_URLS)
_FIXTURE_IDS: Final = frozenset(
    {
        "single-stage-ideal-equation",
        "two-stage-jettison-bookkeeping",
        "standard-gravity-specific-impulse",
        "surface-gravity-twr-reference",
        "mass-fraction-closure",
        "payload-tradeoff-monotonic",
        "reference-comparison-values",
        "stage-domain-rejection",
        "input-domain-rejection",
        "launch-mass-guard",
        "deterministic-repeat",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "STANDARD_GRAVITY_M_S2": STANDARD_GRAVITY_M_S2,
    "MIN_STAGE_COUNT": MIN_STAGE_COUNT,
    "MAX_STAGE_COUNT": MAX_STAGE_COUNT,
    "MIN_STAGE_DRY_MASS_KG": MIN_STAGE_DRY_MASS_KG,
    "MAX_STAGE_DRY_MASS_KG": MAX_STAGE_DRY_MASS_KG,
    "MIN_STAGE_PROPELLANT_MASS_KG": MIN_STAGE_PROPELLANT_MASS_KG,
    "MAX_STAGE_PROPELLANT_MASS_KG": MAX_STAGE_PROPELLANT_MASS_KG,
    "MIN_STAGE_THRUST_N": MIN_STAGE_THRUST_N,
    "MAX_STAGE_THRUST_N": MAX_STAGE_THRUST_N,
    "MIN_STAGE_SPECIFIC_IMPULSE_S": MIN_STAGE_SPECIFIC_IMPULSE_S,
    "MAX_STAGE_SPECIFIC_IMPULSE_S": MAX_STAGE_SPECIFIC_IMPULSE_S,
    "MIN_PAYLOAD_MASS_KG": MIN_PAYLOAD_MASS_KG,
    "MAX_PAYLOAD_MASS_KG": MAX_PAYLOAD_MASS_KG,
    "MAX_SUBMITTED_LAUNCH_MASS_KG": MAX_SUBMITTED_LAUNCH_MASS_KG,
    "EARTH_SURFACE_GRAVITY_M_S2": EARTH_SURFACE_GRAVITY_M_S2,
    "MOON_SURFACE_GRAVITY_M_S2": MOON_SURFACE_GRAVITY_M_S2,
    "MARS_SURFACE_GRAVITY_M_S2": MARS_SURFACE_GRAVITY_M_S2,
    "EARTH_200_MILE_ORBIT_REFERENCE_M_S": EARTH_200_MILE_ORBIT_REFERENCE_M_S,
    "EARTH_EQUATORIAL_ESCAPE_SPEED_M_S": EARTH_EQUATORIAL_ESCAPE_SPEED_M_S,
    "MARS_EQUATORIAL_ESCAPE_SPEED_M_S": MARS_EQUATORIAL_ESCAPE_SPEED_M_S,
}


class RocketMissionDesignerModelError(ValueError):
    """Raised when Rocket/Mission Designer inputs leave the reviewed v1 domain."""


def _number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RocketMissionDesignerModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise RocketMissionDesignerModelError()
    return 0.0 if numeric == 0.0 else numeric


@dataclass(frozen=True, slots=True)
class RocketStageInput:
    dry_mass_kg: float
    propellant_mass_kg: float
    specific_impulse_s: float
    thrust_n: float

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "dry_mass_kg",
            _number(
                self.dry_mass_kg,
                minimum=MIN_STAGE_DRY_MASS_KG,
                maximum=MAX_STAGE_DRY_MASS_KG,
            ),
        )
        object.__setattr__(
            self,
            "propellant_mass_kg",
            _number(
                self.propellant_mass_kg,
                minimum=MIN_STAGE_PROPELLANT_MASS_KG,
                maximum=MAX_STAGE_PROPELLANT_MASS_KG,
            ),
        )
        object.__setattr__(
            self,
            "specific_impulse_s",
            _number(
                self.specific_impulse_s,
                minimum=MIN_STAGE_SPECIFIC_IMPULSE_S,
                maximum=MAX_STAGE_SPECIFIC_IMPULSE_S,
            ),
        )
        object.__setattr__(
            self,
            "thrust_n",
            _number(
                self.thrust_n,
                minimum=MIN_STAGE_THRUST_N,
                maximum=MAX_STAGE_THRUST_N,
            ),
        )

    @property
    def wet_mass_kg(self) -> float:
        return self.dry_mass_kg + self.propellant_mass_kg


@dataclass(frozen=True, slots=True)
class RocketMissionDesignerInput:
    gravity_body: GravityBody
    delta_v_reference_id: DeltaVReferenceId
    payload_mass_kg: float
    stages: tuple[RocketStageInput, ...]

    def __post_init__(self) -> None:
        if self.gravity_body not in _GRAVITY_BY_BODY:
            raise RocketMissionDesignerModelError()
        if self.delta_v_reference_id not in _REFERENCE_BY_ID:
            raise RocketMissionDesignerModelError()
        payload = _number(
            self.payload_mass_kg,
            minimum=MIN_PAYLOAD_MASS_KG,
            maximum=MAX_PAYLOAD_MASS_KG,
        )
        if not isinstance(self.stages, tuple):
            raise RocketMissionDesignerModelError()
        if not MIN_STAGE_COUNT <= len(self.stages) <= MAX_STAGE_COUNT:
            raise RocketMissionDesignerModelError()
        if any(not isinstance(stage, RocketStageInput) for stage in self.stages):
            raise RocketMissionDesignerModelError()
        launch_mass = payload + sum(stage.wet_mass_kg for stage in self.stages)
        if not math.isfinite(launch_mass) or launch_mass > MAX_SUBMITTED_LAUNCH_MASS_KG:
            raise RocketMissionDesignerModelError()
        object.__setattr__(self, "payload_mass_kg", payload)


@dataclass(frozen=True, slots=True)
class RocketStageResult:
    index: int
    dry_mass_kg: float
    propellant_mass_kg: float
    wet_mass_kg: float
    specific_impulse_s: float
    thrust_n: float
    ignition_mass_kg: float
    burnout_before_jettison_mass_kg: float
    mass_ratio: float
    effective_exhaust_velocity_m_s: float
    ideal_delta_v_m_s: float
    surface_gravity_thrust_to_weight: float
    stage_dry_fraction: float
    stage_propellant_fraction: float


@dataclass(frozen=True, slots=True)
class VehicleMassFractions:
    launch_mass_kg: float
    total_stage_dry_mass_kg: float
    total_propellant_mass_kg: float
    payload_mass_kg: float
    stage_dry_fraction_of_launch_mass: float
    propellant_fraction_of_launch_mass: float
    payload_fraction_of_launch_mass: float


@dataclass(frozen=True, slots=True)
class PayloadTradeoffPoint:
    payload_multiplier: float
    payload_mass_kg: float
    total_ideal_delta_v_m_s: float


@dataclass(frozen=True, slots=True)
class DeltaVReferenceComparison:
    reference_id: DeltaVReferenceId
    reference_kind: ReferenceKind
    label: str
    reference_value_m_s: float
    ideal_delta_v_difference_m_s: float
    ideal_delta_v_to_reference_ratio: float
    interpretation: str


@dataclass(frozen=True, slots=True)
class RocketMissionDesignerResult:
    model_version: str
    schema_version: int
    inputs: RocketMissionDesignerInput
    selected_surface_gravity_m_s2: float
    stages: tuple[RocketStageResult, ...]
    total_ideal_delta_v_m_s: float
    mass_fractions: VehicleMassFractions
    payload_tradeoff: tuple[PayloadTradeoffPoint, ...]
    reference_comparison: DeltaVReferenceComparison
    model_note: str


def _sequence(
    stages: tuple[RocketStageInput, ...],
    *,
    payload_mass_kg: float,
    surface_gravity_m_s2: float,
) -> tuple[tuple[RocketStageResult, ...], float]:
    remaining_mass = payload_mass_kg + sum(stage.wet_mass_kg for stage in stages)
    results: list[RocketStageResult] = []
    total_delta_v = 0.0
    for index, stage in enumerate(stages, start=1):
        ignition_mass = remaining_mass
        burnout_mass = ignition_mass - stage.propellant_mass_kg
        if burnout_mass <= 0.0:
            raise RocketMissionDesignerModelError()
        mass_ratio = ignition_mass / burnout_mass
        effective_exhaust_velocity = stage.specific_impulse_s * STANDARD_GRAVITY_M_S2
        delta_v = effective_exhaust_velocity * math.log(mass_ratio)
        thrust_to_weight = stage.thrust_n / (ignition_mass * surface_gravity_m_s2)
        wet_mass = stage.wet_mass_kg
        values = (
            ignition_mass,
            burnout_mass,
            mass_ratio,
            effective_exhaust_velocity,
            delta_v,
            thrust_to_weight,
        )
        if any(not math.isfinite(value) or value <= 0.0 for value in values):
            raise RocketMissionDesignerModelError()
        results.append(
            RocketStageResult(
                index=index,
                dry_mass_kg=stage.dry_mass_kg,
                propellant_mass_kg=stage.propellant_mass_kg,
                wet_mass_kg=wet_mass,
                specific_impulse_s=stage.specific_impulse_s,
                thrust_n=stage.thrust_n,
                ignition_mass_kg=ignition_mass,
                burnout_before_jettison_mass_kg=burnout_mass,
                mass_ratio=mass_ratio,
                effective_exhaust_velocity_m_s=effective_exhaust_velocity,
                ideal_delta_v_m_s=delta_v,
                surface_gravity_thrust_to_weight=thrust_to_weight,
                stage_dry_fraction=stage.dry_mass_kg / wet_mass,
                stage_propellant_fraction=stage.propellant_mass_kg / wet_mass,
            )
        )
        total_delta_v += delta_v
        remaining_mass = burnout_mass - stage.dry_mass_kg
        if not math.isfinite(remaining_mass) or remaining_mass < 0.0:
            raise RocketMissionDesignerModelError()
    if not math.isclose(remaining_mass, payload_mass_kg, rel_tol=0.0, abs_tol=1e-8):
        raise RocketMissionDesignerModelError()
    if not math.isfinite(total_delta_v) or total_delta_v <= 0.0:
        raise RocketMissionDesignerModelError()
    return tuple(results), total_delta_v


def _mass_fractions(inputs: RocketMissionDesignerInput) -> VehicleMassFractions:
    dry = sum(stage.dry_mass_kg for stage in inputs.stages)
    propellant = sum(stage.propellant_mass_kg for stage in inputs.stages)
    launch = dry + propellant + inputs.payload_mass_kg
    return VehicleMassFractions(
        launch_mass_kg=launch,
        total_stage_dry_mass_kg=dry,
        total_propellant_mass_kg=propellant,
        payload_mass_kg=inputs.payload_mass_kg,
        stage_dry_fraction_of_launch_mass=dry / launch,
        propellant_fraction_of_launch_mass=propellant / launch,
        payload_fraction_of_launch_mass=inputs.payload_mass_kg / launch,
    )


def _payload_tradeoff(
    inputs: RocketMissionDesignerInput,
    *,
    surface_gravity_m_s2: float,
) -> tuple[PayloadTradeoffPoint, ...]:
    points: list[PayloadTradeoffPoint] = []
    for multiplier in PAYLOAD_TRADEOFF_MULTIPLIERS:
        payload = inputs.payload_mass_kg * multiplier
        _, total_delta_v = _sequence(
            inputs.stages,
            payload_mass_kg=payload,
            surface_gravity_m_s2=surface_gravity_m_s2,
        )
        points.append(
            PayloadTradeoffPoint(
                payload_multiplier=multiplier,
                payload_mass_kg=payload,
                total_ideal_delta_v_m_s=total_delta_v,
            )
        )
    return tuple(points)


def _reference_comparison(
    reference_id: DeltaVReferenceId,
    *,
    total_ideal_delta_v_m_s: float,
) -> DeltaVReferenceComparison:
    row = _REFERENCE_BY_ID[reference_id]
    kind = cast(ReferenceKind, row[1])
    reference_value = float(row[3])
    return DeltaVReferenceComparison(
        reference_id=reference_id,
        reference_kind=kind,
        label=row[2],
        reference_value_m_s=reference_value,
        ideal_delta_v_difference_m_s=total_ideal_delta_v_m_s - reference_value,
        ideal_delta_v_to_reference_ratio=total_ideal_delta_v_m_s / reference_value,
        interpretation=(
            "This is an educational velocity-reference comparison only. It is not a mission "
            "delta-v requirement, feasibility result, launch capability claim, or operational "
            "planning output."
        ),
    )


def calculate_rocket_mission_designer(
    inputs: RocketMissionDesignerInput,
) -> RocketMissionDesignerResult:
    """Evaluate the reviewed deterministic Rocket/Mission Designer v1 model."""

    if not isinstance(inputs, RocketMissionDesignerInput):
        raise RocketMissionDesignerModelError()
    surface_gravity = _GRAVITY_BY_BODY[inputs.gravity_body]
    stages, total_delta_v = _sequence(
        inputs.stages,
        payload_mass_kg=inputs.payload_mass_kg,
        surface_gravity_m_s2=surface_gravity,
    )
    return RocketMissionDesignerResult(
        model_version=ROCKET_MISSION_DESIGNER_MODEL_VERSION,
        schema_version=ROCKET_MISSION_DESIGNER_SCHEMA_VERSION,
        inputs=inputs,
        selected_surface_gravity_m_s2=surface_gravity,
        stages=stages,
        total_ideal_delta_v_m_s=total_delta_v,
        mass_fractions=_mass_fractions(inputs),
        payload_tradeoff=_payload_tradeoff(
            inputs,
            surface_gravity_m_s2=surface_gravity,
        ),
        reference_comparison=_reference_comparison(
            inputs.delta_v_reference_id,
            total_ideal_delta_v_m_s=total_delta_v,
        ),
        model_note=(
            "Ideal staged delta-v excludes atmosphere, gravity/drag/steering losses, finite-burn "
            "trajectory effects, changing gravity, guidance, structural/aerodynamic/thermal "
            "engineering, reserves, and operational launch planning. Surface-gravity TWR is a "
            "pedagogical reference, not an upper-stage flight-condition estimate."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise RocketMissionDesignerModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise RocketMissionDesignerModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise RocketMissionDesignerModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RocketMissionDesignerModelError()
    return value


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
    if source_id not in _SOURCE_URLS:
        raise RocketMissionDesignerModelError()
    url = _string(source["url"])
    parsed = urlparse(url)
    if (
        url != _SOURCE_URLS[source_id]
        or parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise RocketMissionDesignerModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def _stage_from_mapping(value: object) -> RocketStageInput:
    stage = _mapping(value)
    _exact_keys(
        stage,
        frozenset({"dry_mass_kg", "propellant_mass_kg", "specific_impulse_s", "thrust_n"}),
    )
    return RocketStageInput(
        dry_mass_kg=stage["dry_mass_kg"],  # type: ignore[arg-type]
        propellant_mass_kg=stage["propellant_mass_kg"],  # type: ignore[arg-type]
        specific_impulse_s=stage["specific_impulse_s"],  # type: ignore[arg-type]
        thrust_n=stage["thrust_n"],  # type: ignore[arg-type]
    )


def load_reviewed_rocket_mission_designer_artifact(
    *,
    repository_root: Path,
) -> dict[str, object]:
    """Load and strictly validate the checked-in Rocket/Mission Designer v1 artifact."""

    path = repository_root / ROCKET_MISSION_DESIGNER_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, RocketMissionDesignerModelError):
        raise RocketMissionDesignerModelError() from None

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
                "gravity_bodies",
                "delta_v_references",
                "presets",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != ROCKET_MISSION_DESIGNER_ARTIFACT_VERSION
        or artifact["model_version"] != ROCKET_MISSION_DESIGNER_MODEL_VERSION
        or artifact["schema_version"] != ROCKET_MISSION_DESIGNER_SCHEMA_VERSION
        or artifact["share_schema_version"] != ROCKET_MISSION_DESIGNER_SHARE_SCHEMA_VERSION
    ):
        raise RocketMissionDesignerModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "rocket-mission-designer"
        or definition.get("title") != "Rocket / Mission Designer"
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("model_version") != ROCKET_MISSION_DESIGNER_MODEL_VERSION
        or definition.get("share_schema_version") != ROCKET_MISSION_DESIGNER_SHARE_SCHEMA_VERSION
    ):
        raise RocketMissionDesignerModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise RocketMissionDesignerModelError()
    source_ids = [_validate_source(source) for source in sources]
    if tuple(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise RocketMissionDesignerModelError()
    if definition.get("references") != source_ids:
        raise RocketMissionDesignerModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise RocketMissionDesignerModelError()

    gravity_bodies = artifact["gravity_bodies"]
    expected_gravity = [
        {"id": "earth", "surface_gravity_m_s2": EARTH_SURFACE_GRAVITY_M_S2},
        {"id": "moon", "surface_gravity_m_s2": MOON_SURFACE_GRAVITY_M_S2},
        {"id": "mars", "surface_gravity_m_s2": MARS_SURFACE_GRAVITY_M_S2},
    ]
    if gravity_bodies != expected_gravity:
        raise RocketMissionDesignerModelError()

    references = artifact["delta_v_references"]
    expected_references = [
        {
            "id": row[0],
            "kind": row[1],
            "label": row[2],
            "value_m_s": row[3],
        }
        for row in _REFERENCE_ROWS
    ]
    if references != expected_references:
        raise RocketMissionDesignerModelError()

    presets = _mapping(artifact["presets"])
    if frozenset(presets) != {"synthetic-two-stage"}:
        raise RocketMissionDesignerModelError()
    preset = _mapping(presets["synthetic-two-stage"])
    _exact_keys(
        preset,
        frozenset({"gravity_body", "delta_v_reference_id", "payload_mass_kg", "stages"}),
    )
    raw_stages = preset["stages"]
    if not isinstance(raw_stages, list):
        raise RocketMissionDesignerModelError()
    RocketMissionDesignerInput(
        gravity_body=cast(GravityBody, _string(preset["gravity_body"])),
        delta_v_reference_id=cast(
            DeltaVReferenceId,
            _string(preset["delta_v_reference_id"]),
        ),
        payload_mass_kg=preset["payload_mass_kg"],  # type: ignore[arg-type]
        stages=tuple(_stage_from_mapping(stage) for stage in raw_stages),
    )

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_FIXTURE_IDS):
        raise RocketMissionDesignerModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _FIXTURE_IDS:
        raise RocketMissionDesignerModelError()

    scientific = _mapping(artifact["scientific_validation"])
    if scientific.get("id") != "rocket-mission-designer-v1-validation":
        raise RocketMissionDesignerModelError()
    if scientific.get("source_ids") != source_ids:
        raise RocketMissionDesignerModelError()
    tests = scientific.get("test_references")
    if (
        not isinstance(tests, list)
        or len(tests) != 12
        or any(not isinstance(item, str) or not item for item in tests)
    ):
        raise RocketMissionDesignerModelError()
    return dict(artifact)


__all__ = [
    "DeltaVReferenceComparison",
    "DeltaVReferenceId",
    "EARTH_200_MILE_ORBIT_REFERENCE_M_S",
    "EARTH_EQUATORIAL_ESCAPE_SPEED_M_S",
    "EARTH_SURFACE_GRAVITY_M_S2",
    "GravityBody",
    "MARS_EQUATORIAL_ESCAPE_SPEED_M_S",
    "MARS_SURFACE_GRAVITY_M_S2",
    "MOON_SURFACE_GRAVITY_M_S2",
    "PAYLOAD_TRADEOFF_MULTIPLIERS",
    "PayloadTradeoffPoint",
    "ROCKET_MISSION_DESIGNER_ARTIFACT_PATH",
    "ROCKET_MISSION_DESIGNER_MODEL_VERSION",
    "RocketMissionDesignerInput",
    "RocketMissionDesignerModelError",
    "RocketMissionDesignerResult",
    "RocketStageInput",
    "RocketStageResult",
    "STANDARD_GRAVITY_M_S2",
    "VehicleMassFractions",
    "calculate_rocket_mission_designer",
    "load_reviewed_rocket_mission_designer_artifact",
]
