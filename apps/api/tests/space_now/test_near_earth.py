"""Space Now Near-Earth Objects projection and cache-only API contracts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

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
from lumina.provenance.composition import nasa_neows_runtime_config
from lumina.provenance.domain.neows import NasaNeowsCodec, NasaNeowsEncounter, NasaNeowsNormalized
from lumina.provenance.domain.runtime import (
    NEOWS_PROVIDER_CODE,
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderFailureCode,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.settings import AppSettings
from lumina.space_now.application.read import NearEarthReadService

_NOW = datetime(2026, 9, 12, 12, 0, tzinfo=UTC)


class _Reader(ProviderSnapshotReader):
    def __init__(self, snapshot: ProviderSnapshot | BaseException) -> None:
        self.snapshot = snapshot
        self.calls: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.calls.append(provider_code)
        if isinstance(self.snapshot, BaseException):
            raise self.snapshot
        return self.snapshot


def _encounter(index: int, *, epoch: int | None = None) -> NasaNeowsEncounter:
    return NasaNeowsEncounter(
        neo_reference_id=str(3_000_000 + index),
        name=f"Fixture NEO {index}",
        approach_date="2026-09-12",
        approach_time_text=f"2026-Sep-12 {index % 24:02d}:00",
        provider_epoch_ms=str(epoch if epoch is not None else 1_800_000_000_000 + index),
        absolute_magnitude_h=20.0 + index / 100,
        nominal_distance_km=500_000.0 + index,
        nominal_distance_lunar=1.3 + index / 1_000,
        relative_velocity_km_s=12.0 + index / 100,
        estimated_diameter_min_m=10.0 + index / 10,
        estimated_diameter_max_m=20.0 + index / 10,
        is_potentially_hazardous_asteroid=index % 2 == 0,
    )


def _cache(
    *,
    fetched_at: datetime = _NOW,
    encounters: tuple[NasaNeowsEncounter, ...] = (_encounter(1), _encounter(2)),
) -> ProviderCacheEntry:
    normalized = NasaNeowsNormalized(
        window_start_date="2026-09-12",
        window_end_date="2026-09-18",
        encounters=encounters,
    )
    codec = NasaNeowsCodec()
    return ProviderCacheEntry(
        provider_code=NEOWS_PROVIDER_CODE,
        cache_key="earth-close-approaches",
        normalized_payload=codec.encode(normalized),
        schema_version="neows-feed-v1-json-v1",
        raw_sha256="b" * 64,
        fetched_at=fetched_at,
        fresh_until=fetched_at + timedelta(hours=3),
        stale_until=fetched_at + timedelta(hours=15),
    )


def _snapshot(
    *,
    enabled: bool = True,
    cache: ProviderCacheEntry | None = None,
    cache_state: CacheState = CacheState.MISSING,
    last_failure_code: ProviderFailureCode | None = None,
) -> ProviderSnapshot:
    config = nasa_neows_runtime_config()
    state = ProviderRuntimeState(
        provider_code=NEOWS_PROVIDER_CODE,
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=_NOW + timedelta(hours=2),
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
        payload_codec=NasaNeowsCodec(),
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


def _app(service: NearEarthReadService) -> FastAPI:
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
    application.state.near_earth_read_service = service
    return application


def _request(application: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


@pytest.mark.asyncio
async def test_projection_exposes_fresh_ordered_events_and_explicit_uncertainty_absence() -> None:
    reader = _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))

    projection = await NearEarthReadService(reader).read()

    assert projection.availability == "fresh"
    assert projection.window is not None
    assert projection.window.start_date == "2026-09-12"
    assert projection.window.end_date == "2026-09-18"
    assert projection.total_encounter_count == 2
    assert projection.returned_encounter_count == 2
    assert projection.encounters[0].encounter_id == "nasa-neows-3000001-2026-09-12"
    assert projection.encounters[0].distance_uncertainty_status == "not_provided_by_source"
    assert projection.encounters[0].time_uncertainty_status == "not_provided_by_source"
    assert projection.encounters[0].is_potentially_hazardous_asteroid is False
    assert reader.calls == [NEOWS_PROVIDER_CODE]


@pytest.mark.asyncio
async def test_projection_caps_only_public_output_and_reports_full_cached_count() -> None:
    encounters = tuple(_encounter(index) for index in range(33))
    reader = _Reader(_snapshot(cache=_cache(encounters=encounters), cache_state=CacheState.FRESH))

    projection = await NearEarthReadService(reader).read()

    assert projection.total_encounter_count == 33
    assert projection.returned_encounter_count == 32
    assert len(projection.encounters) == 32
    assert projection.encounters[-1].neo_reference_id == "3000031"
    decoded = NasaNeowsCodec().decode(_cache(encounters=encounters).normalized_payload)
    assert len(decoded.encounters) == 33


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
    projection = await NearEarthReadService(
        _Reader(_snapshot(enabled=enabled, cache=cache, cache_state=cache_state))
    ).read()

    assert projection.availability == "unavailable"
    assert projection.unavailable_reason == reason
    assert projection.encounters == ()
    assert projection.window is None


@pytest.mark.asyncio
async def test_projection_keeps_stale_events_and_retrieval_failure_separate() -> None:
    cache = _cache(fetched_at=_NOW - timedelta(hours=4))
    projection = await NearEarthReadService(
        _Reader(
            _snapshot(
                cache=cache,
                cache_state=CacheState.STALE,
                last_failure_code=ProviderFailureCode.TIMEOUT,
            )
        )
    ).read()

    assert projection.availability == "stale"
    assert projection.encounters[0].approach_date == "2026-09-12"
    assert projection.freshness.retrieved_at == _NOW - timedelta(hours=4)
    assert projection.freshness.fresh_until == _NOW - timedelta(hours=1)
    assert projection.freshness.stale_until == _NOW + timedelta(hours=11)
    assert projection.freshness.last_refresh_failure_code == "provider.timeout"


def test_public_near_earth_response_is_safe_and_cache_only() -> None:
    response = _request(
        _app(
            NearEarthReadService(_Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH)))
        ),
        "/api/v1/now/near-earth",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "fresh"
    assert body["window"] == {"start_date": "2026-09-12", "end_date": "2026-09-18"}
    assert body["total_encounter_count"] == 2
    assert body["returned_encounter_count"] == 2
    assert body["encounters"][0]["encounter_id"] == "nasa-neows-3000001-2026-09-12"
    assert body["encounters"][0]["distance_uncertainty_status"] == "not_provided_by_source"
    assert body["encounters"][0]["time_uncertainty_status"] == "not_provided_by_source"
    assert body["encounters"][0]["object_id"] == "nasa-neows-3000001"
    assert "is_sentry_object" not in response.text
    assert "orbit_class" not in response.text
    assert "api_key" not in response.text
    assert "nasa_jpl_url" not in response.text
    assert "raw_sha256" not in response.text


def test_public_near_earth_route_rejects_query_parameters_without_reading_state() -> None:
    reader = _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    response = _request(
        _app(NearEarthReadService(reader)),
        "/api/v1/now/near-earth?start_date=2026-09-12",
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"
    assert reader.calls == []


def test_public_near_earth_route_uses_the_standard_safe_error_for_read_failures() -> None:
    response = _request(
        _app(NearEarthReadService(_Reader(ProviderSnapshotReadError()))),
        "/api/v1/now/near-earth",
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "now.near_earth_unavailable"
    assert response.json()["error"]["message"] == (
        "Near-Earth approach data is temporarily unavailable."
    )
    assert "Provider snapshot" not in response.text
