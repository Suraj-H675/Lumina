"""Versioned public schemas for the Planetary System Builder v1 boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.planetary_system_builder import (
    HabitableZoneRelation,
    PairwiseSpacingAssessment,
)


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class PlanetarySystemPlanetInputResponse(_ResponseModel):
    mass_mearth: StrictFloat
    semi_major_axis_au: StrictFloat


class PlanetarySystemBuilderInputResponse(_ResponseModel):
    stellar_mass_msun: StrictFloat
    stellar_luminosity_lsun: StrictFloat
    stellar_effective_temperature_k: StrictFloat
    planets: list[PlanetarySystemPlanetInputResponse] = Field(min_length=1, max_length=8)


class PlanetarySystemHabitableZoneResponse(_ResponseModel):
    model_id: StrictStr
    inner_edge_au: StrictFloat
    outer_edge_au: StrictFloat
    inner_effective_flux: StrictFloat
    outer_effective_flux: StrictFloat
    habitability_note: StrictStr


class PlanetarySystemPlanetResponse(_ResponseModel):
    index: StrictInt
    mass_mearth: StrictFloat
    semi_major_axis_au: StrictFloat
    orbital_period_s: StrictFloat
    orbital_period_days: StrictFloat
    habitable_zone_relation: HabitableZoneRelation


class PlanetarySystemAdjacentPairResponse(_ResponseModel):
    inner_index: StrictInt
    outer_index: StrictInt
    mutual_hill_radius_au: StrictFloat
    separation_mutual_hill: StrictFloat
    pairwise_reference_threshold: StrictFloat
    spacing_assessment: PairwiseSpacingAssessment
    interpretation: StrictStr


class PlanetarySystemBuilderCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: PlanetarySystemBuilderInputResponse
    habitable_zone: PlanetarySystemHabitableZoneResponse
    planets: list[PlanetarySystemPlanetResponse] = Field(min_length=1, max_length=8)
    adjacent_pairs: list[PlanetarySystemAdjacentPairResponse] = Field(max_length=7)
    stellar_consistency_note: StrictStr
    stability_note: StrictStr


__all__ = [
    "PlanetarySystemAdjacentPairResponse",
    "PlanetarySystemBuilderCalculationResponse",
    "PlanetarySystemBuilderInputResponse",
    "PlanetarySystemHabitableZoneResponse",
    "PlanetarySystemPlanetInputResponse",
    "PlanetarySystemPlanetResponse",
]
