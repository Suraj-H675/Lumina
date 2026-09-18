"""Deterministic educational planetary-system builder model."""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

PLANETARY_SYSTEM_BUILDER_MODEL_VERSION: Final = "planetary-system-builder-v1"
PLANETARY_SYSTEM_BUILDER_SCHEMA_VERSION: Final = 1
PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION: Final = 1
PLANETARY_SYSTEM_BUILDER_ARTIFACT_VERSION: Final = 1
PLANETARY_SYSTEM_BUILDER_ARTIFACT_PATH: Final = "data/seed/planetary-system-builder-v1.json"

NOMINAL_SOLAR_MASS_PARAMETER_M3_S2: Final = 1.327_124_4e20
NOMINAL_EARTH_MASS_PARAMETER_M3_S2: Final = 3.986_004e14
ASTRONOMICAL_UNIT_M: Final = 149_597_870_700.0
SECONDS_PER_DAY: Final = 86_400.0

MIN_STELLAR_MASS_MSUN: Final = 0.1
MAX_STELLAR_MASS_MSUN: Final = 2.0
MIN_STELLAR_LUMINOSITY_LSUN: Final = 0.001
MAX_STELLAR_LUMINOSITY_LSUN: Final = 20.0
MIN_STELLAR_EFFECTIVE_TEMPERATURE_K: Final = 2600.0
MAX_STELLAR_EFFECTIVE_TEMPERATURE_K: Final = 7200.0
MIN_PLANET_COUNT: Final = 1
MAX_PLANET_COUNT: Final = 8
MIN_PLANET_MASS_MEARTH: Final = 0.01
MAX_PLANET_MASS_MEARTH: Final = 320.0
MIN_SEMI_MAJOR_AXIS_AU: Final = 0.01
MAX_SEMI_MAJOR_AXIS_AU: Final = 20.0
MAX_TOTAL_PLANET_TO_STAR_MASS_RATIO: Final = 0.1

KOPPARAPU_REFERENCE_TEMPERATURE_K: Final = 5780.0
HZ_INNER_SEFF_SUN: Final = 1.107
HZ_INNER_A: Final = 1.332e-4
HZ_INNER_B: Final = 1.58e-8
HZ_INNER_C: Final = -8.308e-12
HZ_INNER_D: Final = -1.931e-15
HZ_OUTER_SEFF_SUN: Final = 0.356
HZ_OUTER_A: Final = 6.171e-5
HZ_OUTER_B: Final = 1.698e-9
HZ_OUTER_C: Final = -3.198e-12
HZ_OUTER_D: Final = -5.575e-16

PAIRWISE_HILL_REFERENCE_THRESHOLD: Final = 2.0 * math.sqrt(3.0)

HabitableZoneRelation = Literal[
    "interior_to_reference_hz",
    "inside_reference_hz",
    "exterior_to_reference_hz",
]
PairwiseSpacingAssessment = Literal[
    "pairwise_close_warning",
    "no_pairwise_hill_warning",
]

_SOURCE_URLS: Final = {
    "murray-correia-2010-keplerian-orbits": "https://arxiv.org/abs/1009.1738",
    "kopparapu-2014-habitable-zone": "https://arxiv.org/abs/1404.5292",
    "iau-2015-resolution-b3": "https://arxiv.org/abs/1510.07674",
    "fabrycky-2014-kepler-architecture": "https://arxiv.org/abs/1202.6328",
}
_SOURCE_IDS: Final = tuple(_SOURCE_URLS)
_FIXTURE_IDS: Final = frozenset(
    {
        "solar-reference-hz",
        "nominal-earth-period",
        "hz-temperature-boundaries",
        "hz-placement-boundaries",
        "mutual-hill-definition",
        "pairwise-close-warning",
        "pairwise-clear-context",
        "single-planet-no-pairs",
        "strict-orbit-ordering",
        "deterministic-repeat",
        "numeric-domain-rejection",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "NOMINAL_SOLAR_MASS_PARAMETER_M3_S2": NOMINAL_SOLAR_MASS_PARAMETER_M3_S2,
    "NOMINAL_EARTH_MASS_PARAMETER_M3_S2": NOMINAL_EARTH_MASS_PARAMETER_M3_S2,
    "ASTRONOMICAL_UNIT_M": ASTRONOMICAL_UNIT_M,
    "SECONDS_PER_DAY": SECONDS_PER_DAY,
    "MIN_STELLAR_MASS_MSUN": MIN_STELLAR_MASS_MSUN,
    "MAX_STELLAR_MASS_MSUN": MAX_STELLAR_MASS_MSUN,
    "MIN_STELLAR_LUMINOSITY_LSUN": MIN_STELLAR_LUMINOSITY_LSUN,
    "MAX_STELLAR_LUMINOSITY_LSUN": MAX_STELLAR_LUMINOSITY_LSUN,
    "MIN_STELLAR_EFFECTIVE_TEMPERATURE_K": MIN_STELLAR_EFFECTIVE_TEMPERATURE_K,
    "MAX_STELLAR_EFFECTIVE_TEMPERATURE_K": MAX_STELLAR_EFFECTIVE_TEMPERATURE_K,
    "MIN_PLANET_COUNT": MIN_PLANET_COUNT,
    "MAX_PLANET_COUNT": MAX_PLANET_COUNT,
    "MIN_PLANET_MASS_MEARTH": MIN_PLANET_MASS_MEARTH,
    "MAX_PLANET_MASS_MEARTH": MAX_PLANET_MASS_MEARTH,
    "MIN_SEMI_MAJOR_AXIS_AU": MIN_SEMI_MAJOR_AXIS_AU,
    "MAX_SEMI_MAJOR_AXIS_AU": MAX_SEMI_MAJOR_AXIS_AU,
    "MAX_TOTAL_PLANET_TO_STAR_MASS_RATIO": MAX_TOTAL_PLANET_TO_STAR_MASS_RATIO,
    "KOPPARAPU_REFERENCE_TEMPERATURE_K": KOPPARAPU_REFERENCE_TEMPERATURE_K,
    "HZ_INNER_SEFF_SUN": HZ_INNER_SEFF_SUN,
    "HZ_INNER_A": HZ_INNER_A,
    "HZ_INNER_B": HZ_INNER_B,
    "HZ_INNER_C": HZ_INNER_C,
    "HZ_INNER_D": HZ_INNER_D,
    "HZ_OUTER_SEFF_SUN": HZ_OUTER_SEFF_SUN,
    "HZ_OUTER_A": HZ_OUTER_A,
    "HZ_OUTER_B": HZ_OUTER_B,
    "HZ_OUTER_C": HZ_OUTER_C,
    "HZ_OUTER_D": HZ_OUTER_D,
    "PAIRWISE_HILL_REFERENCE_THRESHOLD": PAIRWISE_HILL_REFERENCE_THRESHOLD,
}


class PlanetarySystemBuilderModelError(ValueError):
    """Raised when Builder inputs or provenance leave the reviewed v1 domain."""


def _number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise PlanetarySystemBuilderModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise PlanetarySystemBuilderModelError()
    return 0.0 if numeric == 0.0 else numeric


@dataclass(frozen=True, slots=True)
class PlanetarySystemPlanetInput:
    mass_mearth: float
    semi_major_axis_au: float

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "mass_mearth",
            _number(
                self.mass_mearth,
                minimum=MIN_PLANET_MASS_MEARTH,
                maximum=MAX_PLANET_MASS_MEARTH,
            ),
        )
        object.__setattr__(
            self,
            "semi_major_axis_au",
            _number(
                self.semi_major_axis_au,
                minimum=MIN_SEMI_MAJOR_AXIS_AU,
                maximum=MAX_SEMI_MAJOR_AXIS_AU,
            ),
        )


@dataclass(frozen=True, slots=True)
class PlanetarySystemBuilderInput:
    stellar_mass_msun: float
    stellar_luminosity_lsun: float
    stellar_effective_temperature_k: float
    planets: tuple[PlanetarySystemPlanetInput, ...]

    def __post_init__(self) -> None:
        stellar_mass = _number(
            self.stellar_mass_msun,
            minimum=MIN_STELLAR_MASS_MSUN,
            maximum=MAX_STELLAR_MASS_MSUN,
        )
        luminosity = _number(
            self.stellar_luminosity_lsun,
            minimum=MIN_STELLAR_LUMINOSITY_LSUN,
            maximum=MAX_STELLAR_LUMINOSITY_LSUN,
        )
        temperature = _number(
            self.stellar_effective_temperature_k,
            minimum=MIN_STELLAR_EFFECTIVE_TEMPERATURE_K,
            maximum=MAX_STELLAR_EFFECTIVE_TEMPERATURE_K,
        )
        if not isinstance(self.planets, tuple):
            raise PlanetarySystemBuilderModelError()
        if not MIN_PLANET_COUNT <= len(self.planets) <= MAX_PLANET_COUNT:
            raise PlanetarySystemBuilderModelError()
        if any(not isinstance(planet, PlanetarySystemPlanetInput) for planet in self.planets):
            raise PlanetarySystemBuilderModelError()
        if any(
            outer.semi_major_axis_au <= inner.semi_major_axis_au
            for inner, outer in zip(self.planets, self.planets[1:], strict=False)
        ):
            raise PlanetarySystemBuilderModelError()
        total_planet_mass_parameter = sum(
            planet.mass_mearth * NOMINAL_EARTH_MASS_PARAMETER_M3_S2 for planet in self.planets
        )
        stellar_mass_parameter = stellar_mass * NOMINAL_SOLAR_MASS_PARAMETER_M3_S2
        if (
            total_planet_mass_parameter / stellar_mass_parameter
            > MAX_TOTAL_PLANET_TO_STAR_MASS_RATIO
        ):
            raise PlanetarySystemBuilderModelError()
        object.__setattr__(self, "stellar_mass_msun", stellar_mass)
        object.__setattr__(self, "stellar_luminosity_lsun", luminosity)
        object.__setattr__(self, "stellar_effective_temperature_k", temperature)


@dataclass(frozen=True, slots=True)
class HabitableZoneResult:
    model_id: str
    inner_edge_au: float
    outer_edge_au: float
    inner_effective_flux: float
    outer_effective_flux: float
    habitability_note: str


@dataclass(frozen=True, slots=True)
class PlanetarySystemPlanetResult:
    index: int
    mass_mearth: float
    semi_major_axis_au: float
    orbital_period_s: float
    orbital_period_days: float
    habitable_zone_relation: HabitableZoneRelation


@dataclass(frozen=True, slots=True)
class AdjacentPairResult:
    inner_index: int
    outer_index: int
    mutual_hill_radius_au: float
    separation_mutual_hill: float
    pairwise_reference_threshold: float
    spacing_assessment: PairwiseSpacingAssessment
    interpretation: str


@dataclass(frozen=True, slots=True)
class PlanetarySystemBuilderResult:
    model_version: str
    schema_version: int
    inputs: PlanetarySystemBuilderInput
    habitable_zone: HabitableZoneResult
    planets: tuple[PlanetarySystemPlanetResult, ...]
    adjacent_pairs: tuple[AdjacentPairResult, ...]
    stellar_consistency_note: str
    stability_note: str


def _effective_flux(
    temperature_k: float,
    *,
    seff_sun: float,
    a: float,
    b: float,
    c: float,
    d: float,
) -> float:
    t_star = temperature_k - KOPPARAPU_REFERENCE_TEMPERATURE_K
    value = seff_sun + a * t_star + b * t_star**2 + c * t_star**3 + d * t_star**4
    if not math.isfinite(value) or value <= 0.0:
        raise PlanetarySystemBuilderModelError()
    return value


def _habitable_zone(
    luminosity_lsun: float,
    temperature_k: float,
) -> HabitableZoneResult:
    inner_flux = _effective_flux(
        temperature_k,
        seff_sun=HZ_INNER_SEFF_SUN,
        a=HZ_INNER_A,
        b=HZ_INNER_B,
        c=HZ_INNER_C,
        d=HZ_INNER_D,
    )
    outer_flux = _effective_flux(
        temperature_k,
        seff_sun=HZ_OUTER_SEFF_SUN,
        a=HZ_OUTER_A,
        b=HZ_OUTER_B,
        c=HZ_OUTER_C,
        d=HZ_OUTER_D,
    )
    inner_au = math.sqrt(luminosity_lsun / inner_flux)
    outer_au = math.sqrt(luminosity_lsun / outer_flux)
    if (
        not math.isfinite(inner_au)
        or not math.isfinite(outer_au)
        or inner_au <= 0.0
        or outer_au <= inner_au
    ):
        raise PlanetarySystemBuilderModelError()
    return HabitableZoneResult(
        model_id="kopparapu-2014-1earth-conservative",
        inner_edge_au=inner_au,
        outer_edge_au=outer_au,
        inner_effective_flux=inner_flux,
        outer_effective_flux=outer_flux,
        habitability_note=(
            "This is a 1-Earth-mass conservative climate-model reference band. "
            "Being inside it does not establish habitability or life."
        ),
    )


def _orbital_period(
    stellar_mass_msun: float, planet: PlanetarySystemPlanetInput
) -> tuple[float, float]:
    total_mass_parameter = (
        stellar_mass_msun * NOMINAL_SOLAR_MASS_PARAMETER_M3_S2
        + planet.mass_mearth * NOMINAL_EARTH_MASS_PARAMETER_M3_S2
    )
    semi_major_axis_m = planet.semi_major_axis_au * ASTRONOMICAL_UNIT_M
    period_s = 2.0 * math.pi * math.sqrt(semi_major_axis_m**3 / total_mass_parameter)
    if not math.isfinite(period_s) or period_s <= 0.0:
        raise PlanetarySystemBuilderModelError()
    return period_s, period_s / SECONDS_PER_DAY


def _hz_relation(
    semi_major_axis_au: float,
    habitable_zone: HabitableZoneResult,
) -> HabitableZoneRelation:
    if semi_major_axis_au < habitable_zone.inner_edge_au:
        return "interior_to_reference_hz"
    if semi_major_axis_au > habitable_zone.outer_edge_au:
        return "exterior_to_reference_hz"
    return "inside_reference_hz"


def _adjacent_pair(
    stellar_mass_msun: float,
    inner_index: int,
    inner: PlanetarySystemPlanetInput,
    outer: PlanetarySystemPlanetInput,
) -> AdjacentPairResult:
    planet_mass_parameter = (
        inner.mass_mearth + outer.mass_mearth
    ) * NOMINAL_EARTH_MASS_PARAMETER_M3_S2
    stellar_mass_parameter = stellar_mass_msun * NOMINAL_SOLAR_MASS_PARAMETER_M3_S2
    mutual_hill_radius_au = (
        (planet_mass_parameter / (3.0 * stellar_mass_parameter)) ** (1.0 / 3.0)
        * (inner.semi_major_axis_au + outer.semi_major_axis_au)
        / 2.0
    )
    separation = (outer.semi_major_axis_au - inner.semi_major_axis_au) / mutual_hill_radius_au
    if (
        not math.isfinite(mutual_hill_radius_au)
        or mutual_hill_radius_au <= 0.0
        or not math.isfinite(separation)
        or separation <= 0.0
    ):
        raise PlanetarySystemBuilderModelError()
    if separation <= PAIRWISE_HILL_REFERENCE_THRESHOLD:
        assessment: PairwiseSpacingAssessment = "pairwise_close_warning"
        interpretation = (
            "This adjacent circular pair is at or below the cited two-planet "
            "2*sqrt(3) mutual-Hill reference threshold. Further dynamical analysis is required."
        )
    else:
        assessment = "no_pairwise_hill_warning"
        interpretation = (
            "This adjacent pair is above the cited two-circular-planet mutual-Hill reference "
            "threshold. This is not a long-term or whole-system stability guarantee."
        )
    return AdjacentPairResult(
        inner_index=inner_index,
        outer_index=inner_index + 1,
        mutual_hill_radius_au=mutual_hill_radius_au,
        separation_mutual_hill=separation,
        pairwise_reference_threshold=PAIRWISE_HILL_REFERENCE_THRESHOLD,
        spacing_assessment=assessment,
        interpretation=interpretation,
    )


def calculate_planetary_system_builder(
    inputs: PlanetarySystemBuilderInput,
) -> PlanetarySystemBuilderResult:
    """Evaluate the reviewed deterministic Builder v1 model."""

    if not isinstance(inputs, PlanetarySystemBuilderInput):
        raise PlanetarySystemBuilderModelError()
    habitable_zone = _habitable_zone(
        inputs.stellar_luminosity_lsun,
        inputs.stellar_effective_temperature_k,
    )
    planets: list[PlanetarySystemPlanetResult] = []
    for index, planet in enumerate(inputs.planets, start=1):
        period_s, period_days = _orbital_period(inputs.stellar_mass_msun, planet)
        planets.append(
            PlanetarySystemPlanetResult(
                index=index,
                mass_mearth=planet.mass_mearth,
                semi_major_axis_au=planet.semi_major_axis_au,
                orbital_period_s=period_s,
                orbital_period_days=period_days,
                habitable_zone_relation=_hz_relation(planet.semi_major_axis_au, habitable_zone),
            )
        )
    adjacent_pairs = tuple(
        _adjacent_pair(inputs.stellar_mass_msun, index, inner, outer)
        for index, (inner, outer) in enumerate(
            zip(inputs.planets, inputs.planets[1:], strict=False),
            start=1,
        )
    )
    return PlanetarySystemBuilderResult(
        model_version=PLANETARY_SYSTEM_BUILDER_MODEL_VERSION,
        schema_version=PLANETARY_SYSTEM_BUILDER_SCHEMA_VERSION,
        inputs=inputs,
        habitable_zone=habitable_zone,
        planets=tuple(planets),
        adjacent_pairs=adjacent_pairs,
        stellar_consistency_note=(
            "Stellar mass, luminosity, and effective temperature are independent educational "
            "controls; v1 does not certify their combination as a stellar-evolution solution."
        ),
        stability_note=(
            "Adjacent mutual-Hill values are pairwise circular-orbit context only. "
            "V1 performs no n-body integration and makes no long-term multi-planet stability claim."
        ),
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise PlanetarySystemBuilderModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise PlanetarySystemBuilderModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise PlanetarySystemBuilderModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise PlanetarySystemBuilderModelError()
    return value


def _validate_source(value: object) -> str:
    source = _mapping(value)
    _exact_keys(
        source,
        frozenset(
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
        ),
    )
    source_id = _string(source["id"])
    if source_id not in _SOURCE_URLS:
        raise PlanetarySystemBuilderModelError()
    url = _string(source["url"])
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or url != _SOURCE_URLS[source_id]:
        raise PlanetarySystemBuilderModelError()
    for key, item in source.items():
        if key not in {"id", "url"}:
            _string(item)
    return source_id


def _planet_from_mapping(value: object) -> PlanetarySystemPlanetInput:
    planet = _mapping(value)
    _exact_keys(planet, frozenset({"mass_mearth", "semi_major_axis_au"}))
    return PlanetarySystemPlanetInput(
        mass_mearth=planet["mass_mearth"],  # type: ignore[arg-type]
        semi_major_axis_au=planet["semi_major_axis_au"],  # type: ignore[arg-type]
    )


def load_reviewed_planetary_system_builder_artifact(
    *,
    repository_root: Path,
) -> dict[str, object]:
    """Load and strictly validate the checked-in Builder v1 artifact."""

    path = repository_root / PLANETARY_SYSTEM_BUILDER_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, PlanetarySystemBuilderModelError):
        raise PlanetarySystemBuilderModelError() from None

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
        artifact["artifact_version"] != PLANETARY_SYSTEM_BUILDER_ARTIFACT_VERSION
        or artifact["model_version"] != PLANETARY_SYSTEM_BUILDER_MODEL_VERSION
        or artifact["schema_version"] != PLANETARY_SYSTEM_BUILDER_SCHEMA_VERSION
        or artifact["share_schema_version"] != PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION
    ):
        raise PlanetarySystemBuilderModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    if (
        definition.get("slug") != "planetary-system-builder"
        or definition.get("title") != "Planetary System Builder"
        or definition.get("status") != "ready"
        or definition.get("version") != 1
        or definition.get("model_version") != PLANETARY_SYSTEM_BUILDER_MODEL_VERSION
        or definition.get("share_schema_version") != PLANETARY_SYSTEM_BUILDER_SHARE_SCHEMA_VERSION
    ):
        raise PlanetarySystemBuilderModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise PlanetarySystemBuilderModelError()
    source_ids = [_validate_source(source) for source in sources]
    if tuple(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise PlanetarySystemBuilderModelError()
    if definition.get("references") != source_ids:
        raise PlanetarySystemBuilderModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise PlanetarySystemBuilderModelError()

    presets = _mapping(artifact["presets"])
    if frozenset(presets) != {"illustrative-three-planet"}:
        raise PlanetarySystemBuilderModelError()
    preset = _mapping(presets["illustrative-three-planet"])
    _exact_keys(
        preset,
        frozenset(
            {
                "stellar_mass_msun",
                "stellar_luminosity_lsun",
                "stellar_effective_temperature_k",
                "planets",
            }
        ),
    )
    raw_planets = preset["planets"]
    if not isinstance(raw_planets, list):
        raise PlanetarySystemBuilderModelError()
    PlanetarySystemBuilderInput(
        stellar_mass_msun=preset["stellar_mass_msun"],  # type: ignore[arg-type]
        stellar_luminosity_lsun=preset["stellar_luminosity_lsun"],  # type: ignore[arg-type]
        stellar_effective_temperature_k=preset[  # type: ignore[arg-type]
            "stellar_effective_temperature_k"
        ],
        planets=tuple(_planet_from_mapping(item) for item in raw_planets),
    )

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_FIXTURE_IDS):
        raise PlanetarySystemBuilderModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_ids.add(_string(fixture["id"]))
        _string(fixture["purpose"])
    if fixture_ids != _FIXTURE_IDS:
        raise PlanetarySystemBuilderModelError()

    scientific = _mapping(artifact["scientific_validation"])
    if scientific.get("id") != "planetary-system-builder-v1-validation":
        raise PlanetarySystemBuilderModelError()
    if scientific.get("source_ids") != source_ids:
        raise PlanetarySystemBuilderModelError()
    tests = scientific.get("test_references")
    if (
        not isinstance(tests, list)
        or len(tests) != 12
        or any(not isinstance(item, str) or not item for item in tests)
    ):
        raise PlanetarySystemBuilderModelError()
    return dict(artifact)


__all__ = [
    "ASTRONOMICAL_UNIT_M",
    "AdjacentPairResult",
    "HabitableZoneRelation",
    "HabitableZoneResult",
    "NOMINAL_EARTH_MASS_PARAMETER_M3_S2",
    "NOMINAL_SOLAR_MASS_PARAMETER_M3_S2",
    "PAIRWISE_HILL_REFERENCE_THRESHOLD",
    "PLANETARY_SYSTEM_BUILDER_ARTIFACT_PATH",
    "PLANETARY_SYSTEM_BUILDER_MODEL_VERSION",
    "PairwiseSpacingAssessment",
    "PlanetarySystemBuilderInput",
    "PlanetarySystemBuilderModelError",
    "PlanetarySystemBuilderResult",
    "PlanetarySystemPlanetInput",
    "PlanetarySystemPlanetResult",
    "calculate_planetary_system_builder",
    "load_reviewed_planetary_system_builder_artifact",
]
