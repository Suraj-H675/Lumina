"""Deterministic large solid-rock terrestrial impact teaching model."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

IMPACT_SIMULATOR_MODEL_VERSION: Final = "impact-simulator-v1"
IMPACT_SIMULATOR_SCHEMA_VERSION: Final = 1
IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION: Final = 1
IMPACT_SIMULATOR_ARTIFACT_VERSION: Final = 1
IMPACT_SIMULATOR_ARTIFACT_PATH: Final = "data/seed/impact-simulator-v1.json"

MIN_DIAMETER_M: Final = 1_500.0
MAX_DIAMETER_M: Final = 20_000.0
MIN_IMPACTOR_DENSITY_KG_M3: Final = 500.0
MAX_IMPACTOR_DENSITY_KG_M3: Final = 8_000.0
MIN_SPEED_KM_S: Final = 11.0
MAX_SPEED_KM_S: Final = 72.0
MIN_IMPACT_ANGLE_DEG: Final = 15.0
MAX_IMPACT_ANGLE_DEG: Final = 90.0

EARTH_SURFACE_GRAVITY_M_S2: Final = 9.81
SEDIMENTARY_ROCK_DENSITY_KG_M3: Final = 2_500.0
CRYSTALLINE_ROCK_DENSITY_KG_M3: Final = 2_750.0
TNT_MEGATON_J: Final = 4.18e15

TRANSIENT_CRATER_COEFFICIENT_LOW: Final = 0.8
TRANSIENT_CRATER_COEFFICIENT_BEST: Final = 1.161
TRANSIENT_CRATER_COEFFICIENT_HIGH: Final = 1.5
COMPLEX_TRANSIENT_SWITCH_KM: Final = 2.56
SIMPLE_COMPLEX_TRANSITION_KM: Final = 3.2
COMPLEX_FINAL_COEFFICIENT: Final = 1.17
COMPLEX_FINAL_TRANSIENT_EXPONENT: Final = 1.13
COMPLEX_FINAL_TRANSITION_EXPONENT: Final = 0.13
EJECTA_THICKNESS_THRESHOLDS_M: Final = (100.0, 10.0, 1.0, 0.1)
MAX_EJECTA_MODEL_RADIUS_M: Final = 10_000_000.0

TargetMaterial = Literal["sedimentary_rock", "crystalline_rock"]
CraterClassification = Literal["complex"]

_TARGET_DENSITY_BY_MATERIAL: Final[dict[str, float]] = {
    "sedimentary_rock": SEDIMENTARY_ROCK_DENSITY_KG_M3,
    "crystalline_rock": CRYSTALLINE_ROCK_DENSITY_KG_M3,
}
_SOURCE_URLS: Final = {
    "collins-melosh-marcus-2005": (
        "https://spiral.imperial.ac.uk/entities/publication/1ba449a0-eff6-475c-abaf-9c50b38401a0"
    ),
    "impact-earth-current-calculator": ("https://impact.ese.ic.ac.uk/ImpactEarth/ImpactEffects/"),
}
_SOURCE_IDS: Final = tuple(_SOURCE_URLS)
_FIXTURE_IDS: Final = frozenset(
    {
        "source-rounded-validation-case",
        "kinetic-energy",
        "best-crater-scaling",
        "coefficient-sensitivity",
        "target-density-preset",
        "ejecta-lower-bound-radii",
        "lower-domain-bound",
        "upper-domain-bound",
        "input-domain-rejection",
        "deterministic-repeat",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "MIN_DIAMETER_M": MIN_DIAMETER_M,
    "MAX_DIAMETER_M": MAX_DIAMETER_M,
    "MIN_IMPACTOR_DENSITY_KG_M3": MIN_IMPACTOR_DENSITY_KG_M3,
    "MAX_IMPACTOR_DENSITY_KG_M3": MAX_IMPACTOR_DENSITY_KG_M3,
    "MIN_SPEED_KM_S": MIN_SPEED_KM_S,
    "MAX_SPEED_KM_S": MAX_SPEED_KM_S,
    "MIN_IMPACT_ANGLE_DEG": MIN_IMPACT_ANGLE_DEG,
    "MAX_IMPACT_ANGLE_DEG": MAX_IMPACT_ANGLE_DEG,
    "EARTH_SURFACE_GRAVITY_M_S2": EARTH_SURFACE_GRAVITY_M_S2,
    "SEDIMENTARY_ROCK_DENSITY_KG_M3": SEDIMENTARY_ROCK_DENSITY_KG_M3,
    "CRYSTALLINE_ROCK_DENSITY_KG_M3": CRYSTALLINE_ROCK_DENSITY_KG_M3,
    "TNT_MEGATON_J": TNT_MEGATON_J,
    "TRANSIENT_CRATER_COEFFICIENT_LOW": TRANSIENT_CRATER_COEFFICIENT_LOW,
    "TRANSIENT_CRATER_COEFFICIENT_BEST": TRANSIENT_CRATER_COEFFICIENT_BEST,
    "TRANSIENT_CRATER_COEFFICIENT_HIGH": TRANSIENT_CRATER_COEFFICIENT_HIGH,
    "COMPLEX_TRANSIENT_SWITCH_KM": COMPLEX_TRANSIENT_SWITCH_KM,
    "SIMPLE_COMPLEX_TRANSITION_KM": SIMPLE_COMPLEX_TRANSITION_KM,
    "COMPLEX_FINAL_COEFFICIENT": COMPLEX_FINAL_COEFFICIENT,
    "COMPLEX_FINAL_TRANSIENT_EXPONENT": COMPLEX_FINAL_TRANSIENT_EXPONENT,
    "COMPLEX_FINAL_TRANSITION_EXPONENT": COMPLEX_FINAL_TRANSITION_EXPONENT,
    "MAX_EJECTA_MODEL_RADIUS_M": MAX_EJECTA_MODEL_RADIUS_M,
}


class ImpactSimulatorModelError(ValueError):
    """Raised when Impact Simulator inputs or artifacts leave the reviewed v1 contract."""


def _number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ImpactSimulatorModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise ImpactSimulatorModelError()
    return numeric


@dataclass(frozen=True, slots=True)
class ImpactSimulatorInput:
    diameter_m: float
    impactor_density_kg_m3: float
    speed_km_s: float
    impact_angle_deg: float
    target_material: TargetMaterial

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "diameter_m",
            _number(self.diameter_m, minimum=MIN_DIAMETER_M, maximum=MAX_DIAMETER_M),
        )
        object.__setattr__(
            self,
            "impactor_density_kg_m3",
            _number(
                self.impactor_density_kg_m3,
                minimum=MIN_IMPACTOR_DENSITY_KG_M3,
                maximum=MAX_IMPACTOR_DENSITY_KG_M3,
            ),
        )
        object.__setattr__(
            self,
            "speed_km_s",
            _number(self.speed_km_s, minimum=MIN_SPEED_KM_S, maximum=MAX_SPEED_KM_S),
        )
        object.__setattr__(
            self,
            "impact_angle_deg",
            _number(
                self.impact_angle_deg,
                minimum=MIN_IMPACT_ANGLE_DEG,
                maximum=MAX_IMPACT_ANGLE_DEG,
            ),
        )
        if self.target_material not in _TARGET_DENSITY_BY_MATERIAL:
            raise ImpactSimulatorModelError()


@dataclass(frozen=True, slots=True)
class CraterDimensions:
    scaling_coefficient: float
    transient_diameter_m: float
    final_diameter_m: float
    classification: CraterClassification


@dataclass(frozen=True, slots=True)
class EjectaThicknessRadius:
    thickness_m: float
    radius_m: float


@dataclass(frozen=True, slots=True)
class ImpactSimulatorResult:
    model_version: str
    schema_version: int
    inputs: ImpactSimulatorInput
    target_density_kg_m3: float
    impactor_mass_kg: float
    kinetic_energy_j: float
    tnt_equivalent_megatons: float
    best_estimate_crater: CraterDimensions
    coefficient_sensitivity: tuple[CraterDimensions, CraterDimensions, CraterDimensions]
    ejecta_thickness_radii: tuple[
        EjectaThicknessRadius,
        EjectaThicknessRadius,
        EjectaThicknessRadius,
        EjectaThicknessRadius,
    ]
    uncertainty_note: str
    model_note: str


def _crater_dimensions(
    inputs: ImpactSimulatorInput,
    *,
    target_density_kg_m3: float,
    scaling_coefficient: float,
) -> CraterDimensions:
    speed_m_s = inputs.speed_km_s * 1_000.0
    angle_rad = math.radians(inputs.impact_angle_deg)
    transient_diameter_m = (
        scaling_coefficient
        * (inputs.impactor_density_kg_m3 / target_density_kg_m3) ** (1.0 / 3.0)
        * inputs.diameter_m**0.78
        * speed_m_s**0.44
        * EARTH_SURFACE_GRAVITY_M_S2**-0.22
        * math.sin(angle_rad) ** (1.0 / 3.0)
    )
    transient_diameter_km = transient_diameter_m / 1_000.0
    if (
        not math.isfinite(transient_diameter_m)
        or transient_diameter_m <= 0.0
        or transient_diameter_km <= COMPLEX_TRANSIENT_SWITCH_KM
    ):
        raise ImpactSimulatorModelError()
    final_diameter_km = (
        COMPLEX_FINAL_COEFFICIENT
        * transient_diameter_km**COMPLEX_FINAL_TRANSIENT_EXPONENT
        / SIMPLE_COMPLEX_TRANSITION_KM**COMPLEX_FINAL_TRANSITION_EXPONENT
    )
    final_diameter_m = final_diameter_km * 1_000.0
    if not math.isfinite(final_diameter_m) or final_diameter_m <= transient_diameter_m:
        raise ImpactSimulatorModelError()
    return CraterDimensions(
        scaling_coefficient=scaling_coefficient,
        transient_diameter_m=transient_diameter_m,
        final_diameter_m=final_diameter_m,
        classification="complex",
    )


def _ejecta_radii(
    *,
    transient_diameter_m: float,
    final_diameter_m: float,
) -> tuple[
    EjectaThicknessRadius,
    EjectaThicknessRadius,
    EjectaThicknessRadius,
    EjectaThicknessRadius,
]:
    rows: list[EjectaThicknessRadius] = []
    for thickness_m in EJECTA_THICKNESS_THRESHOLDS_M:
        radius_m = (transient_diameter_m**4 / (112.0 * thickness_m)) ** (1.0 / 3.0)
        if (
            not math.isfinite(radius_m)
            or radius_m <= final_diameter_m / 2.0
            or radius_m > MAX_EJECTA_MODEL_RADIUS_M
        ):
            raise ImpactSimulatorModelError()
        rows.append(EjectaThicknessRadius(thickness_m=thickness_m, radius_m=radius_m))
    if len(rows) != 4:
        raise ImpactSimulatorModelError()
    return cast(
        tuple[
            EjectaThicknessRadius,
            EjectaThicknessRadius,
            EjectaThicknessRadius,
            EjectaThicknessRadius,
        ],
        tuple(rows),
    )


def calculate_impact_simulator(inputs: ImpactSimulatorInput) -> ImpactSimulatorResult:
    """Evaluate the reviewed deterministic Impact Simulator v1 model."""

    if not isinstance(inputs, ImpactSimulatorInput):
        raise ImpactSimulatorModelError()
    target_density = _TARGET_DENSITY_BY_MATERIAL[inputs.target_material]
    impactor_mass = math.pi / 6.0 * inputs.impactor_density_kg_m3 * inputs.diameter_m**3
    speed_m_s = inputs.speed_km_s * 1_000.0
    kinetic_energy = 0.5 * impactor_mass * speed_m_s**2
    tnt_megatons = kinetic_energy / TNT_MEGATON_J
    if any(
        not math.isfinite(value) or value <= 0.0
        for value in (impactor_mass, kinetic_energy, tnt_megatons)
    ):
        raise ImpactSimulatorModelError()

    low = _crater_dimensions(
        inputs,
        target_density_kg_m3=target_density,
        scaling_coefficient=TRANSIENT_CRATER_COEFFICIENT_LOW,
    )
    best = _crater_dimensions(
        inputs,
        target_density_kg_m3=target_density,
        scaling_coefficient=TRANSIENT_CRATER_COEFFICIENT_BEST,
    )
    high = _crater_dimensions(
        inputs,
        target_density_kg_m3=target_density,
        scaling_coefficient=TRANSIENT_CRATER_COEFFICIENT_HIGH,
    )
    if not (
        low.transient_diameter_m < best.transient_diameter_m < high.transient_diameter_m
        and low.final_diameter_m < best.final_diameter_m < high.final_diameter_m
    ):
        raise ImpactSimulatorModelError()

    return ImpactSimulatorResult(
        model_version=IMPACT_SIMULATOR_MODEL_VERSION,
        schema_version=IMPACT_SIMULATOR_SCHEMA_VERSION,
        inputs=inputs,
        target_density_kg_m3=target_density,
        impactor_mass_kg=impactor_mass,
        kinetic_energy_j=kinetic_energy,
        tnt_equivalent_megatons=tnt_megatons,
        best_estimate_crater=best,
        coefficient_sensitivity=(low, best, high),
        ejecta_thickness_radii=_ejecta_radii(
            transient_diameter_m=best.transient_diameter_m,
            final_diameter_m=best.final_diameter_m,
        ),
        uncertainty_note=(
            "The low/high crater values vary only the published Eq. 21 scaling coefficient "
            "from 0.8 to 1.5. They are a coefficient-sensitivity range, not a complete "
            "statistical confidence interval or full geological uncertainty estimate."
        ),
        model_note=(
            "Educational large solid-rock Earth-impact model only. V1 omits atmospheric entry, "
            "airbursts, water/tsunami, thermal radiation, seismic and blast effects, climate, "
            "casualty/property damage, maps, named locations, targeting, and optimization. "
            "Ejecta thickness radii are location-free lower-bound deposit estimates."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ImpactSimulatorModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise ImpactSimulatorModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise ImpactSimulatorModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ImpactSimulatorModelError()
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
        raise ImpactSimulatorModelError()
    url = _string(source["url"])
    parsed = urlparse(url)
    if (
        url != _SOURCE_URLS[source_id]
        or parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ImpactSimulatorModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def _input_from_mapping(value: object) -> ImpactSimulatorInput:
    row = _mapping(value)
    _exact_keys(
        row,
        frozenset(
            {
                "diameter_m",
                "impactor_density_kg_m3",
                "speed_km_s",
                "impact_angle_deg",
                "target_material",
            }
        ),
    )
    return ImpactSimulatorInput(
        diameter_m=row["diameter_m"],  # type: ignore[arg-type]
        impactor_density_kg_m3=row["impactor_density_kg_m3"],  # type: ignore[arg-type]
        speed_km_s=row["speed_km_s"],  # type: ignore[arg-type]
        impact_angle_deg=row["impact_angle_deg"],  # type: ignore[arg-type]
        target_material=cast(TargetMaterial, _string(row["target_material"])),
    )


def load_reviewed_impact_simulator_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and strictly validate the checked-in Impact Simulator v1 artifact."""

    path = repository_root / IMPACT_SIMULATOR_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, ImpactSimulatorModelError):
        raise ImpactSimulatorModelError() from None

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
                "target_materials",
                "preset",
                "validation_fixtures",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != IMPACT_SIMULATOR_ARTIFACT_VERSION
        or artifact["model_version"] != IMPACT_SIMULATOR_MODEL_VERSION
        or artifact["schema_version"] != IMPACT_SIMULATOR_SCHEMA_VERSION
        or artifact["share_schema_version"] != IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION
    ):
        raise ImpactSimulatorModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "impact-simulator"
        or definition.get("title") != "Impact Simulator"
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("model_version") != IMPACT_SIMULATOR_MODEL_VERSION
        or definition.get("share_schema_version") != IMPACT_SIMULATOR_SHARE_SCHEMA_VERSION
    ):
        raise ImpactSimulatorModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise ImpactSimulatorModelError()
    source_ids = [_validate_source(source) for source in sources]
    if tuple(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise ImpactSimulatorModelError()
    if definition.get("references") != source_ids:
        raise ImpactSimulatorModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise ImpactSimulatorModelError()

    target_materials = artifact["target_materials"]
    if target_materials != [
        {"id": "sedimentary_rock", "density_kg_m3": SEDIMENTARY_ROCK_DENSITY_KG_M3},
        {"id": "crystalline_rock", "density_kg_m3": CRYSTALLINE_ROCK_DENSITY_KG_M3},
    ]:
        raise ImpactSimulatorModelError()

    preset = _input_from_mapping(artifact["preset"])
    if preset != ImpactSimulatorInput(
        diameter_m=1_500.0,
        impactor_density_kg_m3=3_000.0,
        speed_km_s=17.0,
        impact_angle_deg=45.0,
        target_material="sedimentary_rock",
    ):
        raise ImpactSimulatorModelError()

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_FIXTURE_IDS):
        raise ImpactSimulatorModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _FIXTURE_IDS:
        raise ImpactSimulatorModelError()

    scientific = _mapping(artifact["scientific_validation"])
    _exact_keys(
        scientific,
        frozenset(
            {
                "id",
                "source_ids",
                "independent_validation_case",
                "method",
                "test_references",
            }
        ),
    )
    if scientific["id"] != "impact-simulator-v1-validation":
        raise ImpactSimulatorModelError()
    if scientific["source_ids"] != source_ids:
        raise ImpactSimulatorModelError()
    validation_case = _mapping(scientific["independent_validation_case"])
    _exact_keys(
        validation_case,
        frozenset(
            {
                "inputs",
                "reported_energy_j",
                "reported_transient_crater_km",
                "reported_final_crater_km",
                "source_id",
            }
        ),
    )
    _input_from_mapping(validation_case["inputs"])
    if validation_case["source_id"] != "impact-earth-current-calculator":
        raise ImpactSimulatorModelError()
    if (
        validation_case["reported_energy_j"] != 3.83e20
        or validation_case["reported_transient_crater_km"] != 11.1
        or validation_case["reported_final_crater_km"] != 15.3
    ):
        raise ImpactSimulatorModelError()
    _string(scientific["method"])
    tests = scientific["test_references"]
    if (
        not isinstance(tests, list)
        or len(tests) != len(_FIXTURE_IDS)
        or any(not isinstance(item, str) or not item for item in tests)
    ):
        raise ImpactSimulatorModelError()
    return dict(artifact)


__all__ = [
    "CRYSTALLINE_ROCK_DENSITY_KG_M3",
    "CraterDimensions",
    "EARTH_SURFACE_GRAVITY_M_S2",
    "EJECTA_THICKNESS_THRESHOLDS_M",
    "EjectaThicknessRadius",
    "IMPACT_SIMULATOR_ARTIFACT_PATH",
    "IMPACT_SIMULATOR_MODEL_VERSION",
    "ImpactSimulatorInput",
    "ImpactSimulatorModelError",
    "ImpactSimulatorResult",
    "MAX_DIAMETER_M",
    "MAX_EJECTA_MODEL_RADIUS_M",
    "MAX_IMPACTOR_DENSITY_KG_M3",
    "MAX_IMPACT_ANGLE_DEG",
    "MAX_SPEED_KM_S",
    "MIN_DIAMETER_M",
    "MIN_IMPACTOR_DENSITY_KG_M3",
    "MIN_IMPACT_ANGLE_DEG",
    "MIN_SPEED_KM_S",
    "SEDIMENTARY_ROCK_DENSITY_KG_M3",
    "TNT_MEGATON_J",
    "TRANSIENT_CRATER_COEFFICIENT_BEST",
    "TRANSIENT_CRATER_COEFFICIENT_HIGH",
    "TRANSIENT_CRATER_COEFFICIENT_LOW",
    "TargetMaterial",
    "calculate_impact_simulator",
    "load_reviewed_impact_simulator_artifact",
]
