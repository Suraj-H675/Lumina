"""Pure deterministic geometry for the Seasons Simulator v1 model.

The model deliberately separates tilt-driven solar geometry from the secondary
inverse-square distance context.  It has no web, persistence, provider, or
browser dependency; the FastAPI layer translates its immutable value objects
to the public transport contract.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

SEASONS_MODEL_VERSION: Final = "seasons-simulator-v1"
SEASONS_SCHEMA_VERSION: Final = 1
SEASONS_ARTIFACT_VERSION: Final = 1
SEASONS_ARTIFACT_PATH: Final = "data/seed/seasons-simulator-v1.json"

EARTH_OBLIQUITY_J2000_DEG: Final = 23.43928
EARTH_ECCENTRICITY: Final = 0.01671123
EARTH_PERIHELION_LONGITUDE_DEG: Final = 102.93768193
PERIHELION_SEASONAL_LONGITUDE_DEG: Final = 282.93768193
MEAN_SOLAR_DAY_HOURS: Final = 24.0
CIRCULAR_ECCENTRICITY: Final = 0.0
EXAGGERATED_ECCENTRICITY: Final = 0.10

ANGLE_ABSOLUTE_TOLERANCE: Final = 1e-9
DAY_LENGTH_ABSOLUTE_TOLERANCE: Final = 1e-9
DIMENSIONLESS_RELATIVE_TOLERANCE: Final = 1e-12

SeasonsEccentricityPreset = Literal["circular", "earth", "exaggerated"]
SeasonsPolarState = Literal["none", "polar_day", "polar_night", "horizon_all_day"]

_ECCENTRICITY_BY_PRESET: Final[dict[SeasonsEccentricityPreset, float]] = {
    "circular": CIRCULAR_ECCENTRICITY,
    "earth": EARTH_ECCENTRICITY,
    "exaggerated": EXAGGERATED_ECCENTRICITY,
}
# The angular boundary check below is an algebraically equivalent, numerically
# stable form of x = -tan(phi)tan(delta).  Only one ulp is tolerated so valid
# inputs immediately inside the polar circle are not swallowed by a broad
# scientific classification tolerance.
_POLAR_BOUNDARY_ROUNDOFF_TOLERANCE: Final = math.ulp(math.pi / 2.0)
_POLE_COSINE_ROUNDOFF_TOLERANCE: Final = 1e-15
_OFFICIAL_SOURCE_HOSTS: Final = frozenset(
    {
        "aa.usno.navy.mil",
        "science.nasa.gov",
        "spaceplace.nasa.gov",
        "ssd.jpl.nasa.gov",
        "www.gml.noaa.gov",
    }
)
_SOURCE_IDS: Final = frozenset(
    {
        "nasa-space-place-seasons",
        "nasa-earth-facts",
        "jpl-approximate-planetary-elements",
        "usno-sun-declination",
        "usno-daylight-geometry",
        "noaa-solar-calculator-details",
    }
)
_EXPECTED_SOURCE_METADATA: Final[dict[str, dict[str, str]]] = {
    "nasa-space-place-seasons": {
        "title": "What Causes the Seasons?",
        "organization_or_authors": "NASA Space Place",
        "url": "https://spaceplace.nasa.gov/seasons/en/",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — official educational reference page.",
        "record_reference": "Page-level explanation; no stable record identifier supplied.",
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Official NASA educational source; Lumina links to the source and does "
            "not redistribute NASA media."
        ),
        "citation": "NASA Space Place, “What Causes the Seasons?”, accessed 2026-09-09.",
        "claim_scope": (
            "Educational explanation that Earth's seasons are primarily caused by "
            "axial tilt rather than distance from the Sun."
        ),
        "source_type": "official-education",
    },
    "nasa-earth-facts": {
        "title": "Earth Facts",
        "organization_or_authors": "NASA Science",
        "url": "https://science.nasa.gov/earth/facts/",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — official reference page.",
        "record_reference": "Page-level Earth facts; no stable record identifier supplied.",
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Official NASA factual/educational source; Lumina links to the source and "
            "does not redistribute NASA media."
        ),
        "citation": "NASA Science, “Earth Facts”, accessed 2026-09-09.",
        "claim_scope": "Earth axial-tilt and annual seasonal context.",
        "source_type": "official-agency",
    },
    "jpl-approximate-planetary-elements": {
        "title": "Approximate Positions of the Planets",
        "organization_or_authors": "NASA Jet Propulsion Laboratory Solar System Dynamics",
        "url": "https://ssd.jpl.nasa.gov/planets/approx_pos.html",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Approximate planetary elements and position reference.",
        "record_reference": (
            "Earth/Moon barycenter row; J2000 obliquity reference in the page table."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "J2000 reference values as identified by source.",
        "terms_or_licence": (
            "Official JPL/NASA technical reference; Lumina cites the reviewed "
            "constants and links to the source."
        ),
        "citation": (
            "NASA JPL Solar System Dynamics, “Approximate Positions of the Planets”, "
            "accessed 2026-09-09."
        ),
        "claim_scope": (
            "Reviewed Earth/Moon-barycenter eccentricity, longitude of perihelion, "
            "and J2000 obliquity constants used by this idealized model."
        ),
        "source_type": "official-agency",
    },
    "usno-sun-declination": {
        "title": "Computing Approximate Solar Coordinates",
        "organization_or_authors": "U.S. Naval Observatory",
        "url": "https://aa.usno.navy.mil/faq/sun_approx",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — official astronomical reference page.",
        "record_reference": (
            "Page-level solar-coordinate definitions; no stable record identifier supplied."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Official U.S. government reference; Lumina links to the source and uses "
            "it for supporting terminology and comparison only."
        ),
        "citation": (
            "U.S. Naval Observatory, “Computing Approximate Solar Coordinates”, "
            "accessed 2026-09-09."
        ),
        "claim_scope": (
            "Supporting definitions for solar declination and solar-coordinate "
            "geometry; not the Lumina date-specific calculation."
        ),
        "source_type": "official-agency",
    },
    "usno-daylight-geometry": {
        "title": "Sunrise and Sunset Times Near the Solstices",
        "organization_or_authors": "U.S. Naval Observatory",
        "url": "https://aa.usno.navy.mil/faq/rs_solstices",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — official astronomical reference page.",
        "record_reference": (
            "Page-level daylight-geometry reference; no stable record identifier supplied."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Official U.S. government reference; Lumina links to the source and uses "
            "it for supporting geometric comparison only."
        ),
        "citation": (
            "U.S. Naval Observatory, “Sunrise and Sunset Times Near the Solstices”, "
            "accessed 2026-09-09."
        ),
        "claim_scope": (
            "Supporting daylight and horizon geometry context; Lumina v1 "
            "intentionally uses a geometric point-Sun horizon rather than "
            "observed-rise conventions."
        ),
        "source_type": "official-agency",
    },
    "noaa-solar-calculator-details": {
        "title": "Solar Calculation Details",
        "organization_or_authors": "NOAA Global Monitoring Laboratory",
        "url": "https://www.gml.noaa.gov/grad/solcalc/calcdetails.html",
        "accessed_at": "2026-09-09",
        "dataset_or_release": "Not applicable — official technical reference page.",
        "record_reference": (
            "Page-level calculation details; no stable record identifier supplied."
        ),
        "retrieved_at": "2026-09-09",
        "data_date": "Not stated by source.",
        "terms_or_licence": (
            "Official NOAA technical reference; Lumina links to the source for "
            "supporting comparison and disclosure."
        ),
        "citation": (
            "NOAA Global Monitoring Laboratory, “Solar Calculation Details”, accessed 2026-09-09."
        ),
        "claim_scope": (
            "Supporting comparison for general solar-zenith geometry and "
            "documentation of refraction and solar-disc corrections excluded by "
            "Lumina v1; NOAA fractional-year declination is not used."
        ),
        "source_type": "official-agency",
    },
}
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "equinox-40-north",
        "june-solstice-40-north",
        "december-solstice-40-north",
        "equator-june-solstice",
        "zero-tilt-distance-only",
        "arctic-circle-boundary",
        "pole-equinox-degeneracy",
        "circular-orbit",
        "earth-perihelion-distance",
        "earth-aphelion-distance",
        "exaggerated-eccentricity-distance",
    }
)


class SeasonsModelError(ValueError):
    """Raised when input, calculation, or reviewed-artifact validation fails."""

    def __init__(self) -> None:
        super().__init__("SEASONS_MODEL_INVALID")


@dataclass(frozen=True, slots=True)
class SeasonsSimulatorInput:
    """Validated continuous inputs for one deterministic model evaluation."""

    axial_tilt_deg: float
    orbital_position_deg: float
    latitude_deg: float
    eccentricity_preset: SeasonsEccentricityPreset

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "axial_tilt_deg",
            _validated_number(self.axial_tilt_deg, minimum=0.0, maximum=90.0),
        )
        object.__setattr__(
            self,
            "orbital_position_deg",
            _validated_number(self.orbital_position_deg, minimum=0.0, maximum=360.0),
        )
        if self.orbital_position_deg >= 360.0:
            raise SeasonsModelError()
        object.__setattr__(
            self,
            "latitude_deg",
            _validated_number(self.latitude_deg, minimum=-90.0, maximum=90.0),
        )
        if not isinstance(self.eccentricity_preset, str) or self.eccentricity_preset not in (
            _ECCENTRICITY_BY_PRESET
        ):
            raise SeasonsModelError()


@dataclass(frozen=True, slots=True)
class SeasonsLatitudeGeometry:
    """Local-solar-noon and geometric-daylight outputs for one latitude."""

    latitude_deg: float
    noon_solar_zenith_deg: float
    noon_sun_altitude_deg: float
    illumination_incidence_deg: float
    day_length_hours: float | None
    polar_state: SeasonsPolarState


@dataclass(frozen=True, slots=True)
class SeasonsSimulatorResult:
    """Complete canonical result returned by the Seasons domain calculation."""

    model_version: str
    schema_version: int
    inputs: SeasonsSimulatorInput
    solar_declination_deg: float
    selected: SeasonsLatitudeGeometry
    comparison_latitude_deg: float
    opposite_hemisphere: SeasonsLatitudeGeometry
    eccentricity: float
    distance_over_semimajor_axis: float
    relative_solar_flux: float


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SeasonsModelError()
    try:
        numeric_value = float(value)
    except (OverflowError, TypeError, ValueError):
        raise SeasonsModelError() from None
    if not math.isfinite(numeric_value) or not minimum <= numeric_value <= maximum:
        raise SeasonsModelError()
    return 0.0 if numeric_value == 0.0 else numeric_value


def _clamp_trigonometric_argument(value: float) -> float:
    """Clamp only an argument that is already mathematically bounded."""

    return max(-1.0, min(1.0, value))


def _seasonal_position_sine(position_deg: float, position_rad: float) -> float:
    """Preserve the exact sine at the four canonical seasonal phases."""

    if position_deg in (0.0, 180.0):
        return 0.0
    if position_deg == 90.0:
        return 1.0
    if position_deg == 270.0:
        return -1.0
    return math.sin(position_rad)


def _geometry_for_latitude(
    latitude_deg: float,
    solar_declination_deg: float,
    *,
    declination_boundary_abs_rad: float,
) -> SeasonsLatitudeGeometry:
    latitude_rad = math.radians(latitude_deg)
    declination_rad = math.radians(solar_declination_deg)

    cos_zenith = math.sin(latitude_rad) * math.sin(declination_rad) + math.cos(
        latitude_rad
    ) * math.cos(declination_rad)
    zenith_deg = math.degrees(math.acos(_clamp_trigonometric_argument(cos_zenith)))
    altitude_deg = 90.0 - zenith_deg

    sine_term = math.sin(latitude_rad) * math.sin(declination_rad)
    cosine_term = math.cos(latitude_rad) * math.cos(declination_rad)

    if abs(cosine_term) <= _POLE_COSINE_ROUNDOFF_TOLERANCE:
        if sine_term > 0.0:
            polar_state: SeasonsPolarState = "polar_day"
            day_length_hours: float | None = MEAN_SOLAR_DAY_HOURS
        elif sine_term < 0.0:
            polar_state = "polar_night"
            day_length_hours = 0.0
        else:
            polar_state = "horizon_all_day"
            day_length_hours = None
    else:
        # For |phi| + |delta| >= 90 degrees, the ordinary x quotient is
        # needlessly ill-conditioned at the polar boundary.  The angle-sum
        # predicate is mathematically equivalent and uses a stable declination
        # magnitude derived from the same sin(delta) relationship.
        polar_boundary_or_beyond = abs(
            latitude_rad
        ) + declination_boundary_abs_rad > math.pi / 2.0 or math.isclose(
            abs(latitude_rad) + declination_boundary_abs_rad,
            math.pi / 2.0,
            rel_tol=0.0,
            abs_tol=_POLAR_BOUNDARY_ROUNDOFF_TOLERANCE,
        )
        if polar_boundary_or_beyond and sine_term > 0.0:
            polar_state = "polar_day"
            day_length_hours = MEAN_SOLAR_DAY_HOURS
        elif polar_boundary_or_beyond and sine_term < 0.0:
            polar_state = "polar_night"
            day_length_hours = 0.0
        else:
            sunset_argument = -sine_term / cosine_term
            hour_angle = math.acos(_clamp_trigonometric_argument(sunset_argument))
            polar_state = "none"
            day_length_hours = MEAN_SOLAR_DAY_HOURS * hour_angle / math.pi

    return SeasonsLatitudeGeometry(
        latitude_deg=latitude_deg,
        noon_solar_zenith_deg=zenith_deg,
        noon_sun_altitude_deg=altitude_deg,
        illumination_incidence_deg=zenith_deg,
        day_length_hours=day_length_hours,
        polar_state=polar_state,
    )


def calculate_seasons(inputs: SeasonsSimulatorInput) -> SeasonsSimulatorResult:
    """Calculate the complete idealized Seasons Simulator result."""

    if not isinstance(inputs, SeasonsSimulatorInput):
        raise SeasonsModelError()

    tilt_rad = math.radians(inputs.axial_tilt_deg)
    position_rad = math.radians(inputs.orbital_position_deg)
    seasonal_sine = _seasonal_position_sine(inputs.orbital_position_deg, position_rad)
    sine_declination = math.sin(tilt_rad) * seasonal_sine
    declination_rad = math.asin(_clamp_trigonometric_argument(sine_declination))
    solar_declination_deg = math.degrees(declination_rad)
    # cos(delta) = sqrt(cos(epsilon)^2 + sin(epsilon)^2 cos(lambda)^2).
    # atan2 preserves the declination magnitude near +/-90 degrees better than
    # recovering it from asin for the boundary classification only.
    declination_boundary_abs_rad = math.atan2(
        abs(sine_declination),
        math.hypot(math.cos(tilt_rad), math.sin(tilt_rad) * math.cos(position_rad)),
    )

    selected = _geometry_for_latitude(
        inputs.latitude_deg,
        solar_declination_deg,
        declination_boundary_abs_rad=declination_boundary_abs_rad,
    )
    comparison_latitude_deg = -inputs.latitude_deg
    opposite_hemisphere = _geometry_for_latitude(
        comparison_latitude_deg,
        solar_declination_deg,
        declination_boundary_abs_rad=declination_boundary_abs_rad,
    )

    eccentricity = _ECCENTRICITY_BY_PRESET[inputs.eccentricity_preset]
    true_anomaly_rad = math.radians(inputs.orbital_position_deg - PERIHELION_SEASONAL_LONGITUDE_DEG)
    distance_over_semimajor_axis = (1.0 - eccentricity**2) / (
        1.0 + eccentricity * math.cos(true_anomaly_rad)
    )
    relative_solar_flux = 1.0 / (distance_over_semimajor_axis**2)

    if not all(
        math.isfinite(value)
        for value in (
            solar_declination_deg,
            distance_over_semimajor_axis,
            relative_solar_flux,
        )
    ):
        raise SeasonsModelError()

    return SeasonsSimulatorResult(
        model_version=SEASONS_MODEL_VERSION,
        schema_version=SEASONS_SCHEMA_VERSION,
        inputs=inputs,
        solar_declination_deg=solar_declination_deg,
        selected=selected,
        comparison_latitude_deg=comparison_latitude_deg,
        opposite_hemisphere=opposite_hemisphere,
        eccentricity=eccentricity,
        distance_over_semimajor_axis=distance_over_semimajor_axis,
        relative_solar_flux=relative_solar_flux,
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise SeasonsModelError()
        result[key] = value
    return result


def _mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise SeasonsModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise SeasonsModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise SeasonsModelError()
    return value


def _number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SeasonsModelError()
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        raise SeasonsModelError() from None
    if not math.isfinite(number):
        raise SeasonsModelError()
    return number


def _validate_source(source: object) -> str:
    mapping = _mapping(source)
    _exact_keys(
        mapping,
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
    source_id = _string(mapping["id"])
    if source_id not in _SOURCE_IDS:
        raise SeasonsModelError()
    expected = _EXPECTED_SOURCE_METADATA.get(source_id)
    if expected is None or any(_string(mapping[key]) != value for key, value in expected.items()):
        raise SeasonsModelError()
    parsed = urlparse(_string(mapping["url"]))
    if parsed.scheme != "https" or parsed.hostname not in _OFFICIAL_SOURCE_HOSTS:
        raise SeasonsModelError()
    if mapping["source_type"] not in {"official-agency", "official-education"}:
        raise SeasonsModelError()
    for key in (
        "title",
        "organization_or_authors",
        "accessed_at",
        "dataset_or_release",
        "record_reference",
        "retrieved_at",
        "data_date",
        "terms_or_licence",
        "citation",
        "claim_scope",
    ):
        _string(mapping[key])
    return source_id


def load_reviewed_seasons_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and validate the checked-in reviewed Seasons model artifact."""

    path = repository_root / SEASONS_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, SeasonsModelError):
        raise SeasonsModelError() from None

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
        artifact["artifact_version"] != SEASONS_ARTIFACT_VERSION
        or artifact["model_version"] != SEASONS_MODEL_VERSION
        or artifact["schema_version"] != SEASONS_SCHEMA_VERSION
        or artifact["share_schema_version"] != SEASONS_SCHEMA_VERSION
    ):
        raise SeasonsModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    _exact_keys(
        definition,
        frozenset(
            {
                "slug",
                "title",
                "content_type",
                "language",
                "status",
                "version",
                "audience_modes",
                "reviewed_by",
                "reviewed_at",
                "updated_at",
                "model_version",
                "learning_objectives",
                "prerequisite_concepts",
                "input_schema",
                "default_preset",
                "calculation_module",
                "output_schema",
                "visualization_module",
                "assumptions",
                "limitations",
                "references",
                "validation_fixtures",
                "share_schema_version",
            }
        ),
    )
    if (
        definition["slug"] != "seasons-simulator"
        or definition["model_version"] != SEASONS_MODEL_VERSION
        or definition["status"] != "ready"
        or definition["version"] != 1
        or definition["share_schema_version"] != SEASONS_SCHEMA_VERSION
    ):
        raise SeasonsModelError()

    raw_sources = artifact["sources"]
    if not isinstance(raw_sources, list) or len(raw_sources) != len(_SOURCE_IDS):
        raise SeasonsModelError()
    source_ids = {_validate_source(source) for source in raw_sources}
    if source_ids != _SOURCE_IDS:
        raise SeasonsModelError()

    constants = _mapping(artifact["constants"])
    expected_constants = {
        "EARTH_OBLIQUITY_J2000_DEG": EARTH_OBLIQUITY_J2000_DEG,
        "EARTH_ECCENTRICITY": EARTH_ECCENTRICITY,
        "EARTH_PERIHELION_LONGITUDE_DEG": EARTH_PERIHELION_LONGITUDE_DEG,
        "PERIHELION_SEASONAL_LONGITUDE_DEG": PERIHELION_SEASONAL_LONGITUDE_DEG,
        "MEAN_SOLAR_DAY_HOURS": MEAN_SOLAR_DAY_HOURS,
        "CIRCULAR_ECCENTRICITY": CIRCULAR_ECCENTRICITY,
        "EXAGGERATED_ECCENTRICITY": EXAGGERATED_ECCENTRICITY,
    }
    _exact_keys(constants, frozenset(expected_constants))
    if any(_number(constants[key]) != expected for key, expected in expected_constants.items()):
        raise SeasonsModelError()

    presets = _mapping(artifact["presets"])
    _exact_keys(presets, frozenset(_ECCENTRICITY_BY_PRESET))
    if any(_number(presets[key]) != value for key, value in _ECCENTRICITY_BY_PRESET.items()):
        raise SeasonsModelError()

    raw_fixtures = artifact["validation_fixtures"]
    if not isinstance(raw_fixtures, list) or len(raw_fixtures) != len(_VALIDATION_FIXTURE_IDS):
        raise SeasonsModelError()
    fixture_ids: set[str] = set()
    for fixture in raw_fixtures:
        fixture_mapping = _mapping(fixture)
        fixture_id = _string(fixture_mapping.get("id"))
        fixture_ids.add(fixture_id)
        if fixture_id not in _VALIDATION_FIXTURE_IDS:
            raise SeasonsModelError()
        if not _string(fixture_mapping.get("purpose")):
            raise SeasonsModelError()
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise SeasonsModelError()

    scientific_validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        scientific_validation,
        frozenset({"id", "checked_at", "method", "tools", "source_ids", "test_references"}),
    )
    if scientific_validation["id"] != "seasons-simulator-independent-validation-v1":
        raise SeasonsModelError()
    _string(scientific_validation["checked_at"])
    _string(scientific_validation["method"])
    source_reference_ids = scientific_validation["source_ids"]
    if not isinstance(source_reference_ids, list) or set(source_reference_ids) != _SOURCE_IDS:
        raise SeasonsModelError()
    test_references = scientific_validation["test_references"]
    if (
        not isinstance(test_references, list)
        or not test_references
        or not all(isinstance(reference, str) and reference for reference in test_references)
    ):
        raise SeasonsModelError()
    tools = scientific_validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise SeasonsModelError()
    for tool in tools:
        tool_mapping = _mapping(tool)
        _exact_keys(tool_mapping, frozenset({"name", "version", "role"}))
        _string(tool_mapping["name"])
        _string(tool_mapping["version"])
        _string(tool_mapping["role"])

    return artifact


__all__ = [
    "ANGLE_ABSOLUTE_TOLERANCE",
    "CIRCULAR_ECCENTRICITY",
    "DAY_LENGTH_ABSOLUTE_TOLERANCE",
    "DIMENSIONLESS_RELATIVE_TOLERANCE",
    "EARTH_ECCENTRICITY",
    "EARTH_OBLIQUITY_J2000_DEG",
    "EARTH_PERIHELION_LONGITUDE_DEG",
    "EXAGGERATED_ECCENTRICITY",
    "MEAN_SOLAR_DAY_HOURS",
    "PERIHELION_SEASONAL_LONGITUDE_DEG",
    "SEASONS_ARTIFACT_PATH",
    "SEASONS_ARTIFACT_VERSION",
    "SEASONS_MODEL_VERSION",
    "SEASONS_SCHEMA_VERSION",
    "SeasonsEccentricityPreset",
    "SeasonsLatitudeGeometry",
    "SeasonsModelError",
    "SeasonsPolarState",
    "SeasonsSimulatorInput",
    "SeasonsSimulatorResult",
    "calculate_seasons",
    "load_reviewed_seasons_artifact",
]
