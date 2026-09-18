"""Read-only HTTP translation for the Planetary System Builder v1 model."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query, Request
from starlette.responses import JSONResponse

from lumina.astronomy.domain.planetary_system_builder import (
    PlanetarySystemBuilderInput,
    PlanetarySystemBuilderModelError,
    PlanetarySystemBuilderResult,
    PlanetarySystemPlanetInput,
    calculate_planetary_system_builder,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .planetary_system_builder_schemas import (
    PlanetarySystemAdjacentPairResponse,
    PlanetarySystemBuilderCalculationResponse,
    PlanetarySystemBuilderInputResponse,
    PlanetarySystemHabitableZoneResponse,
    PlanetarySystemPlanetInputResponse,
    PlanetarySystemPlanetResponse,
)

router = APIRouter(prefix="/api/v1/simulations", tags=["simulations"])

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Planetary System Builder input is invalid.",
    },
}
_SCALAR_QUERY_KEYS = frozenset(
    {
        "stellar_mass_msun",
        "stellar_luminosity_lsun",
        "stellar_effective_temperature_k",
    }
)
_REPEATED_QUERY_KEYS = frozenset({"planet_mass_mearth", "semi_major_axis_au"})
_QUERY_KEYS = _SCALAR_QUERY_KEYS | _REPEATED_QUERY_KEYS

_STELLAR_MASS = Annotated[
    float,
    Query(description="Stellar mass in nominal Solar masses; 0.1 through 2.0."),
]
_STELLAR_LUMINOSITY = Annotated[
    float,
    Query(description="Stellar luminosity in nominal Solar luminosities; 0.001 through 20."),
]
_STELLAR_EFFECTIVE_TEMPERATURE = Annotated[
    float,
    Query(description="Stellar effective temperature in kelvin; 2600 through 7200."),
]
_PLANET_MASSES = Annotated[
    list[float],
    Query(
        min_length=1,
        max_length=8,
        description=(
            "Repeated ordered planet masses in nominal terrestrial masses; one through eight."
        ),
    ),
]
_SEMI_MAJOR_AXES = Annotated[
    list[float],
    Query(
        min_length=1,
        max_length=8,
        description=(
            "Repeated ordered semimajor axes in AU; values must already be strictly increasing."
        ),
    ),
]


def _invalid_model_response(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="planetary_system_builder.model_invalid",
        message="The Planetary System Builder input is invalid.",
    )


def _result_response(
    result: PlanetarySystemBuilderResult,
) -> PlanetarySystemBuilderCalculationResponse:
    return PlanetarySystemBuilderCalculationResponse(
        model_version=result.model_version,
        schema_version=result.schema_version,
        inputs=PlanetarySystemBuilderInputResponse(
            stellar_mass_msun=result.inputs.stellar_mass_msun,
            stellar_luminosity_lsun=result.inputs.stellar_luminosity_lsun,
            stellar_effective_temperature_k=result.inputs.stellar_effective_temperature_k,
            planets=[
                PlanetarySystemPlanetInputResponse(
                    mass_mearth=planet.mass_mearth,
                    semi_major_axis_au=planet.semi_major_axis_au,
                )
                for planet in result.inputs.planets
            ],
        ),
        habitable_zone=PlanetarySystemHabitableZoneResponse(
            model_id=result.habitable_zone.model_id,
            inner_edge_au=result.habitable_zone.inner_edge_au,
            outer_edge_au=result.habitable_zone.outer_edge_au,
            inner_effective_flux=result.habitable_zone.inner_effective_flux,
            outer_effective_flux=result.habitable_zone.outer_effective_flux,
            habitability_note=result.habitable_zone.habitability_note,
        ),
        planets=[
            PlanetarySystemPlanetResponse(
                index=planet.index,
                mass_mearth=planet.mass_mearth,
                semi_major_axis_au=planet.semi_major_axis_au,
                orbital_period_s=planet.orbital_period_s,
                orbital_period_days=planet.orbital_period_days,
                habitable_zone_relation=planet.habitable_zone_relation,
            )
            for planet in result.planets
        ],
        adjacent_pairs=[
            PlanetarySystemAdjacentPairResponse(
                inner_index=pair.inner_index,
                outer_index=pair.outer_index,
                mutual_hill_radius_au=pair.mutual_hill_radius_au,
                separation_mutual_hill=pair.separation_mutual_hill,
                pairwise_reference_threshold=pair.pairwise_reference_threshold,
                spacing_assessment=pair.spacing_assessment,
                interpretation=pair.interpretation,
            )
            for pair in result.adjacent_pairs
        ],
        stellar_consistency_note=result.stellar_consistency_note,
        stability_note=result.stability_note,
    )


@router.get(
    "/planetary-system-builder",
    response_model=PlanetarySystemBuilderCalculationResponse,
    responses=_ERROR_RESPONSES,
    operation_id="calculate_planetary_system_builder",
)
async def planetary_system_builder(
    request: Request,
    stellar_mass_msun: _STELLAR_MASS,
    stellar_luminosity_lsun: _STELLAR_LUMINOSITY,
    stellar_effective_temperature_k: _STELLAR_EFFECTIVE_TEMPERATURE,
    planet_mass_mearth: _PLANET_MASSES,
    semi_major_axis_au: _SEMI_MAJOR_AXES,
) -> PlanetarySystemBuilderCalculationResponse | JSONResponse:
    if set(request.query_params) != _QUERY_KEYS or any(
        len(request.query_params.getlist(key)) != 1 for key in _SCALAR_QUERY_KEYS
    ):
        return _invalid_model_response(request)
    if len(planet_mass_mearth) != len(semi_major_axis_au):
        return _invalid_model_response(request)
    try:
        result = calculate_planetary_system_builder(
            PlanetarySystemBuilderInput(
                stellar_mass_msun=stellar_mass_msun,
                stellar_luminosity_lsun=stellar_luminosity_lsun,
                stellar_effective_temperature_k=stellar_effective_temperature_k,
                planets=tuple(
                    PlanetarySystemPlanetInput(mass_mearth=mass, semi_major_axis_au=axis)
                    for mass, axis in zip(
                        planet_mass_mearth,
                        semi_major_axis_au,
                        strict=True,
                    )
                ),
            )
        )
    except PlanetarySystemBuilderModelError:
        return _invalid_model_response(request)
    return _result_response(result)


__all__ = ["router"]
