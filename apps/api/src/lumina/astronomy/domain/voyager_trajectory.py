"""Reviewed Voyager 1 timeline and JPL Horizons trajectory artifact for Phase 5B."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Final

VOYAGER_MODEL_VERSION: Final = "voyager-1-trajectory-v1"
VOYAGER_SCHEMA_VERSION: Final = 1
VOYAGER_ARTIFACT_VERSION: Final = 1
VOYAGER_RAW_PATH: Final = "data/seed/jpl-horizons-voyager-1-heliocentric-v1.txt"
VOYAGER_ARTIFACT_PATH: Final = "data/seed/voyager-1-trajectory-v1.json"
VOYAGER_RAW_SHA256: Final = "827e0323d9a64632fc7dedf5d9d905adf2690adf7270d4e7251ea03ef7042d1f"
VOYAGER_GENERATED_AT: Final = "2026-09-15T10:45:00Z"

_EXPECTED_HEADER_LINES: Final = (
    "Target body name: Voyager 1 (spacecraft) (-31)",
    "Center body name: Sun (10)",
    "Start time      : A.D. 1977-Sep-06 00:00:00.0000 TDB",
    "Stop  time      : A.D. 2026-Sep-16 00:00:00.0000 TDB",
    "Step-size       : 1  calendar years",
    "Output units    : AU-D",
    "Output type     : GEOMETRIC cartesian states",
    "Output format   : 1 (position only)",
    "Reference frame : Ecliptic of J2000.0",
)

_SOURCES: Final = (
    {
        "id": "nasa-voyager-1-mission",
        "title": "Voyager 1",
        "organization_or_authors": "NASA Science",
        "url": "https://science.nasa.gov/mission/voyager/voyager-1/",
        "accessed_at": "2026-09-15",
        "claim_scope": (
            "Mission launch, planetary flybys, extended-mission milestones, termination shock, "
            "100 AU, and entry into interstellar space."
        ),
    },
    {
        "id": "jpl-horizons-api",
        "title": "Horizons API",
        "organization_or_authors": "NASA/JPL Solar System Dynamics",
        "url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
        "accessed_at": "2026-09-15",
        "claim_scope": "Machine-readable Horizons query semantics and vector ephemeris contract.",
    },
)

_MILESTONES: Final = (
    {
        "date": "1977-09-05",
        "title": "Launch",
        "detail": "Voyager 1 launched from Cape Canaveral at 12:56:01 UT.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "1979-03-05",
        "title": "Jupiter closest approach",
        "detail": "Voyager 1 made its closest approach to Jupiter.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "1980-11-12",
        "title": "Saturn closest approach",
        "detail": "Voyager 1 made its closest approach to Saturn.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "1990-01-01",
        "title": "Voyager Interstellar Mission begins",
        "detail": "NASA marks the official start of the Voyager Interstellar Mission.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "1998-02-17",
        "title": "Most distant human-made object",
        "detail": "Voyager 1 overtook Pioneer 10 in distance from Earth.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "2004-12-16",
        "title": "Termination shock",
        "detail": "Voyager 1 reached the termination shock and entered the heliosheath.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "2006-08-16",
        "title": "100 AU reached",
        "detail": "Voyager 1 reached a heliocentric distance of 100 astronomical units.",
        "source_id": "nasa-voyager-1-mission",
    },
    {
        "date": "2012-08-25",
        "title": "Interstellar space",
        "detail": "Voyager 1 crossed the heliopause and entered interstellar space.",
        "source_id": "nasa-voyager-1-mission",
    },
)


class VoyagerTrajectoryModelError(ValueError):
    def __init__(self) -> None:
        super().__init__("VOYAGER_TRAJECTORY_MODEL_INVALID")


@dataclass(frozen=True, slots=True)
class VoyagerVectorSample:
    jd_tdb: float
    epoch_tdb: str
    x_au: float
    y_au: float
    z_au: float
    radius_au: float


def _load_raw(*, repository_root: Path) -> str:
    path = repository_root / VOYAGER_RAW_PATH
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise VoyagerTrajectoryModelError() from exc
    if hashlib.sha256(raw).hexdigest() != VOYAGER_RAW_SHA256:
        raise VoyagerTrajectoryModelError()
    try:
        text = raw.decode("utf-8")
    except UnicodeError as exc:
        raise VoyagerTrajectoryModelError() from exc
    for expected in _EXPECTED_HEADER_LINES:
        if expected not in text:
            raise VoyagerTrajectoryModelError()
    return text


def _parse_samples(text: str) -> tuple[VoyagerVectorSample, ...]:
    try:
        body = text.split("$$SOE\n", 1)[1].split("$$EOE", 1)[0]
    except IndexError as exc:
        raise VoyagerTrajectoryModelError() from exc
    rows = list(csv.reader(body.splitlines()))
    samples: list[VoyagerVectorSample] = []
    for row in rows:
        if len(row) < 5:
            raise VoyagerTrajectoryModelError()
        try:
            jd_tdb = float(row[0].strip())
            epoch_tdb = row[1].strip()
            x_au = float(row[2].strip())
            y_au = float(row[3].strip())
            z_au = float(row[4].strip())
        except (TypeError, ValueError) as exc:
            raise VoyagerTrajectoryModelError() from exc
        if not epoch_tdb.startswith("A.D. "):
            raise VoyagerTrajectoryModelError()
        values = (jd_tdb, x_au, y_au, z_au)
        if not all(math.isfinite(value) for value in values):
            raise VoyagerTrajectoryModelError()
        radius_au = math.sqrt(x_au * x_au + y_au * y_au + z_au * z_au)
        if not math.isfinite(radius_au) or radius_au <= 0:
            raise VoyagerTrajectoryModelError()
        samples.append(
            VoyagerVectorSample(
                jd_tdb=jd_tdb,
                epoch_tdb=epoch_tdb,
                x_au=x_au,
                y_au=y_au,
                z_au=z_au,
                radius_au=radius_au,
            )
        )
    if len(samples) != 50:
        raise VoyagerTrajectoryModelError()
    if any(
        second.jd_tdb <= first.jd_tdb for first, second in zip(samples, samples[1:], strict=False)
    ):
        raise VoyagerTrajectoryModelError()
    return tuple(samples)


def build_voyager_trajectory_artifact(*, repository_root: Path) -> dict[str, object]:
    text = _load_raw(repository_root=repository_root)
    samples = _parse_samples(text)
    source_ids = {source["id"] for source in _SOURCES}
    if any(milestone["source_id"] not in source_ids for milestone in _MILESTONES):
        raise VoyagerTrajectoryModelError()

    return {
        "artifact_version": VOYAGER_ARTIFACT_VERSION,
        "model_version": VOYAGER_MODEL_VERSION,
        "schema_version": VOYAGER_SCHEMA_VERSION,
        "generated_at": VOYAGER_GENERATED_AT,
        "definition": {
            "slug": "voyager-1-mission-trajectory",
            "title": "Voyager 1 Mission Timeline and Trajectory",
            "content_type": "interactive-reference-model",
            "status": "ready",
            "version": 1,
            "reviewed_at": "2026-09-15",
            "model_version": VOYAGER_MODEL_VERSION,
            "assumptions": [
                (
                    "Mission milestones use NASA historical mission documentation, not Horizons "
                    "event text."
                ),
                (
                    "Trajectory samples are Sun-centered geometric Cartesian positions from JPL "
                    "Horizons."
                ),
                (
                    "The trajectory is sampled once per calendar year in the J2000 ecliptic "
                    "reference frame."
                ),
                "Heliocentric distance is derived as sqrt(x² + y² + z²) from the pinned vectors.",
            ],
            "limitations": [
                (
                    "The XY trajectory is a projection; Z is omitted visually but remains in the "
                    "data table."
                ),
                "Annual sampling does not reproduce the continuous flight path between samples.",
                (
                    "Horizons describes the pre-1981 section as a rough patched-conic "
                    "mission-design trajectory."
                ),
                (
                    "The post-1981 trajectory is a 2022 refit/extrapolation using tracking data "
                    "through 1992."
                ),
                "NASA mission dates and Horizons TDB sample epochs are separate source contracts.",
            ],
        },
        "sources": list(_SOURCES),
        "raw_snapshot": {
            "path": VOYAGER_RAW_PATH,
            "sha256": VOYAGER_RAW_SHA256,
            "bytes": (repository_root / VOYAGER_RAW_PATH).stat().st_size,
            "retrieved_at": "2026-09-15",
            "provider": "NASA/JPL Horizons API",
            "target_id": "-31",
            "center": "Sun (10)",
            "reference_frame": "Ecliptic of J2000.0",
            "output_units": "AU-D",
            "output_type": "GEOMETRIC cartesian states",
            "sample_step": "1 calendar year",
            "start_tdb": "1977-09-06T00:00:00",
            "stop_request_tdb": "2026-09-16T00:00:00",
            "last_sample_tdb": "2026-09-06T00:00:00",
            "api_documentation_url": "https://ssd-api.jpl.nasa.gov/doc/horizons.html",
        },
        "milestones": list(_MILESTONES),
        "trajectory_samples": [
            {
                "jd_tdb": sample.jd_tdb,
                "epoch_tdb": sample.epoch_tdb,
                "x_au": sample.x_au,
                "y_au": sample.y_au,
                "z_au": sample.z_au,
                "radius_au": sample.radius_au,
            }
            for sample in samples
        ],
    }


def write_voyager_trajectory_artifact(*, repository_root: Path) -> Path:
    path = repository_root / VOYAGER_ARTIFACT_PATH
    payload = build_voyager_trajectory_artifact(repository_root=repository_root)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def load_voyager_trajectory_artifact(*, repository_root: Path) -> dict[str, object]:
    path = repository_root / VOYAGER_ARTIFACT_PATH
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise VoyagerTrajectoryModelError() from exc
    if not isinstance(payload, dict):
        raise VoyagerTrajectoryModelError()
    return payload
