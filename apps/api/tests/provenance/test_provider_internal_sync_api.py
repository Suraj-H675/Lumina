"""Authenticated scheduler boundary for bounded production provider syncs."""

from __future__ import annotations

import httpx
from fakes.http import request_asgi
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.provenance.application.sync import ProviderSyncReport
from lumina.provenance.domain.runtime import ProviderSyncOutcome
from lumina.settings import AppSettings

_TOKEN = "a" * 64


class _SyncService:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def sync(self, provider_code: str) -> ProviderSyncReport:
        self.calls.append(provider_code)
        return ProviderSyncReport(
            provider_code=provider_code,
            outcome=ProviderSyncOutcome.SUCCESS,
            failure_code=None,
            attempts=1,
            retries=0,
            cache_state="fresh",
            stale_fallback=False,
            normalized_payload={"private": "must-not-escape"},
            raw_sha256="f" * 64,
        )


def _app(*, configured: bool = True) -> tuple[FastAPI, _SyncService]:
    values: dict[str, object] = {
        "LUMINA_ENV": "test",
        "LUMINA_DATABASE_URL": (
            "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test"
        ),
    }
    if configured:
        values["LUMINA_PROVIDER_TRIGGER_TOKEN"] = _TOKEN
    app = create_app(AppSettings.model_validate(values))
    service = _SyncService()
    app.state.provider_sync_service = service
    return app, service


def _request(
    app: FastAPI,
    *,
    token: str | None = _TOKEN,
    provider: str | None = "nasa-exoplanet-archive",
    content: bytes = b"",
) -> httpx.Response:
    headers = {}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if provider is not None:
        headers["X-Lumina-Provider-Code"] = provider
    return request_asgi(
        app,
        "POST",
        "/api/v1/providers/internal-sync",
        headers=headers,
        content=content,
    )


def test_scheduler_route_fails_closed_without_configured_or_valid_token() -> None:
    unconfigured, unconfigured_service = _app(configured=False)
    assert _request(unconfigured).status_code == 404
    assert unconfigured_service.calls == []

    app, service = _app()
    assert _request(app, token=None).status_code == 404
    assert _request(app, token="b" * 65).status_code == 404
    assert _request(app, token="b" * 64).status_code == 404
    assert service.calls == []


def test_scheduler_route_rejects_unknown_provider_and_body_before_sync() -> None:
    app, service = _app()
    assert _request(app, provider="unknown-provider").status_code == 422
    assert _request(app, content=b"x").status_code == 422
    assert service.calls == []


def test_scheduler_route_returns_only_safe_sync_metadata() -> None:
    app, service = _app()
    response = _request(app, provider="noaa-swpc")

    assert response.status_code == 200
    assert response.json() == {
        "provider_code": "noaa-swpc",
        "outcome": "success",
        "failure_code": None,
        "attempts": 1,
        "retries": 0,
        "cache_state": "fresh",
        "stale_fallback": False,
    }
    assert service.calls == ["noaa-swpc"]
    assert "private" not in response.text
    assert "f" * 64 not in response.text
    assert "/api/v1/providers/internal-sync" not in app.openapi()["paths"]
