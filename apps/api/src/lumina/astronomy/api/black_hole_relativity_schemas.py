"""Versioned public schemas for the Black-Hole / Relativity Lab v1 boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class BlackHoleRelativityInputResponse(_ResponseModel):
    mass_nominal_solar: StrictFloat
    static_observer_radius_rs: StrictFloat


class SchwarzschildLandmarkResponse(_ResponseModel):
    id: StrictStr
    label: StrictStr
    radius_rs: StrictFloat
    radius_m: StrictFloat
    interpretation: StrictStr


class BlackHoleRelativityCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: BlackHoleRelativityInputResponse
    gravitational_parameter_m3_s2: StrictFloat
    schwarzschild_radius_m: StrictFloat
    landmarks: list[SchwarzschildLandmarkResponse] = Field(min_length=3, max_length=3)
    static_observer_areal_radius_m: StrictFloat
    proper_time_rate_vs_infinity: StrictFloat
    frequency_ratio_at_infinity: StrictFloat
    far_away_interval_per_local_interval: StrictFloat
    gravitational_redshift_z: StrictFloat
    observer_note: StrictStr
    model_note: StrictStr


__all__ = [
    "BlackHoleRelativityCalculationResponse",
    "BlackHoleRelativityInputResponse",
    "SchwarzschildLandmarkResponse",
]
