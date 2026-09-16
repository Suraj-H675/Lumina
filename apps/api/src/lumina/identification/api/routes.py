"""Privacy-minimal HTTP routes for Phase 6A fake identification."""

from __future__ import annotations

from typing import Annotated, Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, Request, UploadFile
from starlette.responses import JSONResponse, Response

from lumina.identification.application.public_read import IdentificationPublicReadService
from lumina.identification.application.submissions import (
    DeleteSubmissionService,
    SubmissionCleanupFailure,
    SubmitIdentificationService,
)
from lumina.identification.application.uploads import UploadStorageIntegrityError
from lumina.identification.domain.public_read import (
    IdentificationPublicReadFailure,
    IdentificationReadValidationError,
    IdentificationSolutionNotReady,
)
from lumina.identification.domain.remote_state import RemoteStateStorageFailure
from lumina.identification.domain.solution import SolutionStorageFailure
from lumina.identification.domain.storage import PrivateStorageError
from lumina.identification.domain.submissions import (
    SubmissionNotFound,
    SubmissionStateConflict,
    SubmissionStorageFailure,
    SubmissionValidationError,
)
from lumina.identification.domain.uploads import (
    UploadDimensionsRejected,
    UploadMalformed,
    UploadTooLarge,
    UploadTypeMismatch,
    UploadTypeUnsupported,
)
from lumina.jobs.domain.models import (
    JobDatabaseOperationFailure,
    JobDatabaseProgrammingFailure,
    JobDatabaseStateFailure,
    JobEnqueueContention,
    JobIdempotencyConflict,
    JobStorageUnavailable,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .schemas import (
    FakeSolverResultResponse,
    IdentificationAnnotationResponse,
    IdentificationCalibrationResponse,
    IdentificationCapabilitiesResponse,
    IdentificationCreateResponse,
    IdentificationSolutionResponse,
    IdentificationStatusResponse,
    IdentificationWcsResponse,
)

router = APIRouter(prefix="/api/v1/identification", tags=["identification"])
_CREATE_ERRORS: dict[int, dict[str, Any]] = {
    413: {"model": ErrorResponse, "description": "The upload exceeds the approved body bound."},
    415: {"model": ErrorResponse, "description": "The upload media type is not accepted."},
    422: {"model": ErrorResponse, "description": "The identification upload is invalid."},
    503: {"model": ErrorResponse, "description": "Identification is temporarily unavailable."},
}
_READ_ERRORS: dict[int, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "The submission does not exist."},
    422: {"model": ErrorResponse, "description": "The submission identifier is invalid."},
    503: {"model": ErrorResponse, "description": "Identification status is unavailable."},
}
_SOLUTION_ERRORS: dict[int, dict[str, Any]] = {
    404: {"model": ErrorResponse, "description": "The submission does not exist."},
    409: {"model": ErrorResponse, "description": "No normalized solution is available."},
    422: {"model": ErrorResponse, "description": "The solution request is invalid."},
    503: {"model": ErrorResponse, "description": "Identification solution is unavailable."},
}
_DELETE_ERRORS: dict[int, dict[str, Any]] = {
    409: {"model": ErrorResponse, "description": "The submission changed during deletion."},
    422: {"model": ErrorResponse, "description": "The submission identifier is invalid."},
    503: {"model": ErrorResponse, "description": "Identification deletion is unavailable."},
}
_JOB_ERRORS = (
    JobStorageUnavailable,
    JobEnqueueContention,
    JobDatabaseStateFailure,
    JobDatabaseProgrammingFailure,
    JobDatabaseOperationFailure,
    JobIdempotencyConflict,
)


@router.get(
    "/capabilities",
    operation_id="get_identification_capabilities",
    response_model=IdentificationCapabilitiesResponse,
)
async def get_identification_capabilities(
    request: Request,
) -> IdentificationCapabilitiesResponse | JSONResponse:
    """Expose only safe Phase 6A upload and retention policy facts."""
    if request.query_params:
        return _invalid(request)
    settings = request.app.state.settings
    return IdentificationCapabilitiesResponse(
        max_bytes=settings.upload_max_bytes,
        max_pixels=settings.upload_max_pixels,
        retention_hours=settings.upload_retention_hours,
    )


@router.post(
    "/submissions",
    operation_id="create_identification_submission",
    status_code=202,
    response_model=IdentificationCreateResponse,
    responses=cast(Any, _CREATE_ERRORS),
)
async def create_identification_submission(
    request: Request,
    file: Annotated[UploadFile, File()],
    consent_remote_processing: Annotated[bool, Form()] = False,
) -> IdentificationCreateResponse | JSONResponse:
    """Accept one bounded private raster and enqueue only the local fake solver."""
    if request.query_params:
        return _invalid(request)
    if consent_remote_processing:
        return error_response(
            request,
            status_code=422,
            code="feature.not_available",
            message="Remote image processing is not available.",
        )
    settings = request.app.state.settings
    try:
        content = await file.read(settings.upload_max_bytes + 1)
    except OSError:
        return _unavailable(request)
    finally:
        await file.close()
    if len(content) > settings.upload_max_bytes:
        return error_response(
            request,
            status_code=413,
            code="upload.too_large",
            message="The uploaded image is too large.",
        )

    service: SubmitIdentificationService = request.app.state.identification_submit_service
    try:
        submitted = await service.submit(
            content,
            original_filename=file.filename,
            declared_media_type=file.content_type,
        )
    except UploadTooLarge:
        return error_response(
            request,
            status_code=413,
            code="upload.too_large",
            message="The uploaded image is too large.",
        )
    except (UploadTypeUnsupported, UploadTypeMismatch):
        return error_response(
            request,
            status_code=415,
            code="upload.invalid_type",
            message="The uploaded image type is not supported.",
        )
    except (UploadMalformed, UploadDimensionsRejected, SubmissionValidationError):
        return _invalid(request)
    except SubmissionStateConflict:
        return _unavailable(request)
    except (
        SubmissionCleanupFailure,
        SubmissionStorageFailure,
        UploadStorageIntegrityError,
        PrivateStorageError,
        *_JOB_ERRORS,
    ):
        return _unavailable(request)

    return IdentificationCreateResponse(
        submission_id=submitted.submission_id,
        job_id=submitted.job_id,
        retention_hours=settings.upload_retention_hours,
    )


@router.get(
    "/submissions/{submission_id}",
    operation_id="get_identification_submission",
    response_model=IdentificationStatusResponse,
    responses=cast(Any, _READ_ERRORS),
)
async def get_identification_submission(
    request: Request,
    response: Response,
    submission_id: UUID,
) -> IdentificationStatusResponse | JSONResponse:
    """Return only safe lifecycle state and a validated synthetic result."""
    if request.query_params:
        return _invalid(request)
    service: IdentificationPublicReadService = request.app.state.identification_public_read_service
    try:
        status = await service.status(submission_id)
    except SubmissionNotFound:
        return error_response(
            request,
            status_code=404,
            code="identification.not_found",
            message="The identification submission was not found.",
        )
    except (
        IdentificationPublicReadFailure,
        RemoteStateStorageFailure,
        SubmissionStorageFailure,
        SolutionStorageFailure,
    ):
        return _unavailable(request)
    result = FakeSolverResultResponse() if status.fake_result is not None else None
    response.headers["Cache-Control"] = "private, no-store"
    return IdentificationStatusResponse(
        submission_id=status.submission_id,
        job_id=status.job_id,
        status=status.state,
        progress=status.progress,
        result=result,
        error_code=status.error_code,
        solution_available=status.solution_available,
        created_at=status.created_at,
        completed_at=status.completed_at,
        deleted_at=status.deleted_at,
        solver_type=status.solver_type.value,
        remote_processing=status.remote_processing,
        retention_hours=request.app.state.settings.upload_retention_hours,
    )


@router.get(
    "/submissions/{submission_id}/solution",
    operation_id="get_identification_solution",
    response_model=IdentificationSolutionResponse,
    responses=cast(Any, _SOLUTION_ERRORS),
)
async def get_identification_solution(
    request: Request,
    response: Response,
    submission_id: UUID,
    cursor: Annotated[
        str | None,
        Query(min_length=1, max_length=512, pattern=r"^[A-Za-z0-9_-]+$"),
    ] = None,
) -> IdentificationSolutionResponse | JSONResponse:
    """Return one bounded page of a stored normalized remote astrometric solution."""
    if (
        any(key != "cursor" for key in request.query_params)
        or len(request.query_params.getlist("cursor")) > 1
    ):
        return _invalid(request)
    service: IdentificationPublicReadService = request.app.state.identification_public_read_service
    try:
        page = await service.solution(submission_id, cursor=cursor)
    except SubmissionNotFound:
        return error_response(
            request,
            status_code=404,
            code="identification.not_found",
            message="The identification submission was not found.",
        )
    except IdentificationSolutionNotReady:
        return error_response(
            request,
            status_code=409,
            code="identification.solution_not_available",
            message="A normalized astrometric solution is not available for this submission.",
        )
    except IdentificationReadValidationError:
        return _invalid(request)
    except (
        IdentificationPublicReadFailure,
        RemoteStateStorageFailure,
        SubmissionStorageFailure,
        SolutionStorageFailure,
    ):
        return _unavailable(request)

    calibration = page.calibration
    wcs = page.wcs
    response.headers["Cache-Control"] = "private, no-store"
    return IdentificationSolutionResponse(
        submission_id=page.submission_id,
        solver_name="astrometry.net-nova",
        solver_version=page.solver_version,
        calibration=IdentificationCalibrationResponse(
            center_ra_deg=calibration.center_ra_deg,
            center_dec_deg=calibration.center_dec_deg,
            orientation_deg=calibration.orientation_deg,
            parity=cast(Literal[-1, 1], calibration.parity),
            pixel_scale_arcsec_per_pixel=calibration.pixel_scale_arcsec_per_pixel,
            radius_deg=calibration.radius_deg,
        ),
        wcs=IdentificationWcsResponse(
            coordinate_frame=wcs.frame.value,
            header=wcs.header_text,
            source_sha256=wcs.source_sha256,
            image_width=wcs.image_width,
            image_height=wcs.image_height,
        ),
        annotations=tuple(
            IdentificationAnnotationResponse(
                category=annotation.category,
                names=annotation.names,
                pixel_x=annotation.pixel_x,
                pixel_y=annotation.pixel_y,
                ra_deg=annotation.ra_deg,
                dec_deg=annotation.dec_deg,
            )
            for annotation in page.annotations
        ),
        next_cursor=page.next_cursor,
        has_more=page.has_more,
    )


@router.delete(
    "/submissions/{submission_id}",
    operation_id="delete_identification_submission",
    status_code=204,
    responses=cast(Any, _DELETE_ERRORS),
)
async def delete_identification_submission(request: Request, submission_id: UUID) -> Response:
    """Delete private bytes and scrub private metadata; repeat deletion is safe."""
    if request.query_params:
        return _invalid(request)
    service: DeleteSubmissionService = request.app.state.identification_delete_service
    try:
        await service.delete(submission_id)
    except SubmissionNotFound:
        return Response(status_code=204)
    except SubmissionStateConflict:
        return error_response(
            request,
            status_code=409,
            code="identification.state_conflict",
            message="The identification submission changed. Try again.",
        )
    except (SubmissionCleanupFailure, SubmissionStorageFailure, PrivateStorageError):
        return _unavailable(request)
    return Response(status_code=204)


def _invalid(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=422,
        code="request.validation_failed",
        message="The request could not be validated.",
    )


def _unavailable(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=503,
        code="identification.unavailable",
        message="Image identification is temporarily unavailable.",
    )


__all__ = ["router"]
