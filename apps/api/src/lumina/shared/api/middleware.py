"""Request context, access logging, and baseline response hardening."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from time import perf_counter
from uuid import UUID, uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from lumina.shared.api.errors import unhandled_exception_response
from lumina.shared.logging import bind_request_id, reset_request_id

_LOGGER = logging.getLogger("lumina.http")
_STRICT_CONTENT_SECURITY_POLICY = (
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
_DOCUMENTATION_CONTENT_SECURITY_POLICIES = {
    "/docs": (
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; "
        "script-src 'unsafe-inline' https://cdn.jsdelivr.net; "
        "style-src https://cdn.jsdelivr.net; img-src data: https://fastapi.tiangolo.com; "
        "font-src 'none'; connect-src 'self'"
    ),
    "/redoc": (
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; "
        "script-src https://cdn.jsdelivr.net; "
        "style-src 'unsafe-inline' https://fonts.googleapis.com; "
        "img-src data: https://fastapi.tiangolo.com; font-src https://fonts.gstatic.com; "
        "connect-src 'self'"
    ),
}
_SECURITY_HEADERS = {
    "Content-Security-Policy": _STRICT_CONTENT_SECURITY_POLICY,
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


def _resolve_request_id(header_value: str | None) -> str:
    if header_value is not None:
        try:
            return str(UUID(header_value))
        except (ValueError, AttributeError):
            pass
    return str(uuid4())


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    template = getattr(route, "path", None)
    return template if isinstance(template, str) else "<unmatched>"


def _content_security_policy(request: Request) -> str:
    """Return a documentation exception only for an enabled built-in docs route."""
    settings = request.app.state.settings
    if settings.api_docs_enabled:
        return _DOCUMENTATION_CONTENT_SECURITY_POLICIES.get(
            request.url.path,
            _STRICT_CONTENT_SECURITY_POLICY,
        )
    return _STRICT_CONTENT_SECURITY_POLICY


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assign request context and emit one safe structured HTTP access event."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = _resolve_request_id(request.headers.get("X-Request-ID"))
        request.state.request_id = request_id
        token = bind_request_id(request_id)
        started_at = perf_counter()

        try:
            try:
                response = await call_next(request)
            except Exception:
                response = await unhandled_exception_response(request)

            response.headers["X-Request-ID"] = request_id
            for name, value in _SECURITY_HEADERS.items():
                response.headers[name] = value
            response.headers["Content-Security-Policy"] = _content_security_policy(request)

            status = response.status_code
            error_code = getattr(request.state, "error_code", None)
            log_method = _LOGGER.info
            if status >= 500:
                log_method = _LOGGER.error
            elif status >= 400:
                log_method = _LOGGER.warning
            log_method(
                "http.request.completed",
                extra={
                    "request_id": request_id,
                    "route": _route_template(request),
                    "method": request.method,
                    "status": status,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 3),
                    "error_code": error_code,
                },
            )
            return response
        finally:
            reset_request_id(token)
