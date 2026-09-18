"""Versioned public schemas for the Eclipse Simulator v1 boundary."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictBool, StrictFloat, StrictInt, StrictStr


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EclipseSimulatorInputResponse(_ResponseModel):
    at_utc: datetime
    latitude_deg: StrictFloat
    longitude_deg: StrictFloat
    elevation_m: StrictFloat


class EclipseInstantGeometryResponse(_ResponseModel):
    phase: Literal["none", "partial", "total", "annular"]
    shadow_region: Literal["outside", "penumbra", "umbra", "antumbra"]
    sun_angular_radius_deg: StrictFloat
    moon_angular_radius_deg: StrictFloat
    center_separation_deg: StrictFloat
    obscuration_fraction: StrictFloat
    sun_distance_km: StrictFloat
    moon_distance_km: StrictFloat
    sun_altitude_deg: StrictFloat
    sun_above_geometric_horizon: StrictBool


class EclipseLocalEventResponse(_ResponseModel):
    classification: Literal["partial", "total", "annular"]
    partial_begin_utc: datetime
    central_begin_utc: datetime | None
    maximum_utc: datetime
    central_end_utc: datetime | None
    partial_end_utc: datetime
    maximum_obscuration_fraction: StrictFloat
    sun_altitude_deg_at_maximum: StrictFloat
    sun_above_geometric_horizon_at_maximum: StrictBool


class EclipseSimulatorCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: EclipseSimulatorInputResponse
    instant: EclipseInstantGeometryResponse
    local_event: EclipseLocalEventResponse | None
    ephemeris_note: StrictStr
    timing_note: StrictStr
    safety_reference_id: StrictStr


__all__ = [
    "EclipseInstantGeometryResponse",
    "EclipseLocalEventResponse",
    "EclipseSimulatorCalculationResponse",
    "EclipseSimulatorInputResponse",
]
