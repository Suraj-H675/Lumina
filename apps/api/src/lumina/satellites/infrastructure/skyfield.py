"""Offline Skyfield/python-sgp4 implementation of the fixed Phase 4D pass policy."""

from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any, Final, cast

from astropy import units as u
from astropy.coordinates import AltAz, EarthLocation, get_sun
from astropy.time import Time
from astropy.utils import iers
from sgp4 import omm
from sgp4.api import WGS72, Satrec
from skyfield.api import EarthSatellite, load, wgs84
from skyfield.timelib import Time as SkyfieldTime

from lumina.satellites.domain.models import (
    SATELLITE_ELEMENT_REFUSAL_HOURS,
    SATELLITE_ELEMENT_WARNING_HOURS,
    SATELLITE_MAX_PROPAGATABLE_CATALOG_NUMBER,
    SATELLITE_PASS_ALTITUDE_THRESHOLD_DEG,
    SATELLITE_PASS_LIMIT,
    ObserverLocation,
    PassEvent,
    PredictionRefusalReason,
    SatelliteAlgorithmMetadata,
    SatelliteElements,
    SatellitePass,
    SatellitePassPrediction,
    compass_direction,
    prediction_window_end,
    sky_state_for_sun_altitude,
)

_EARTH_SHADOW_RADIUS_KM: Final = 6378.137


class SkyfieldSatellitePassEngine:
    """Compute bounded pass predictions without any runtime network access."""

    def __init__(self) -> None:
        self._timescale = load.timescale(builtin=True)
        self._algorithm = SatelliteAlgorithmMetadata()

    def predict(
        self,
        elements: SatelliteElements,
        observer: ObserverLocation,
        start_utc: datetime,
    ) -> SatellitePassPrediction:
        start = _utc(start_utc)
        end = prediction_window_end(start)
        start_offset = (start - elements.epoch_utc).total_seconds() / 3600.0
        end_offset = (end - elements.epoch_utc).total_seconds() / 3600.0
        maximum_offset = max(abs(start_offset), abs(end_offset))
        warning = maximum_offset > SATELLITE_ELEMENT_WARNING_HOURS
        if maximum_offset > SATELLITE_ELEMENT_REFUSAL_HOURS:
            return self._refused(
                "elements_outside_supported_age", start_offset, maximum_offset, warning
            )
        if elements.catalog_number > SATELLITE_MAX_PROPAGATABLE_CATALOG_NUMBER:
            return self._refused(
                "catalog_number_unsupported_by_sgp4", start_offset, maximum_offset, warning
            )

        try:
            satellite = self._satellite(elements)
            topos = wgs84.latlon(
                latitude_degrees=float(observer.latitude_deg),
                longitude_degrees=float(observer.longitude_deg),
                elevation_m=float(observer.elevation_m),
            )
            t0 = self._timescale.from_datetime(start)
            t1 = self._timescale.from_datetime(end)
            event_times, event_codes = satellite.find_events(
                topos,
                t0,
                t1,
                altitude_degrees=SATELLITE_PASS_ALTITUDE_THRESHOLD_DEG,
            )
            parsed = self._complete_triplets(tuple(int(code) for code in event_codes))
            if parsed is None:
                return self._refused(
                    "unsupported_event_sequence", start_offset, maximum_offset, warning
                )
            passes = tuple(
                self._pass(satellite, topos, event_times, indexes, observer)
                for indexes in parsed[:SATELLITE_PASS_LIMIT]
            )
        except (ArithmeticError, IndexError, KeyError, OverflowError, TypeError, ValueError):
            return self._refused("unsupported_sgp4_state", start_offset, maximum_offset, warning)

        return SatellitePassPrediction(
            state="available" if passes else "no_passes",
            refusal_reason=None,
            element_offset_hours_at_start=start_offset,
            maximum_element_offset_hours=maximum_offset,
            stale_element_warning=warning,
            passes=passes,
            algorithm=self._algorithm,
        )

    def _satellite(self, elements: SatelliteElements) -> EarthSatellite:
        fields: dict[str, str | int | float] = {
            "OBJECT_NAME": elements.object_name,
            "OBJECT_ID": elements.object_id or "",
            "EPOCH": elements.epoch_utc.isoformat(timespec="microseconds").replace("+00:00", ""),
            "MEAN_MOTION": elements.mean_motion_rev_per_day,
            "ECCENTRICITY": elements.eccentricity,
            "INCLINATION": elements.inclination_deg,
            "RA_OF_ASC_NODE": elements.ra_of_asc_node_deg,
            "ARG_OF_PERICENTER": elements.arg_of_pericenter_deg,
            "MEAN_ANOMALY": elements.mean_anomaly_deg,
            "EPHEMERIS_TYPE": elements.ephemeris_type,
            "CLASSIFICATION_TYPE": elements.classification_type,
            "NORAD_CAT_ID": elements.catalog_number,
            "ELEMENT_SET_NO": elements.element_set_number,
            "REV_AT_EPOCH": elements.revolution_at_epoch,
            "BSTAR": elements.bstar,
            "MEAN_MOTION_DOT": elements.mean_motion_dot,
            "MEAN_MOTION_DDOT": elements.mean_motion_ddot,
        }
        satrec = Satrec()
        omm.initialize(satrec, fields, WGS72)
        return EarthSatellite.from_satrec(satrec, self._timescale)

    @staticmethod
    def _complete_triplets(codes: tuple[int, ...]) -> tuple[tuple[int, int, int], ...] | None:
        """Return only complete rise/peak/set passes; reject unsupported interior sequences."""
        result: list[tuple[int, int, int]] = []
        index = 0
        while index < len(codes):
            if index + 2 < len(codes) and codes[index : index + 3] == (0, 1, 2):
                result.append((index, index + 1, index + 2))
                index += 3
                continue
            if not result and codes[index] in {1, 2}:
                index += 1
                continue
            if index >= len(codes) - 2 and codes[index] in {0, 1}:
                break
            return None
        return tuple(result)

    def _pass(
        self,
        satellite: EarthSatellite,
        topos: object,
        event_times: Any,
        indexes: tuple[int, int, int],
        observer: ObserverLocation,
    ) -> SatellitePass:
        rise_time = cast(SkyfieldTime, event_times[indexes[0]])
        peak_time = cast(SkyfieldTime, event_times[indexes[1]])
        set_time = cast(SkyfieldTime, event_times[indexes[2]])
        rise, _ = self._event(satellite, topos, rise_time)
        peak, peak_altitude = self._event(satellite, topos, peak_time)
        set_event, _ = self._event(satellite, topos, set_time)
        peak_datetime = _skyfield_datetime(peak_time)
        sun_altitude = _observer_sun_altitude(observer, peak_datetime)
        sunlit = _satellite_sunlit(satellite, peak_time, peak_datetime)
        return SatellitePass(
            rise=rise,
            peak=peak,
            set=set_event,
            peak_altitude_deg=peak_altitude,
            satellite_sunlit_at_peak=sunlit,
            observer_sun_altitude_deg_at_peak=sun_altitude,
            observer_sky_state_at_peak=sky_state_for_sun_altitude(sun_altitude),
        )

    @staticmethod
    def _event(
        satellite: EarthSatellite,
        topos: object,
        when: SkyfieldTime,
    ) -> tuple[PassEvent, float]:
        topocentric = (satellite - topos).at(when)
        altitude, azimuth, _distance = topocentric.altaz()
        azimuth_deg = float(azimuth.degrees) % 360.0
        altitude_deg = float(altitude.degrees)
        return (
            PassEvent(
                time_utc=_skyfield_datetime(when),
                azimuth_deg=azimuth_deg,
                direction=compass_direction(azimuth_deg),
            ),
            altitude_deg,
        )

    def _refused(
        self,
        reason: PredictionRefusalReason,
        start_offset: float,
        maximum_offset: float,
        warning: bool,
    ) -> SatellitePassPrediction:
        return SatellitePassPrediction(
            state="refused",
            refusal_reason=reason,
            element_offset_hours_at_start=start_offset,
            maximum_element_offset_hours=maximum_offset,
            stale_element_warning=warning,
            passes=(),
            algorithm=self._algorithm,
        )


def _observer_sun_altitude(observer: ObserverLocation, when: datetime) -> float:
    moment = Time(when, scale="utc")
    location = EarthLocation.from_geodetic(
        lon=float(observer.longitude_deg) * u.deg,
        lat=float(observer.latitude_deg) * u.deg,
        height=float(observer.elevation_m) * u.m,
    )
    with iers.conf.set_temp("auto_download", False):
        sun = get_sun(moment)
        altitude = sun.transform_to(AltAz(obstime=moment, location=location)).alt.deg
    return float(altitude)


def _satellite_sunlit(
    satellite: EarthSatellite,
    when: SkyfieldTime,
    when_datetime: datetime,
) -> bool:
    """Simple cylindrical Earth-shadow test; no optical magnitude is inferred."""
    satellite_xyz = satellite.at(when).position.km
    with iers.conf.set_temp("auto_download", False):
        sun_xyz = get_sun(Time(when_datetime, scale="utc")).cartesian.xyz.to_value(u.km)
    sx, sy, sz = (float(sun_xyz[index]) for index in range(3))
    rx, ry, rz = (float(satellite_xyz[index]) for index in range(3))
    sun_norm = math.sqrt(sx * sx + sy * sy + sz * sz)
    if not math.isfinite(sun_norm) or sun_norm <= 0.0:
        raise ValueError("Sun vector is invalid")
    ux, uy, uz = sx / sun_norm, sy / sun_norm, sz / sun_norm
    projection = rx * ux + ry * uy + rz * uz
    px, py, pz = rx - projection * ux, ry - projection * uy, rz - projection * uz
    perpendicular = math.sqrt(px * px + py * py + pz * pz)
    eclipsed = projection < 0.0 and perpendicular < _EARTH_SHADOW_RADIUS_KM
    return not eclipsed


def _skyfield_datetime(value: SkyfieldTime) -> datetime:
    result = cast(datetime, value.utc_datetime())
    if result.tzinfo is None:
        result = result.replace(tzinfo=UTC)
    return result.astimezone(UTC)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("Satellite prediction start must use UTC")
    return value.astimezone(UTC)


__all__ = ["SkyfieldSatellitePassEngine"]
