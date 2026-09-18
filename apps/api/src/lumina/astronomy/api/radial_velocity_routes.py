"""Read-only HTTP translation for the Radial Velocity Lab domain model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.radial_velocity import (
    RadialVelocityInput,
    RadialVelocityModelError,
    RadialVelocityResult,
    calculate_radial_velocity,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .radial_velocity_schemas import (
    RadialVelocityCalculationResponse,
    RadialVelocityCurvePointResponse,
    RadialVelocityInputResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Radial Velocity inputs are invalid."},
}
_QUERY_KEYS = frozenset(
    {
        "stellar_mass_kg",
        "planet_mass_kg",
        "orbital_period_s",
        "eccentricity",
        "inclination_deg",
        "stellar_argument_of_periastron_deg",
        "mean_anomaly_at_epoch_deg",
    }
)
_RV_FLOAT = Annotated[float, Query(description="Radial Velocity SI-unit model input.")]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="radial_velocity.model_invalid",
        message="The Radial Velocity inputs are invalid.",
    )


def _result_response(result: RadialVelocityResult) -> RadialVelocityCalculationResponse:
    return RadialVelocityCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=RadialVelocityInputResponse(
            stellar_mass_kg=result.inputs.stellar_mass_kg,
            planet_mass_kg=result.inputs.planet_mass_kg,
            orbital_period_s=result.inputs.orbital_period_s,
            eccentricity=result.inputs.eccentricity,
            inclination_deg=result.inputs.inclination_deg,
            stellar_argument_of_periastron_deg=result.inputs.stellar_argument_of_periastron_deg,
            mean_anomaly_at_epoch_deg=result.inputs.mean_anomaly_at_epoch_deg,
        ),
        inclination_projection=result.inclination_projection,
        semi_amplitude_m_s=result.semi_amplitude_m_s,
        projected_planet_mass_kg=result.projected_planet_mass_kg,
        mass_function_kg=result.mass_function_kg,
        edge_on_minimum_mass_kg=result.edge_on_minimum_mass_kg,
        curve=[
            RadialVelocityCurvePointResponse(
                time_s=point.time_s,
                orbital_phase=point.orbital_phase,
                radial_velocity_m_s=point.radial_velocity_m_s,
            )
            for point in result.curve
        ],
    )


@router.get(
    "/radial-velocity",
    response_model=RadialVelocityCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_radial_velocity",
)
async def radial_velocity(
    request: Request,
    stellar_mass_kg: _RV_FLOAT,
    planet_mass_kg: _RV_FLOAT,
    orbital_period_s: _RV_FLOAT,
    eccentricity: _RV_FLOAT,
    inclination_deg: _RV_FLOAT,
    stellar_argument_of_periastron_deg: _RV_FLOAT,
    mean_anomaly_at_epoch_deg: _RV_FLOAT,
) -> RadialVelocityCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_radial_velocity(
            RadialVelocityInput(
                stellar_mass_kg=stellar_mass_kg,
                planet_mass_kg=planet_mass_kg,
                orbital_period_s=orbital_period_s,
                eccentricity=eccentricity,
                inclination_deg=inclination_deg,
                stellar_argument_of_periastron_deg=stellar_argument_of_periastron_deg,
                mean_anomaly_at_epoch_deg=mean_anomaly_at_epoch_deg,
            )
        )
    except RadialVelocityModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
