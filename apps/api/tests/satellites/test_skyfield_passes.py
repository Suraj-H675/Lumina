"""Independent reference and edge tests for the Phase 4D SGP4 pass engine."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

import pytest
from astropy import units as u
from astropy.coordinates import ITRS, TEME, AltAz, CartesianRepresentation, EarthLocation
from astropy.time import Time
from astropy.utils import iers
from lumina.satellites.domain.models import ObserverLocation, SatelliteElements
from lumina.satellites.infrastructure.skyfield import SkyfieldSatellitePassEngine
from sgp4 import omm
from sgp4.api import WGS72, Satrec

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider" / "celestrak"
_REFERENCE_OBSERVER = ObserverLocation(0.0, 0.0, 0.0)
_START = datetime(2026, 6, 19, 12, 0, tzinfo=UTC)


def _fixture(name: str, index: int = 0) -> dict[str, Any]:
    values = cast(list[dict[str, Any]], json.loads((_FIXTURES / name).read_text()))
    return values[index]


def _elements(value: dict[str, Any], groups: tuple[str, ...]) -> SatelliteElements:
    epoch = datetime.fromisoformat(cast(str, value["EPOCH"])).replace(tzinfo=UTC)
    return SatelliteElements(
        catalog_number=cast(int, value["NORAD_CAT_ID"]),
        object_name=cast(str, value["OBJECT_NAME"]),
        object_id=cast(str | None, value["OBJECT_ID"]),
        epoch_utc=epoch,
        mean_motion_rev_per_day=float(value["MEAN_MOTION"]),
        eccentricity=float(value["ECCENTRICITY"]),
        inclination_deg=float(value["INCLINATION"]),
        ra_of_asc_node_deg=float(value["RA_OF_ASC_NODE"]),
        arg_of_pericenter_deg=float(value["ARG_OF_PERICENTER"]),
        mean_anomaly_deg=float(value["MEAN_ANOMALY"]),
        ephemeris_type=cast(int, value["EPHEMERIS_TYPE"]),
        classification_type=cast(str, value["CLASSIFICATION_TYPE"]),
        element_set_number=cast(int, value["ELEMENT_SET_NO"]),
        revolution_at_epoch=cast(int, value["REV_AT_EPOCH"]),
        bstar=float(value["BSTAR"]),
        mean_motion_dot=float(value["MEAN_MOTION_DOT"]),
        mean_motion_ddot=float(value["MEAN_MOTION_DDOT"]),
        groups=cast(Any, groups),
    )


def _independent_altaz(
    value: dict[str, Any],
    when: datetime,
    observer: ObserverLocation,
) -> tuple[float, float]:
    """Reference path: raw python-sgp4 TEME -> Astropy ITRS -> topocentric AltAz."""
    satrec = Satrec()
    omm.initialize(satrec, value, WGS72)
    moment = Time(when, scale="utc")
    error, position_km, _velocity = satrec.sgp4(moment.jd1, moment.jd2)
    assert error == 0
    teme = TEME(CartesianRepresentation(position_km * u.km), obstime=moment)
    with iers.conf.set_temp("auto_download", False):
        geocentric = teme.transform_to(ITRS(obstime=moment))
        location = EarthLocation.from_geodetic(
            observer.longitude_deg * u.deg,
            observer.latitude_deg * u.deg,
            observer.elevation_m * u.m,
        )
        site = location.get_itrs(obstime=moment)
        topocentric_cart = (
            geocentric.cartesian.without_differentials() - site.cartesian.without_differentials()
        )
        topocentric = ITRS(topocentric_cart, obstime=moment, location=location)
        altaz = topocentric.transform_to(AltAz(obstime=moment, location=location))
    return float(altaz.alt.deg), float(altaz.az.deg)


def test_iss_reference_pass_matches_independent_sgp4_astropy_path() -> None:
    raw = _fixture("stations.json")
    elements = _elements(raw, ("STATIONS", "VISUAL"))
    prediction = SkyfieldSatellitePassEngine().predict(elements, _REFERENCE_OBSERVER, _START)

    assert prediction.state == "available"
    assert len(prediction.passes) == 2
    first = prediction.passes[0]
    expected_peak = datetime(2026, 6, 19, 13, 2, 20, 332412, tzinfo=UTC)
    assert abs((first.peak.time_utc - expected_peak).total_seconds()) < 1.0
    reference_alt, reference_az = _independent_altaz(raw, first.peak.time_utc, _REFERENCE_OBSERVER)
    assert first.peak_altitude_deg == pytest.approx(reference_alt, abs=0.002)
    assert first.peak.azimuth_deg == pytest.approx(reference_az, abs=0.002)
    assert first.peak.direction == "NE"
    assert first.satellite_sunlit_at_peak is True
    assert first.observer_sky_state_at_peak == "daylight"


def test_bright_fixture_has_bounded_complete_passes_and_separates_daylight_from_sunlight() -> None:
    elements = _elements(_fixture("visual.json", 1), ("VISUAL",))
    prediction = SkyfieldSatellitePassEngine().predict(elements, _REFERENCE_OBSERVER, _START)

    assert prediction.state == "available"
    assert len(prediction.passes) == 3
    daylight = prediction.passes[0]
    expected_peak = datetime(2026, 6, 19, 13, 36, 6, 164313, tzinfo=UTC)
    assert abs((daylight.peak.time_utc - expected_peak).total_seconds()) < 1.0
    assert daylight.peak_altitude_deg == pytest.approx(37.161085, abs=0.01)
    assert daylight.satellite_sunlit_at_peak is True
    assert daylight.observer_sky_state_at_peak == "daylight"
    assert daylight.observer_sun_altitude_deg_at_peak > 50.0
    dark = prediction.passes[-1]
    assert dark.satellite_sunlit_at_peak is False
    assert dark.observer_sky_state_at_peak == "night"


def test_polar_observer_can_return_no_passes_without_inventing_events() -> None:
    elements = _elements(_fixture("stations.json"), ("STATIONS", "VISUAL"))
    prediction = SkyfieldSatellitePassEngine().predict(
        elements, ObserverLocation(89.0, 0.0, 0.0), _START
    )
    assert prediction.state == "no_passes"
    assert prediction.refusal_reason is None
    assert prediction.passes == ()


def test_window_is_refused_when_any_part_exceeds_fixed_element_age_policy() -> None:
    elements = _elements(_fixture("stations.json"), ("STATIONS", "VISUAL"))
    start = elements.epoch_utc + timedelta(hours=49)
    prediction = SkyfieldSatellitePassEngine().predict(elements, _REFERENCE_OBSERVER, start)
    assert prediction.state == "refused"
    assert prediction.refusal_reason == "elements_outside_supported_age"
    assert prediction.maximum_element_offset_hours == pytest.approx(73.0)
    assert prediction.stale_element_warning is True
    assert prediction.passes == ()


def test_large_modern_catalog_id_remains_representable_but_is_not_falsely_propagated() -> None:
    elements = _elements(_fixture("visual.json", 1), ("VISUAL",))
    future_catalog = replace(elements, catalog_number=340_000)
    prediction = SkyfieldSatellitePassEngine().predict(future_catalog, _REFERENCE_OBSERVER, _START)
    assert prediction.state == "refused"
    assert prediction.refusal_reason == "catalog_number_unsupported_by_sgp4"
    assert prediction.passes == ()


def test_observer_validation_rejects_nonfinite_and_out_of_range_private_coordinates() -> None:
    with pytest.raises(ValueError):
        ObserverLocation(91.0, 0.0, 0.0)
    with pytest.raises(ValueError):
        ObserverLocation(0.0, 181.0, 0.0)
    with pytest.raises(ValueError):
        ObserverLocation(float("nan"), 0.0, 0.0)
