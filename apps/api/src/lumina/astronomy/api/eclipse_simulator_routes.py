"""Read-only HTTP translation for the Eclipse Simulator v1 model."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.eclipse_simulator import (
    EclipseSimulatorInput,
    EclipseSimulatorModelError,
    EclipseSimulatorResult,
    calculate_eclipse_simulator,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .eclipse_simulator_schemas import (
    EclipseInstantGeometryResponse,
    EclipseLocalEventResponse,
    EclipseSimulatorCalculationResponse,
    EclipseSimulatorInputResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Eclipse Simulator input is invalid."},
}
_QUERY_KEYS = frozenset({"at_utc", "latitude_deg", "longitude_deg", "elevation_m"})
_AT_UTC = Annotated[
    datetime,
    Query(description="Explicit UTC observer instant inside the reviewed offline v1 interval."),
]
_LATITUDE = Annotated[
    float,
    Query(description="WGS84 geodetic observer latitude in degrees."),
]
_LONGITUDE = Annotated[
    float,
    Query(description="WGS84 geodetic observer longitude in degrees, east-positive."),
]
_ELEVATION = Annotated[
    float,
    Query(description="Observer elevation above the WGS84 ellipsoid in metres."),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="eclipse_simulator.model_invalid",
        message="The Eclipse Simulator input is invalid.",
    )


def _result_response(result: EclipseSimulatorResult) -> EclipseSimulatorCalculationResponse:
    event = result.local_event
    return EclipseSimulatorCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=EclipseSimulatorInputResponse(
            at_utc=result.inputs.at_utc,
            latitude_deg=result.inputs.latitude_deg,
            longitude_deg=result.inputs.longitude_deg,
            elevation_m=result.inputs.elevation_m,
        ),
        instant=EclipseInstantGeometryResponse(
            phase=result.instant.phase,
            shadow_region=result.instant.shadow_region,
            sun_angular_radius_deg=result.instant.sun_angular_radius_deg,
            moon_angular_radius_deg=result.instant.moon_angular_radius_deg,
            center_separation_deg=result.instant.center_separation_deg,
            obscuration_fraction=result.instant.obscuration_fraction,
            sun_distance_km=result.instant.sun_distance_km,
            moon_distance_km=result.instant.moon_distance_km,
            sun_altitude_deg=result.instant.sun_altitude_deg,
            sun_above_geometric_horizon=result.instant.sun_above_geometric_horizon,
        ),
        local_event=(
            None
            if event is None
            else EclipseLocalEventResponse(
                classification=event.classification,
                partial_begin_utc=event.partial_begin_utc,
                central_begin_utc=event.central_begin_utc,
                maximum_utc=event.maximum_utc,
                central_end_utc=event.central_end_utc,
                partial_end_utc=event.partial_end_utc,
                maximum_obscuration_fraction=event.maximum_obscuration_fraction,
                sun_altitude_deg_at_maximum=event.sun_altitude_deg_at_maximum,
                sun_above_geometric_horizon_at_maximum=(
                    event.sun_above_geometric_horizon_at_maximum
                ),
            )
        ),
        ephemeris_note=result.ephemeris_note,
        timing_note=result.timing_note,
        safety_reference_id=result.safety_reference_id,
    )


@router.get(
    "/eclipse-simulator",
    response_model=EclipseSimulatorCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_eclipse_simulator",
)
async def eclipse_simulator(
    request: Request,
    at_utc: _AT_UTC,
    latitude_deg: _LATITUDE,
    longitude_deg: _LONGITUDE,
    elevation_m: _ELEVATION,
) -> EclipseSimulatorCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_eclipse_simulator(
            EclipseSimulatorInput(
                at_utc=at_utc,
                latitude_deg=latitude_deg,
                longitude_deg=longitude_deg,
                elevation_m=elevation_m,
            )
        )
    except EclipseSimulatorModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
