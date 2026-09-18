"""Offline topocentric solar-eclipse model for Eclipse Simulator v1.

Astropy/ERFA owns the ephemeris and coordinate transforms. The browser may
validate and render returned geometry but must not reproduce this calculation.
"""

from __future__ import annotations

import json
import math
import warnings
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Final, Literal
from urllib.parse import urlparse

import numpy as np
from astropy import units as u
from astropy.coordinates import AltAz, EarthLocation, get_body, solar_system_ephemeris
from astropy.time import Time
from astropy.utils import iers

ECLIPSE_SIMULATOR_MODEL_VERSION: Final = "eclipse-simulator-v1"
ECLIPSE_SIMULATOR_SCHEMA_VERSION: Final = 1
ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION: Final = 1
ECLIPSE_SIMULATOR_ARTIFACT_VERSION: Final = 1
ECLIPSE_SIMULATOR_ARTIFACT_PATH: Final = "data/seed/eclipse-simulator-v1.json"

SOLAR_RADIUS_KM: Final = 695_700.0
MOON_RADIUS_KM: Final = 1_737.4
MIN_LATITUDE_DEG: Final = -90.0
MAX_LATITUDE_DEG: Final = 90.0
MIN_LONGITUDE_DEG: Final = -180.0
MAX_LONGITUDE_DEG: Final = 180.0
MIN_ELEVATION_M: Final = -500.0
MAX_ELEVATION_M: Final = 9_000.0
MIN_UTC: Final = datetime(1973, 1, 2, tzinfo=UTC)
MAX_UTC: Final = datetime(2027, 8, 27, 23, 59, 59, tzinfo=UTC)
EVENT_SEARCH_HOURS: Final = 6
COARSE_EVENT_STEP_SECONDS: Final = 300
CONTACT_REFINEMENT_STEP_SECONDS: Final = 10
PUBLIC_TIME_RESOLUTION_SECONDS: Final = 60

_SOURCE_URLS: Final = {
    "astropy-solar-system-ephemerides": (
        "https://docs.astropy.org/en/stable/coordinates/solarsystem.html"
    ),
    "erfa-moon98": "https://pyerfa.readthedocs.io/en/latest/api/erfa.moon98.html",
    "iau-2015-resolution-b3": "https://arxiv.org/abs/1510.07674",
    "nasa-nssdc-moon-fact-sheet": ("https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html"),
    "nasa-eclipse-geometry": "https://science.nasa.gov/eclipses/geometry/",
    "nasa-eclipse-safety": "https://science.nasa.gov/eclipses/safety/",
    "nasa-2024-eclipse-where-when": (
        "https://science.nasa.gov/eclipses/future-eclipses/eclipse-2024/where-when/"
    ),
    "nasa-2023-eclipse-where-when": (
        "https://science.nasa.gov/eclipses/future-eclipses/eclipse-2023/where-when/"
    ),
}
_SOURCE_IDS: Final = frozenset(_SOURCE_URLS)
_VALIDATION_FIXTURE_IDS: Final = frozenset(
    {
        "dallas-2024-total",
        "dallas-2024-partial-shoulder",
        "dallas-next-day-none",
        "albuquerque-2023-annular",
        "dallas-2024-contacts",
        "albuquerque-2023-contacts",
        "disk-overlap-limits",
        "horizon-state",
        "deterministic-repeat",
        "domain-rejection",
        "artifact-mutation",
    }
)
_EXPECTED_CONSTANTS: Final = {
    "SOLAR_RADIUS_KM": SOLAR_RADIUS_KM,
    "MOON_RADIUS_KM": MOON_RADIUS_KM,
    "MIN_LATITUDE_DEG": MIN_LATITUDE_DEG,
    "MAX_LATITUDE_DEG": MAX_LATITUDE_DEG,
    "MIN_LONGITUDE_DEG": MIN_LONGITUDE_DEG,
    "MAX_LONGITUDE_DEG": MAX_LONGITUDE_DEG,
    "MIN_ELEVATION_M": MIN_ELEVATION_M,
    "MAX_ELEVATION_M": MAX_ELEVATION_M,
    "MIN_UTC": "1973-01-02T00:00:00Z",
    "MAX_UTC": "2027-08-27T23:59:59Z",
    "EVENT_SEARCH_HOURS": EVENT_SEARCH_HOURS,
    "COARSE_EVENT_STEP_SECONDS": COARSE_EVENT_STEP_SECONDS,
    "CONTACT_REFINEMENT_STEP_SECONDS": CONTACT_REFINEMENT_STEP_SECONDS,
    "PUBLIC_TIME_RESOLUTION_SECONDS": PUBLIC_TIME_RESOLUTION_SECONDS,
    "ASTROPY_VERSION": "8.0.1",
    "PYERFA_VERSION": "2.0.1.5",
    "ASTROPY_IERS_DATA_VERSION": "0.2026.8.31.0.57.9",
    "EPHEMERIS": "builtin",
}

EclipsePhase = Literal["none", "partial", "total", "annular"]
ShadowRegion = Literal["outside", "penumbra", "umbra", "antumbra"]


class EclipseSimulatorModelError(ValueError):
    """Raised when Eclipse Simulator input or provenance leaves the reviewed v1 domain."""


@dataclass(frozen=True, slots=True)
class EclipseSimulatorInput:
    at_utc: datetime
    latitude_deg: float
    longitude_deg: float
    elevation_m: float

    def __post_init__(self) -> None:
        if not isinstance(self.at_utc, datetime):
            raise EclipseSimulatorModelError()
        if self.at_utc.tzinfo is None or self.at_utc.utcoffset() != timedelta(0):
            raise EclipseSimulatorModelError()
        at_utc = self.at_utc.astimezone(UTC)
        if not MIN_UTC <= at_utc <= MAX_UTC:
            raise EclipseSimulatorModelError()
        latitude = _validated_number(
            self.latitude_deg,
            minimum=MIN_LATITUDE_DEG,
            maximum=MAX_LATITUDE_DEG,
        )
        longitude = _validated_number(
            self.longitude_deg,
            minimum=MIN_LONGITUDE_DEG,
            maximum=MAX_LONGITUDE_DEG,
        )
        elevation = _validated_number(
            self.elevation_m,
            minimum=MIN_ELEVATION_M,
            maximum=MAX_ELEVATION_M,
        )
        object.__setattr__(self, "at_utc", at_utc)
        object.__setattr__(self, "latitude_deg", latitude)
        object.__setattr__(self, "longitude_deg", longitude)
        object.__setattr__(self, "elevation_m", elevation)


@dataclass(frozen=True, slots=True)
class EclipseInstantGeometry:
    phase: EclipsePhase
    shadow_region: ShadowRegion
    sun_angular_radius_deg: float
    moon_angular_radius_deg: float
    center_separation_deg: float
    obscuration_fraction: float
    sun_distance_km: float
    moon_distance_km: float
    sun_altitude_deg: float
    sun_above_geometric_horizon: bool


@dataclass(frozen=True, slots=True)
class EclipseLocalEvent:
    classification: Literal["partial", "total", "annular"]
    partial_begin_utc: datetime
    central_begin_utc: datetime | None
    maximum_utc: datetime
    central_end_utc: datetime | None
    partial_end_utc: datetime
    maximum_obscuration_fraction: float
    sun_altitude_deg_at_maximum: float
    sun_above_geometric_horizon_at_maximum: bool


@dataclass(frozen=True, slots=True)
class EclipseSimulatorResult:
    model_version: str
    schema_version: int
    inputs: EclipseSimulatorInput
    instant: EclipseInstantGeometry
    local_event: EclipseLocalEvent | None
    ephemeris_note: str
    timing_note: str
    safety_reference_id: str


@dataclass(frozen=True, slots=True)
class _DiskSamples:
    separation_deg: np.ndarray
    sun_radius_deg: np.ndarray
    moon_radius_deg: np.ndarray
    sun_distance_km: np.ndarray
    moon_distance_km: np.ndarray


def _validated_number(value: object, *, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EclipseSimulatorModelError()
    numeric = float(value)
    if not math.isfinite(numeric) or not minimum <= numeric <= maximum:
        raise EclipseSimulatorModelError()
    return 0.0 if numeric == 0.0 else numeric


def _location(inputs: EclipseSimulatorInput) -> EarthLocation:
    return EarthLocation.from_geodetic(
        lon=inputs.longitude_deg * u.deg,
        lat=inputs.latitude_deg * u.deg,
        height=inputs.elevation_m * u.m,
    )


def _times(start: datetime, offsets_seconds: np.ndarray) -> Time:
    return Time(start, scale="utc") + offsets_seconds * u.s


def _disk_samples(times: Time, location: EarthLocation) -> _DiskSamples:
    try:
        with (
            solar_system_ephemeris.set("builtin"),
            iers.conf.set_temp("auto_download", False),
            warnings.catch_warnings(),
        ):
            warnings.simplefilter("error", iers.IERSWarning)
            sun = get_body("sun", times, location, ephemeris="builtin")
            moon = get_body("moon", times, location, ephemeris="builtin")
    except (ArithmeticError, OSError, RuntimeError, TypeError, ValueError, iers.IERSWarning):
        raise EclipseSimulatorModelError() from None

    separation = np.asarray(sun.separation(moon).deg, dtype=float)
    sun_distance = np.asarray(sun.distance.to_value(u.km), dtype=float)
    moon_distance = np.asarray(moon.distance.to_value(u.km), dtype=float)
    if (
        np.any(~np.isfinite(separation))
        or np.any(~np.isfinite(sun_distance))
        or np.any(~np.isfinite(moon_distance))
        or np.any(sun_distance <= SOLAR_RADIUS_KM)
        or np.any(moon_distance <= MOON_RADIUS_KM)
    ):
        raise EclipseSimulatorModelError()
    sun_radius = np.degrees(np.arcsin(SOLAR_RADIUS_KM / sun_distance))
    moon_radius = np.degrees(np.arcsin(MOON_RADIUS_KM / moon_distance))
    return _DiskSamples(
        separation_deg=separation,
        sun_radius_deg=np.asarray(sun_radius, dtype=float),
        moon_radius_deg=np.asarray(moon_radius, dtype=float),
        sun_distance_km=sun_distance,
        moon_distance_km=moon_distance,
    )


def _phase(separation: float, sun_radius: float, moon_radius: float) -> EclipsePhase:
    if separation >= sun_radius + moon_radius:
        return "none"
    if moon_radius >= sun_radius and separation <= moon_radius - sun_radius:
        return "total"
    if sun_radius > moon_radius and separation <= sun_radius - moon_radius:
        return "annular"
    return "partial"


def _shadow_region(phase: EclipsePhase) -> ShadowRegion:
    return {
        "none": "outside",
        "partial": "penumbra",
        "total": "umbra",
        "annular": "antumbra",
    }[phase]  # type: ignore[return-value]


def _acos_clamped(value: float) -> float:
    return math.acos(min(1.0, max(-1.0, value)))


def _disk_overlap_fraction(
    sun_radius: float,
    moon_radius: float,
    separation: float,
) -> float:
    """Return apparent Solar-disk area obscured by the apparent lunar disk."""

    if min(sun_radius, moon_radius) <= 0.0 or separation < 0.0:
        raise EclipseSimulatorModelError()
    if separation >= sun_radius + moon_radius:
        return 0.0
    if separation <= abs(sun_radius - moon_radius):
        if moon_radius >= sun_radius:
            return 1.0
        return (moon_radius / sun_radius) ** 2
    if separation <= 0.0:
        raise EclipseSimulatorModelError()

    sun_term = _acos_clamped(
        (separation**2 + sun_radius**2 - moon_radius**2) / (2.0 * separation * sun_radius)
    )
    moon_term = _acos_clamped(
        (separation**2 + moon_radius**2 - sun_radius**2) / (2.0 * separation * moon_radius)
    )
    radicand = (
        (-separation + sun_radius + moon_radius)
        * (separation + sun_radius - moon_radius)
        * (separation - sun_radius + moon_radius)
        * (separation + sun_radius + moon_radius)
    )
    overlap = (
        sun_radius**2 * sun_term + moon_radius**2 * moon_term - 0.5 * math.sqrt(max(0.0, radicand))
    )
    fraction = overlap / (math.pi * sun_radius**2)
    if not math.isfinite(fraction) or fraction < -1e-12 or fraction > 1.0 + 1e-12:
        raise EclipseSimulatorModelError()
    return min(1.0, max(0.0, fraction))


def _sun_altitude(at_utc: datetime, location: EarthLocation) -> float:
    moment = Time(at_utc, scale="utc")
    try:
        with (
            solar_system_ephemeris.set("builtin"),
            iers.conf.set_temp("auto_download", False),
            warnings.catch_warnings(),
        ):
            warnings.simplefilter("error", iers.IERSWarning)
            sun = get_body("sun", moment, location, ephemeris="builtin")
            altitude = sun.transform_to(
                AltAz(
                    obstime=moment,
                    location=location,
                    pressure=0.0 * u.hPa,
                )
            ).alt.deg
    except (ArithmeticError, OSError, RuntimeError, TypeError, ValueError, iers.IERSWarning):
        raise EclipseSimulatorModelError() from None
    numeric = float(altitude)
    if not math.isfinite(numeric):
        raise EclipseSimulatorModelError()
    return numeric


def _geometry_at(at_utc: datetime, location: EarthLocation) -> EclipseInstantGeometry:
    sample = _disk_samples(Time([at_utc], scale="utc"), location)
    separation = float(sample.separation_deg[0])
    sun_radius = float(sample.sun_radius_deg[0])
    moon_radius = float(sample.moon_radius_deg[0])
    phase = _phase(separation, sun_radius, moon_radius)
    altitude = _sun_altitude(at_utc, location)
    return EclipseInstantGeometry(
        phase=phase,
        shadow_region=_shadow_region(phase),
        sun_angular_radius_deg=sun_radius,
        moon_angular_radius_deg=moon_radius,
        center_separation_deg=separation,
        obscuration_fraction=_disk_overlap_fraction(sun_radius, moon_radius, separation),
        sun_distance_km=float(sample.sun_distance_km[0]),
        moon_distance_km=float(sample.moon_distance_km[0]),
        sun_altitude_deg=altitude,
        sun_above_geometric_horizon=altitude > 0.0,
    )


def _outer_margin(samples: _DiskSamples) -> np.ndarray:
    return np.asarray(
        samples.sun_radius_deg + samples.moon_radius_deg - samples.separation_deg,
        dtype=float,
    )


def _central_margin(samples: _DiskSamples) -> np.ndarray:
    return np.asarray(
        np.abs(samples.sun_radius_deg - samples.moon_radius_deg) - samples.separation_deg,
        dtype=float,
    )


def _round_minute(value: datetime) -> datetime:
    shifted = value + timedelta(seconds=PUBLIC_TIME_RESOLUTION_SECONDS / 2)
    return shifted.replace(second=0, microsecond=0)


def _refine_margin_transition(
    left: datetime,
    right: datetime,
    location: EarthLocation,
    *,
    central: bool,
    entering: bool,
) -> datetime:
    span = int((right - left).total_seconds())
    if span <= 0 or span > COARSE_EVENT_STEP_SECONDS:
        raise EclipseSimulatorModelError()
    offsets = np.arange(0, span + 1, CONTACT_REFINEMENT_STEP_SECONDS, dtype=float)
    if offsets[-1] != span:
        offsets = np.append(offsets, float(span))
    samples = _disk_samples(_times(left, offsets), location)
    margin = _central_margin(samples) if central else _outer_margin(samples)
    mask = margin >= 0.0
    candidates = np.flatnonzero(mask if entering else ~mask)
    if candidates.size == 0:
        raise EclipseSimulatorModelError()
    index = int(candidates[0])
    if index == 0:
        return left
    coarse_left = left + timedelta(seconds=float(offsets[index - 1]))
    coarse_right = left + timedelta(seconds=float(offsets[index]))
    fine_span = int((coarse_right - coarse_left).total_seconds())
    fine_offsets = np.arange(0, fine_span + 1, 1, dtype=float)
    fine_samples = _disk_samples(_times(coarse_left, fine_offsets), location)
    fine_margin = _central_margin(fine_samples) if central else _outer_margin(fine_samples)
    fine_mask = fine_margin >= 0.0
    fine_candidates = np.flatnonzero(fine_mask if entering else ~fine_mask)
    if fine_candidates.size == 0:
        raise EclipseSimulatorModelError()
    return coarse_left + timedelta(seconds=int(fine_candidates[0]))


def _maximum_geometry(
    coarse_times: Sequence[datetime],
    coarse_samples: _DiskSamples,
    location: EarthLocation,
) -> tuple[datetime, EclipseInstantGeometry]:
    # Local greatest eclipse is defined by the closest apparent center
    # alignment. Obscured area is an unsuitable optimization metric because
    # it is flat at 1 throughout totality and can remain nearly flat through
    # annularity while the lunar apparent radius changes slowly.
    index = int(np.argmin(coarse_samples.separation_deg))
    center = coarse_times[index]
    start = max(MIN_UTC, center - timedelta(seconds=COARSE_EVENT_STEP_SECONDS))
    end = min(MAX_UTC, center + timedelta(seconds=COARSE_EVENT_STEP_SECONDS))
    span = int((end - start).total_seconds())
    offsets = np.arange(0, span + 1, CONTACT_REFINEMENT_STEP_SECONDS, dtype=float)
    samples = _disk_samples(_times(start, offsets), location)
    refined_index = int(np.argmin(samples.separation_deg))
    ten_second_best = start + timedelta(seconds=float(offsets[refined_index]))
    one_second_start = max(MIN_UTC, ten_second_best - timedelta(seconds=10))
    one_second_end = min(MAX_UTC, ten_second_best + timedelta(seconds=10))
    fine_span = int((one_second_end - one_second_start).total_seconds())
    fine_offsets = np.arange(0, fine_span + 1, 1, dtype=float)
    fine_samples = _disk_samples(_times(one_second_start, fine_offsets), location)
    fine_index = int(np.argmin(fine_samples.separation_deg))
    maximum = one_second_start + timedelta(seconds=int(fine_offsets[fine_index]))
    return maximum, _geometry_at(maximum, location)


def _central_contacts(
    maximum: datetime,
    location: EarthLocation,
) -> tuple[datetime, datetime]:
    half_window = timedelta(minutes=15)
    start = max(MIN_UTC, maximum - half_window)
    end = min(MAX_UTC, maximum + half_window)
    span = int((end - start).total_seconds())
    offsets = np.arange(0, span + 1, CONTACT_REFINEMENT_STEP_SECONDS, dtype=float)
    samples = _disk_samples(_times(start, offsets), location)
    mask = _central_margin(samples) >= 0.0
    indexes = np.flatnonzero(mask)
    if indexes.size == 0:
        raise EclipseSimulatorModelError()
    first = int(indexes[0])
    last = int(indexes[-1])
    if first == 0 or last >= len(offsets) - 1:
        raise EclipseSimulatorModelError()
    before = start + timedelta(seconds=float(offsets[first - 1]))
    first_inside = start + timedelta(seconds=float(offsets[first]))
    last_inside = start + timedelta(seconds=float(offsets[last]))
    after = start + timedelta(seconds=float(offsets[last + 1]))
    begin = _refine_margin_transition(
        before,
        first_inside,
        location,
        central=True,
        entering=True,
    )
    end_contact = _refine_margin_transition(
        last_inside,
        after,
        location,
        central=True,
        entering=False,
    )
    return begin, end_contact


def _local_event(
    inputs: EclipseSimulatorInput,
    instant: EclipseInstantGeometry,
    location: EarthLocation,
) -> EclipseLocalEvent | None:
    if instant.phase == "none":
        return None

    start = max(MIN_UTC, inputs.at_utc - timedelta(hours=EVENT_SEARCH_HOURS))
    end = min(MAX_UTC, inputs.at_utc + timedelta(hours=EVENT_SEARCH_HOURS))
    span = int((end - start).total_seconds())
    offsets = np.arange(0, span + 1, COARSE_EVENT_STEP_SECONDS, dtype=float)
    if offsets[-1] != span:
        offsets = np.append(offsets, float(span))
    coarse_times = tuple(start + timedelta(seconds=float(offset)) for offset in offsets)
    samples = _disk_samples(_times(start, offsets), location)
    outer = _outer_margin(samples) >= 0.0
    indexes = np.flatnonzero(outer)
    if indexes.size == 0:
        raise EclipseSimulatorModelError()
    first = int(indexes[0])
    last = int(indexes[-1])
    if first == 0 or last >= len(coarse_times) - 1:
        raise EclipseSimulatorModelError()

    partial_begin = _refine_margin_transition(
        coarse_times[first - 1],
        coarse_times[first],
        location,
        central=False,
        entering=True,
    )
    partial_end = _refine_margin_transition(
        coarse_times[last],
        coarse_times[last + 1],
        location,
        central=False,
        entering=False,
    )
    maximum, maximum_geometry = _maximum_geometry(coarse_times, samples, location)
    if maximum_geometry.phase == "none":
        raise EclipseSimulatorModelError()

    central_begin: datetime | None = None
    central_end: datetime | None = None
    if maximum_geometry.phase in {"total", "annular"}:
        central_begin, central_end = _central_contacts(maximum, location)

    classification: Literal["partial", "total", "annular"] = (
        maximum_geometry.phase
        if maximum_geometry.phase in {"partial", "total", "annular"}
        else "partial"
    )
    return EclipseLocalEvent(
        classification=classification,
        partial_begin_utc=_round_minute(partial_begin),
        central_begin_utc=None if central_begin is None else _round_minute(central_begin),
        maximum_utc=_round_minute(maximum),
        central_end_utc=None if central_end is None else _round_minute(central_end),
        partial_end_utc=_round_minute(partial_end),
        maximum_obscuration_fraction=maximum_geometry.obscuration_fraction,
        sun_altitude_deg_at_maximum=maximum_geometry.sun_altitude_deg,
        sun_above_geometric_horizon_at_maximum=maximum_geometry.sun_above_geometric_horizon,
    )


def calculate_eclipse_simulator(inputs: EclipseSimulatorInput) -> EclipseSimulatorResult:
    """Calculate reviewed Eclipse Simulator v1 topocentric solar geometry."""

    location = _location(inputs)
    instant = _geometry_at(inputs.at_utc, location)
    event = _local_event(inputs, instant, location)
    return EclipseSimulatorResult(
        model_version=ECLIPSE_SIMULATOR_MODEL_VERSION,
        schema_version=ECLIPSE_SIMULATOR_SCHEMA_VERSION,
        inputs=inputs,
        instant=instant,
        local_event=event,
        ephemeris_note=(
            "Astropy 8.0.1 builtin offline ephemeris; ERFA moon98 is approximate/non-canonical "
            "and v1 is bounded to the locked offline Earth-orientation interval."
        ),
        timing_note=(
            "Local event contacts and maximum are approximate educational estimates rounded to "
            "whole UTC minutes; no second-level precision is claimed."
        ),
        safety_reference_id="nasa-eclipse-safety",
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise EclipseSimulatorModelError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping):
        raise EclipseSimulatorModelError()
    return value


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise EclipseSimulatorModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise EclipseSimulatorModelError()


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
        raise EclipseSimulatorModelError()
    parsed = urlparse(_string(source["url"]))
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise EclipseSimulatorModelError()
    for key in required - {"id", "url"}:
        _string(source[key])
    return source_id


def load_reviewed_eclipse_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and strictly validate the checked-in Eclipse Simulator v1 artifact."""

    path = repository_root / ECLIPSE_SIMULATOR_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"),
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (OSError, json.JSONDecodeError, EclipseSimulatorModelError):
        raise EclipseSimulatorModelError() from None

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
        artifact["artifact_version"] != ECLIPSE_SIMULATOR_ARTIFACT_VERSION
        or artifact["model_version"] != ECLIPSE_SIMULATOR_MODEL_VERSION
        or artifact["schema_version"] != ECLIPSE_SIMULATOR_SCHEMA_VERSION
        or artifact["share_schema_version"] != ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION
    ):
        raise EclipseSimulatorModelError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    required_definition = frozenset(
        {
            "slug",
            "title",
            "content_type",
            "language",
            "status",
            "version",
            "share_schema_version",
            "model_version",
            "learning_objectives",
            "prerequisite_concepts",
            "input_schema",
            "output_schema",
            "equations",
            "sampling_policy",
            "default_preset",
            "assumptions",
            "limitations",
            "references",
            "validation_fixtures",
        }
    )
    _exact_keys(definition, required_definition)
    if (
        definition["slug"] != "eclipse-simulator"
        or definition["title"] != "Eclipse Simulator"
        or definition["status"] != "ready"
        or definition["version"] != 1
        or definition["model_version"] != ECLIPSE_SIMULATOR_MODEL_VERSION
        or definition["share_schema_version"] != ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION
    ):
        raise EclipseSimulatorModelError()
    for key in ("sampling_policy", "default_preset"):
        _string(definition[key])
    for key in (
        "learning_objectives",
        "prerequisite_concepts",
        "output_schema",
        "assumptions",
        "limitations",
        "references",
        "validation_fixtures",
    ):
        values = definition[key]
        if (
            not isinstance(values, list)
            or not values
            or any(not isinstance(item, str) for item in values)
        ):
            raise EclipseSimulatorModelError()
    if not isinstance(definition["equations"], Mapping) or not definition["equations"]:
        raise EclipseSimulatorModelError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_IDS):
        raise EclipseSimulatorModelError()
    source_ids = [_validate_source(source) for source in sources]
    if frozenset(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise EclipseSimulatorModelError()
    if definition["references"] != source_ids:
        raise EclipseSimulatorModelError()

    constants = _mapping(artifact["constants"])
    if dict(constants) != _EXPECTED_CONSTANTS:
        raise EclipseSimulatorModelError()

    presets = _mapping(artifact["presets"])
    if frozenset(presets) != {
        "nasa-2024-dallas-total-reference",
        "nasa-2023-albuquerque-annular-reference",
    }:
        raise EclipseSimulatorModelError()
    for preset in presets.values():
        item = _mapping(preset)
        _exact_keys(item, frozenset({"at_utc", "latitude_deg", "longitude_deg", "elevation_m"}))
        try:
            at_utc = datetime.fromisoformat(_string(item["at_utc"]).replace("Z", "+00:00"))
        except ValueError:
            raise EclipseSimulatorModelError() from None
        EclipseSimulatorInput(
            at_utc=at_utc,
            latitude_deg=_validated_number(
                item["latitude_deg"],
                minimum=MIN_LATITUDE_DEG,
                maximum=MAX_LATITUDE_DEG,
            ),
            longitude_deg=_validated_number(
                item["longitude_deg"],
                minimum=MIN_LONGITUDE_DEG,
                maximum=MAX_LONGITUDE_DEG,
            ),
            elevation_m=_validated_number(
                item["elevation_m"],
                minimum=MIN_ELEVATION_M,
                maximum=MAX_ELEVATION_M,
            ),
        )

    fixtures = artifact["validation_fixtures"]
    if not isinstance(fixtures, list) or len(fixtures) != len(_VALIDATION_FIXTURE_IDS):
        raise EclipseSimulatorModelError()
    fixture_ids: set[str] = set()
    for fixture_value in fixtures:
        fixture = _mapping(fixture_value)
        _exact_keys(fixture, frozenset({"id", "purpose"}))
        fixture_id = _string(fixture["id"])
        _string(fixture["purpose"])
        fixture_ids.add(fixture_id)
    if fixture_ids != _VALIDATION_FIXTURE_IDS:
        raise EclipseSimulatorModelError()

    scientific_validation = _mapping(artifact["scientific_validation"])
    if scientific_validation.get("id") != "eclipse-simulator-v1-validation":
        raise EclipseSimulatorModelError()
    validation_sources = scientific_validation.get("source_ids")
    if not isinstance(validation_sources, list) or validation_sources != source_ids:
        raise EclipseSimulatorModelError()
    test_references = scientific_validation.get("test_references")
    if (
        not isinstance(test_references, list)
        or len(test_references) != 12
        or any(not isinstance(item, str) or not item for item in test_references)
    ):
        raise EclipseSimulatorModelError()
    return dict(artifact)


__all__ = [
    "ECLIPSE_SIMULATOR_ARTIFACT_PATH",
    "ECLIPSE_SIMULATOR_ARTIFACT_VERSION",
    "ECLIPSE_SIMULATOR_MODEL_VERSION",
    "ECLIPSE_SIMULATOR_SCHEMA_VERSION",
    "ECLIPSE_SIMULATOR_SHARE_SCHEMA_VERSION",
    "MAX_UTC",
    "MIN_UTC",
    "EclipseInstantGeometry",
    "EclipseLocalEvent",
    "EclipseSimulatorInput",
    "EclipseSimulatorModelError",
    "EclipseSimulatorResult",
    "calculate_eclipse_simulator",
    "load_reviewed_eclipse_artifact",
]
