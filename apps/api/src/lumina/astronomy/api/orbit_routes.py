"""Read-only HTTP translation for the Orbit Sandbox domain model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.orbit_sandbox import (
    OrbitSandboxInput,
    OrbitSandboxModelError,
    OrbitSandboxResult,
    calculate_orbit_sandbox,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .orbit_schemas import (
    OrbitSandboxCalculationResponse,
    OrbitSandboxInputResponse,
    OrbitTrajectoryPointResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Orbit Sandbox inputs are invalid."},
}
_QUERY_KEYS = frozenset(
    {
        "central_mass_kg",
        "central_radius_m",
        "orbiting_body_mass_kg",
        "position_x_m",
        "position_y_m",
        "velocity_x_m_s",
        "velocity_y_m_s",
        "duration_s",
        "time_step_s",
    }
)
_ORBIT_FLOAT = Annotated[float, Query(description="Orbit Sandbox SI-unit model input.")]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="orbit_sandbox.model_invalid",
        message="The Orbit Sandbox inputs are invalid.",
    )


def _result_response(result: OrbitSandboxResult) -> OrbitSandboxCalculationResponse:
    return OrbitSandboxCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=OrbitSandboxInputResponse(
            central_mass_kg=result.inputs.central_mass_kg,
            central_radius_m=result.inputs.central_radius_m,
            orbiting_body_mass_kg=result.inputs.orbiting_body_mass_kg,
            position_x_m=result.inputs.position_x_m,
            position_y_m=result.inputs.position_y_m,
            velocity_x_m_s=result.inputs.velocity_x_m_s,
            velocity_y_m_s=result.inputs.velocity_y_m_s,
            duration_s=result.inputs.duration_s,
            time_step_s=result.inputs.time_step_s,
        ),
        gravitational_parameter_m3_s2=result.gravitational_parameter_m3_s2,
        reduced_mass_kg=result.reduced_mass_kg,
        specific_orbital_energy_j_per_kg=result.specific_orbital_energy_j_per_kg,
        orbital_energy_j=result.orbital_energy_j,
        specific_angular_momentum_m2_per_s=result.specific_angular_momentum_m2_per_s,
        angular_momentum_kg_m2_per_s=result.angular_momentum_kg_m2_per_s,
        eccentricity=result.eccentricity,
        semi_major_axis_m=result.semi_major_axis_m,
        period_s=result.period_s,
        periapsis_m=result.periapsis_m,
        apoapsis_m=result.apoapsis_m,
        classification=result.classification,
        collision_time_s=result.collision_time_s,
        trajectory=[
            OrbitTrajectoryPointResponse(
                time_s=point.time_s,
                x_m=point.x_m,
                y_m=point.y_m,
                distance_m=point.distance_m,
                speed_m_s=point.speed_m_s,
            )
            for point in result.trajectory
        ],
        max_specific_energy_drift_fraction=result.max_specific_energy_drift_fraction,
        max_specific_angular_momentum_drift_fraction=(
            result.max_specific_angular_momentum_drift_fraction
        ),
    )


@router.get(
    "/orbit-sandbox",
    response_model=OrbitSandboxCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_orbit_sandbox",
)
async def orbit_sandbox(
    request: Request,
    central_mass_kg: _ORBIT_FLOAT,
    central_radius_m: _ORBIT_FLOAT,
    orbiting_body_mass_kg: _ORBIT_FLOAT,
    position_x_m: _ORBIT_FLOAT,
    position_y_m: _ORBIT_FLOAT,
    velocity_x_m_s: _ORBIT_FLOAT,
    velocity_y_m_s: _ORBIT_FLOAT,
    duration_s: _ORBIT_FLOAT,
    time_step_s: _ORBIT_FLOAT,
) -> OrbitSandboxCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_orbit_sandbox(
            OrbitSandboxInput(
                central_mass_kg=central_mass_kg,
                central_radius_m=central_radius_m,
                orbiting_body_mass_kg=orbiting_body_mass_kg,
                position_x_m=position_x_m,
                position_y_m=position_y_m,
                velocity_x_m_s=velocity_x_m_s,
                velocity_y_m_s=velocity_y_m_s,
                duration_s=duration_s,
                time_step_s=time_step_s,
            )
        )
    except OrbitSandboxModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
