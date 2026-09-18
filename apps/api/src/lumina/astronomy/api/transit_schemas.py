"""Versioned public schemas for Transit Method Lab's calculation boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.transit_method import TransitClassification


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TransitMethodInputResponse(_ResponseModel):
    stellar_radius_m: StrictFloat
    planet_radius_m: StrictFloat
    semi_major_axis_m: StrictFloat
    orbital_period_s: StrictFloat
    inclination_deg: StrictFloat


class TransitLightCurvePointResponse(_ResponseModel):
    time_from_mid_transit_s: StrictFloat
    orbital_phase: StrictFloat
    projected_separation_stellar_radii: StrictFloat
    relative_flux: StrictFloat


class TransitMethodCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: TransitMethodInputResponse
    radius_ratio: StrictFloat
    scaled_semi_major_axis: StrictFloat
    impact_parameter: StrictFloat
    classification: TransitClassification
    central_depth_approximation_fraction: StrictFloat
    maximum_depth_fraction: StrictFloat
    maximum_depth_ppm: StrictFloat
    total_duration_s: StrictFloat | None
    full_duration_s: StrictFloat | None
    light_curve: list[TransitLightCurvePointResponse] = Field(max_length=301)


__all__ = [
    "TransitLightCurvePointResponse",
    "TransitMethodCalculationResponse",
    "TransitMethodInputResponse",
]
