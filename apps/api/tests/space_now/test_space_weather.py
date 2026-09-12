"""Space Weather cache projection and public API contracts."""

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
from lumina.provenance.composition import noaa_swpc_runtime_config
from lumina.provenance.domain.runtime import (
    SWPC_PROVIDER_CODE,
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderFailureCode,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.provenance.domain.space_weather import (
    SwpcCodec,
    SwpcKpRow,
    SwpcNormalized,
    SwpcNotification,
    SwpcScales,
    SwpcScaleState,
    SwpcSolarWindField,
    SwpcSolarWindSpeed,
    SwpcSourceEvidence,
)
from lumina.settings import AppSettings
from lumina.space_now.api.routes import _SPACE_WEATHER_PUBLIC_RESPONSE_MAX_BYTES
from lumina.space_now.application.read import SpaceWeatherReadService

_ROOT = __import__("pathlib").Path(__file__).resolve().parents[4]
_NOW = datetime(2026, 9, 12, 7, 0, tzinfo=UTC)


class _Reader(ProviderSnapshotReader):
    def __init__(self, snapshot: ProviderSnapshot | BaseException) -> None:
        self.snapshot = snapshot
        self.calls: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.calls.append(provider_code)
        if isinstance(self.snapshot, BaseException):
            raise self.snapshot
        return self.snapshot


def _normalized() -> SwpcNormalized:
    return SwpcNormalized(
        scales=SwpcScales(
            date_text="2026-09-12",
            time_text="06:57:00",
            radio_blackout=SwpcScaleState(2, "moderate"),
            solar_radiation=SwpcScaleState(1, "minor"),
            geomagnetic=SwpcScaleState(3, "strong"),
        ),
        kp_rows=(
            SwpcKpRow("2026-09-12T00:00:00", 2.0, "observed", None),
            SwpcKpRow("2026-09-12T03:00:00", 2.67, "estimated", None),
            SwpcKpRow("2026-09-12T06:00:00", 4.5, "predicted", "G1"),
        ),
        solar_wind_speed=SwpcSolarWindSpeed("2026-09-12T06:52:00Z", 404.0),
        solar_wind_field=SwpcSolarWindField("2026-09-12T06:52:00Z", 6.0, -3.0),
        notifications=(
            SwpcNotification(
                "EF3A",
                "2026-09-12 06:45:35.603",
                "Plain provider text <script>alert(1)</script>",
            ),
        ),
        source_evidence=SwpcSourceEvidence(*("a" * 64 for _ in range(5))),
    )


def _cache(*, fetched_at: datetime = _NOW) -> ProviderCacheEntry:
    codec = SwpcCodec()
    return ProviderCacheEntry(
        provider_code=SWPC_PROVIDER_CODE,
        cache_key="space-weather-snapshot",
        normalized_payload=codec.encode(_normalized()),
        schema_version="swpc-space-weather-v1",
        raw_sha256="b" * 64,
        fetched_at=fetched_at,
        fresh_until=fetched_at + timedelta(minutes=10),
        stale_until=fetched_at + timedelta(minutes=60),
    )


def _snapshot(
    *,
    enabled: bool = True,
    cache: ProviderCacheEntry | None = None,
    cache_state: CacheState = CacheState.MISSING,
    last_failure_code: ProviderFailureCode | None = None,
) -> ProviderSnapshot:
    config = noaa_swpc_runtime_config(repository_root=_ROOT)
    state = ProviderRuntimeState(
        provider_code=SWPC_PROVIDER_CODE,
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=_NOW + timedelta(minutes=5),
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
        payload_codec=SwpcCodec(),
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


def _app(service: SpaceWeatherReadService) -> FastAPI:
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
    application.state.space_weather_read_service = service
    return application


def _request(application: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


@pytest.mark.asyncio
async def test_projection_keeps_scale_families_statuses_units_and_timestamps_distinct() -> None:
    reader = _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))

    projection = await SpaceWeatherReadService(reader).read()

    assert projection.availability == "fresh"
    assert projection.scales is not None
    assert projection.scales.radio_blackout.level == 2
    assert projection.scales.solar_radiation.level == 1
    assert projection.scales.geomagnetic.level == 3
    assert projection.latest_observed_kp is not None
    assert projection.latest_observed_kp.status == "observed"
    assert projection.latest_estimated_kp is not None
    assert projection.latest_estimated_kp.status == "estimated"
    assert projection.forecast_kp[0].status == "predicted"
    assert projection.solar_wind is not None
    assert projection.solar_wind.proton_speed_km_s == 404.0
    assert projection.solar_wind.bt_nt == 6.0
    assert projection.solar_wind.bz_gsm_nt == -3.0
    assert projection.aurora.mode == "official_link"
    assert "ovation" in projection.aurora.explanation.lower()
    assert reader.calls == [SWPC_PROVIDER_CODE]


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
    projection = await SpaceWeatherReadService(
        _Reader(_snapshot(enabled=enabled, cache=cache, cache_state=cache_state))
    ).read()

    assert projection.availability == "unavailable"
    assert projection.unavailable_reason == reason
    assert projection.scales is None
    assert projection.latest_notifications == ()
    assert projection.aurora.mode == "official_link"


def test_public_space_weather_response_is_cache_only_and_safe() -> None:
    response = _request(
        _app(
            SpaceWeatherReadService(
                _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
            )
        ),
        "/api/v1/now/space-weather",
    )

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "fresh"
    assert body["scales"]["radio_blackout"] == {"level": 2, "text": "moderate"}
    assert body["scales"]["solar_radiation"]["level"] == 1
    assert body["scales"]["geomagnetic"]["level"] == 3
    assert body["kp"]["latest_observed"]["status"] == "observed"
    assert body["kp"]["latest_estimated"]["status"] == "estimated"
    assert body["kp"]["forecast"][0]["status"] == "predicted"
    assert body["solar_wind"]["proton_speed_km_s"] == 404.0
    assert body["solar_wind"]["bt_nt"] == 6.0
    assert body["solar_wind"]["bz_gsm_nt"] == -3.0
    assert body["aurora"]["mode"] == "official_link"
    assert body["freshness"]["retrieved_at"] == "2026-09-12T07:00:00Z"
    assert "raw_sha256" not in response.text
    assert "services.swpc.noaa.gov/products" not in response.text


def test_public_space_weather_response_keeps_complete_notifications_within_transport_bound() -> (
    None
):
    normalized = _normalized()
    large_notifications = tuple(
        SwpcNotification(
            f"TEST{i}",
            f"2026-09-12 06:{i:02d}:00",
            "x" * 16_384,
        )
        for i in range(12)
    )
    large_cache = _cache(
        fetched_at=_NOW,
    )
    large_cache = ProviderCacheEntry(
        provider_code=large_cache.provider_code,
        cache_key=large_cache.cache_key,
        normalized_payload=SwpcCodec().encode(
            SwpcNormalized(
                scales=normalized.scales,
                kp_rows=normalized.kp_rows,
                solar_wind_speed=normalized.solar_wind_speed,
                solar_wind_field=normalized.solar_wind_field,
                notifications=large_notifications,
                source_evidence=normalized.source_evidence,
            )
        ),
        schema_version=large_cache.schema_version,
        raw_sha256=large_cache.raw_sha256,
        fetched_at=large_cache.fetched_at,
        fresh_until=large_cache.fresh_until,
        stale_until=large_cache.stale_until,
    )
    response = _request(
        _app(
            SpaceWeatherReadService(
                _Reader(_snapshot(cache=large_cache, cache_state=CacheState.FRESH))
            )
        ),
        "/api/v1/now/space-weather",
    )

    assert response.status_code == 200
    assert len(response.content) <= _SPACE_WEATHER_PUBLIC_RESPONSE_MAX_BYTES
    public_notifications = response.json()["latest_notifications"]
    assert 0 < len(public_notifications) < 12
    assert all(notification["message"] == "x" * 16_384 for notification in public_notifications)


def test_public_space_weather_route_rejects_query_parameters_without_reading_state() -> None:
    reader = _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    response = _request(
        _app(SpaceWeatherReadService(reader)),
        "/api/v1/now/space-weather?refresh=true",
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"
    assert reader.calls == []


def test_public_space_weather_route_uses_standard_safe_read_error() -> None:
    response = _request(
        _app(SpaceWeatherReadService(_Reader(ProviderSnapshotReadError()))),
        "/api/v1/now/space-weather",
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "now.space_weather_unavailable"
    assert response.json()["error"]["message"] == "Space Weather data is currently unavailable."
    assert "Provider snapshot" not in response.text
