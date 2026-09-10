"""Read-only HTTP translation for the static provider runtime registry."""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Request
from starlette.responses import JSONResponse

from lumina.provenance.application.registry import StaticProviderRegistry
from lumina.provenance.application.sync import ProviderRuntimeError, ProviderSyncService
from lumina.provenance.domain.runtime import (
    ProviderRuntimeConfig,
    ProviderStatusSnapshot,
    ProviderStorageFailure,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .schemas import ProviderMetricsResponse, ProviderStatusListResponse, ProviderStatusResponse

router = APIRouter(prefix="/api/v1/providers", tags=["providers"])
_ERROR_RESPONSES: dict[int, dict[str, Any]] = {
    503: {
        "model": ErrorResponse,
        "description": "Provider operational status is temporarily unavailable.",
    },
}


@router.get(
    "/status",
    operation_id="list_provider_status",
    response_model=ProviderStatusListResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def provider_status(request: Request) -> ProviderStatusListResponse | JSONResponse:
    """Return safe state for every statically approved production provider."""
    registry: StaticProviderRegistry = request.app.state.provider_registry
    service: ProviderSyncService = request.app.state.provider_sync_service
    try:
        status_values: list[ProviderStatusResponse] = []
        for provider_code in sorted(registry.registered_codes):
            registration = registry.resolve(provider_code)
            if registration is None:
                return _unavailable(request)
            status_values.append(
                _status_response(registration.config, await service.status(provider_code))
            )
        statuses = tuple(status_values)
        if len(statuses) != len(registry.registered_codes):
            return _unavailable(request)
        return ProviderStatusListResponse(providers=statuses)
    except (ProviderRuntimeError, ProviderStorageFailure):
        return _unavailable(request)


def _unavailable(request: Request) -> JSONResponse:
    return error_response(
        request,
        status_code=503,
        code="provider.status_unavailable",
        message="Provider status is temporarily unavailable.",
    )


def _status_response(
    config: ProviderRuntimeConfig,
    snapshot: ProviderStatusSnapshot,
) -> ProviderStatusResponse:
    """Map the domain projection while deliberately omitting cached payload bytes."""
    cache = snapshot.cache
    counters = snapshot.state.counters
    return ProviderStatusResponse(
        provider_code=config.provider_code,
        source_name=config.source_manifest.source_name,
        official_documentation_url=str(config.source_manifest.official_documentation_url),
        terms_or_licence_url=str(config.source_manifest.terms_or_licence_url),
        attribution_text=config.source_manifest.attribution_text,
        adapter_id=config.adapter_id,
        adapter_version=config.adapter_version,
        source_schema_version=config.source_schema_version,
        enabled=snapshot.state.enabled,
        circuit_state=snapshot.state.circuit_state,
        cache_state=snapshot.cache_state,
        cache_active=snapshot.state.enabled and snapshot.cache_state.value in {"fresh", "stale"},
        sync_lease_active=snapshot.state.sync_lease_active,
        consecutive_failures=snapshot.state.consecutive_failures,
        last_attempt_at=snapshot.state.last_attempt_at,
        last_success_at=snapshot.state.last_success_at,
        last_failure_at=snapshot.state.last_failure_at,
        last_failure_code=snapshot.state.last_failure_code,
        last_http_status=snapshot.state.last_http_status,
        last_sync_duration_ms=snapshot.state.last_sync_duration_ms,
        next_sync_at=snapshot.state.next_sync_at,
        next_probe_at=snapshot.state.next_probe_at,
        cache_fetched_at=None if cache is None else cache.fetched_at,
        cache_fresh_until=None if cache is None else cache.fresh_until,
        cache_stale_until=None if cache is None else cache.stale_until,
        quarantine_exists=snapshot.quarantine_exists,
        quarantine_observed_at=snapshot.quarantine_observed_at,
        quarantine_failure_code=snapshot.quarantine_failure_code,
        quarantine_raw_sha256=snapshot.quarantine_raw_sha256,
        metrics=ProviderMetricsResponse(
            sync_cycles_started=counters.sync_cycles_started,
            sync_successes=counters.sync_successes,
            sync_upstream_failures=counters.sync_upstream_failures,
            http_requests=counters.http_requests,
            http_retries=counters.http_retries,
            schema_failures=counters.schema_failures,
            quarantines=counters.quarantines,
            stale_fallbacks=counters.stale_fallbacks,
            circuit_openings=counters.circuit_openings,
            disabled_skips=counters.disabled_skips,
            circuit_open_skips=counters.circuit_open_skips,
            concurrent_lease_skips=counters.concurrent_lease_skips,
        ),
    )


__all__ = ["router"]
