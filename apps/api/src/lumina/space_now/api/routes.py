"""Read-only HTTP translation for the Space Now Daily Visual."""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from lumina.provenance.application.read import ProviderSnapshotReadError
from lumina.provenance.domain.runtime import ProviderStorageFailure
from lumina.shared.api.errors import ErrorResponse, error_response
from lumina.space_now.application.read import ApodProjection, ApodReadService

from .schemas import (
    ApodContentResponse,
    ApodFreshnessResponse,
    ApodResponse,
    ApodSourceResponse,
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


__all__ = ["router"]
