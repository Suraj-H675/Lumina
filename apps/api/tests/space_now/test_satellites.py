"""Phase 4D satellite cache, pass API, response bounds, and privacy contracts."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, replace
from datetime import UTC, datetime, timedelta
from typing import Any

import anyio
import httpx
import pytest
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.provenance.application.read import ProviderSnapshot, ProviderSnapshotReader
from lumina.provenance.composition import celestrak_runtime_config
from lumina.provenance.domain.celestrak import (
    CelestrakCodec,
    CelestrakNormalized,
    CelestrakSatellite,
)
from lumina.provenance.domain.runtime import (
    CELESTRAK_PROVIDER_CODE,
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderFailureCode,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.satellites.infrastructure.skyfield import SkyfieldSatellitePassEngine
from lumina.settings import AppSettings
from lumina.space_now.application.satellites import SatellitePassService, SatelliteReadService

_NOW = datetime(2026, 6, 19, 14, 0, tzinfo=UTC)


@dataclass
class _Clock:
    current: datetime = _NOW

    def now(self) -> datetime:
        return self.current


class _Reader(ProviderSnapshotReader):
    def __init__(self, snapshot: ProviderSnapshot | BaseException) -> None:
        self.snapshot = snapshot
        self.calls: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.calls.append(provider_code)
        if isinstance(self.snapshot, BaseException):
            raise self.snapshot
        return self.snapshot


def _iss(*, catalog_number: int = 25544) -> CelestrakSatellite:
    return CelestrakSatellite(
        catalog_number=catalog_number,
        object_name="ISS (ZARYA)",
        object_id="1998-067A",
        epoch_utc="2026-06-19T12:16:41.638656Z",
        mean_motion_rev_per_day=15.49315858,
        eccentricity=0.00045965,
        inclination_deg=51.6332,
        ra_of_asc_node_deg=288.5889,
        arg_of_pericenter_deg=205.0015,
        mean_anomaly_deg=155.0751,
        ephemeris_type=0,
        classification_type="U",
        element_set_number=999,
        revolution_at_epoch=57211,
        bstar=0.0001560528,
        mean_motion_dot=0.00008252,
        mean_motion_ddot=0.0,
        groups=("STATIONS", "VISUAL"),
    )


def _bright() -> CelestrakSatellite:
    return CelestrakSatellite(
        catalog_number=123456,
        object_name="FICTIONAL BRIGHT TEST SAT",
        object_id="2026-999A",
        epoch_utc="2026-06-19T12:00:00.000000Z",
        mean_motion_rev_per_day=14.8,
        eccentricity=0.0012,
        inclination_deg=53.0,
        ra_of_asc_node_deg=120.0,
        arg_of_pericenter_deg=45.0,
        mean_anomaly_deg=315.0,
        ephemeris_type=0,
        classification_type="U",
        element_set_number=1,
        revolution_at_epoch=100,
        bstar=0.00001,
        mean_motion_dot=0.000001,
        mean_motion_ddot=0.0,
        groups=("VISUAL",),
    )


def _cache(
    satellites: tuple[CelestrakSatellite, ...] = (_iss(), _bright()),
    *,
    fetched_at: datetime = _NOW,
) -> ProviderCacheEntry:
    ordered = tuple(sorted(satellites, key=lambda item: item.catalog_number))
    normalized = CelestrakNormalized(
        snapshot_latest_epoch_utc=max(ordered, key=lambda item: item.epoch_utc).epoch_utc,
        satellites=ordered,
    )
    return ProviderCacheEntry(
        provider_code=CELESTRAK_PROVIDER_CODE,
        cache_key="selected-satellites",
        normalized_payload=CelestrakCodec().encode(normalized),
        schema_version="celestrak-omm-json-v1",
        raw_sha256="d" * 64,
        fetched_at=fetched_at,
        fresh_until=fetched_at + timedelta(hours=3),
        stale_until=fetched_at + timedelta(hours=24),
    )


def _snapshot(
    *,
    enabled: bool = True,
    cache: ProviderCacheEntry | None = None,
    cache_state: CacheState = CacheState.MISSING,
    last_failure_code: ProviderFailureCode | None = None,
) -> ProviderSnapshot:
    config = celestrak_runtime_config()
    state = ProviderRuntimeState(
        provider_code=CELESTRAK_PROVIDER_CODE,
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
        last_sync_duration_ms=50,
        sync_lease_active=False,
        lease_expires_at=None,
        counters=RuntimeCounters(sync_successes=0 if cache is None else 1),
        updated_at=_NOW,
    )
    return ProviderSnapshot(
        config=config,
        payload_codec=CelestrakCodec(),
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


def _app(snapshot: ProviderSnapshot) -> FastAPI:
    reader = _Reader(snapshot)
    app = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test"
                ),
            }
        )
    )
    clock = _Clock()
    app.state.satellite_read_service = SatelliteReadService(reader, clock=clock)
    app.state.satellite_pass_service = SatellitePassService(
        reader,
        SkyfieldSatellitePassEngine(),
        clock=clock,
    )
    return app


def _get(app: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


def _post(app: FastAPI, path: str, payload: dict[str, Any]) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(path, json=payload)

    return anyio.run(send)


def _post_raw(
    app: FastAPI,
    path: str,
    body: bytes,
    *,
    content_length: int | None = None,
) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        headers = {"content-type": "application/json"}
        if content_length is not None:
            headers["content-length"] = str(content_length)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(path, content=body, headers=headers)

    return anyio.run(send)


def _post_chunked(app: FastAPI, path: str, chunks: tuple[bytes, ...]) -> httpx.Response:
    async def body_stream() -> AsyncIterator[bytes]:
        for chunk in chunks:
            yield chunk

    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post(
                path,
                content=body_stream(),
                headers={"content-type": "application/json"},
            )

    return anyio.run(send)


def _pass_payload(catalog_number: int = 25544) -> dict[str, Any]:
    return {
        "catalog_number": catalog_number,
        "observer": {
            "latitude_deg": 35.1234,
            "longitude_deg": -105.5678,
            "elevation_m": 1600.0,
        },
        "start_utc": "2026-06-19T12:00:00Z",
    }


@pytest.mark.asyncio
async def test_list_projection_preserves_groups_epoch_and_element_age() -> None:
    reader = _Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    projection = await SatelliteReadService(reader, clock=_Clock()).read()
    assert projection.availability == "fresh"
    assert projection.total_satellite_count == 2
    assert projection.satellites[0].catalog_number == 25544
    assert projection.satellites[0].groups == ("STATIONS", "VISUAL")
    assert projection.satellites[0].element_epoch_utc == datetime(
        2026, 6, 19, 12, 16, 41, 638656, tzinfo=UTC
    )
    assert projection.satellites[0].element_age_hours == pytest.approx(1.72176704)
    assert projection.satellites[0].stale_element_warning is False
    assert reader.calls == [CELESTRAK_PROVIDER_CODE]


def test_public_list_is_cache_only_bounded_and_attributed() -> None:
    response = _get(
        _app(_snapshot(cache=_cache(), cache_state=CacheState.FRESH)), "/api/v1/now/satellites"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "fresh"
    assert body["returned_satellite_count"] == 2
    assert body["satellites"][0]["name"] == "ISS (ZARYA)"
    assert body["source"]["name"] == "CelesTrak Current GP Data"
    assert len(response.content) <= 61_440


def test_pass_post_returns_local_prediction_without_echoing_private_coordinates() -> None:
    response = _post(
        _app(_snapshot(cache=_cache(), cache_state=CacheState.FRESH)),
        "/api/v1/now/satellites/passes",
        _pass_payload(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["satellite"]["catalog_number"] == 25544
    assert body["prediction"]["state"] == "available"
    assert len(body["prediction"]["passes"]) == 5
    assert body["prediction"]["algorithm"]["propagation_model"] == "SGP4"
    assert body["prediction"]["algorithm"]["gravity_model"] == "WGS72"
    assert body["prediction"]["passes"][0]["observer_sky_state_at_peak"] == "daylight"
    serialized = response.text
    assert "observer" not in body
    assert "35.1234" not in serialized
    assert "-105.5678" not in serialized
    assert len(response.content) <= 61_440


def test_large_valid_catalog_is_listed_but_pass_prediction_is_typed_refusal() -> None:
    large = replace(_bright(), catalog_number=340_000, object_name="LARGE ID TEST SAT")
    cache = _cache((_iss(), large))
    app = _app(_snapshot(cache=cache, cache_state=CacheState.FRESH))
    listing = _get(app, "/api/v1/now/satellites").json()
    item = next(value for value in listing["satellites"] if value["catalog_number"] == 340000)
    assert item["pass_prediction_runtime_supported"] is False

    response = _post(app, "/api/v1/now/satellites/passes", _pass_payload(340_000))
    assert response.status_code == 200
    body = response.json()
    assert body["prediction"]["state"] == "refused"
    assert body["prediction"]["refusal_reason"] == "catalog_number_unsupported_by_sgp4"
    assert body["prediction"]["passes"] == []


@pytest.mark.parametrize(
    ("enabled", "cache", "cache_state", "reason"),
    [
        (False, _cache(), CacheState.FRESH, "provider_disabled"),
        (True, None, CacheState.MISSING, "no_cached_content"),
        (True, _cache(), CacheState.EXPIRED, "cached_content_expired"),
    ],
)
def test_list_has_explicit_unavailable_states(
    enabled: bool,
    cache: ProviderCacheEntry | None,
    cache_state: CacheState,
    reason: str,
) -> None:
    response = _get(
        _app(_snapshot(enabled=enabled, cache=cache, cache_state=cache_state)),
        "/api/v1/now/satellites",
    )
    assert response.status_code == 200
    assert response.json()["unavailable_reason"] == reason


def test_invalid_private_location_and_unknown_satellite_fail_with_safe_envelopes() -> None:
    app = _app(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    invalid = _pass_payload()
    invalid["observer"] = {
        "latitude_deg": 120.123456,
        "longitude_deg": -105.5678,
        "elevation_m": 1600.0,
    }
    response = _post(app, "/api/v1/now/satellites/passes", invalid)
    assert response.status_code == 422
    text = response.text
    assert "120.123456" not in text
    assert "-105.5678" not in text

    missing = _post(app, "/api/v1/now/satellites/passes", _pass_payload(999_999))
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "now.satellite_not_found"


def test_pass_endpoint_refuses_when_provider_cache_is_expired() -> None:
    app = _app(_snapshot(cache=_cache(), cache_state=CacheState.EXPIRED))
    response = _post(app, "/api/v1/now/satellites/passes", _pass_payload())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "now.satellites_unavailable"


def test_pass_endpoint_rejects_declared_oversized_body_before_json_parsing() -> None:
    app = _app(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    sentinel = b"PRIVATE-OVERSIZED-COORDINATE-SENTINEL"
    body = b"{" + sentinel + b"x" * 5000 + b"}"

    response = _post_raw(
        app,
        "/api/v1/now/satellites/passes",
        body,
        content_length=len(body),
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request.body_too_large"
    assert response.json()["error"]["message"] == "The request body is too large."
    assert sentinel.decode() not in response.text


def test_pass_endpoint_rejects_chunked_body_when_stream_crosses_limit() -> None:
    app = _app(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))
    sentinel = b"PRIVATE-CHUNKED-COORDINATE-SENTINEL"

    response = _post_chunked(
        app,
        "/api/v1/now/satellites/passes",
        (b"{" + sentinel + b"x" * 3000, b"y" * 2000 + b"}"),
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request.body_too_large"
    assert sentinel.decode() not in response.text
