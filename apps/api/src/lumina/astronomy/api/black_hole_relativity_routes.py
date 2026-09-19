"""Read-only HTTP translation for the Black-Hole / Relativity Lab v1 model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.black_hole_relativity import (
    MAX_MASS_NOMINAL_SOLAR,
    MAX_STATIC_OBSERVER_RADIUS_RS,
    MIN_MASS_NOMINAL_SOLAR,
    MIN_STATIC_OBSERVER_RADIUS_RS,
    BlackHoleRelativityInput,
    BlackHoleRelativityModelError,
    BlackHoleRelativityResult,
    SchwarzschildLandmark,
    calculate_black_hole_relativity,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .black_hole_relativity_schemas import (
    BlackHoleRelativityCalculationResponse,
    BlackHoleRelativityInputResponse,
    SchwarzschildLandmarkResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Black-Hole / Relativity Lab input is invalid.",
    },
}
_QUERY_KEYS = frozenset({"mass_nominal_solar", "static_observer_radius_rs"})

_MASS = Annotated[
    float,
    Query(
        ge=MIN_MASS_NOMINAL_SOLAR,
        le=MAX_MASS_NOMINAL_SOLAR,
        description=(
            "Synthetic black-hole mass scale in IAU nominal solar masses; 1 through 1e10."
        ),
    ),
]
_STATIC_RADIUS = Annotated[
    float,
    Query(
        ge=MIN_STATIC_OBSERVER_RADIUS_RS,
        le=MAX_STATIC_OBSERVER_RADIUS_RS,
        description=(
            "Hypothetical static-observer Schwarzschild areal radius in event-horizon "
            "radius multiples; 1.01 through 100."
        ),
    ),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="black_hole_relativity.model_invalid",
        message="The Black-Hole / Relativity Lab input is invalid.",
    )


def _landmark_response(
    landmark: SchwarzschildLandmark,
) -> SchwarzschildLandmarkResponse:
    return SchwarzschildLandmarkResponse(
        id=landmark.id,
        label=landmark.label,
        radius_rs=landmark.radius_rs,
        radius_m=landmark.radius_m,
        interpretation=landmark.interpretation,
    )


def _result_response(
    result: BlackHoleRelativityResult,
) -> BlackHoleRelativityCalculationResponse:
    return BlackHoleRelativityCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=BlackHoleRelativityInputResponse(
            mass_nominal_solar=result.inputs.mass_nominal_solar,
            static_observer_radius_rs=result.inputs.static_observer_radius_rs,
        ),
        gravitational_parameter_m3_s2=result.gravitational_parameter_m3_s2,
        schwarzschild_radius_m=result.schwarzschild_radius_m,
        landmarks=[_landmark_response(row) for row in result.landmarks],
        static_observer_areal_radius_m=result.static_observer_areal_radius_m,
        proper_time_rate_vs_infinity=result.proper_time_rate_vs_infinity,
        frequency_ratio_at_infinity=result.frequency_ratio_at_infinity,
        far_away_interval_per_local_interval=(result.far_away_interval_per_local_interval),
        gravitational_redshift_z=result.gravitational_redshift_z,
        observer_note=result.observer_note,
        model_note=result.model_note,
    )


@router.get(
    "/black-hole-relativity",
    response_model=BlackHoleRelativityCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_black_hole_relativity",
)
async def black_hole_relativity(
    request: Request,
    mass_nominal_solar: _MASS,
    static_observer_radius_rs: _STATIC_RADIUS,
) -> BlackHoleRelativityCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_black_hole_relativity(
            BlackHoleRelativityInput(
                mass_nominal_solar=mass_nominal_solar,
                static_observer_radius_rs=static_observer_radius_rs,
            )
        )
    except BlackHoleRelativityModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
