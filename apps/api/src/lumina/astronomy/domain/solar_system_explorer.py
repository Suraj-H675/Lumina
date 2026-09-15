"""Reviewed Solar System distance model for Phase 5B visual exploration.

The model is deliberately not an ephemeris. It transforms NASA-reviewed mean Sun distances into
linear and logarithmic display coordinates so the browser can compare system scale without
inventing current planetary positions or orbital shapes.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

SOLAR_SYSTEM_MODEL_VERSION: Final = "solar-system-distance-v1"
SOLAR_SYSTEM_SCHEMA_VERSION: Final = 1
SOLAR_SYSTEM_ARTIFACT_VERSION: Final = 1
SOLAR_SYSTEM_ARTIFACT_PATH: Final = "data/seed/solar-system-distance-v1.json"
SOLAR_SYSTEM_GENERATED_AT: Final = "2026-09-15T10:00:00Z"
RELATIVE_TOLERANCE: Final = 1e-12

PlanetClass = Literal["terrestrial", "giant"]
LightTimeUnit = Literal["minutes", "hours"]

_BODY_IDS: Final = (
    "sun",
    "mercury",
    "venus",
    "earth",
    "mars",
    "jupiter",
    "saturn",
    "uranus",
    "neptune",
)

_SOURCE_METADATA: Final = (
    {
        "id": "nasa-basics-solar-system-distances",
        "title": "Basics of Space Flight, Chapter 1: The Solar System",
        "organization_or_authors": "NASA Science / Jet Propulsion Laboratory",
        "url": "https://science.nasa.gov/learn/basics-of-space-flight/chapter1-2/",
        "accessed_at": "2026-09-15",
        "dataset_or_release": "NASA Basics of Space Flight web reference; not a versioned dataset.",
        "record_reference": "Terrestrial and Jovian planetary-data tables on the chapter page.",
        "retrieved_at": "2026-09-15",
        "data_date": "Page publication metadata is not a planetary-element epoch.",
        "terms_or_licence": (
            "NASA factual/educational source; Lumina republishes cited numeric facts and "
            "links only, not NASA media or identifiers."
        ),
        "citation": (
            "NASA Science / Jet Propulsion Laboratory, “Basics of Space Flight, Chapter 1: The "
            "Solar System”, accessed 2026-09-15."
        ),
        "claim_scope": (
            "Approximate mean distances from the Sun and light-time context for the eight planets."
        ),
        "source_type": "official-agency",
    },
    {
        "id": "nasa-basics-au-definition",
        "title": "Basics of Space Flight: Units of Measure",
        "organization_or_authors": "NASA Science / Jet Propulsion Laboratory",
        "url": "https://science.nasa.gov/learn/basics-of-space-flight/units/",
        "accessed_at": "2026-09-15",
        "dataset_or_release": "NASA Basics of Space Flight web reference; not a versioned dataset.",
        "record_reference": "Astronomical-unit entry in the units reference.",
        "retrieved_at": "2026-09-15",
        "data_date": "Not applicable — unit-definition reference.",
        "terms_or_licence": (
            "NASA factual/educational source; Lumina republishes cited unit context and links "
            "only, not NASA media or identifiers."
        ),
        "citation": (
            "NASA Science / Jet Propulsion Laboratory, “Basics of Space Flight: Units of Measure”, "
            "accessed 2026-09-15."
        ),
        "claim_scope": "Astronomical-unit definition and distance-unit context.",
        "source_type": "official-agency",
    },
)


class SolarSystemExplorerModelError(ValueError):
    """Raised when reviewed model input violates the Phase 5B contract."""

    def __init__(self) -> None:
        super().__init__("SOLAR_SYSTEM_EXPLORER_MODEL_INVALID")


@dataclass(frozen=True, slots=True)
class PlanetDistanceInput:
    id: str
    name: str
    planet_class: PlanetClass
    mean_distance_au: float
    light_time_value: float
    light_time_unit: LightTimeUnit

    def __post_init__(self) -> None:
        if self.id not in _BODY_IDS[1:] or not self.name:
            raise SolarSystemExplorerModelError()
        if self.planet_class not in {"terrestrial", "giant"}:
            raise SolarSystemExplorerModelError()
        for value in (self.mean_distance_au, self.light_time_value):
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise SolarSystemExplorerModelError()
            if not math.isfinite(float(value)) or float(value) <= 0:
                raise SolarSystemExplorerModelError()
        if self.light_time_unit not in {"minutes", "hours"}:
            raise SolarSystemExplorerModelError()


_REVIEWED_PLANETS: Final = (
    PlanetDistanceInput("mercury", "Mercury", "terrestrial", 0.387, 3.2, "minutes"),
    PlanetDistanceInput("venus", "Venus", "terrestrial", 0.723, 6.0, "minutes"),
    PlanetDistanceInput("earth", "Earth", "terrestrial", 1.0, 8.3, "minutes"),
    PlanetDistanceInput("mars", "Mars", "terrestrial", 1.524, 12.7, "minutes"),
    PlanetDistanceInput("jupiter", "Jupiter", "giant", 5.20, 0.72, "hours"),
    PlanetDistanceInput("saturn", "Saturn", "giant", 9.58, 1.3, "hours"),
    PlanetDistanceInput("uranus", "Uranus", "giant", 19.20, 2.7, "hours"),
    PlanetDistanceInput("neptune", "Neptune", "giant", 30.05, 4.2, "hours"),
)


def _validate_sources() -> None:
    for source in _SOURCE_METADATA:
        parsed = urlparse(source["url"])
        if parsed.scheme != "https" or parsed.hostname != "science.nasa.gov":
            raise SolarSystemExplorerModelError()


def _normalized_log_position(distance_au: float, minimum_au: float, maximum_au: float) -> float:
    denominator = math.log10(maximum_au) - math.log10(minimum_au)
    if denominator <= 0:
        raise SolarSystemExplorerModelError()
    result = (math.log10(distance_au) - math.log10(minimum_au)) / denominator * 100.0
    if (
        not math.isfinite(result)
        or result < -RELATIVE_TOLERANCE
        or result > 100 + RELATIVE_TOLERANCE
    ):
        raise SolarSystemExplorerModelError()
    return min(100.0, max(0.0, result))


def _linear_position(distance_au: float, maximum_au: float) -> float:
    result = distance_au / maximum_au * 100.0
    if not math.isfinite(result) or result <= 0 or result > 100 + RELATIVE_TOLERANCE:
        raise SolarSystemExplorerModelError()
    return min(100.0, result)


def build_solar_system_distance_artifact(
    planets: tuple[PlanetDistanceInput, ...] = _REVIEWED_PLANETS,
) -> dict[str, object]:
    """Build the deterministic reviewed output consumed by the web route."""

    _validate_sources()
    if tuple(planet.id for planet in planets) != _BODY_IDS[1:]:
        raise SolarSystemExplorerModelError()
    distances = tuple(float(planet.mean_distance_au) for planet in planets)
    if any(second <= first for first, second in zip(distances, distances[1:], strict=False)):
        raise SolarSystemExplorerModelError()

    minimum_au = distances[0]
    maximum_au = distances[-1]
    bodies: list[dict[str, object]] = [
        {
            "id": "sun",
            "name": "Sun",
            "kind": "star",
            "mean_distance_au": 0.0,
            "light_time_value": 0.0,
            "light_time_unit": "minutes",
            "linear_position_percent": 0.0,
            "log_position_percent": None,
            "earth_distance_ratio": 0.0,
            "scale_explorer_node_id": "sun",
            "source_ids": ["nasa-basics-solar-system-distances"],
        }
    ]
    for planet in planets:
        distance = float(planet.mean_distance_au)
        bodies.append(
            {
                "id": planet.id,
                "name": planet.name,
                "kind": planet.planet_class,
                "mean_distance_au": distance,
                "light_time_value": float(planet.light_time_value),
                "light_time_unit": planet.light_time_unit,
                "linear_position_percent": _linear_position(distance, maximum_au),
                "log_position_percent": _normalized_log_position(distance, minimum_au, maximum_au),
                "earth_distance_ratio": distance,
                "scale_explorer_node_id": planet.id,
                "source_ids": ["nasa-basics-solar-system-distances"],
            }
        )

    return {
        "artifact_version": SOLAR_SYSTEM_ARTIFACT_VERSION,
        "model_version": SOLAR_SYSTEM_MODEL_VERSION,
        "schema_version": SOLAR_SYSTEM_SCHEMA_VERSION,
        "generated_at": SOLAR_SYSTEM_GENERATED_AT,
        "definition": {
            "slug": "solar-system-distance-explorer",
            "title": "Solar System Distance Explorer",
            "content_type": "interactive-reference-model",
            "status": "ready",
            "version": 1,
            "reviewed_at": "2026-09-15",
            "model_version": SOLAR_SYSTEM_MODEL_VERSION,
            "default_scale": "log",
            "calculation": {
                "log_distance": (
                    "log10(mean Sun distance in AU), normalized from Mercury=0% to Neptune=100%; "
                    "the Sun is excluded because log10(0) is undefined."
                ),
                "linear_distance": "mean Sun distance / Neptune mean Sun distance × 100%.",
            },
            "assumptions": [
                "NASA's cited mean Sun distances are used as fixed reference distances.",
                "The visual does not compute or display current planetary positions.",
                "Planet markers use a uniform presentation size; body diameter is not encoded.",
            ],
            "limitations": [
                (
                    "The track is not an ephemeris, orbit propagator, or current Solar System "
                    "snapshot."
                ),
                (
                    "The logarithmic view intentionally distorts linear spacing so inner and "
                    "outer planets fit together."
                ),
                (
                    "The linear view compares the cited mean distances only; it does not draw "
                    "orbital eccentricity or inclination."
                ),
                (
                    "The Sun is an origin marker at 0 AU and is not included in the logarithmic "
                    "transform."
                ),
            ],
            "references": [source["id"] for source in _SOURCE_METADATA],
        },
        "sources": list(_SOURCE_METADATA),
        "bodies": bodies,
        "validation_fixtures": [
            {
                "id": "earth-linear-reference",
                "body_id": "earth",
                "field": "linear_position_percent",
                "expected": 1.0 / 30.05 * 100.0,
                "absolute_tolerance": 1e-12,
            },
            {
                "id": "mercury-log-minimum",
                "body_id": "mercury",
                "field": "log_position_percent",
                "expected": 0.0,
                "absolute_tolerance": 1e-12,
            },
            {
                "id": "neptune-both-maxima",
                "body_id": "neptune",
                "field": "linear_position_percent",
                "expected": 100.0,
                "absolute_tolerance": 1e-12,
            },
            {
                "id": "neptune-log-maximum",
                "body_id": "neptune",
                "field": "log_position_percent",
                "expected": 100.0,
                "absolute_tolerance": 1e-12,
            },
        ],
    }


def write_solar_system_distance_artifact(*, repository_root: Path) -> Path:
    path = repository_root / SOLAR_SYSTEM_ARTIFACT_PATH
    payload = build_solar_system_distance_artifact()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_solar_system_distance_artifact(*, repository_root: Path) -> dict[str, object]:
    path = repository_root / SOLAR_SYSTEM_ARTIFACT_PATH
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SolarSystemExplorerModelError() from exc
    if not isinstance(payload, dict):
        raise SolarSystemExplorerModelError()
    return payload
