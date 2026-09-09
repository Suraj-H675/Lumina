"""Read-only HTTP translation for the Seasons Simulator domain model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.seasons_simulator import (
    SeasonsEccentricityPreset,
    SeasonsLatitudeGeometry,
    SeasonsModelError,
    SeasonsSimulatorInput,
    SeasonsSimulatorResult,
    calculate_seasons,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .schemas import (
    SeasonsCalculationResponse,
    SeasonsInputResponse,
    SeasonsLatitudeGeometryResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Seasons model inputs are invalid."},
}
_SEASONS_QUERY_KEYS = frozenset(
    {
        "axial_tilt_deg",
        "orbital_position_deg",
        "latitude_deg",
        "eccentricity_preset",
    }
)
_AXIAL_TILT = Annotated[
    float,
    Query(description="Axial tilt in degrees, inclusive range 0 to 90."),
]
_ORBITAL_POSITION = Annotated[
    float,
    Query(description="Idealized seasonal orbital position in degrees, range [0, 360)."),
]
_LATITUDE = Annotated[
    float,
    Query(description="Idealized geographic latitude in degrees, inclusive range -90 to 90."),
]
_ECCENTRICITY = Annotated[
    SeasonsEccentricityPreset,
    Query(description="Reviewed eccentricity context preset."),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="seasons.model_invalid",
        message="The Seasons Simulator inputs are invalid.",
    )


def _geometry_response(value: SeasonsLatitudeGeometry) -> SeasonsLatitudeGeometryResponse:
    geometry = value
    return SeasonsLatitudeGeometryResponse(
        latitude_deg=geometry.latitude_deg,
        noon_solar_zenith_deg=geometry.noon_solar_zenith_deg,
        noon_sun_altitude_deg=geometry.noon_sun_altitude_deg,
        illumination_incidence_deg=geometry.illumination_incidence_deg,
        day_length_hours=geometry.day_length_hours,
        polar_state=geometry.polar_state,
    )


def _result_response(result: SeasonsSimulatorResult) -> SeasonsCalculationResponse:
    return SeasonsCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=SeasonsInputResponse(
            axial_tilt_deg=result.inputs.axial_tilt_deg,
            orbital_position_deg=result.inputs.orbital_position_deg,
            latitude_deg=result.inputs.latitude_deg,
            eccentricity_preset=result.inputs.eccentricity_preset,
        ),
        solar_declination_deg=result.solar_declination_deg,
        selected=_geometry_response(result.selected),
        comparison_latitude_deg=result.comparison_latitude_deg,
        opposite_hemisphere=_geometry_response(result.opposite_hemisphere),
        eccentricity=result.eccentricity,
        distance_over_semimajor_axis=result.distance_over_semimajor_axis,
        relative_solar_flux=result.relative_solar_flux,
    )


@router.get(
    "/seasons",
    response_model=SeasonsCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_seasons_simulator",
)
async def seasons(
    request: Request,
    axial_tilt_deg: _AXIAL_TILT,
    orbital_position_deg: _ORBITAL_POSITION,
    latitude_deg: _LATITUDE,
    eccentricity_preset: _ECCENTRICITY,
) -> SeasonsCalculationResponse | JSONResponse:
    """Evaluate the read-only, versioned Seasons Simulator model."""

    if set(request.query_params) != _SEASONS_QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _SEASONS_QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        inputs = SeasonsSimulatorInput(
            axial_tilt_deg=axial_tilt_deg,
            orbital_position_deg=orbital_position_deg,
            latitude_deg=latitude_deg,
            eccentricity_preset=eccentricity_preset,
        )
        result = calculate_seasons(inputs)
    except SeasonsModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
