"""FastAPI composition root for the Phase 0B2 application."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException

from lumina import __version__
from lumina.catalog.api.routes import router as catalog_router
from lumina.catalog.application.read import CatalogReadService
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.settings import AppSettings
from lumina.shared.api.errors import (
    http_exception_handler,
    request_validation_exception_handler,
)
from lumina.shared.api.middleware import RequestContextMiddleware
from lumina.shared.api.routes import router
from lumina.shared.application.readiness import DatabaseReadinessService
from lumina.shared.infrastructure.database.probe import SqlAlchemyDatabaseProbe
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from lumina.shared.logging import configure_logging


def create_app(settings: AppSettings) -> FastAPI:
    """Compose the API without connecting to PostgreSQL during import or startup."""
    configure_logging(settings.log_level)
    database_runtime = create_database_runtime(settings.database_url)
    readiness_service = DatabaseReadinessService(SqlAlchemyDatabaseProbe(database_runtime.engine))
    catalog_read_repository = PostgreSqlCatalogReadRepository(database_runtime.session_factory)
    catalog_read_service = CatalogReadService(catalog_read_repository)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        try:
            yield
        finally:
            await database_runtime.engine.dispose()

    docs_enabled = settings.api_docs_enabled
    application = FastAPI(
        title="Lumina API",
        version=__version__,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
        lifespan=lifespan,
    )
    application.state.settings = settings
    application.state.database_runtime = database_runtime
    application.state.readiness_service = readiness_service
    application.state.catalog_read_service = catalog_read_service

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
    application.include_router(catalog_router)
    return application
