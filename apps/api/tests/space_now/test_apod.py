"""Space Now APOD projection and public API contracts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Literal

import anyio
import httpx
import pytest
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.provenance.application.read import (
    ProviderSnapshot,
    ProviderSnapshotReader,
    ProviderSnapshotReadError,
)
from lumina.provenance.composition import nasa_apod_runtime_config
from lumina.provenance.domain.apod import NasaApodCodec, NasaApodNormalized
from lumina.provenance.domain.runtime import (
    APOD_PROVIDER_CODE,
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderFailureCode,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.settings import AppSettings
from lumina.space_now.application.read import ApodReadService

_NOW = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
_SOURCE_MEDIA_URL = "https://media.example.invalid/private-fixture.jpg"


class _Reader(ProviderSnapshotReader):
    def __init__(self, snapshot: ProviderSnapshot | BaseException) -> None:
        self.snapshot = snapshot
        self.calls: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.calls.append(provider_code)
        if isinstance(self.snapshot, BaseException):
            raise self.snapshot
        return self.snapshot


def _cache(
    *,
    date: str = "2026-09-09",
    fetched_at: datetime = _NOW,
    title: str = "Fixture APOD title",
    media_type: Literal["image", "video"] = "image",
    copyright: str | None = None,
) -> ProviderCacheEntry:
    normalized = NasaApodNormalized(
        date=date,
        title=title,
        explanation="NASA-supplied fixture explanation.",
        media_type=media_type,
        source_media_url=_SOURCE_MEDIA_URL,
        source_hd_media_url="https://media.example.invalid/private-fixture-hd.jpg",
        source_thumbnail_url="https://media.example.invalid/private-fixture-thumb.jpg",
        copyright=copyright,
        service_version="v1",
    )
    codec = NasaApodCodec()
    return ProviderCacheEntry(
        provider_code=APOD_PROVIDER_CODE,
        cache_key="daily-media",
        normalized_payload=codec.encode(normalized),
        schema_version="apod-v1-json-v1",
        raw_sha256="a" * 64,
        fetched_at=fetched_at,
        fresh_until=fetched_at + timedelta(hours=6),
        stale_until=fetched_at + timedelta(hours=78),
    )


def _snapshot(
    *,
    enabled: bool = True,
    cache: ProviderCacheEntry | None = None,
    cache_state: CacheState = CacheState.MISSING,
    last_failure_code: ProviderFailureCode | None = None,
) -> ProviderSnapshot:
    config = nasa_apod_runtime_config()
    state = ProviderRuntimeState(
        provider_code=APOD_PROVIDER_CODE,
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=_NOW + timedelta(hours=4),
        next_probe_at=None,
        last_attempt_at=_NOW,
        last_success_at=None if cache is None else cache.fetched_at,
        last_failure_at=None if last_failure_code is None else _NOW,
        last_failure_code=last_failure_code,
        last_http_status=None,
        last_sync_duration_ms=42,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(sync_successes=0 if cache is None else 1),
        updated_at=_NOW,
    )
    return ProviderSnapshot(
        config=config,
        payload_codec=NasaApodCodec(),
        status=ProviderStatusSnapshot(
            state=state,
            cache=cache,
            cache_state=cache_state,
            quarantine_exists=False,
            quarantine_observed_at=None,
            quarantine_failure_code=None,
            quarantine_raw_sha256=None,
        ),
    )


def _app(service: ApodReadService) -> FastAPI:
    application = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test"
                ),
            }
        )
    )
    application.state.apod_read_service = service
    return application


def _request(application: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


@pytest.mark.asyncio
async def test_projection_returns_fresh_content_without_raw_media_urls() -> None:
    reader = _Reader(
        _snapshot(
            cache=_cache(copyright="Fixture Creator"),
            cache_state=CacheState.FRESH,
        )
    )

    projection = await ApodReadService(reader).read()

    assert projection.availability == "fresh"
    assert projection.unavailable_reason is None
    assert projection.content is not None
    assert projection.content.date == "2026-09-09"
    assert projection.content.copyright == "Fixture Creator"
    assert projection.content.apod_page_url == "https://apod.nasa.gov/apod/ap260909.html"
    assert not hasattr(projection.content, "source_media_url")
    assert reader.calls == [APOD_PROVIDER_CODE]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("enabled", "cache", "cache_state", "reason"),
    [
        (False, _cache(), CacheState.FRESH, "provider_disabled"),
        (True, None, CacheState.MISSING, "no_cached_content"),
        (True, _cache(), CacheState.EXPIRED, "cached_content_expired"),
    ],
)
async def test_projection_has_explicit_unavailable_states(
    enabled: bool,
    cache: ProviderCacheEntry | None,
    cache_state: CacheState,
    reason: str,
) -> None:
    projection = await ApodReadService(
        _Reader(_snapshot(enabled=enabled, cache=cache, cache_state=cache_state))
    ).read()

    assert projection.availability == "unavailable"
    assert projection.unavailable_reason == reason
    assert projection.content is None
    if cache is not None:
        assert projection.freshness.retrieved_at == _NOW


@pytest.mark.asyncio
async def test_projection_keeps_stale_content_and_distinct_retrieval_timestamp() -> None:
    cache = _cache(fetched_at=_NOW - timedelta(hours=7))
    projection = await ApodReadService(
        _Reader(
            _snapshot(
                cache=cache,
                cache_state=CacheState.STALE,
                last_failure_code=ProviderFailureCode.TIMEOUT,
            )
        )
    ).read()

    assert projection.availability == "stale"
    assert projection.content is not None
    assert projection.content.date == "2026-09-09"
    assert projection.freshness.retrieved_at == _NOW - timedelta(hours=7)
    assert projection.freshness.fresh_until == _NOW - timedelta(hours=1)
    assert projection.freshness.stale_until == _NOW + timedelta(hours=71)
    assert projection.freshness.last_refresh_failure_code == "provider.timeout"


@pytest.mark.asyncio
async def test_projection_rejects_a_cache_identity_mismatch_at_the_product_boundary() -> None:
    cache = _cache()
    mismatched = ProviderCacheEntry(
        provider_code="nasa-exoplanet-archive",
        cache_key=cache.cache_key,
        normalized_payload=cache.normalized_payload,
        schema_version=cache.schema_version,
        raw_sha256=cache.raw_sha256,
        fetched_at=cache.fetched_at,
        fresh_until=cache.fresh_until,
        stale_until=cache.stale_until,
    )

    with pytest.raises(ProviderSnapshotReadError):
        await ApodReadService(
            _Reader(_snapshot(cache=mismatched, cache_state=CacheState.FRESH))
        ).read()


def test_public_apod_response_is_safe_and_read_only() -> None:
    cache = _cache(copyright="Fixture Creator")
    response = _request(
        _app(ApodReadService(_Reader(_snapshot(cache=cache, cache_state=CacheState.FRESH)))),
        "/api/v1/now/apod",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "fresh"
    assert body["content"] == {
        "date": "2026-09-09",
        "title": "Fixture APOD title",
        "explanation": "NASA-supplied fixture explanation.",
        "media_type": "image",
        "copyright": "Fixture Creator",
        "service_version": "v1",
        "apod_page_url": "https://apod.nasa.gov/apod/ap260909.html",
    }
    assert body["freshness"]["retrieved_at"] == "2026-09-10T12:00:00Z"
    assert body["source"]["name"] == "NASA Astronomy Picture of the Day (APOD)"
    assert body["source"]["official_url"] == "https://apod.nasa.gov/apod/"
    assert body["source"]["api_documentation_url"] == "https://api.nasa.gov/"
    assert body["source"]["media_usage_url"] == (
        "https://www.nasa.gov/nasa-brand-center/images-and-media/"
    )
    assert _SOURCE_MEDIA_URL not in response.text
    assert "source_media_url" not in response.text
    assert "api_key" not in response.text
    assert "raw_sha256" not in response.text


def test_public_apod_route_rejects_query_parameters_without_reading_provider_state() -> None:
    reader = _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    response = _request(_app(ApodReadService(reader)), "/api/v1/now/apod?date=2026-09-09")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"
    assert reader.calls == []


def test_public_apod_route_uses_the_standard_safe_error_for_read_failures() -> None:
    response = _request(
        _app(ApodReadService(_Reader(ProviderSnapshotReadError()))),
        "/api/v1/now/apod",
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "now.apod_unavailable"
    assert response.json()["error"]["message"] == "The Daily Visual is temporarily unavailable."
    assert "Provider snapshot" not in response.text
