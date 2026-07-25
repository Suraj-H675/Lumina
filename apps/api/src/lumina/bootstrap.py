"""FastAPI composition root for the Phase 0B1 application."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException

from lumina import __version__
from lumina.settings import AppSettings
from lumina.shared.api.errors import (
    http_exception_handler,
    request_validation_exception_handler,
)
from lumina.shared.api.middleware import RequestContextMiddleware
from lumina.shared.api.routes import router
from lumina.shared.logging import configure_logging


def create_app(settings: AppSettings) -> FastAPI:
    """Compose a database-independent FastAPI application."""
    configure_logging(settings.log_level)
    docs_enabled = settings.api_docs_enabled
    application = FastAPI(
        title="Lumina API",
        version=__version__,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    application.state.settings = settings

    application.add_exception_handler(
        RequestValidationError,
        request_validation_exception_handler,
    )
    application.add_exception_handler(HTTPException, http_exception_handler)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    application.add_middleware(RequestContextMiddleware)
    application.include_router(router)
    return application
