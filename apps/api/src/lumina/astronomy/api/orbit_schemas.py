"""Versioned public schemas for Orbit Sandbox's calculation boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.orbit_sandbox import OrbitClassification


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class OrbitSandboxInputResponse(_ResponseModel):
    central_mass_kg: StrictFloat
    central_radius_m: StrictFloat
    orbiting_body_mass_kg: StrictFloat
    position_x_m: StrictFloat
    position_y_m: StrictFloat
    velocity_x_m_s: StrictFloat
    velocity_y_m_s: StrictFloat
    duration_s: StrictFloat
    time_step_s: StrictFloat


class OrbitTrajectoryPointResponse(_ResponseModel):
    time_s: StrictFloat
    x_m: StrictFloat
    y_m: StrictFloat
    distance_m: StrictFloat
    speed_m_s: StrictFloat


class OrbitSandboxCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: OrbitSandboxInputResponse
    gravitational_parameter_m3_s2: StrictFloat
    reduced_mass_kg: StrictFloat | None
    specific_orbital_energy_j_per_kg: StrictFloat
    orbital_energy_j: StrictFloat | None
    specific_angular_momentum_m2_per_s: StrictFloat
    angular_momentum_kg_m2_per_s: StrictFloat | None
    eccentricity: StrictFloat
    semi_major_axis_m: StrictFloat | None
    period_s: StrictFloat | None
    periapsis_m: StrictFloat
    apoapsis_m: StrictFloat | None
    classification: OrbitClassification
    collision_time_s: StrictFloat | None
    trajectory: list[OrbitTrajectoryPointResponse] = Field(max_length=4096)
    max_specific_energy_drift_fraction: StrictFloat
    max_specific_angular_momentum_drift_fraction: StrictFloat


__all__ = [
    "OrbitSandboxCalculationResponse",
    "OrbitSandboxInputResponse",
    "OrbitTrajectoryPointResponse",
]
