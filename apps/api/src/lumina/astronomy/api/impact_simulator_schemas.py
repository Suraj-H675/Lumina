"""Versioned public schemas for the Impact Simulator v1 boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.impact_simulator import TargetMaterial


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ImpactSimulatorInputResponse(_ResponseModel):
    diameter_m: StrictFloat
    impactor_density_kg_m3: StrictFloat
    speed_km_s: StrictFloat
    impact_angle_deg: StrictFloat
    target_material: TargetMaterial


class CraterDimensionsResponse(_ResponseModel):
    scaling_coefficient: StrictFloat
    transient_diameter_m: StrictFloat
    final_diameter_m: StrictFloat
    classification: StrictStr


class EjectaThicknessRadiusResponse(_ResponseModel):
    thickness_m: StrictFloat
    radius_m: StrictFloat


class ImpactSimulatorCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: ImpactSimulatorInputResponse
    target_density_kg_m3: StrictFloat
    impactor_mass_kg: StrictFloat
    kinetic_energy_j: StrictFloat
    tnt_equivalent_megatons: StrictFloat
    best_estimate_crater: CraterDimensionsResponse
    coefficient_sensitivity: list[CraterDimensionsResponse] = Field(min_length=3, max_length=3)
    ejecta_thickness_radii: list[EjectaThicknessRadiusResponse] = Field(
        min_length=4,
        max_length=4,
    )
    uncertainty_note: StrictStr
    model_note: StrictStr


__all__ = [
    "CraterDimensionsResponse",
    "EjectaThicknessRadiusResponse",
    "ImpactSimulatorCalculationResponse",
    "ImpactSimulatorInputResponse",
]
