"""Read-only HTTP translation for the Impact Simulator v1 model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.impact_simulator import (
    MAX_DIAMETER_M,
    MAX_IMPACT_ANGLE_DEG,
    MAX_IMPACTOR_DENSITY_KG_M3,
    MAX_SPEED_KM_S,
    MIN_DIAMETER_M,
    MIN_IMPACT_ANGLE_DEG,
    MIN_IMPACTOR_DENSITY_KG_M3,
    MIN_SPEED_KM_S,
    CraterDimensions,
    ImpactSimulatorInput,
    ImpactSimulatorModelError,
    ImpactSimulatorResult,
    TargetMaterial,
    calculate_impact_simulator,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .impact_simulator_schemas import (
    CraterDimensionsResponse,
    EjectaThicknessRadiusResponse,
    ImpactSimulatorCalculationResponse,
    ImpactSimulatorInputResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Impact Simulator input is invalid.",
    },
}
_QUERY_KEYS = frozenset(
    {
        "diameter_m",
        "impactor_density_kg_m3",
        "speed_km_s",
        "impact_angle_deg",
        "target_material",
    }
)

_DIAMETER = Annotated[
    float,
    Query(
        ge=MIN_DIAMETER_M,
        le=MAX_DIAMETER_M,
        description="Synthetic spherical impactor diameter in metres; 1500 through 20000.",
    ),
]
_IMPACTOR_DENSITY = Annotated[
    float,
    Query(
        ge=MIN_IMPACTOR_DENSITY_KG_M3,
        le=MAX_IMPACTOR_DENSITY_KG_M3,
        description="Synthetic impactor bulk density in kg/m^3; 500 through 8000.",
    ),
]
_SPEED = Annotated[
    float,
    Query(
        ge=MIN_SPEED_KM_S,
        le=MAX_SPEED_KM_S,
        description="Pre-atmospheric impact speed in km/s; 11 through 72.",
    ),
]
_ANGLE = Annotated[
    float,
    Query(
        ge=MIN_IMPACT_ANGLE_DEG,
        le=MAX_IMPACT_ANGLE_DEG,
        description="Impact angle in degrees above the local horizontal; 15 through 90.",
    ),
]
_TARGET_MATERIAL = Annotated[
    TargetMaterial,
    Query(description="Closed solid-rock target preset: sedimentary_rock or crystalline_rock."),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="impact_simulator.model_invalid",
        message="The Impact Simulator input is invalid.",
    )


def _crater_response(result: CraterDimensions) -> CraterDimensionsResponse:
    if not isinstance(result, CraterDimensions):
        raise ImpactSimulatorModelError()
    return CraterDimensionsResponse(
        scaling_coefficient=result.scaling_coefficient,
        transient_diameter_m=result.transient_diameter_m,
        final_diameter_m=result.final_diameter_m,
        classification=result.classification,
    )


def _result_response(result: ImpactSimulatorResult) -> ImpactSimulatorCalculationResponse:
    return ImpactSimulatorCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=ImpactSimulatorInputResponse(
            diameter_m=result.inputs.diameter_m,
            impactor_density_kg_m3=result.inputs.impactor_density_kg_m3,
            speed_km_s=result.inputs.speed_km_s,
            impact_angle_deg=result.inputs.impact_angle_deg,
            target_material=result.inputs.target_material,
        ),
        target_density_kg_m3=result.target_density_kg_m3,
        impactor_mass_kg=result.impactor_mass_kg,
        kinetic_energy_j=result.kinetic_energy_j,
        tnt_equivalent_megatons=result.tnt_equivalent_megatons,
        best_estimate_crater=_crater_response(result.best_estimate_crater),
        coefficient_sensitivity=[_crater_response(row) for row in result.coefficient_sensitivity],
        ejecta_thickness_radii=[
            EjectaThicknessRadiusResponse(
                thickness_m=row.thickness_m,
                radius_m=row.radius_m,
            )
            for row in result.ejecta_thickness_radii
        ],
        uncertainty_note=result.uncertainty_note,
        model_note=result.model_note,
    )


@router.get(
    "/impact-simulator",
    response_model=ImpactSimulatorCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_impact_simulator",
)
async def impact_simulator(
    request: Request,
    diameter_m: _DIAMETER,
    impactor_density_kg_m3: _IMPACTOR_DENSITY,
    speed_km_s: _SPEED,
    impact_angle_deg: _ANGLE,
    target_material: _TARGET_MATERIAL,
) -> ImpactSimulatorCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_impact_simulator(
            ImpactSimulatorInput(
                diameter_m=diameter_m,
                impactor_density_kg_m3=impactor_density_kg_m3,
                speed_km_s=speed_km_s,
                impact_angle_deg=impact_angle_deg,
                target_material=target_material,
            )
        )
    except ImpactSimulatorModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
