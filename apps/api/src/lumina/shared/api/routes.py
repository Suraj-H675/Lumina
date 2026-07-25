"""Phase 0B1 HTTP translation for process and application metadata."""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict
from starlette.responses import JSONResponse

from lumina import __version__
from lumina.settings import AppSettings
from lumina.shared.api.errors import error_response
from lumina.shared.application.readiness import DatabaseReadinessService

router = APIRouter()


class LiveResponse(BaseModel):
    """Dependency-free process liveness."""

    model_config = ConfigDict(extra="forbid")

    status: str


class ReadyResponse(BaseModel):
    """Public dependency readiness."""

    model_config = ConfigDict(extra="forbid")

    status: str


class FeatureFlags(BaseModel):
    """Environment-safe public feature flags for the current phase."""

    model_config = ConfigDict(extra="forbid")


class MetaResponse(BaseModel):
    """Safe public application metadata."""

    model_config = ConfigDict(extra="forbid")

    application_name: str
    application_version: str
    api_version: str
    feature_flags: FeatureFlags
    build_commit: str | None


@router.get("/health/live", response_model=LiveResponse)
async def live() -> LiveResponse:
    """Report process liveness without checking external dependencies."""
    return LiveResponse(status="live")


@router.get("/health/ready", response_model=ReadyResponse)
async def ready(request: Request) -> ReadyResponse | JSONResponse:
    """Report whether the injected database probe can complete safely."""
    readiness_service: DatabaseReadinessService = request.app.state.readiness_service
    if await readiness_service.is_ready():
        return ReadyResponse(status="ready")
    return error_response(
        request,
        status_code=503,
        code="database.unavailable",
        message="The database is temporarily unavailable.",
    )


@router.get("/api/v1/meta", response_model=MetaResponse)
async def metadata(request: Request) -> MetaResponse:
    """Translate resolved application metadata into its public contract."""
    settings: AppSettings = request.app.state.settings
    return MetaResponse(
        application_name="Lumina",
        application_version=__version__,
        api_version="v1",
        feature_flags=FeatureFlags(),
        build_commit=settings.build_commit,
    )
