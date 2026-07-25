"""Safe public API errors and exception normalization."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any
from uuid import uuid4

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from lumina.shared.logging import current_request_id

_SAFE_ERROR_CODE = re.compile(r"[a-z][a-z0-9_.]{0,63}")
_VALIDATION_LOCATIONS = frozenset({"body", "cookie", "header", "path", "query"})


class ErrorBody(BaseModel):
    """Stable public error fields."""

    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: dict[str, object] = Field(default_factory=dict)
    request_id: str


class ErrorResponse(BaseModel):
    """Top-level public error envelope."""

    model_config = ConfigDict(extra="forbid")

    error: ErrorBody


def error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    details: dict[str, object] | None = None,
) -> JSONResponse:
    """Build an error response without exposing exception or request data."""
    request_id = getattr(request.state, "request_id", None) or current_request_id() or str(uuid4())
    request.state.error_code = code
    payload = ErrorResponse(
        error=ErrorBody(
            code=code,
            message=message,
            details=details or {},
            request_id=request_id,
        )
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump(mode="json"))


def _safe_validation_fields(errors: Sequence[Any]) -> list[dict[str, object]]:
    fields: list[dict[str, object]] = []
    for error in errors:
        if not isinstance(error, dict):
            fields.append({"location": [], "code": "validation_error"})
            continue
        location: list[str] = []
        raw_location = error.get("loc")
        if isinstance(raw_location, (list, tuple)) and raw_location:
            source = raw_location[0]
            if isinstance(source, str) and source in _VALIDATION_LOCATIONS:
                location.append(source)

        raw_code = error.get("type")
        code = (
            raw_code
            if isinstance(raw_code, str) and _SAFE_ERROR_CODE.fullmatch(raw_code)
            else "validation_error"
        )
        fields.append({"location": location, "code": code})
    return fields


async def request_validation_exception_handler(
    request: Request,
    exception: Exception,
) -> JSONResponse:
    """Normalize Pydantic validation failures without raw values or messages."""
    if not isinstance(exception, RequestValidationError):
        return await unhandled_exception_response(request)
    return error_response(
        request,
        status_code=422,
        code="request.validation_failed",
        message="The request could not be validated.",
        details={"fields": _safe_validation_fields(exception.errors())},
    )


async def http_exception_handler(request: Request, exception: Exception) -> JSONResponse:
    """Normalize framework HTTP errors to stable, non-reflective messages."""
    if not isinstance(exception, HTTPException):
        return await unhandled_exception_response(request)
    messages = {
        400: ("request.invalid", "The request was invalid."),
        404: ("request.not_found", "The requested resource was not found."),
        405: ("request.method_not_allowed", "The request method is not allowed."),
    }
    code, message = messages.get(
        exception.status_code,
        ("request.failed", "The request could not be completed."),
    )
    return error_response(
        request,
        status_code=exception.status_code,
        code=code,
        message=message,
    )


async def unhandled_exception_response(request: Request) -> JSONResponse:
    """Return the generic public response for an unexpected server failure."""
    return error_response(
        request,
        status_code=500,
        code="server.internal_error",
        message="The request could not be completed.",
    )
