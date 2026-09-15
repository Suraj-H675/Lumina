"""Provider-neutral value objects and fixed policy for satellite pass prediction."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Final, Literal, Protocol

SATELLITE_PASS_ALTITUDE_THRESHOLD_DEG: Final = 10.0
SATELLITE_PASS_WINDOW_HOURS: Final = 24
SATELLITE_PASS_LIMIT: Final = 16
SATELLITE_ELEMENT_WARNING_HOURS: Final = 24.0
SATELLITE_ELEMENT_REFUSAL_HOURS: Final = 72.0
SATELLITE_MAX_PROPAGATABLE_CATALOG_NUMBER: Final = 339_999
SATELLITE_ALGORITHM_VERSION: Final = "lumina-satellite-pass-v1"
SATELLITE_PROPAGATION_MODEL: Final = "SGP4"
SATELLITE_GRAVITY_MODEL: Final = "WGS72"
SATELLITE_OBSERVER_ELLIPSOID: Final = "WGS84"
SATELLITE_SHADOW_POLICY: Final = "cylindrical-earth-shadow-v1"

SatelliteGroup = Literal["STATIONS", "VISUAL"]
SkyState = Literal[
    "daylight",
    "civil_twilight",
    "nautical_twilight",
    "astronomical_twilight",
    "night",
]
PredictionState = Literal["available", "no_passes", "refused"]
PredictionRefusalReason = Literal[
    "elements_outside_supported_age",
    "catalog_number_unsupported_by_sgp4",
    "unsupported_sgp4_state",
    "unsupported_event_sequence",
]


@dataclass(frozen=True, slots=True)
class ObserverLocation:
    latitude_deg: float
    longitude_deg: float
    elevation_m: float = 0.0

    def __post_init__(self) -> None:
        for value in (self.latitude_deg, self.longitude_deg, self.elevation_m):
            if type(value) not in {int, float} or not math.isfinite(float(value)):
                raise ValueError("Observer location contains a non-finite value")
        if not -90.0 <= float(self.latitude_deg) <= 90.0:
            raise ValueError("Observer latitude is outside [-90, 90]")
        if not -180.0 <= float(self.longitude_deg) <= 180.0:
            raise ValueError("Observer longitude is outside [-180, 180]")
        if not -500.0 <= float(self.elevation_m) <= 10_000.0:
            raise ValueError("Observer elevation is outside the supported range")


@dataclass(frozen=True, slots=True)
class SatelliteElements:
    catalog_number: int
    object_name: str
    object_id: str | None
    epoch_utc: datetime
    mean_motion_rev_per_day: float
    eccentricity: float
    inclination_deg: float
    ra_of_asc_node_deg: float
    arg_of_pericenter_deg: float
    mean_anomaly_deg: float
    ephemeris_type: int
    classification_type: str
    element_set_number: int
    revolution_at_epoch: int
    bstar: float
    mean_motion_dot: float
    mean_motion_ddot: float
    groups: tuple[SatelliteGroup, ...]

    def __post_init__(self) -> None:
        if type(self.catalog_number) is not int or not 1 <= self.catalog_number <= 999_999_999:
            raise ValueError("Satellite catalog number is invalid")
        _require_utc(self.epoch_utc)
        if not self.object_name or not self.groups:
            raise ValueError("Satellite identity is incomplete")
        if self.ephemeris_type != 0 or self.classification_type != "U":
            raise ValueError("Satellite elements are outside the supported public GP contract")


@dataclass(frozen=True, slots=True)
class PassEvent:
    time_utc: datetime
    azimuth_deg: float
    direction: str

    def __post_init__(self) -> None:
        _require_utc(self.time_utc)
        if not math.isfinite(self.azimuth_deg) or not 0.0 <= self.azimuth_deg < 360.0:
            raise ValueError("Pass event azimuth is invalid")
        if not self.direction:
            raise ValueError("Pass event direction is invalid")


@dataclass(frozen=True, slots=True)
class SatellitePass:
    rise: PassEvent
    peak: PassEvent
    set: PassEvent
    peak_altitude_deg: float
    satellite_sunlit_at_peak: bool
    observer_sun_altitude_deg_at_peak: float
    observer_sky_state_at_peak: SkyState

    def __post_init__(self) -> None:
        if not self.rise.time_utc < self.peak.time_utc < self.set.time_utc:
            raise ValueError("Satellite pass event order is invalid")
        if not SATELLITE_PASS_ALTITUDE_THRESHOLD_DEG <= self.peak_altitude_deg <= 90.0:
            raise ValueError("Satellite pass peak altitude is invalid")
        if not -90.0 <= self.observer_sun_altitude_deg_at_peak <= 90.0:
            raise ValueError("Observer Sun altitude is invalid")


@dataclass(frozen=True, slots=True)
class SatelliteAlgorithmMetadata:
    algorithm_version: str = SATELLITE_ALGORITHM_VERSION
    propagation_model: str = SATELLITE_PROPAGATION_MODEL
    gravity_model: str = SATELLITE_GRAVITY_MODEL
    observer_ellipsoid: str = SATELLITE_OBSERVER_ELLIPSOID
    altitude_threshold_deg: float = SATELLITE_PASS_ALTITUDE_THRESHOLD_DEG
    window_hours: int = SATELLITE_PASS_WINDOW_HOURS
    shadow_policy: str = SATELLITE_SHADOW_POLICY


@dataclass(frozen=True, slots=True)
class SatellitePassPrediction:
    state: PredictionState
    refusal_reason: PredictionRefusalReason | None
    element_offset_hours_at_start: float
    maximum_element_offset_hours: float
    stale_element_warning: bool
    passes: tuple[SatellitePass, ...]
    algorithm: SatelliteAlgorithmMetadata

    def __post_init__(self) -> None:
        if not math.isfinite(self.element_offset_hours_at_start):
            raise ValueError("Satellite element offset is invalid")
        if (
            not math.isfinite(self.maximum_element_offset_hours)
            or self.maximum_element_offset_hours < 0
        ):
            raise ValueError("Satellite maximum element offset is invalid")
        if len(self.passes) > SATELLITE_PASS_LIMIT:
            raise ValueError("Satellite pass result exceeds the public bound")
        if self.state == "refused":
            if self.refusal_reason is None or self.passes:
                raise ValueError("Refused satellite predictions cannot contain passes")
        elif self.refusal_reason is not None:
            raise ValueError("Available satellite predictions cannot contain a refusal reason")
        elif self.state == "available" and not self.passes:
            raise ValueError("Available satellite prediction requires at least one pass")
        elif self.state == "no_passes" and self.passes:
            raise ValueError("No-pass prediction cannot contain passes")


class SatellitePassEngine(Protocol):
    def predict(
        self,
        elements: SatelliteElements,
        observer: ObserverLocation,
        start_utc: datetime,
    ) -> SatellitePassPrediction:
        """Compute one bounded pass window without network or persistence."""
        ...


def prediction_window_end(start_utc: datetime) -> datetime:
    _require_utc(start_utc)
    return start_utc + timedelta(hours=SATELLITE_PASS_WINDOW_HOURS)


def sky_state_for_sun_altitude(altitude_deg: float) -> SkyState:
    if not math.isfinite(altitude_deg) or not -90.0 <= altitude_deg <= 90.0:
        raise ValueError("Observer Sun altitude is invalid")
    if altitude_deg >= 0.0:
        return "daylight"
    if altitude_deg >= -6.0:
        return "civil_twilight"
    if altitude_deg >= -12.0:
        return "nautical_twilight"
    if altitude_deg >= -18.0:
        return "astronomical_twilight"
    return "night"


def compass_direction(azimuth_deg: float) -> str:
    if not math.isfinite(azimuth_deg):
        raise ValueError("Azimuth is invalid")
    normalized = azimuth_deg % 360.0
    labels = (
        "N",
        "NNE",
        "NE",
        "ENE",
        "E",
        "ESE",
        "SE",
        "SSE",
        "S",
        "SSW",
        "SW",
        "WSW",
        "W",
        "WNW",
        "NW",
        "NNW",
    )
    return labels[int((normalized + 11.25) // 22.5) % 16]


def _require_utc(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("Satellite timestamps must use UTC")


__all__ = [
    "ObserverLocation",
    "PassEvent",
    "PredictionRefusalReason",
    "PredictionState",
    "SATELLITE_ALGORITHM_VERSION",
    "SATELLITE_ELEMENT_REFUSAL_HOURS",
    "SATELLITE_ELEMENT_WARNING_HOURS",
    "SATELLITE_GRAVITY_MODEL",
    "SATELLITE_MAX_PROPAGATABLE_CATALOG_NUMBER",
    "SATELLITE_OBSERVER_ELLIPSOID",
    "SATELLITE_PASS_ALTITUDE_THRESHOLD_DEG",
    "SATELLITE_PASS_LIMIT",
    "SATELLITE_PASS_WINDOW_HOURS",
    "SATELLITE_PROPAGATION_MODEL",
    "SATELLITE_SHADOW_POLICY",
    "SatelliteAlgorithmMetadata",
    "SatelliteElements",
    "SatelliteGroup",
    "SatellitePass",
    "SatellitePassEngine",
    "SatellitePassPrediction",
    "SkyState",
    "compass_direction",
    "prediction_window_end",
    "sky_state_for_sun_altitude",
]
