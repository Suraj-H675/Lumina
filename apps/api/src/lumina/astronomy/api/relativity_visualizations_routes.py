"""Read-only HTTP translation for Relativity Visualizations v1."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.relativity_visualizations import (
    MAX_PROPER_LENGTH_M,
    MAX_PROPER_TIME_S,
    MAX_RELATIVE_SPEED_FRACTION_C,
    MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
    MIN_PROPER_LENGTH_M,
    MIN_PROPER_TIME_S,
    MIN_RELATIVE_SPEED_FRACTION_C,
    MIN_SIMULTANEOUS_EVENT_SEPARATION_M,
    RelativityVisualizationsInput,
    RelativityVisualizationsModelError,
    RelativityVisualizationsResult,
    calculate_relativity_visualizations,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .relativity_visualizations_schemas import (
    RelativityVisualizationsCalculationResponse,
    RelativityVisualizationsInputResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Relativity Visualizations input is invalid.",
    },
}
_QUERY_KEYS = frozenset(
    {
        "relative_speed_fraction_c",
        "proper_time_s",
        "proper_length_m",
        "simultaneous_event_separation_m",
    }
)

_BETA = Annotated[
    float,
    Query(
        ge=MIN_RELATIVE_SPEED_FRACTION_C,
        le=MAX_RELATIVE_SPEED_FRACTION_C,
        description="Relative speed beta=v/c for S' moving in +x relative to S; 0 through 0.99.",
    ),
]
_PROPER_TIME = Annotated[
    float,
    Query(
        ge=MIN_PROPER_TIME_S,
        le=MAX_PROPER_TIME_S,
        description="Proper-time interval in seconds; 1e-9 through 1e9.",
    ),
]
_PROPER_LENGTH = Annotated[
    float,
    Query(
        ge=MIN_PROPER_LENGTH_M,
        le=MAX_PROPER_LENGTH_M,
        description="Proper length in meters; 1e-6 through 1e15.",
    ),
]
_EVENT_SEPARATION = Annotated[
    float,
    Query(
        ge=MIN_SIMULTANEOUS_EVENT_SEPARATION_M,
        le=MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
        description=(
            "Non-negative +x separation in meters between events A and B that are simultaneous "
            "in S; 0 through 1e15."
        ),
    ),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="relativity_visualizations.model_invalid",
        message="The Relativity Visualizations input is invalid.",
    )


def _result_response(
    result: RelativityVisualizationsResult,
) -> RelativityVisualizationsCalculationResponse:
    return RelativityVisualizationsCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=RelativityVisualizationsInputResponse(
            relative_speed_fraction_c=result.inputs.relative_speed_fraction_c,
            proper_time_s=result.inputs.proper_time_s,
            proper_length_m=result.inputs.proper_length_m,
            simultaneous_event_separation_m=(result.inputs.simultaneous_event_separation_m),
        ),
        relative_speed_m_s=result.relative_speed_m_s,
        lorentz_factor=result.lorentz_factor,
        dilated_time_s=result.dilated_time_s,
        contracted_length_m=result.contracted_length_m,
        simultaneity_offset_s=result.simultaneity_offset_s,
        simultaneity_interpretation=result.simultaneity_interpretation,
        time_dilation_note=result.time_dilation_note,
        length_contraction_note=result.length_contraction_note,
        light_cone_note=result.light_cone_note,
        model_note=result.model_note,
    )


@router.get(
    "/relativity-visualizations",
    response_model=RelativityVisualizationsCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_relativity_visualizations",
)
async def relativity_visualizations(
    request: Request,
    relative_speed_fraction_c: _BETA,
    proper_time_s: _PROPER_TIME,
    proper_length_m: _PROPER_LENGTH,
    simultaneous_event_separation_m: _EVENT_SEPARATION,
) -> RelativityVisualizationsCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_relativity_visualizations(
            RelativityVisualizationsInput(
                relative_speed_fraction_c=relative_speed_fraction_c,
                proper_time_s=proper_time_s,
                proper_length_m=proper_length_m,
                simultaneous_event_separation_m=simultaneous_event_separation_m,
            )
        )
    except RelativityVisualizationsModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
