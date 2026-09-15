"""CelesTrak selected-group synchronization and replacement safety."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.composition import celestrak_runtime_config
from lumina.provenance.domain.celestrak import CelestrakCodec, CelestrakNormalized
from lumina.provenance.domain.runtime import (
    CELESTRAK_PROVIDER_CODE,
    CELESTRAK_STATIONS_MAX_RESPONSE_BYTES,
    CELESTRAK_VISUAL_MAX_RESPONSE_BYTES,
    CacheState,
    ProviderCacheEntry,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderRuntimeConfig,
    ProviderRuntimeStore,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.celestrak import (
    CelestrakAdapter,
    celestrak_request_plan,
    compose_celestrak_snapshot,
    load_celestrak_source_manifest,
)

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider" / "celestrak"
_NOW = datetime(2026, 6, 19, 14, 0, tzinfo=UTC)
_LIMITS = (CELESTRAK_STATIONS_MAX_RESPONSE_BYTES, CELESTRAK_VISUAL_MAX_RESPONSE_BYTES)


@asynccontextmanager
async def _no_timeout(_deadline: float) -> AsyncIterator[None]:
    yield


async def _sleep_noop(_delay: float) -> None:
    return None


@dataclass
class _Clock:
    current: datetime = _NOW

    def now(self) -> datetime:
        return self.current


@dataclass
class _Store:
    current_payload: object | None = None
    stale_on_failure: bool = True
    success_calls: list[dict[str, Any]] = field(default_factory=list)
    failure_calls: list[dict[str, Any]] = field(default_factory=list)

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        del config, kwargs
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("celestrak-test-lease", half_open_probe=False),
        )

    async def finalize_success(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        self.success_calls.append({"config": config, **kwargs})
        return ProviderFinalization(ProviderFinalizationOutcome.COMMITTED, CacheState.FRESH)

    async def finalize_failure(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        self.failure_calls.append({"config": config, **kwargs})
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.STALE if self.stale_on_failure else CacheState.MISSING,
            stale_fallback=self.stale_on_failure,
        )

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        del kwargs
        cache = None
        if self.current_payload is not None:
            cache = ProviderCacheEntry(
                provider_code=config.provider_code,
                cache_key=config.cache_key,
                normalized_payload=cast(Any, self.current_payload),
                schema_version=config.source_schema_version,
                raw_sha256="0" * 64,
                fetched_at=_NOW,
                fresh_until=_NOW,
                stale_until=_NOW,
            )
        return SimpleNamespace(state=SimpleNamespace(enabled=True), cache=cache)

    async def set_enabled(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("set_enabled is not used by CelesTrak sync tests")


class _ReplayTransport:
    def __init__(self, outcomes: list[RawProviderResponse]) -> None:
        self.outcomes = outcomes
        self.requests: list[Any] = []

    async def request(
        self, request: Any, *, attempt_deadline: float | None = None
    ) -> RawProviderResponse:
        del attempt_deadline
        self.requests.append(request)
        return self.outcomes.pop(0)


def _fixture(name: str) -> object:
    return json.loads((_FIXTURES / name).read_text())


def _raw(index: int, *, value: object | None = None, status: int = 200) -> RawProviderResponse:
    data = _fixture("stations.json" if index == 0 else "visual.json") if value is None else value
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode()
    return RawProviderResponse(
        status_code=status,
        headers={"content-type": "application/json"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=True,
        max_response_bytes=_LIMITS[index],
    )


def _service(transport: _ReplayTransport, store: _Store) -> ProviderSyncService:
    config = celestrak_runtime_config()
    adapter = CelestrakAdapter(transport, source_manifest=load_celestrak_source_manifest())
    registration = ProviderRegistration(
        config=config,
        adapter=adapter,
        request_factory=celestrak_request_plan,
        payload_codec=adapter.codec,
        check_replacement=True,
        snapshot_normalizer=compose_celestrak_snapshot,
    )
    return ProviderSyncService(
        registry=StaticProviderRegistry({CELESTRAK_PROVIDER_CODE: registration}),
        store=cast(ProviderRuntimeStore, store),
        clock=_Clock(),
        sleeper=_sleep_noop,
        monotonic=lambda: 0.0,
        timeout_at=_no_timeout,
        lease_token_factory=lambda: "celestrak-test-lease",
    )


@pytest.mark.asyncio
async def test_success_publishes_one_atomic_snapshot_after_both_fixed_groups() -> None:
    transport = _ReplayTransport([_raw(0), _raw(1)])
    store = _Store(current_payload=None)

    report = await _service(transport, store).sync(CELESTRAK_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert report.attempts == 2
    assert report.retries == 0
    assert len(store.success_calls) == 1
    assert store.failure_calls == []
    assert [request.params for request in transport.requests] == [
        (("GROUP", "STATIONS"), ("FORMAT", "JSON")),
        (("GROUP", "VISUAL"), ("FORMAT", "JSON")),
    ]
    normalized = CelestrakCodec().decode(store.success_calls[0]["normalized_payload"])
    assert isinstance(normalized, CelestrakNormalized)
    assert [item.catalog_number for item in normalized.satellites] == [25544, 123456]


@pytest.mark.asyncio
async def test_second_group_contract_failure_never_publishes_partial_snapshot() -> None:
    malformed = [{"NORAD_CAT_ID": 25544}]
    transport = _ReplayTransport([_raw(0), _raw(1, value=malformed)])
    store = _Store()

    report = await _service(transport, store).sync(CELESTRAK_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.payload_invalid"
    assert store.success_calls == []
    assert len(store.failure_calls) == 1
    assert store.failure_calls[0]["failure"].component_id == "visual"


@pytest.mark.asyncio
async def test_rate_limit_on_first_group_uses_stale_fallback_without_partial_fetch() -> None:
    transport = _ReplayTransport([_raw(0, value=[], status=429)])
    store = _Store()

    report = await _service(transport, store).sync(CELESTRAK_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.http_rate_limited"
    assert report.attempts == 1
    assert report.retries == 0
    assert len(transport.requests) == 1
    assert store.success_calls == []


@pytest.mark.asyncio
async def test_regressed_element_epoch_is_rejected_before_cache_replacement() -> None:
    initial_transport = _ReplayTransport([_raw(0), _raw(1)])
    initial_store = _Store(current_payload=None)
    initial = await _service(initial_transport, initial_store).sync(CELESTRAK_PROVIDER_CODE)
    assert initial.outcome is ProviderSyncOutcome.SUCCESS
    current_payload = initial_store.success_calls[0]["normalized_payload"]

    stations = cast(list[dict[str, Any]], _fixture("stations.json"))
    visual = cast(list[dict[str, Any]], _fixture("visual.json"))
    stations[0]["EPOCH"] = "2026-06-18T12:16:41.638656"
    visual[0]["EPOCH"] = "2026-06-18T12:16:41.638656"
    regressed_transport = _ReplayTransport([_raw(0, value=stations), _raw(1, value=visual)])
    regressed_store = _Store(current_payload=current_payload)

    report = await _service(regressed_transport, regressed_store).sync(CELESTRAK_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.payload_invalid"
    assert regressed_store.success_calls == []
    assert len(regressed_store.failure_calls) == 1
