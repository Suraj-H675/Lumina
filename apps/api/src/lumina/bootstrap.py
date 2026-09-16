"""FastAPI composition root for the Phase 0B2 application."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException

from lumina import __version__
from lumina.astronomy.api.routes import router as astronomy_router
from lumina.astronomy.api.telescope_routes import router as telescope_router
from lumina.catalog.api.routes import router as catalog_router
from lumina.catalog.api.routes import search_router
from lumina.catalog.application.read import CatalogReadService
from lumina.catalog.application.search import CatalogSearchService
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.catalog.infrastructure.postgresql.search import PostgreSqlCatalogSearchRepository
from lumina.identification.api.routes import router as identification_router
from lumina.identification.application.public_read import IdentificationPublicReadService
from lumina.identification.application.submissions import (
    CreateSubmissionService,
    DeleteSubmissionService,
    StartRemoteIdentificationService,
    SubmitIdentificationService,
)
from lumina.identification.application.uploads import StoreValidatedUploadService
from lumina.identification.domain.uploads import UploadValidationPolicy
from lumina.identification.infrastructure.filesystem import FilesystemPrivateObjectStore
from lumina.identification.infrastructure.postgresql import (
    PostgreSqlIdentificationSubmissionRepository,
)
from lumina.identification.infrastructure.remote_postgresql import PostgreSqlRemoteSolveRepository
from lumina.identification.infrastructure.solution_postgresql import PostgreSqlSolutionRepository
from lumina.jobs.application.enqueue import EnqueueJobService
from lumina.jobs.infrastructure.postgresql.enqueue import PostgreSqlEnqueueJobStore
from lumina.provenance.api.routes import router as provider_router
from lumina.provenance.composition import compose_provider_runtime
from lumina.satellites.infrastructure.skyfield import SkyfieldSatellitePassEngine
from lumina.settings import AppSettings
from lumina.shared.api.errors import (
    http_exception_handler,
    request_validation_exception_handler,
)
from lumina.shared.api.middleware import BoundedRequestBodyMiddleware, RequestContextMiddleware
from lumina.shared.api.routes import router
from lumina.shared.application.readiness import DatabaseReadinessService
from lumina.shared.infrastructure.database.probe import SqlAlchemyDatabaseProbe
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from lumina.shared.logging import configure_logging
from lumina.space_now.api.routes import router as space_now_router
from lumina.space_now.application.launches import LaunchReadService
from lumina.space_now.application.read import (
    ApodReadService,
    NearEarthReadService,
    SpaceWeatherReadService,
)
from lumina.space_now.application.satellites import SatellitePassService, SatelliteReadService


def create_app(settings: AppSettings) -> FastAPI:
    """Compose the API without connecting to PostgreSQL during import or startup."""
    configure_logging(settings.log_level)
    database_runtime = create_database_runtime(settings.database_url)
    readiness_service = DatabaseReadinessService(SqlAlchemyDatabaseProbe(database_runtime.engine))
    catalog_read_repository = PostgreSqlCatalogReadRepository(database_runtime.session_factory)
    catalog_read_service = CatalogReadService(catalog_read_repository)
    catalog_search_repository = PostgreSqlCatalogSearchRepository(database_runtime.session_factory)
    catalog_search_service = CatalogSearchService(catalog_search_repository)
    provider_composition = compose_provider_runtime(
        database_runtime.session_factory,
        nasa_api_key=settings.nasa_api_key,
    )
    identification_store = FilesystemPrivateObjectStore(settings.storage_local_root)
    identification_repository = PostgreSqlIdentificationSubmissionRepository(
        database_runtime.session_factory,
        operation_wait_timeout_ms=settings.job_operation_wait_timeout_ms,
    )
    identification_solutions = PostgreSqlSolutionRepository(
        database_runtime.session_factory,
        operation_wait_timeout_ms=settings.job_operation_wait_timeout_ms,
    )
    identification_remote_state = PostgreSqlRemoteSolveRepository(
        database_runtime.session_factory,
        operation_wait_timeout_ms=settings.job_operation_wait_timeout_ms,
    )
    identification_uploads = StoreValidatedUploadService(
        identification_store,
        UploadValidationPolicy(
            max_bytes=settings.upload_max_bytes,
            max_pixels=settings.upload_max_pixels,
            min_dimension=32,
        ),
    )
    identification_create = CreateSubmissionService(
        identification_uploads,
        identification_repository,
        identification_store,
        now=lambda: datetime.now(UTC),
        provisional_retention=timedelta(hours=settings.upload_retention_hours),
    )
    identification_delete = DeleteSubmissionService(
        identification_repository,
        identification_store,
        now=lambda: datetime.now(UTC),
        solutions=identification_solutions,
    )
    identification_enqueue = EnqueueJobService(
        PostgreSqlEnqueueJobStore(
            database_runtime.session_factory,
            wait_timeout_ms=settings.job_enqueue_wait_timeout_ms,
        ),
        payload_max_bytes=settings.job_payload_max_bytes,
        default_max_attempts=settings.job_default_max_attempts,
    )
    identification_submit = SubmitIdentificationService(
        identification_create,
        identification_enqueue,
        identification_repository,
        identification_delete,
    )
    identification_remote_start = StartRemoteIdentificationService(
        identification_create,
        identification_remote_state,
        identification_delete,
        timeout_seconds=settings.astrometry_timeout_seconds,
    )
    identification_public_read = IdentificationPublicReadService(
        identification_repository,
        identification_remote_state,
        identification_solutions,
    )

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
    application.state.catalog_search_service = catalog_search_service
    application.state.provider_registry = provider_composition.registry
    application.state.provider_sync_service = provider_composition.sync_service
    application.state.apod_read_service = ApodReadService(provider_composition.snapshot_reader)
    application.state.near_earth_read_service = NearEarthReadService(
        provider_composition.snapshot_reader
    )
    application.state.space_weather_read_service = SpaceWeatherReadService(
        provider_composition.snapshot_reader
    )
    application.state.launch_read_service = LaunchReadService(provider_composition.snapshot_reader)
    application.state.satellite_read_service = SatelliteReadService(
        provider_composition.snapshot_reader
    )
    application.state.satellite_pass_service = SatellitePassService(
        provider_composition.snapshot_reader,
        SkyfieldSatellitePassEngine(),
    )
    application.state.identification_submit_service = identification_submit
    application.state.identification_remote_start_service = identification_remote_start
    application.state.identification_public_read_service = identification_public_read
    application.state.identification_delete_service = identification_delete

    application.add_exception_handler(
        RequestValidationError,
        request_validation_exception_handler,
    )
    application.add_exception_handler(HTTPException, http_exception_handler)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Accept", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )
    application.add_middleware(
        BoundedRequestBodyMiddleware,
        limits={
            ("POST", "/api/v1/now/satellites/passes"): 4_096,
            ("POST", "/api/v1/identification/submissions"): settings.upload_max_bytes + 65_536,
        },
    )
    application.add_middleware(RequestContextMiddleware)
    application.include_router(router)
    application.include_router(astronomy_router)
    application.include_router(telescope_router)
    application.include_router(catalog_router)
    application.include_router(search_router)
    application.include_router(provider_router)
    application.include_router(space_now_router)
    application.include_router(identification_router)
    return application
