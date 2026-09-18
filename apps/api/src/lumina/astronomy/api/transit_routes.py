"""Read-only HTTP translation for the Transit Method Lab domain model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.transit_method import (
    TransitMethodInput,
    TransitMethodModelError,
    TransitMethodResult,
    calculate_transit_method,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .transit_schemas import (
    TransitLightCurvePointResponse,
    TransitMethodCalculationResponse,
    TransitMethodInputResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Transit Method inputs are invalid."},
}
_QUERY_KEYS = frozenset(
    {
        "stellar_radius_m",
        "planet_radius_m",
        "semi_major_axis_m",
        "orbital_period_s",
        "inclination_deg",
    }
)
_TRANSIT_FLOAT = Annotated[float, Query(description="Transit Method SI-unit model input.")]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="transit_method.model_invalid",
        message="The Transit Method inputs are invalid.",
    )


def _result_response(result: TransitMethodResult) -> TransitMethodCalculationResponse:
    return TransitMethodCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=TransitMethodInputResponse(
            stellar_radius_m=result.inputs.stellar_radius_m,
            planet_radius_m=result.inputs.planet_radius_m,
            semi_major_axis_m=result.inputs.semi_major_axis_m,
            orbital_period_s=result.inputs.orbital_period_s,
            inclination_deg=result.inputs.inclination_deg,
        ),
        radius_ratio=result.radius_ratio,
        scaled_semi_major_axis=result.scaled_semi_major_axis,
        impact_parameter=result.impact_parameter,
        classification=result.classification,
        central_depth_approximation_fraction=result.central_depth_approximation_fraction,
        maximum_depth_fraction=result.maximum_depth_fraction,
        maximum_depth_ppm=result.maximum_depth_ppm,
        total_duration_s=result.total_duration_s,
        full_duration_s=result.full_duration_s,
        light_curve=[
            TransitLightCurvePointResponse(
                time_from_mid_transit_s=point.time_from_mid_transit_s,
                orbital_phase=point.orbital_phase,
                projected_separation_stellar_radii=(point.projected_separation_stellar_radii),
                relative_flux=point.relative_flux,
            )
            for point in result.light_curve
        ],
    )


@router.get(
    "/transit-method",
    response_model=TransitMethodCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_transit_method",
)
async def transit_method(
    request: Request,
    stellar_radius_m: _TRANSIT_FLOAT,
    planet_radius_m: _TRANSIT_FLOAT,
    semi_major_axis_m: _TRANSIT_FLOAT,
    orbital_period_s: _TRANSIT_FLOAT,
    inclination_deg: _TRANSIT_FLOAT,
) -> TransitMethodCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_transit_method(
            TransitMethodInput(
                stellar_radius_m=stellar_radius_m,
                planet_radius_m=planet_radius_m,
                semi_major_axis_m=semi_major_axis_m,
                orbital_period_s=orbital_period_s,
                inclination_deg=inclination_deg,
            )
        )
    except TransitMethodModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
