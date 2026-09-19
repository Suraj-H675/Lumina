from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.bootstrap import create_app
from lumina.participate.api.routes import router
from lumina.participate.application.read import ParticipateReadService
from lumina.provenance.application.read import ProviderSnapshot
from lumina.provenance.composition import zooniverse_panoptes_runtime_config
from lumina.provenance.domain.citizen_science import (
    PANOPTES_PROJECT_IDENTITIES,
    PanoptesCodec,
    PanoptesNormalized,
    PanoptesProjectStatus,
    PanoptesSourceEvidence,
)
from lumina.provenance.domain.runtime import (
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.settings import AppSettings

_ROOT = Path(__file__).resolve().parents[5]
_NOW = datetime(2026, 9, 19, 8, 0, tzinfo=UTC)


def _app() -> FastAPI:
    app = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://participate_route:nonsecret@127.0.0.1:1/participate_route"
                ),
                "LUMINA_ENABLE_API_DOCS": False,
                "LUMINA_ENV": "test",
                "LUMINA_LOG_LEVEL": "CRITICAL",
            }
        )
    )
    app.state.participate_read_service = ParticipateReadService(_Reader(_snapshot()))
    return app


def _normalized() -> PanoptesNormalized:
    return PanoptesNormalized(
        projects=tuple(
            PanoptesProjectStatus(
                component_id=component_id,
                project_id=project_id,
                slug=slug,
                private=False,
                live=True,
                updated_at="2026-09-19T07:00:00Z",
            )
            for component_id, project_id, slug in PANOPTES_PROJECT_IDENTITIES
        ),
        source_evidence=tuple(
            PanoptesSourceEvidence(
                component_id=component_id,
                raw_sha256=f"{index:x}" * 64,
            )
            for index, (component_id, _project_id, _slug) in enumerate(PANOPTES_PROJECT_IDENTITIES)
        ),
    )


def _snapshot() -> ProviderSnapshot:
    config = zooniverse_panoptes_runtime_config(repository_root=_ROOT)
    normalized = _normalized()
    cache = ProviderCacheEntry(
        provider_code=config.provider_code,
        cache_key=config.cache_key,
        normalized_payload=PanoptesCodec().encode(normalized),
        schema_version=config.source_schema_version,
        raw_sha256="a" * 64,
        fetched_at=_NOW,
        fresh_until=_NOW + timedelta(hours=8),
        stale_until=_NOW + timedelta(hours=80),
    )
    state = ProviderRuntimeState(
        provider_code=config.provider_code,
        enabled=True,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=None,
        next_probe_at=None,
        last_attempt_at=_NOW,
        last_success_at=_NOW,
        last_failure_at=None,
        last_failure_code=None,
        last_http_status=200,
        last_sync_duration_ms=12,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(sync_cycles_started=1, sync_successes=1, http_requests=6),
        updated_at=_NOW,
    )
    return ProviderSnapshot(
        config=config,
        payload_codec=PanoptesCodec(),
        status=ProviderStatusSnapshot(
            state=state,
            cache=cache,
            cache_state=CacheState.FRESH,
            quarantine_exists=False,
            quarantine_observed_at=None,
            quarantine_failure_code=None,
            quarantine_raw_sha256=None,
        ),
    )


class _Reader:
    def __init__(self, snapshot: ProviderSnapshot) -> None:
        self.snapshot = snapshot

    async def read(self, provider_code: str) -> ProviderSnapshot:
        assert provider_code == "zooniverse-panoptes"
        return self.snapshot


def _request(app: FastAPI, path: str, *, method: str = "GET") -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path)

    return anyio.run(send)


def test_participate_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/participate"
    assert routes[0].methods == {"GET"}


def test_participate_returns_reviewed_content_and_current_status_within_normal_ceiling() -> None:
    response = _request(_app(), "/api/v1/participate")

    assert response.status_code == 200
    assert len(response.content) < 61_440
    payload = response.json()
    assert payload["model_version"] == "participate-v1"
    assert payload["schema_version"] == 1
    assert payload["freshness"]["availability"] == "fresh"
    assert payload["freshness"]["cache_state"] == "fresh"
    assert len(payload["projects"]) == 6
    assert all(project["status"] == "active" for project in payload["projects"])
    assert all(project["status_stale"] is False for project in payload["projects"])
    assert len(payload["challenges"]) == 12
    assert len(payload["activities"]) == 7
    assert len(payload["sources"]) == 19
    assert payload["activities"][0]["id"] == "paper-planisphere"
    assert payload["activities"][1]["id"] == "pinhole-projector"
    assert "Never look at the Sun through the pinhole." in payload["activities"][1]["safety"]
    assert payload["definition"]["external_handoff_notice"].startswith(
        "You are leaving Lumina for Zooniverse"
    )

    serialized = response.text
    for forbidden in (
        "classifications_count",
        "users_count",
        "provider-controlled",
        "workflow_description",
        "/talk",
    ):
        assert forbidden not in serialized


def test_participate_rejects_query_parameters_and_non_get_methods() -> None:
    app = _app()
    query = _request(app, "/api/v1/participate?location=somewhere")
    post = _request(app, "/api/v1/participate", method="POST")

    assert query.status_code == 422
    assert query.json()["error"]["code"] == "request.validation_failed"
    assert "somewhere" not in query.text
    assert post.status_code == 405
    assert post.json()["error"]["code"] == "request.method_not_allowed"


def test_participate_fails_closed_when_read_service_raises() -> None:
    class FailingService:
        async def read(self) -> object:
            from lumina.provenance.application.read import ProviderSnapshotReadError

            raise ProviderSnapshotReadError()

    app = _app()
    app.state.participate_read_service = FailingService()

    response = _request(app, "/api/v1/participate")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "participate.unavailable"
