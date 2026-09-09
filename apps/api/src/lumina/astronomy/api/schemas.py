"""Versioned public schemas for the Seasons Simulator calculation boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.seasons_simulator import SeasonsEccentricityPreset, SeasonsPolarState


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class SeasonsInputResponse(_ResponseModel):
    """Normalized validated inputs echoed by the deterministic result."""

    axial_tilt_deg: StrictFloat = Field(description="Axial tilt in degrees.")
    orbital_position_deg: StrictFloat = Field(
        description="Canonical idealized seasonal orbital position in degrees [0, 360)."
    )
    latitude_deg: StrictFloat = Field(description="Observer latitude in degrees.")
    eccentricity_preset: SeasonsEccentricityPreset


class SeasonsLatitudeGeometryResponse(_ResponseModel):
    """Solar-noon and geometric daylight outputs for one latitude."""

    latitude_deg: StrictFloat
    noon_solar_zenith_deg: StrictFloat
    noon_sun_altitude_deg: StrictFloat
    illumination_incidence_deg: StrictFloat
    day_length_hours: StrictFloat | None
    polar_state: SeasonsPolarState


class SeasonsCalculationResponse(_ResponseModel):
    """Complete public result for one Seasons Simulator evaluation."""

    model_version: StrictStr
    schema_version: StrictInt
    inputs: SeasonsInputResponse
    solar_declination_deg: StrictFloat
    selected: SeasonsLatitudeGeometryResponse
    comparison_latitude_deg: StrictFloat
    opposite_hemisphere: SeasonsLatitudeGeometryResponse
    eccentricity: StrictFloat
    distance_over_semimajor_axis: StrictFloat
    relative_solar_flux: StrictFloat


__all__ = [
    "SeasonsCalculationResponse",
    "SeasonsInputResponse",
    "SeasonsLatitudeGeometryResponse",
]
