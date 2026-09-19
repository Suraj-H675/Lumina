"""Read-only HTTP translation for the Rocket/Mission Designer v1 model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.rocket_mission_designer import (
    DeltaVReferenceId,
    GravityBody,
    RocketMissionDesignerInput,
    RocketMissionDesignerModelError,
    RocketMissionDesignerResult,
    RocketStageInput,
    calculate_rocket_mission_designer,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .rocket_mission_designer_schemas import (
    DeltaVReferenceComparisonResponse,
    PayloadTradeoffPointResponse,
    RocketMissionDesignerCalculationResponse,
    RocketMissionDesignerInputResponse,
    RocketStageInputResponse,
    RocketStageResponse,
    VehicleMassFractionsResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Rocket/Mission Designer input is invalid.",
    },
}
_SCALAR_QUERY_KEYS = frozenset({"gravity_body", "delta_v_reference_id", "payload_mass_kg"})
_REPEATED_QUERY_KEYS = frozenset(
    {
        "stage_dry_mass_kg",
        "stage_propellant_mass_kg",
        "stage_specific_impulse_s",
        "stage_thrust_n",
    }
)
_QUERY_KEYS = _SCALAR_QUERY_KEYS | _REPEATED_QUERY_KEYS

_GRAVITY_BODY = Annotated[
    GravityBody,
    Query(description="Surface-gravity teaching reference: earth, moon, or mars."),
]
_DELTA_V_REFERENCE = Annotated[
    DeltaVReferenceId,
    Query(
        description=(
            "Fixed educational velocity reference; comparison is not a mission-feasibility result."
        )
    ),
]
_PAYLOAD_MASS = Annotated[
    float,
    Query(description="Payload mass in kilograms; 1 through 300000."),
]
_STAGE_DRY_MASSES = Annotated[
    list[float],
    Query(
        min_length=1,
        max_length=4,
        description="Repeated stage dry masses in kilograms, in ignition order.",
    ),
]
_STAGE_PROPELLANT_MASSES = Annotated[
    list[float],
    Query(
        min_length=1,
        max_length=4,
        description="Repeated stage propellant masses in kilograms, in ignition order.",
    ),
]
_STAGE_SPECIFIC_IMPULSES = Annotated[
    list[float],
    Query(
        min_length=1,
        max_length=4,
        description="Repeated stage specific impulses in seconds, in ignition order.",
    ),
]
_STAGE_THRUSTS = Annotated[
    list[float],
    Query(
        min_length=1,
        max_length=4,
        description="Repeated stage thrust values in newtons, in ignition order.",
    ),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="rocket_mission_designer.model_invalid",
        message="The Rocket/Mission Designer input is invalid.",
    )


def _result_response(
    result: RocketMissionDesignerResult,
) -> RocketMissionDesignerCalculationResponse:
    return RocketMissionDesignerCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=RocketMissionDesignerInputResponse(
            gravity_body=result.inputs.gravity_body,
            delta_v_reference_id=result.inputs.delta_v_reference_id,
            payload_mass_kg=result.inputs.payload_mass_kg,
            stages=[
                RocketStageInputResponse(
                    dry_mass_kg=stage.dry_mass_kg,
                    propellant_mass_kg=stage.propellant_mass_kg,
                    specific_impulse_s=stage.specific_impulse_s,
                    thrust_n=stage.thrust_n,
                )
                for stage in result.inputs.stages
            ],
        ),
        selected_surface_gravity_m_s2=result.selected_surface_gravity_m_s2,
        stages=[
            RocketStageResponse(
                index=stage.index,
                dry_mass_kg=stage.dry_mass_kg,
                propellant_mass_kg=stage.propellant_mass_kg,
                wet_mass_kg=stage.wet_mass_kg,
                specific_impulse_s=stage.specific_impulse_s,
                thrust_n=stage.thrust_n,
                ignition_mass_kg=stage.ignition_mass_kg,
                burnout_before_jettison_mass_kg=stage.burnout_before_jettison_mass_kg,
                mass_ratio=stage.mass_ratio,
                effective_exhaust_velocity_m_s=stage.effective_exhaust_velocity_m_s,
                ideal_delta_v_m_s=stage.ideal_delta_v_m_s,
                surface_gravity_thrust_to_weight=stage.surface_gravity_thrust_to_weight,
                stage_dry_fraction=stage.stage_dry_fraction,
                stage_propellant_fraction=stage.stage_propellant_fraction,
            )
            for stage in result.stages
        ],
        total_ideal_delta_v_m_s=result.total_ideal_delta_v_m_s,
        mass_fractions=VehicleMassFractionsResponse(
            launch_mass_kg=result.mass_fractions.launch_mass_kg,
            total_stage_dry_mass_kg=result.mass_fractions.total_stage_dry_mass_kg,
            total_propellant_mass_kg=result.mass_fractions.total_propellant_mass_kg,
            payload_mass_kg=result.mass_fractions.payload_mass_kg,
            stage_dry_fraction_of_launch_mass=(
                result.mass_fractions.stage_dry_fraction_of_launch_mass
            ),
            propellant_fraction_of_launch_mass=(
                result.mass_fractions.propellant_fraction_of_launch_mass
            ),
            payload_fraction_of_launch_mass=result.mass_fractions.payload_fraction_of_launch_mass,
        ),
        payload_tradeoff=[
            PayloadTradeoffPointResponse(
                payload_multiplier=point.payload_multiplier,
                payload_mass_kg=point.payload_mass_kg,
                total_ideal_delta_v_m_s=point.total_ideal_delta_v_m_s,
            )
            for point in result.payload_tradeoff
        ],
        reference_comparison=DeltaVReferenceComparisonResponse(
            reference_id=result.reference_comparison.reference_id,
            reference_kind=result.reference_comparison.reference_kind,
            label=result.reference_comparison.label,
            reference_value_m_s=result.reference_comparison.reference_value_m_s,
            ideal_delta_v_difference_m_s=result.reference_comparison.ideal_delta_v_difference_m_s,
            ideal_delta_v_to_reference_ratio=(
                result.reference_comparison.ideal_delta_v_to_reference_ratio
            ),
            interpretation=result.reference_comparison.interpretation,
        ),
        model_note=result.model_note,
    )


@router.get(
    "/rocket-mission-designer",
    response_model=RocketMissionDesignerCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_rocket_mission_designer",
)
async def rocket_mission_designer(
    request: Request,
    gravity_body: _GRAVITY_BODY,
    delta_v_reference_id: _DELTA_V_REFERENCE,
    payload_mass_kg: _PAYLOAD_MASS,
    stage_dry_mass_kg: _STAGE_DRY_MASSES,
    stage_propellant_mass_kg: _STAGE_PROPELLANT_MASSES,
    stage_specific_impulse_s: _STAGE_SPECIFIC_IMPULSES,
    stage_thrust_n: _STAGE_THRUSTS,
) -> RocketMissionDesignerCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _SCALAR_QUERY_KEYS
    ):
        return _invalid_model_response(request)
    lengths = {
        len(stage_dry_mass_kg),
        len(stage_propellant_mass_kg),
        len(stage_specific_impulse_s),
        len(stage_thrust_n),
    }
    if len(lengths) != 1:
        return _invalid_model_response(request)
    try:
        result = calculate_rocket_mission_designer(
            RocketMissionDesignerInput(
                gravity_body=gravity_body,
                delta_v_reference_id=delta_v_reference_id,
                payload_mass_kg=payload_mass_kg,
                stages=tuple(
                    RocketStageInput(
                        dry_mass_kg=dry,
                        propellant_mass_kg=propellant,
                        specific_impulse_s=specific_impulse,
                        thrust_n=thrust,
                    )
                    for dry, propellant, specific_impulse, thrust in zip(
                        stage_dry_mass_kg,
                        stage_propellant_mass_kg,
                        stage_specific_impulse_s,
                        stage_thrust_n,
                        strict=True,
                    )
                ),
            )
        )
    except RocketMissionDesignerModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
