"""Versioned public schemas for the Rocket/Mission Designer v1 boundary."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr

from lumina.astronomy.domain.rocket_mission_designer import (
    DeltaVReferenceId,
    GravityBody,
    ReferenceKind,
)


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class RocketStageInputResponse(_ResponseModel):
    dry_mass_kg: StrictFloat
    propellant_mass_kg: StrictFloat
    specific_impulse_s: StrictFloat
    thrust_n: StrictFloat


class RocketMissionDesignerInputResponse(_ResponseModel):
    gravity_body: GravityBody
    delta_v_reference_id: DeltaVReferenceId
    payload_mass_kg: StrictFloat
    stages: list[RocketStageInputResponse] = Field(min_length=1, max_length=4)


class RocketStageResponse(_ResponseModel):
    index: StrictInt
    dry_mass_kg: StrictFloat
    propellant_mass_kg: StrictFloat
    wet_mass_kg: StrictFloat
    specific_impulse_s: StrictFloat
    thrust_n: StrictFloat
    ignition_mass_kg: StrictFloat
    burnout_before_jettison_mass_kg: StrictFloat
    mass_ratio: StrictFloat
    effective_exhaust_velocity_m_s: StrictFloat
    ideal_delta_v_m_s: StrictFloat
    surface_gravity_thrust_to_weight: StrictFloat
    stage_dry_fraction: StrictFloat
    stage_propellant_fraction: StrictFloat


class VehicleMassFractionsResponse(_ResponseModel):
    launch_mass_kg: StrictFloat
    total_stage_dry_mass_kg: StrictFloat
    total_propellant_mass_kg: StrictFloat
    payload_mass_kg: StrictFloat
    stage_dry_fraction_of_launch_mass: StrictFloat
    propellant_fraction_of_launch_mass: StrictFloat
    payload_fraction_of_launch_mass: StrictFloat


class PayloadTradeoffPointResponse(_ResponseModel):
    payload_multiplier: StrictFloat
    payload_mass_kg: StrictFloat
    total_ideal_delta_v_m_s: StrictFloat


class DeltaVReferenceComparisonResponse(_ResponseModel):
    reference_id: DeltaVReferenceId
    reference_kind: ReferenceKind
    label: StrictStr
    reference_value_m_s: StrictFloat
    ideal_delta_v_difference_m_s: StrictFloat
    ideal_delta_v_to_reference_ratio: StrictFloat
    interpretation: StrictStr


class RocketMissionDesignerCalculationResponse(_ResponseModel):
    model_version: StrictStr
    schema_version: StrictInt
    inputs: RocketMissionDesignerInputResponse
    selected_surface_gravity_m_s2: StrictFloat
    stages: list[RocketStageResponse] = Field(min_length=1, max_length=4)
    total_ideal_delta_v_m_s: StrictFloat
    mass_fractions: VehicleMassFractionsResponse
    payload_tradeoff: list[PayloadTradeoffPointResponse] = Field(min_length=5, max_length=5)
    reference_comparison: DeltaVReferenceComparisonResponse
    model_note: StrictStr


__all__ = [
    "DeltaVReferenceComparisonResponse",
    "PayloadTradeoffPointResponse",
    "RocketMissionDesignerCalculationResponse",
    "RocketMissionDesignerInputResponse",
    "RocketStageInputResponse",
    "RocketStageResponse",
    "VehicleMassFractionsResponse",
]
