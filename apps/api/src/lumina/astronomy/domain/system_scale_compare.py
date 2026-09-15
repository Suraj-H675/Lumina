"""Phase 5B composition model for cross-domain AU reference-length comparison.

The model combines three already-reviewed artifacts without pretending that their quantities are
scientifically identical. It creates one display axis for unit-compatible positive lengths while
preserving each item's quantity definition, source scope, and provenance independently.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Final, Literal

SYSTEM_COMPARE_MODEL_VERSION: Final = "system-scale-compare-v1"
SYSTEM_COMPARE_SCHEMA_VERSION: Final = 1
SYSTEM_COMPARE_ARTIFACT_VERSION: Final = 1
SYSTEM_COMPARE_ARTIFACT_PATH: Final = "data/seed/system-scale-compare-v1.json"
SYSTEM_COMPARE_GENERATED_AT: Final = "2026-09-15T11:15:00Z"

SOLAR_ARTIFACT_PATH: Final = "data/seed/solar-system-distance-v1.json"
EXOPLANET_ARTIFACT_PATH: Final = "data/seed/exoplanet-system-layout-v1.json"
VOYAGER_ARTIFACT_PATH: Final = "data/seed/voyager-1-trajectory-v1.json"

CompareKind = Literal["solar-mean-distance", "exoplanet-semimajor-axis", "voyager-radius"]


class SystemScaleCompareModelError(ValueError):
    def __init__(self) -> None:
        super().__init__("SYSTEM_SCALE_COMPARE_MODEL_INVALID")


def _load_json(path: Path) -> dict[str, object]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemScaleCompareModelError() from exc
    if not isinstance(value, dict):
        raise SystemScaleCompareModelError()
    return value


def _positive_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise SystemScaleCompareModelError()
    result = float(value)
    if not math.isfinite(result) or result <= 0:
        raise SystemScaleCompareModelError()
    return result


def _source_reference(*, label: str, url: str) -> dict[str, str]:
    if not label or not url.startswith("https://"):
        raise SystemScaleCompareModelError()
    return {"label": label, "url": url}


def _solar_items(artifact: dict[str, object]) -> list[dict[str, object]]:
    if artifact.get("model_version") != "solar-system-distance-v1":
        raise SystemScaleCompareModelError()
    bodies = artifact.get("bodies")
    sources = artifact.get("sources")
    if not isinstance(bodies, list) or not isinstance(sources, list):
        raise SystemScaleCompareModelError()
    source_by_id = {
        source["id"]: source
        for source in sources
        if isinstance(source, dict) and isinstance(source.get("id"), str)
    }
    items: list[dict[str, object]] = []
    for body in bodies:
        if not isinstance(body, dict) or body.get("id") == "sun":
            continue
        source_ids = body.get("source_ids")
        if not isinstance(source_ids, list) or len(source_ids) != 1:
            raise SystemScaleCompareModelError()
        source = source_by_id.get(source_ids[0])
        if not isinstance(source, dict):
            raise SystemScaleCompareModelError()
        body_id = body.get("id")
        name = body.get("name")
        if not isinstance(body_id, str) or not isinstance(name, str):
            raise SystemScaleCompareModelError()
        items.append(
            {
                "id": f"solar:{body_id}",
                "kind": "solar-mean-distance",
                "group_label": "Solar System",
                "name": name,
                "value_au": _positive_number(body.get("mean_distance_au")),
                "quantity_label": "Mean distance from the Sun",
                "semantic_note": (
                    "NASA-reviewed mean Sun distance; not a current planet position or orbit shape."
                ),
                "source": _source_reference(
                    label=str(source.get("citation", "")),
                    url=str(source.get("url", "")),
                ),
                "detail_href": "/explore/solar-system",
            }
        )
    if len(items) != 8:
        raise SystemScaleCompareModelError()
    return items


def _exoplanet_items(artifact: dict[str, object]) -> list[dict[str, object]]:
    if artifact.get("model_version") != "exoplanet-system-layout-v1":
        raise SystemScaleCompareModelError()
    systems = artifact.get("systems")
    if not isinstance(systems, list):
        raise SystemScaleCompareModelError()
    items: list[dict[str, object]] = []
    for system in systems:
        if not isinstance(system, dict):
            raise SystemScaleCompareModelError()
        display_name = system.get("display_name")
        host_slug = system.get("host_slug")
        planets = system.get("planets")
        if (
            not isinstance(display_name, str)
            or not isinstance(host_slug, str)
            or not isinstance(planets, list)
        ):
            raise SystemScaleCompareModelError()
        for planet in planets:
            if not isinstance(planet, dict):
                raise SystemScaleCompareModelError()
            name = planet.get("name")
            reference = planet.get("semimajor_axis_reference")
            if not isinstance(name, str) or not isinstance(reference, dict):
                raise SystemScaleCompareModelError()
            reference_text = reference.get("text")
            reference_url = reference.get("url")
            if not isinstance(reference_text, str) or not isinstance(reference_url, str):
                raise SystemScaleCompareModelError()
            slug_token = name.casefold().replace(" ", "-")
            items.append(
                {
                    "id": f"exoplanet:{slug_token}",
                    "kind": "exoplanet-semimajor-axis",
                    "group_label": f"Exoplanet · {display_name}",
                    "name": name,
                    "value_au": _positive_number(planet.get("semimajor_axis_au")),
                    "quantity_label": "Orbit semi-major axis",
                    "semantic_note": (
                        "NASA Exoplanet Archive PSCompPars orbital reference length; not current "
                        "star distance or orbital phase."
                    ),
                    "source": _source_reference(label=reference_text, url=reference_url),
                    "detail_href": "/explore/exoplanet-systems",
                }
            )
    if len(items) != 10:
        raise SystemScaleCompareModelError()
    return items


def _voyager_items(artifact: dict[str, object]) -> list[dict[str, object]]:
    if artifact.get("model_version") != "voyager-1-trajectory-v1":
        raise SystemScaleCompareModelError()
    samples = artifact.get("trajectory_samples")
    sources = artifact.get("sources")
    if not isinstance(samples, list) or not isinstance(sources, list):
        raise SystemScaleCompareModelError()
    horizons = next(
        (
            source
            for source in sources
            if isinstance(source, dict) and source.get("id") == "jpl-horizons-api"
        ),
        None,
    )
    if not isinstance(horizons, dict):
        raise SystemScaleCompareModelError()
    items: list[dict[str, object]] = []
    for sample in samples:
        if not isinstance(sample, dict):
            raise SystemScaleCompareModelError()
        epoch = sample.get("epoch_tdb")
        if not isinstance(epoch, str):
            raise SystemScaleCompareModelError()
        try:
            year = int(epoch.split("-", 1)[0].split()[-1])
        except (IndexError, ValueError) as exc:
            raise SystemScaleCompareModelError() from exc
        items.append(
            {
                "id": f"voyager:{year}",
                "kind": "voyager-radius",
                "group_label": "Voyager 1",
                "name": f"Voyager 1 · {year}",
                "value_au": _positive_number(sample.get("radius_au")),
                "quantity_label": "Heliocentric position-vector magnitude",
                "semantic_note": (
                    "Derived from the pinned Sun-centered J2000-ecliptic Horizons XYZ vector at "
                    "this annual TDB sample epoch."
                ),
                "source": _source_reference(
                    label="NASA/JPL Horizons API",
                    url=str(horizons.get("url", "")),
                ),
                "detail_href": "/explore/missions/voyager-1",
                "epoch_tdb": epoch,
            }
        )
    if len(items) != 50:
        raise SystemScaleCompareModelError()
    return items


def build_system_scale_compare_artifact(*, repository_root: Path) -> dict[str, object]:
    solar = _load_json(repository_root / SOLAR_ARTIFACT_PATH)
    exoplanets = _load_json(repository_root / EXOPLANET_ARTIFACT_PATH)
    voyager = _load_json(repository_root / VOYAGER_ARTIFACT_PATH)
    items = _solar_items(solar) + _exoplanet_items(exoplanets) + _voyager_items(voyager)
    values = tuple(_positive_number(item["value_au"]) for item in items)
    minimum = min(values)
    maximum = max(values)
    denominator = math.log10(maximum) - math.log10(minimum)
    if denominator <= 0:
        raise SystemScaleCompareModelError()

    composed: list[dict[str, object]] = []
    for item in items:
        value = _positive_number(item["value_au"])
        composed.append(
            {
                **item,
                "linear_position_percent": value / maximum * 100.0,
                "log_position_percent": (
                    (math.log10(value) - math.log10(minimum)) / denominator * 100.0
                ),
                "earth_reference_ratio": value,
            }
        )

    ids = [str(item["id"]) for item in composed]
    if len(ids) != len(set(ids)):
        raise SystemScaleCompareModelError()

    return {
        "artifact_version": SYSTEM_COMPARE_ARTIFACT_VERSION,
        "model_version": SYSTEM_COMPARE_MODEL_VERSION,
        "schema_version": SYSTEM_COMPARE_SCHEMA_VERSION,
        "generated_at": SYSTEM_COMPARE_GENERATED_AT,
        "definition": {
            "slug": "system-scale-compare",
            "title": "System Scale Compare",
            "content_type": "interactive-reference-model",
            "status": "ready",
            "version": 1,
            "reviewed_at": "2026-09-15",
            "model_version": SYSTEM_COMPARE_MODEL_VERSION,
            "shared_domain_au": {"minimum": minimum, "maximum": maximum},
            "default_item_ids": ["solar:earth", "exoplanet:kepler-452-b", "voyager:2026"],
            "assumptions": [
                (
                    "Only positive AU-valued outputs from three already-reviewed Phase 5B "
                    "artifacts are composed."
                ),
                (
                    "The shared axis compares numeric reference lengths, not scientific quantity "
                    "identity."
                ),
                (
                    "Earth's reviewed 1 AU mean Sun distance is the arithmetic reference for "
                    "displayed multiples."
                ),
            ],
            "limitations": [
                (
                    "Mean Sun distance, orbit semi-major axis, and vector magnitude are distinct "
                    "quantities."
                ),
                (
                    "A shared unit allows numeric scale comparison but does not make the "
                    "quantities interchangeable."
                ),
                "The comparison does not rank, score, recommend, or infer physical similarity.",
                (
                    "Log spacing is a visualization transform and must not be read as physical "
                    "placement between systems."
                ),
            ],
        },
        "items": composed,
    }


def write_system_scale_compare_artifact(*, repository_root: Path) -> Path:
    path = repository_root / SYSTEM_COMPARE_ARTIFACT_PATH
    payload = build_system_scale_compare_artifact(repository_root=repository_root)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_system_scale_compare_artifact(*, repository_root: Path) -> dict[str, object]:
    path = repository_root / SYSTEM_COMPARE_ARTIFACT_PATH
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SystemScaleCompareModelError() from exc
    if not isinstance(payload, dict):
        raise SystemScaleCompareModelError()
    return payload
