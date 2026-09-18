"""Read-only HTTP translation for the Spectroscopy Lab v1 model."""

from __future__ import annotations

from typing import Annotated, Any, cast

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.spectroscopy_lab import (
    ElementId,
    SpectroscopyInput,
    SpectroscopyMode,
    SpectroscopyModelError,
    SpectroscopyResult,
    calculate_spectroscopy_lab,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .spectroscopy_lab_schemas import (
    SpectroscopyCalculationResponse,
    SpectroscopyElementFingerprintResponse,
    SpectroscopyInputResponse,
    SpectroscopyRepresentativeLineResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {"model": ErrorResponse, "description": "The Spectroscopy Lab input is invalid."},
}
_QUERY_KEYS = frozenset(
    {
        "mode",
        "temperature_k",
        "selected_elements",
        "radial_velocity_km_s",
        "resolving_power",
        "noise_sigma",
        "noise_seed",
    }
)
_MODE = Annotated[
    SpectroscopyMode,
    Query(description="continuum, emission, absorption, doppler, or element_match."),
]
_TEMPERATURE = Annotated[
    float,
    Query(description="Ideal blackbody teaching temperature in kelvin."),
]
_ELEMENTS = Annotated[
    str,
    Query(
        description=(
            "Comma-separated unique species from H I, He I, Na I, and Ca II; empty only for "
            "continuum mode."
        )
    ),
]
_RADIAL_VELOCITY = Annotated[
    float,
    Query(description="First-order radial velocity in km/s; positive is recession."),
]
_RESOLVING_POWER = Annotated[
    float,
    Query(description="Illustrative resolving power R=lambda/delta-lambda."),
]
_NOISE_SIGMA = Annotated[
    float,
    Query(description="Deterministic normalized display-noise sigma."),
]
_NOISE_SEED = Annotated[
    int,
    Query(description="Unsigned 32-bit deterministic display-noise seed."),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="spectroscopy_lab.model_invalid",
        message="The Spectroscopy Lab input is invalid.",
    )


def _parse_elements(value: str) -> tuple[ElementId, ...]:
    if value == "":
        return ()
    parts = tuple(value.split(","))
    if any(part == "" for part in parts):
        raise SpectroscopyModelError()
    return cast(tuple[ElementId, ...], parts)


def _result_response(result: SpectroscopyResult) -> SpectroscopyCalculationResponse:
    return SpectroscopyCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=SpectroscopyInputResponse(
            mode=result.inputs.mode,
            temperature_k=result.inputs.temperature_k,
            selected_elements=list(result.inputs.selected_elements),
            radial_velocity_km_s=result.inputs.radial_velocity_km_s,
            resolving_power=result.inputs.resolving_power,
            noise_sigma=result.inputs.noise_sigma,
            noise_seed=result.inputs.noise_seed,
        ),
        wien_peak_nm=result.wien_peak_nm,
        doppler_factor=result.doppler_factor,
        wavelength_nm=[point.wavelength_nm for point in result.spectrum],
        normalized_flux=[point.normalized_flux for point in result.spectrum],
        representative_lines=[
            SpectroscopyRepresentativeLineResponse(
                element=line.element,
                label=line.label,
                rest_wavelength_vacuum_nm=line.rest_wavelength_vacuum_nm,
                shifted_wavelength_vacuum_nm=line.shifted_wavelength_vacuum_nm,
                illustrative_fwhm_nm=line.illustrative_fwhm_nm,
                nist_relative_intensity=line.nist_relative_intensity,
            )
            for line in result.representative_lines
        ],
        fingerprints=[
            SpectroscopyElementFingerprintResponse(
                element=fingerprint.element,
                representative_line_count=fingerprint.representative_line_count,
            )
            for fingerprint in result.fingerprints
        ],
        identification_explanation=result.identification_explanation,
        continuum_note=result.continuum_note,
        line_strength_note=result.line_strength_note,
        resolution_note=result.resolution_note,
        noise_note=result.noise_note,
    )


@router.get(
    "/spectroscopy-lab",
    response_model=SpectroscopyCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_spectroscopy_lab",
)
async def spectroscopy_lab(
    request: Request,
    mode: _MODE,
    temperature_k: _TEMPERATURE,
    selected_elements: _ELEMENTS,
    radial_velocity_km_s: _RADIAL_VELOCITY,
    resolving_power: _RESOLVING_POWER,
    noise_sigma: _NOISE_SIGMA,
    noise_seed: _NOISE_SEED,
) -> SpectroscopyCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _QUERY_KEYS
    ):
        return _invalid_model_response(request)
    try:
        result = calculate_spectroscopy_lab(
            SpectroscopyInput(
                mode=mode,
                temperature_k=temperature_k,
                selected_elements=_parse_elements(selected_elements),
                radial_velocity_km_s=radial_velocity_km_s,
                resolving_power=resolving_power,
                noise_sigma=noise_sigma,
                noise_seed=noise_seed,
            )
        )
    except SpectroscopyModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
