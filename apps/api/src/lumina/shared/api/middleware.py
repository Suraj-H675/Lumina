"""Request context, access logging, and baseline response hardening."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from time import perf_counter
from uuid import UUID, uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from lumina.shared.api.errors import error_response, unhandled_exception_response
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


class BoundedRequestBodyMiddleware:
    """Bound selected request bodies before framework JSON parsing allocates them."""

    def __init__(
        self,
        app: ASGIApp,
        *,
        limits: dict[tuple[str, str], int],
    ) -> None:
        if not limits or any(limit < 1 for limit in limits.values()):
            raise ValueError("Request body limits must be positive")
        self._app = app
        self._limits = dict(limits)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        method = str(scope.get("method", ""))
        path = str(scope.get("path", ""))
        limit = self._limits.get((method, path))
        if limit is None:
            await self._app(scope, receive, send)
            return

        declared = _declared_content_length(scope)
        if declared is not None and declared > limit:
            await _send_body_too_large(scope, receive, send)
            return

        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                await _send_body_too_large(scope, receive, send)
                return
            chunk = message.get("body", b"")
            if not isinstance(chunk, bytes):
                await _send_body_too_large(scope, receive, send)
                return
            if len(chunk) > limit - len(body):
                await _send_body_too_large(scope, receive, send)
                return
            body.extend(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Message:
            nonlocal replayed
            if replayed:
                return {"type": "http.disconnect"}
            replayed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self._app(scope, replay, send)


def _declared_content_length(scope: Scope) -> int | None:
    values = [
        value for name, value in scope.get("headers", ()) if name.lower() == b"content-length"
    ]
    if not values:
        return None
    if len(values) != 1:
        return 2**63 - 1
    raw = values[0]
    if not raw.isdigit():
        return 2**63 - 1
    try:
        return int(raw)
    except ValueError:
        return 2**63 - 1


async def _send_body_too_large(scope: Scope, receive: Receive, send: Send) -> None:
    request = Request(scope, receive=receive)
    response = error_response(
        request,
        status_code=413,
        code="request.body_too_large",
        message="The request body is too large.",
    )
    await response(scope, receive, send)


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
