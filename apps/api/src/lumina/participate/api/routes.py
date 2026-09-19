"""Read-only HTTP translation for Phase 8A Participate."""

from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any, Final, cast

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from lumina.participate.application.read import ParticipateReadService
from lumina.provenance.application.read import ProviderSnapshotReadError
from lumina.provenance.domain.runtime import ProviderStorageFailure
from lumina.shared.api.errors import ErrorResponse, error_response

from .schemas import ParticipateResponse

router = APIRouter(tags=["participate"])
_MAX_RESPONSE_BYTES: Final = 61_440
_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    422: {
        "model": ErrorResponse,
        "description": "The Participate request must not contain query parameters.",
    },
    503: {
        "model": ErrorResponse,
        "description": "Participate content is temporarily unavailable.",
    },
}


@router.get(
    "/api/v1/participate",
    operation_id="get_participate",
    response_model=ParticipateResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def participate(request: Request) -> ParticipateResponse | JSONResponse:
    """Return reviewed Participate content plus durable cached project status."""

    if request.query_params:
        return error_response(
            request,
            status_code=422,
            code="request.validation_failed",
            message="The request could not be validated.",
        )
    service: ParticipateReadService = request.app.state.participate_read_service
    try:
        projection = await service.read()
        response = ParticipateResponse.model_validate(asdict(projection))
    except (
        ProviderSnapshotReadError,
        ProviderStorageFailure,
        TypeError,
        ValueError,
    ):
        return error_response(
            request,
            status_code=503,
            code="participate.unavailable",
            message="Participate content is temporarily unavailable.",
        )
    serialized = json.dumps(
        response.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    if len(serialized) > _MAX_RESPONSE_BYTES:
        return error_response(
            request,
            status_code=503,
            code="participate.unavailable",
            message="Participate content is temporarily unavailable.",
        )
    return response


__all__ = ["router"]
