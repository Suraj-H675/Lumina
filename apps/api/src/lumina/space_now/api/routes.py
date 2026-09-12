"""Read-only HTTP translation for the Space Now Daily Visual."""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from lumina.provenance.application.read import ProviderSnapshotReadError
from lumina.provenance.domain.runtime import ProviderStorageFailure
from lumina.shared.api.errors import ErrorResponse, error_response
from lumina.space_now.application.read import (
    ApodProjection,
    ApodReadService,
    NearEarthProjection,
    NearEarthReadService,
)

from .schemas import (
    ApodContentResponse,
    ApodFreshnessResponse,
    ApodResponse,
    ApodSourceResponse,
    NearEarthEncounterResponse,
    NearEarthFreshnessResponse,
    NearEarthResponse,
    NearEarthSourceResponse,
    NearEarthWindowResponse,
)

router = APIRouter(prefix="/api/v1/now", tags=["space-now"])
_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Daily Visual request must not contain query parameters.",
    },
    503: {
        "model": ErrorResponse,
        "description": "The Daily Visual read projection is temporarily unavailable.",
    },
}
_NEAR_EARTH_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Near-Earth Objects request must not contain query parameters.",
    },
    503: {
        "model": ErrorResponse,
        "description": "The Near-Earth Objects read projection is temporarily unavailable.",
    },
}


@router.get(
    "/apod",
    operation_id="get_now_apod",
    response_model=ApodResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def now_apod(request: Request) -> ApodResponse | JSONResponse:
    """Return the durable last-known-good APOD projection without fetching NASA."""
    if request.query_params:
        return error_response(
            request,
            status_code=422,
            code="request.validation_failed",
            message="The request could not be validated.",
        )
    service: ApodReadService = request.app.state.apod_read_service
    try:
        projection = await service.read()
    except (ProviderSnapshotReadError, ProviderStorageFailure):
        return error_response(
            request,
            status_code=503,
            code="now.apod_unavailable",
            message="The Daily Visual is temporarily unavailable.",
        )
    return _response(projection)


@router.get(
    "/near-earth",
    operation_id="get_now_near_earth",
    response_model=NearEarthResponse,
    responses=cast(Any, _NEAR_EARTH_ERROR_RESPONSES),
)
async def now_near_earth(request: Request) -> NearEarthResponse | JSONResponse:
    """Return the durable last-known-good NeoWs projection without fetching NASA."""
    if request.query_params:
        return error_response(
            request,
            status_code=422,
            code="request.validation_failed",
            message="The request could not be validated.",
        )
    service: NearEarthReadService = request.app.state.near_earth_read_service
    try:
        projection = await service.read()
    except (ProviderSnapshotReadError, ProviderStorageFailure):
        return error_response(
            request,
            status_code=503,
            code="now.near_earth_unavailable",
            message="Near-Earth approach data is temporarily unavailable.",
        )
    return _near_earth_response(projection)


def _response(projection: ApodProjection) -> ApodResponse:
    content = projection.content
    return ApodResponse(
        availability=projection.availability,
        unavailable_reason=projection.unavailable_reason,
        content=(
            None
            if content is None
            else ApodContentResponse(
                date=content.date,
                title=content.title,
                explanation=content.explanation,
                media_type=content.media_type,
                copyright=content.copyright,
                service_version=content.service_version,
                apod_page_url=content.apod_page_url,
            )
        ),
        freshness=ApodFreshnessResponse(
            cache_state=projection.freshness.cache_state,
            retrieved_at=projection.freshness.retrieved_at,
            fresh_until=projection.freshness.fresh_until,
            stale_until=projection.freshness.stale_until,
            last_refresh_failure_code=projection.freshness.last_refresh_failure_code,
        ),
        source=ApodSourceResponse(
            name=projection.source.name,
            official_url=projection.source.official_url,
            api_documentation_url=projection.source.api_documentation_url,
            media_usage_url=projection.source.media_usage_url,
            attribution_text=projection.source.attribution_text,
        ),
    )


def _near_earth_response(projection: NearEarthProjection) -> NearEarthResponse:
    return NearEarthResponse(
        availability=projection.availability,
        unavailable_reason=projection.unavailable_reason,
        window=(
            None
            if projection.window is None
            else NearEarthWindowResponse(
                start_date=projection.window.start_date,
                end_date=projection.window.end_date,
            )
        ),
        total_encounter_count=projection.total_encounter_count,
        returned_encounter_count=projection.returned_encounter_count,
        encounters=tuple(
            NearEarthEncounterResponse(
                encounter_id=encounter.encounter_id,
                object_id=encounter.object_id,
                neo_reference_id=encounter.neo_reference_id,
                name=encounter.name,
                approach_date=encounter.approach_date,
                approach_time_text=encounter.approach_time_text,
                absolute_magnitude_h=encounter.absolute_magnitude_h,
                nominal_distance_km=encounter.nominal_distance_km,
                nominal_distance_lunar=encounter.nominal_distance_lunar,
                relative_velocity_km_s=encounter.relative_velocity_km_s,
                estimated_diameter_min_m=encounter.estimated_diameter_min_m,
                estimated_diameter_max_m=encounter.estimated_diameter_max_m,
                is_potentially_hazardous_asteroid=encounter.is_potentially_hazardous_asteroid,
                distance_uncertainty_status=encounter.distance_uncertainty_status,
                time_uncertainty_status=encounter.time_uncertainty_status,
            )
            for encounter in projection.encounters
        ),
        freshness=NearEarthFreshnessResponse(
            cache_state=projection.freshness.cache_state,
            retrieved_at=projection.freshness.retrieved_at,
            fresh_until=projection.freshness.fresh_until,
            stale_until=projection.freshness.stale_until,
            last_refresh_failure_code=projection.freshness.last_refresh_failure_code,
        ),
        source=NearEarthSourceResponse(
            name=projection.source.name,
            official_documentation_url=projection.source.official_documentation_url,
            attribution_text=projection.source.attribution_text,
        ),
    )


__all__ = ["router"]
