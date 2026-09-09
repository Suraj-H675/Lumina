"""Read-only HTTP translation for Telescope Builder's domain model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.telescope_builder import (
    OpticalModifierKind,
    TelescopeBuilderInput,
    TelescopeBuilderModelError,
    TelescopeBuilderResult,
    TelescopeType,
    calculate_telescope_builder,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .telescope_schemas import TelescopeBuilderCalculationResponse, TelescopeBuilderInputResponse

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Telescope Builder inputs are invalid."},
}
_TELESCOPE_BUILDER_QUERY_KEYS = frozenset(
    {
        "aperture_mm",
        "telescope_focal_length_mm",
        "telescope_type",
        "eyepiece_focal_length_mm",
        "eyepiece_apparent_field_deg",
        "optical_modifier_kind",
        "optical_modifier_factor",
        "target_angular_size_arcmin",
    }
)
_APERTURE = Annotated[
    float,
    Query(description="Clear nominal aperture in millimetres, inclusive range 20 to 1000."),
]
_TELESCOPE_FOCAL_LENGTH = Annotated[
    float,
    Query(
        description="Native telescope focal length in millimetres, inclusive range 100 to 10000."
    ),
]
_TELESCOPE_TYPE = Annotated[
    TelescopeType,
    Query(description="Descriptive telescope type: refractor, reflector, or catadioptric."),
]
_EYEPIECE_FOCAL_LENGTH = Annotated[
    float,
    Query(description="Eyepiece focal length in millimetres, inclusive range 1 to 60."),
]
_EYEPIECE_APPARENT_FIELD = Annotated[
    float,
    Query(description="Nominal eyepiece apparent field in degrees, inclusive range 30 to 120."),
]
_MODIFIER_KIND = Annotated[
    OpticalModifierKind,
    Query(description="At most one idealized focal-length modifier."),
]
_MODIFIER_FACTOR = Annotated[
    float,
    Query(description="Effective focal-length multiplier for the selected modifier."),
]
_TARGET_SIZE = Annotated[
    float,
    Query(description="Scalar target angular extent in arcminutes, inclusive range 0.01 to 600."),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="telescope_builder.model_invalid",
        message="The Telescope Builder inputs are invalid.",
    )


def _result_response(result: TelescopeBuilderResult) -> TelescopeBuilderCalculationResponse:
    return TelescopeBuilderCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=TelescopeBuilderInputResponse(
            aperture_mm=result.inputs.aperture_mm,
            telescope_focal_length_mm=result.inputs.telescope_focal_length_mm,
            telescope_type=result.inputs.telescope_type,
            eyepiece_focal_length_mm=result.inputs.eyepiece_focal_length_mm,
            eyepiece_apparent_field_deg=result.inputs.eyepiece_apparent_field_deg,
            optical_modifier_kind=result.inputs.optical_modifier_kind,
            optical_modifier_factor=result.inputs.optical_modifier_factor,
            target_angular_size_arcmin=result.inputs.target_angular_size_arcmin,
        ),
        effective_focal_length_mm=result.effective_focal_length_mm,
        native_focal_ratio=result.native_focal_ratio,
        effective_focal_ratio=result.effective_focal_ratio,
        magnification_x=result.magnification_x,
        approx_true_field_deg=result.approx_true_field_deg,
        exit_pupil_mm=result.exit_pupil_mm,
        dawes_limit_arcsec=result.dawes_limit_arcsec,
        rayleigh_limit_arcsec=result.rayleigh_limit_arcsec,
        ideal_light_gathering_ratio_vs_7mm_pupil=result.ideal_light_gathering_ratio_vs_7mm_pupil,
        target_angular_size_deg=result.target_angular_size_deg,
        target_field_fraction=result.target_field_fraction,
        target_fit=result.target_fit,
        warning_codes=list(result.warning_codes),
    )


@router.get(
    "/telescope-builder",
    response_model=TelescopeBuilderCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_telescope_builder",
)
async def telescope_builder(
    request: Request,
    aperture_mm: _APERTURE,
    telescope_focal_length_mm: _TELESCOPE_FOCAL_LENGTH,
    telescope_type: _TELESCOPE_TYPE,
    eyepiece_focal_length_mm: _EYEPIECE_FOCAL_LENGTH,
    eyepiece_apparent_field_deg: _EYEPIECE_APPARENT_FIELD,
    optical_modifier_kind: _MODIFIER_KIND,
    optical_modifier_factor: _MODIFIER_FACTOR,
    target_angular_size_arcmin: _TARGET_SIZE,
) -> TelescopeBuilderCalculationResponse | JSONResponse:
    """Evaluate the read-only, versioned Telescope Builder model."""

    if set(request.query_params) != _TELESCOPE_BUILDER_QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _TELESCOPE_BUILDER_QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        inputs = TelescopeBuilderInput(
            aperture_mm=aperture_mm,
            telescope_focal_length_mm=telescope_focal_length_mm,
            telescope_type=telescope_type,
            eyepiece_focal_length_mm=eyepiece_focal_length_mm,
            eyepiece_apparent_field_deg=eyepiece_apparent_field_deg,
            optical_modifier_kind=optical_modifier_kind,
            optical_modifier_factor=optical_modifier_factor,
            target_angular_size_arcmin=target_angular_size_arcmin,
        )
        result = calculate_telescope_builder(inputs)
    except TelescopeBuilderModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
