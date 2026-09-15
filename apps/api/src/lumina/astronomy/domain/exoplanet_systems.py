"""Pinned NASA Exoplanet Archive system-layout model for Phase 5B.

This module consumes one reviewed PSCompPars CSV snapshot for the five exoplanet-host stars
already represented in Lumina. It preserves parameter-level references and transforms only
non-limit, positive semi-major axes into shared linear/log display coordinates. It is not an
ephemeris and never infers current orbital phase or planet position.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

EXOPLANET_SYSTEM_MODEL_VERSION: Final = "exoplanet-system-layout-v1"
EXOPLANET_SYSTEM_SCHEMA_VERSION: Final = 1
EXOPLANET_SYSTEM_ARTIFACT_VERSION: Final = 1
EXOPLANET_RAW_PATH: Final = "data/seed/nasa-exoplanet-archive-known-host-systems-v1.csv"
EXOPLANET_ARTIFACT_PATH: Final = "data/seed/exoplanet-system-layout-v1.json"
EXOPLANET_RAW_SHA256: Final = "74a1dde951b63b630653c94c36880cfd9b015faa2c600315f5e06fa22596c9db"
EXOPLANET_GENERATED_AT: Final = "2026-09-15T10:20:00Z"

ScaleMode = Literal["linear", "log"]

_ARCHIVE_QUERY: Final = (
    "select pl_name,hostname,sy_pnum,pl_orbsmax,pl_orbsmaxerr1,pl_orbsmaxerr2,"
    "pl_orbsmaxlim,pl_orbsmax_reflink,pl_orbper,pl_orbpererr1,pl_orbpererr2,"
    "pl_orbperlim,pl_orbper_reflink,disc_year,discoverymethod from pscomppars where "
    "hostname in ('HD 209458','Kepler-186','Kepler-452','51 Peg','51 Pegasi','K2-18') "
    "order by hostname,pl_orbsmax,pl_name"
)

_HOSTS: Final = {
    "51 Peg": {"display_name": "51 Pegasi", "slug": "51-pegasi"},
    "HD 209458": {"display_name": "HD 209458", "slug": "hd-209458"},
    "K2-18": {"display_name": "K2-18", "slug": "k2-18"},
    "Kepler-186": {"display_name": "Kepler-186", "slug": "kepler-186"},
    "Kepler-452": {"display_name": "Kepler-452", "slug": "kepler-452"},
}

_HREF_RE: Final = re.compile(r"href=([^ >]+)")
_TEXT_RE: Final = re.compile(r">\s*([^<]+?)\s*</a>")


class ExoplanetSystemModelError(ValueError):
    def __init__(self) -> None:
        super().__init__("EXOPLANET_SYSTEM_MODEL_INVALID")


@dataclass(frozen=True, slots=True)
class ParameterReference:
    text: str
    url: str


@dataclass(frozen=True, slots=True)
class PlanetRecord:
    name: str
    archive_hostname: str
    system_planet_count: int
    semimajor_axis_au: float
    semimajor_axis_error_plus_au: float | None
    semimajor_axis_error_minus_au: float | None
    semimajor_axis_reference: ParameterReference
    orbital_period_days: float
    orbital_period_error_plus_days: float | None
    orbital_period_error_minus_days: float | None
    orbital_period_reference: ParameterReference
    discovery_year: int
    discovery_method: str


def _optional_float(value: str) -> float | None:
    if value == "":
        return None
    result = float(value)
    if not math.isfinite(result):
        raise ExoplanetSystemModelError()
    return result


def _positive_float(value: str) -> float:
    result = _optional_float(value)
    if result is None or result <= 0:
        raise ExoplanetSystemModelError()
    return result


def _parse_reference(value: str) -> ParameterReference:
    href = _HREF_RE.search(value)
    text = _TEXT_RE.search(value)
    if href is None or text is None:
        raise ExoplanetSystemModelError()
    url = href.group(1).strip("\"'")
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "ui.adsabs.harvard.edu":
        raise ExoplanetSystemModelError()
    citation = " ".join(text.group(1).split())
    if not citation:
        raise ExoplanetSystemModelError()
    return ParameterReference(text=citation, url=url)


def _read_records(*, repository_root: Path) -> tuple[PlanetRecord, ...]:
    path = repository_root / EXOPLANET_RAW_PATH
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ExoplanetSystemModelError() from exc
    if hashlib.sha256(raw).hexdigest() != EXOPLANET_RAW_SHA256:
        raise ExoplanetSystemModelError()
    try:
        rows = list(csv.DictReader(raw.decode("utf-8").splitlines()))
    except (UnicodeError, csv.Error) as exc:
        raise ExoplanetSystemModelError() from exc
    if len(rows) != 10:
        raise ExoplanetSystemModelError()

    records: list[PlanetRecord] = []
    for row in rows:
        hostname = row.get("hostname", "")
        if hostname not in _HOSTS:
            raise ExoplanetSystemModelError()
        if row.get("pl_orbsmaxlim") != "0" or row.get("pl_orbperlim") != "0":
            raise ExoplanetSystemModelError()
        try:
            system_planet_count = int(row["sy_pnum"])
            discovery_year = int(row["disc_year"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ExoplanetSystemModelError() from exc
        records.append(
            PlanetRecord(
                name=row["pl_name"],
                archive_hostname=hostname,
                system_planet_count=system_planet_count,
                semimajor_axis_au=_positive_float(row["pl_orbsmax"]),
                semimajor_axis_error_plus_au=_optional_float(row["pl_orbsmaxerr1"]),
                semimajor_axis_error_minus_au=_optional_float(row["pl_orbsmaxerr2"]),
                semimajor_axis_reference=_parse_reference(row["pl_orbsmax_reflink"]),
                orbital_period_days=_positive_float(row["pl_orbper"]),
                orbital_period_error_plus_days=_optional_float(row["pl_orbpererr1"]),
                orbital_period_error_minus_days=_optional_float(row["pl_orbpererr2"]),
                orbital_period_reference=_parse_reference(row["pl_orbper_reflink"]),
                discovery_year=discovery_year,
                discovery_method=row["discoverymethod"],
            )
        )

    counts = Counter(record.archive_hostname for record in records)
    for hostname, count in counts.items():
        expected = next(
            record.system_planet_count for record in records if record.archive_hostname == hostname
        )
        if count != expected:
            raise ExoplanetSystemModelError()
    if set(counts) != set(_HOSTS):
        raise ExoplanetSystemModelError()
    return tuple(records)


def _linear_position(value: float, maximum: float) -> float:
    result = value / maximum * 100.0
    if not math.isfinite(result) or result <= 0 or result > 100:
        raise ExoplanetSystemModelError()
    return result


def _log_position(value: float, minimum: float, maximum: float) -> float:
    denominator = math.log10(maximum) - math.log10(minimum)
    if denominator <= 0:
        raise ExoplanetSystemModelError()
    result = (math.log10(value) - math.log10(minimum)) / denominator * 100.0
    if not math.isfinite(result) or result < 0 or result > 100:
        raise ExoplanetSystemModelError()
    return result


def _uncertainty(plus: float | None, minus: float | None) -> dict[str, float | None]:
    return {"plus": plus, "minus": minus}


def build_exoplanet_system_artifact(*, repository_root: Path) -> dict[str, object]:
    records = _read_records(repository_root=repository_root)
    axes = tuple(record.semimajor_axis_au for record in records)
    minimum = min(axes)
    maximum = max(axes)
    systems: list[dict[str, object]] = []

    for archive_hostname, metadata in _HOSTS.items():
        host_records = sorted(
            (record for record in records if record.archive_hostname == archive_hostname),
            key=lambda record: (record.semimajor_axis_au, record.name),
        )
        planets: list[dict[str, object]] = []
        for record in host_records:
            planets.append(
                {
                    "name": record.name,
                    "semimajor_axis_au": record.semimajor_axis_au,
                    "semimajor_axis_uncertainty_au": _uncertainty(
                        record.semimajor_axis_error_plus_au,
                        record.semimajor_axis_error_minus_au,
                    ),
                    "semimajor_axis_reference": {
                        "text": record.semimajor_axis_reference.text,
                        "url": record.semimajor_axis_reference.url,
                    },
                    "orbital_period_days": record.orbital_period_days,
                    "orbital_period_uncertainty_days": _uncertainty(
                        record.orbital_period_error_plus_days,
                        record.orbital_period_error_minus_days,
                    ),
                    "orbital_period_reference": {
                        "text": record.orbital_period_reference.text,
                        "url": record.orbital_period_reference.url,
                    },
                    "discovery_year": record.discovery_year,
                    "discovery_method": record.discovery_method,
                    "linear_position_percent": _linear_position(record.semimajor_axis_au, maximum),
                    "log_position_percent": _log_position(
                        record.semimajor_axis_au, minimum, maximum
                    ),
                }
            )
        systems.append(
            {
                "archive_hostname": archive_hostname,
                "display_name": metadata["display_name"],
                "host_slug": metadata["slug"],
                "archive_planet_count": host_records[0].system_planet_count,
                "planets": planets,
            }
        )

    return {
        "artifact_version": EXOPLANET_SYSTEM_ARTIFACT_VERSION,
        "model_version": EXOPLANET_SYSTEM_MODEL_VERSION,
        "schema_version": EXOPLANET_SYSTEM_SCHEMA_VERSION,
        "generated_at": EXOPLANET_GENERATED_AT,
        "raw_snapshot": {
            "path": EXOPLANET_RAW_PATH,
            "sha256": EXOPLANET_RAW_SHA256,
            "bytes": (repository_root / EXOPLANET_RAW_PATH).stat().st_size,
            "retrieved_at": "2026-09-15",
            "provider": "NASA Exoplanet Archive",
            "table": "pscomppars",
            "tap_endpoint": "https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
            "query": _ARCHIVE_QUERY,
            "documentation_url": "https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html",
            "column_documentation_url": (
                "https://exoplanetarchive.ipac.caltech.edu/docs/API_PS_columns.html"
            ),
        },
        "definition": {
            "slug": "exoplanet-system-layout",
            "title": "Exoplanet System Layout",
            "content_type": "interactive-reference-model",
            "status": "ready",
            "version": 1,
            "reviewed_at": "2026-09-15",
            "model_version": EXOPLANET_SYSTEM_MODEL_VERSION,
            "default_scale": "log",
            "shared_scale_domain_au": {"minimum": minimum, "maximum": maximum},
            "assumptions": [
                (
                    "Only confirmed PSCompPars rows for Lumina's five reviewed host stars are "
                    "included."
                ),
                "Only positive, non-limit semi-major-axis values are eligible for layout.",
                "All systems share one axis domain so cross-system spacing remains comparable.",
                "Planet markers use a uniform presentation size and do not encode planet radius.",
            ],
            "limitations": [
                (
                    "Semi-major axis is an orbital reference length, not the planet's current star "
                    "distance."
                ),
                (
                    "Marker position on the one-dimensional track is not orbital phase or sky "
                    "position."
                ),
                (
                    "The track does not encode eccentricity, inclination, orientation, or current "
                    "epoch."
                ),
                "PSCompPars is composite: different parameters may cite different publications.",
            ],
        },
        "systems": systems,
    }


def write_exoplanet_system_artifact(*, repository_root: Path) -> Path:
    path = repository_root / EXOPLANET_ARTIFACT_PATH
    payload = build_exoplanet_system_artifact(repository_root=repository_root)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_exoplanet_system_artifact(*, repository_root: Path) -> dict[str, object]:
    path = repository_root / EXOPLANET_ARTIFACT_PATH
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ExoplanetSystemModelError() from exc
    if not isinstance(payload, dict):
        raise ExoplanetSystemModelError()
    return payload
