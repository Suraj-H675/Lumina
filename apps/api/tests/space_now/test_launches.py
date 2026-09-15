"""Launch Center projection and cache-only API contracts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import anyio
import httpx
import pytest
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.provenance.application.read import ProviderSnapshot, ProviderSnapshotReader
from lumina.provenance.composition import launch_library_runtime_config
from lumina.provenance.domain.launch_library import (
    Ll2Agency,
    Ll2Codec,
    Ll2Launch,
    Ll2Mission,
    Ll2Normalized,
    Ll2Precision,
    Ll2Site,
    Ll2Status,
    Ll2Vehicle,
)
from lumina.provenance.domain.runtime import (
    LL2_PROVIDER_CODE,
    CacheState,
    CircuitState,
    ProviderCacheEntry,
    ProviderFailureCode,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    RuntimeCounters,
)
from lumina.settings import AppSettings
from lumina.space_now.application.launches import LaunchReadService

_NOW = datetime(2026, 9, 15, 0, 0, tzinfo=UTC)


class _Reader(ProviderSnapshotReader):
    def __init__(self, snapshot: ProviderSnapshot | BaseException) -> None:
        self.snapshot = snapshot
        self.calls: list[str] = []

    async def read(self, provider_code: str) -> ProviderSnapshot:
        self.calls.append(provider_code)
        if isinstance(self.snapshot, BaseException):
            raise self.snapshot
        return self.snapshot


def _launch(
    index: int,
    *,
    status: Ll2Status | None = None,
    precision: Ll2Precision | None = None,
    description: str | None = "Source-provided fixture mission description.",
) -> Ll2Launch:
    return Ll2Launch(
        launch_id=f"00000000-0000-4000-8000-{index:012d}",
        slug=f"fixture-launch-{index}",
        name=f"Fixture Launch {index}",
        status=status or Ll2Status(1, "Go for Launch", "Go"),
        net_utc=f"2026-09-{16 + index:02d}T12:30:00Z",
        precision=precision or Ll2Precision(1, "Minute", "MIN"),
        window_start_utc=f"2026-09-{16 + index:02d}T12:30:00Z",
        window_end_utc=f"2026-09-{16 + index:02d}T13:00:00Z",
        last_updated_utc=f"2026-09-15T00:{index:02d}:00Z",
        agency=Ll2Agency(100 + index, f"Agency {index}"),
        vehicle=Ll2Vehicle(200 + index, "Falcon 9", "Falcon 9 Block 5", "Block 5"),
        mission=Ll2Mission(
            300 + index,
            f"Mission {index}",
            "Earth Science",
            description,
            "Low Earth Orbit",
            "LEO",
            "Earth",
            (f"Agency {index}",),
        ),
        site=Ll2Site(400 + index, f"Pad {index}", "Cape Canaveral", "United States", "US"),
        official_page_url=f"https://example.org/launch/{index}",
        official_webcast_url=f"https://example.org/watch/{index}",
        webcast_live=index == 0,
    )


def _cache(
    launches: tuple[Ll2Launch, ...] = (_launch(0), _launch(1)),
    *,
    fetched_at: datetime = _NOW,
) -> ProviderCacheEntry:
    normalized = Ll2Normalized(
        snapshot_latest_updated_utc=max(launch.last_updated_utc for launch in launches),
        launches=launches,
    )
    return ProviderCacheEntry(
        provider_code=LL2_PROVIDER_CODE,
        cache_key="upcoming-launches",
        normalized_payload=Ll2Codec().encode(normalized),
        schema_version="ll2-upcoming-v2.3-json-v1",
        raw_sha256="c" * 64,
        fetched_at=fetched_at,
        fresh_until=fetched_at + timedelta(hours=2),
        stale_until=fetched_at + timedelta(hours=24),
    )


def _snapshot(
    *,
    enabled: bool = True,
    cache: ProviderCacheEntry | None = None,
    cache_state: CacheState = CacheState.MISSING,
    last_failure_code: ProviderFailureCode | None = None,
) -> ProviderSnapshot:
    config = launch_library_runtime_config()
    state = ProviderRuntimeState(
        provider_code=LL2_PROVIDER_CODE,
        enabled=enabled,
        circuit_state=CircuitState.CLOSED,
        consecutive_failures=0,
        next_sync_at=_NOW + timedelta(hours=1),
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
        payload_codec=Ll2Codec(),
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


def _app(service: LaunchReadService) -> FastAPI:
    app = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test",
            }
        )
    )
    app.state.launch_read_service = service
    return app


def _request(app: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


@pytest.mark.asyncio
async def test_projection_preserves_status_precision_and_eligibility() -> None:
    coarse = _launch(
        1,
        status=Ll2Status(8, "To Be Confirmed", "TBC"),
        precision=Ll2Precision(5, "Day", "DAY"),
    )
    reader = _Reader(_snapshot(cache=_cache((_launch(0), coarse)), cache_state=CacheState.FRESH))
    projection = await LaunchReadService(reader).read()
    assert projection.availability == "fresh"
    assert projection.total_launch_count == 2
    assert projection.launches[0].timing.countdown_eligible is True
    assert projection.launches[0].timing.calendar_eligible is True
    assert projection.launches[1].status.abbreviation == "TBC"
    assert projection.launches[1].timing.precision_name == "Day"
    assert projection.launches[1].timing.countdown_eligible is False
    assert projection.launches[1].timing.calendar_eligible is False
    assert projection.active_mission_launch_ids == (
        projection.launches[0].launch_id,
        projection.launches[1].launch_id,
    )
    assert reader.calls == [LL2_PROVIDER_CODE]


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
    projection = await LaunchReadService(
        _Reader(_snapshot(enabled=enabled, cache=cache, cache_state=cache_state))
    ).read()
    assert projection.availability == "unavailable"
    assert projection.unavailable_reason == reason
    assert projection.launches == ()
    assert projection.active_mission_launch_ids == ()


@pytest.mark.asyncio
async def test_stale_projection_retains_source_data_and_failure_separately() -> None:
    fetched = _NOW - timedelta(hours=3)
    projection = await LaunchReadService(
        _Reader(
            _snapshot(
                cache=_cache(fetched_at=fetched),
                cache_state=CacheState.STALE,
                last_failure_code=ProviderFailureCode.HTTP_RATE_LIMITED,
            )
        )
    ).read()
    assert projection.availability == "stale"
    assert projection.freshness.retrieved_at == fetched
    assert projection.freshness.last_refresh_failure_code == "provider.http_rate_limited"
    assert projection.freshness.snapshot_latest_updated_utc == "2026-09-15T00:01:00Z"


def test_public_launch_list_and_detail_are_cache_only_and_bounded() -> None:
    service = LaunchReadService(_Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH)))
    app = _app(service)
    listing = _request(app, "/api/v1/now/launches")
    assert listing.status_code == 200
    body = listing.json()
    assert body["availability"] == "fresh"
    assert body["returned_launch_count"] == 2
    assert body["launches"][0]["timing"]["countdown_eligible"] is True
    assert body["launches"][0]["mission"]["destination_body"] == "Earth"
    assert body["source"]["name"] == "Launch Library 2 by The Space Devs"
    assert len(listing.content) <= 61_440

    launch_id = body["launches"][0]["launch_id"]
    detail = _request(app, f"/api/v1/now/launches/{launch_id}")
    assert detail.status_code == 200
    assert detail.json()["launch"]["launch_id"] == launch_id
    assert len(detail.content) <= 61_440


def test_detail_missing_invalid_and_query_parameters_fail_without_upstream_access() -> None:
    app = _app(LaunchReadService(_Reader(_snapshot(cache=_cache(), cache_state=CacheState.FRESH))))
    assert _request(app, "/api/v1/now/launches/not-a-uuid").status_code == 422
    assert (
        _request(app, "/api/v1/now/launches/ffffffff-ffff-4fff-8fff-ffffffffffff").status_code
        == 404
    )
    assert _request(app, "/api/v1/now/launches?limit=1").status_code == 422


def test_list_drops_complete_tail_records_to_stay_under_public_byte_ceiling() -> None:
    large = "x" * 4096
    launches = tuple(_launch(index, description=large) for index in range(12))
    response = _request(
        _app(
            LaunchReadService(
                _Reader(_snapshot(cache=_cache(launches), cache_state=CacheState.FRESH))
            )
        ),
        "/api/v1/now/launches",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_launch_count"] == 12
    assert 0 < body["returned_launch_count"] < 12
    assert len(body["launches"]) == body["returned_launch_count"]
    assert len(response.content) <= 61_440


def test_detail_can_read_tail_launch_outside_bounded_public_list() -> None:
    launches = tuple(_launch(index) for index in range(13))
    app = _app(
        LaunchReadService(_Reader(_snapshot(cache=_cache(launches), cache_state=CacheState.FRESH)))
    )

    listing = _request(app, "/api/v1/now/launches")
    assert listing.status_code == 200
    body = listing.json()
    assert body["total_launch_count"] == 13
    assert body["returned_launch_count"] == 12
    tail_id = launches[-1].launch_id
    assert tail_id not in {item["launch_id"] for item in body["launches"]}

    detail = _request(app, f"/api/v1/now/launches/{tail_id}")
    assert detail.status_code == 200
    assert detail.json()["launch"]["launch_id"] == tail_id
    assert len(detail.content) <= 61_440
