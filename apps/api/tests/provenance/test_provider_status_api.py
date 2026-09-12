"""Safe provider status API contracts without database or network access."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import anyio
import httpx
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.provenance.application.sync import ProviderRuntimeError
from lumina.provenance.composition import production_provider_registry
from lumina.provenance.domain.runtime import (
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.settings import AppSettings

_NOW = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test"
                ),
            }
        )
    )


def _request(app: FastAPI) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/api/v1/providers/status")

    return anyio.run(send)


def _snapshot(*, enabled: bool = False) -> ProviderStatusSnapshot:
    cache = ProviderCacheEntry(
        provider_code="nasa-exoplanet-archive",
        cache_key="confirmed-planet-count",
        normalized_payload={"confirmed_planet_count": 6360},
        schema_version="ps-confirmed-count-v1",
        raw_sha256="a" * 64,
        fetched_at=_NOW,
        fresh_until=_NOW + timedelta(hours=8),
        stale_until=_NOW + timedelta(hours=80),
    )
    state = ProviderRuntimeState(
        provider_code="nasa-exoplanet-archive",
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=_NOW + timedelta(hours=6),
        next_probe_at=None,
        last_attempt_at=_NOW,
        last_success_at=_NOW,
        last_failure_at=None,
        last_failure_code=None,
        last_http_status=None,
        last_sync_duration_ms=42,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(sync_successes=1, http_requests=1),
        updated_at=_NOW,
    )
    return ProviderStatusSnapshot(
        state=state,
        cache=cache,
        cache_state=CacheState.FRESH,
        quarantine_exists=False,
        quarantine_observed_at=None,
        quarantine_failure_code=None,
        quarantine_raw_sha256=None,
    )


def _apod_snapshot(*, enabled: bool = False) -> ProviderStatusSnapshot:
    state = ProviderRuntimeState(
        provider_code="nasa-apod",
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=None,
        next_probe_at=None,
        last_attempt_at=None,
        last_success_at=None,
        last_failure_at=None,
        last_failure_code=None,
        last_http_status=None,
        last_sync_duration_ms=None,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(),
        updated_at=_NOW,
    )
    return ProviderStatusSnapshot(
        state=state,
        cache=None,
        cache_state=CacheState.MISSING,
        quarantine_exists=False,
        quarantine_observed_at=None,
        quarantine_failure_code=None,
        quarantine_raw_sha256=None,
    )


def _neows_snapshot(*, enabled: bool = False) -> ProviderStatusSnapshot:
    state = ProviderRuntimeState(
        provider_code="nasa-neows",
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=None,
        next_probe_at=None,
        last_attempt_at=None,
        last_success_at=None,
        last_failure_at=None,
        last_failure_code=None,
        last_http_status=None,
        last_sync_duration_ms=None,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(),
        updated_at=_NOW,
    )
    return ProviderStatusSnapshot(
        state=state,
        cache=None,
        cache_state=CacheState.MISSING,
        quarantine_exists=False,
        quarantine_observed_at=None,
        quarantine_failure_code=None,
        quarantine_raw_sha256=None,
    )


class _StatusService:
    def __init__(self, value: ProviderStatusSnapshot | BaseException) -> None:
        self.value = value

    async def status(self, provider_code: str) -> ProviderStatusSnapshot:
        if isinstance(self.value, BaseException):
            raise self.value
        if provider_code == "nasa-exoplanet-archive":
            return self.value
        if provider_code == "nasa-apod":
            return _apod_snapshot()
        return _neows_snapshot()


def test_status_is_safe_and_does_not_expose_cached_payload_or_endpoint() -> None:
    app = _app()
    app.state.provider_registry = production_provider_registry()
    app.state.provider_sync_service = _StatusService(_snapshot(enabled=False))

    response = _request(app)

    assert response.status_code == 200
    body = response.json()
    assert len(body["providers"]) == 4
    assert {entry["provider_code"] for entry in body["providers"]} == {
        "nasa-exoplanet-archive",
        "nasa-apod",
        "nasa-neows",
        "noaa-swpc",
    }
    provider = next(
        entry for entry in body["providers"] if entry["provider_code"] == "nasa-exoplanet-archive"
    )
    assert provider["provider_code"] == "nasa-exoplanet-archive"
    assert provider["enabled"] is False
    assert provider["cache_state"] == "fresh"
    assert provider["cache_active"] is False
    assert provider["official_documentation_url"].endswith("/docs/TAP/usingTAP.html")
    assert provider["terms_or_licence_url"].endswith("/docs/acknowledge.html")
    assert "NASA Exoplanet Archive" in provider["attribution_text"]
    assert provider["metrics"]["sync_successes"] == 1
    serialized = response.text
    assert "confirmed_planet_count" not in serialized
    assert "6360" not in serialized
    assert "https://exoplanetarchive.ipac.caltech.edu/docs/" in serialized
    assert "select count" not in serialized.lower()
    apod = next(entry for entry in body["providers"] if entry["provider_code"] == "nasa-apod")
    assert apod["source_name"] == "NASA Astronomy Picture of the Day (APOD)"
    assert apod["enabled"] is False
    assert apod["cache_state"] == "missing"
    assert apod["official_documentation_url"] == "https://api.nasa.gov/"
    neows = next(entry for entry in body["providers"] if entry["provider_code"] == "nasa-neows")
    assert neows["source_name"] == "NASA Asteroids NeoWs"
    assert neows["enabled"] is False
    assert neows["cache_state"] == "missing"
    assert neows["official_documentation_url"] == "https://api.nasa.gov/"


def test_status_failure_is_safe_and_does_not_leak_exception_detail() -> None:
    app = _app()
    app.state.provider_registry = production_provider_registry()
    app.state.provider_sync_service = _StatusService(ProviderRuntimeError())

    response = _request(app)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "provider.status_unavailable"
    assert response.json()["error"]["message"] == "Provider status is temporarily unavailable."
    assert "Provider runtime failed" not in response.text
