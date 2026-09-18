"""Versioned public schemas for Radial Velocity Lab's calculation boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RadialVelocityInputResponse(_ResponseModel):
    stellar_mass_kg: StrictFloat
    planet_mass_kg: StrictFloat
    orbital_period_s: StrictFloat
    eccentricity: StrictFloat
    inclination_deg: StrictFloat
    stellar_argument_of_periastron_deg: StrictFloat
    mean_anomaly_at_epoch_deg: StrictFloat


class RadialVelocityCurvePointResponse(_ResponseModel):
    time_s: StrictFloat
    orbital_phase: StrictFloat
    radial_velocity_m_s: StrictFloat


class RadialVelocityCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: RadialVelocityInputResponse
    inclination_projection: StrictFloat
    semi_amplitude_m_s: StrictFloat
    projected_planet_mass_kg: StrictFloat
    mass_function_kg: StrictFloat
    edge_on_minimum_mass_kg: StrictFloat
    curve: list[RadialVelocityCurvePointResponse] = Field(max_length=301)


__all__ = [
    "RadialVelocityCalculationResponse",
    "RadialVelocityCurvePointResponse",
    "RadialVelocityInputResponse",
]
