"""Read-only HTTP translation for the Stellar Laboratory v1 model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.stellar_laboratory import (
    StellarLaboratoryInput,
    StellarLaboratoryModelError,
    StellarLaboratoryResult,
    calculate_stellar_laboratory,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .stellar_laboratory_schemas import (
    StellarLaboratoryCalculationResponse,
    StellarLaboratoryInputResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Stellar Laboratory input is invalid."},
}
_QUERY_KEYS = frozenset({"initial_mass_msun"})
_STELLAR_MASS = Annotated[
    float,
    Query(description="Initial mass in nominal Solar-mass units for the reviewed v1 mapping."),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="stellar_laboratory.model_invalid",
        message="The Stellar Laboratory input is invalid.",
    )


def _result_response(result: StellarLaboratoryResult) -> StellarLaboratoryCalculationResponse:
    return StellarLaboratoryCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=StellarLaboratoryInputResponse(
            initial_mass_msun=result.inputs.initial_mass_msun,
        ),
        luminosity_lsun=result.luminosity_lsun,
        radius_rsun=result.radius_rsun,
        effective_temperature_k=result.effective_temperature_k,
        nearest_spectral_type_anchor=result.nearest_spectral_type_anchor,
        colour_anchor_mass_msun=result.colour_anchor_mass_msun,
        approximate_b_minus_v_mag=result.approximate_b_minus_v_mag,
        main_sequence_lifetime_years=result.main_sequence_lifetime_years,
        evolutionary_path=list(result.evolutionary_path),
        expected_remnant=result.expected_remnant,
        remnant_boundary_note=result.remnant_boundary_note,
        metallicity_scope=result.metallicity_scope,
    )


@router.get(
    "/stellar-laboratory",
    response_model=StellarLaboratoryCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_stellar_laboratory",
)
async def stellar_laboratory(
    request: Request,
    initial_mass_msun: _STELLAR_MASS,
) -> StellarLaboratoryCalculationResponse | JSONResponse:
    if (
        set(request.query_params) != _QUERY_KEYS
        or len(request.query_params.getlist("initial_mass_msun")) != 1
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_stellar_laboratory(
            StellarLaboratoryInput(initial_mass_msun=initial_mass_msun)
        )
    except StellarLaboratoryModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
