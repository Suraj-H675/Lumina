"""Atomic SWPC plan execution and component-local retry contracts."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.domain.provider import ProviderFetchTimeout, ProviderFetchUnavailable
from lumina.provenance.domain.request_plan import ProviderRequestPlan
from lumina.provenance.domain.runtime import (
    SWPC_PROVIDER_CODE,
    CacheState,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderRuntimeConfig,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.noaa_swpc import (
    NoaaSwpcAdapter,
    compose_swpc_snapshot,
    load_noaa_swpc_source_manifest,
    noaa_swpc_request_plan,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_FIXTURE_ROOT = _REPOSITORY_ROOT / "apps" / "api" / "tests" / "fixtures" / "provider" / "noaa-swpc"
_FILES = (
    "scales.json",
    "kp.json",
    "solar-wind-speed.json",
    "solar-wind-field.json",
    "notifications.json",
)
_LIMITS = (16_384, 65_536, 8_192, 8_192, 131_072)
_NOW = datetime(2026, 9, 12, 7, 0, tzinfo=UTC)


def _config() -> ProviderRuntimeConfig:
    from lumina.provenance.composition import noaa_swpc_runtime_config

    return noaa_swpc_runtime_config(repository_root=_REPOSITORY_ROOT)


def _raw(index: int, *, status_code: int = 200) -> RawProviderResponse:
    body = (_FIXTURE_ROOT / _FILES[index]).read_bytes()
    return RawProviderResponse(
        status_code=status_code,
        headers={"content-type": "application/json"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=True,
        max_response_bytes=_LIMITS[index],
    )


@dataclass
class _Transport:
    outcomes: list[RawProviderResponse | BaseException]
    paths: list[str] = field(default_factory=list)

    async def request(
        self,
        request: Any,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        del attempt_deadline
        self.paths.append(request.url)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


@dataclass
class _Store:
    success_calls: list[dict[str, Any]] = field(default_factory=list)
    failure_calls: list[dict[str, Any]] = field(default_factory=list)

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        del config, kwargs
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("swpc-test-lease", half_open_probe=False),
        )

    async def finalize_success(
        self,
        config: ProviderRuntimeConfig,
        **kwargs: Any,
    ) -> ProviderFinalization:
        self.success_calls.append({"config": config, **kwargs})
        return ProviderFinalization(ProviderFinalizationOutcome.COMMITTED, CacheState.FRESH)

    async def finalize_failure(
        self,
        config: ProviderRuntimeConfig,
        **kwargs: Any,
    ) -> ProviderFinalization:
        self.failure_calls.append({"config": config, **kwargs})
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.STALE,
            stale_fallback=True,
        )

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("status is not used by this sync test")

    async def set_enabled(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("set_enabled is not used by this sync test")


@asynccontextmanager
async def _no_timeout(_deadline: float) -> AsyncIterator[None]:
    yield


def _service(
    transport: _Transport,
    store: _Store,
    sleeper: Any,
    *,
    plan_factory: Any = noaa_swpc_request_plan,
    monotonic: Any = lambda: 1.0,
) -> ProviderSyncService:
    config = _config()
    adapter = NoaaSwpcAdapter(
        transport,
        source_manifest=load_noaa_swpc_source_manifest(_REPOSITORY_ROOT),
    )
    registration = ProviderRegistration(
        config=config,
        adapter=adapter,
        request_factory=plan_factory,
        payload_codec=adapter.codec,
        snapshot_normalizer=compose_swpc_snapshot,
    )
    return ProviderSyncService(
        registry=StaticProviderRegistry({SWPC_PROVIDER_CODE: registration}),
        store=store,
        clock=type("Clock", (), {"now": lambda _self: _NOW})(),
        sleeper=sleeper,
        monotonic=monotonic,
        timeout_at=_no_timeout,
        lease_token_factory=lambda: "swpc-test-lease",
    )


def test_retry_refetches_only_the_failed_component() -> None:
    transport = _Transport([_raw(0), ProviderFetchTimeout(), _raw(1), _raw(2), _raw(3), _raw(4)])
    store = _Store()
    sleeps: list[float] = []

    async def sleeper(delay: float) -> None:
        sleeps.append(delay)

    report = asyncio.run(_service(transport, store, sleeper).sync(SWPC_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert sleeps == [1.0]
    assert transport.paths == [
        "https://services.swpc.noaa.gov/products/noaa-scales.json",
        "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
        "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
        "https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
        "https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json",
        "https://services.swpc.noaa.gov/products/alerts.json",
    ]
    assert report.attempts == 6
    assert report.retries == 1
    assert len(store.success_calls) == 1
    assert store.failure_calls == []


def test_late_component_failure_does_not_publish_partial_snapshot() -> None:
    transport = _Transport(
        [
            _raw(0),
            _raw(1),
            _raw(2),
            _raw(3),
            ProviderFetchUnavailable(),
            ProviderFetchUnavailable(),
            ProviderFetchUnavailable(),
        ]
    )
    store = _Store()
    sleeps: list[float] = []

    async def sleeper(delay: float) -> None:
        sleeps.append(delay)

    report = asyncio.run(_service(transport, store, sleeper).sync(SWPC_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.transport_unavailable"
    assert report.attempts == 7
    assert report.retries == 2
    assert sleeps == [1.0, 2.0]
    assert store.success_calls == []
    assert len(store.failure_calls) == 1
    assert store.failure_calls[0]["failure"].component_id == "notifications"


def test_contract_failure_stops_before_later_components_and_retains_failing_body() -> None:
    malformed_kp_body = b'[{"time_tag":"not-a-time"}]'
    malformed_kp = RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=malformed_kp_body,
        raw_complete=True,
        observed_bytes=len(malformed_kp_body),
        content_type_valid=True,
        max_response_bytes=_LIMITS[1],
    )
    transport = _Transport([_raw(0), malformed_kp, _raw(2), _raw(3), _raw(4)])
    store = _Store()

    async def sleeper(_delay: float) -> None:
        return None

    report = asyncio.run(_service(transport, store, sleeper).sync(SWPC_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.payload_invalid"
    assert transport.paths == [
        "https://services.swpc.noaa.gov/products/noaa-scales.json",
        "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json",
    ]
    failure = store.failure_calls[0]["failure"]
    assert failure.component_id == "kp"
    assert failure.raw_response is not None
    assert failure.raw_response.body == malformed_kp.body
    assert store.success_calls == []


def test_total_evidence_bound_rejects_without_publishing_snapshot() -> None:
    production_plan = noaa_swpc_request_plan()
    bounded_plan = ProviderRequestPlan(
        components=production_plan.components,
        max_total_response_bytes=131_072,
        checksum_domain=production_plan.checksum_domain,
    )
    large_notifications = json.dumps(
        [
            {
                "product_id": f"TEST{i}",
                "issue_datetime": f"2026-09-12 06:0{i}:00",
                "message": "x" * 13_000,
            }
            for i in range(10)
        ],
        separators=(",", ":"),
    ).encode()
    notifications = RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=large_notifications,
        raw_complete=True,
        observed_bytes=len(large_notifications),
        content_type_valid=True,
        max_response_bytes=_LIMITS[4],
    )
    transport = _Transport([_raw(0), _raw(1), _raw(2), _raw(3), notifications])
    store = _Store()

    async def sleeper(_delay: float) -> None:
        return None

    report = asyncio.run(
        _service(
            transport,
            store,
            sleeper,
            plan_factory=lambda: bounded_plan,
        ).sync(SWPC_PROVIDER_CODE)
    )

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.response_too_large"
    assert transport.paths[-1].endswith("/products/alerts.json")
    assert store.success_calls == []


def test_request_cycle_deadline_is_shared_by_slow_component_attempts() -> None:
    monotonic_value = 0.0

    def monotonic() -> float:
        return monotonic_value

    class SlowTransport(_Transport):
        async def request(
            self,
            request: Any,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            nonlocal monotonic_value
            self.paths.append(request.url)
            monotonic_value += 30.0
            raise ProviderFetchTimeout()

    transport = SlowTransport([])
    store = _Store()

    async def sleeper(_delay: float) -> None:
        return None

    report = asyncio.run(
        _service(transport, store, sleeper, monotonic=monotonic).sync(SWPC_PROVIDER_CODE)
    )

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.timeout"
    assert report.attempts == 3
    assert report.retries == 2
    assert len(transport.paths) == 3
    assert all(path.endswith("/products/noaa-scales.json") for path in transport.paths)
    assert store.success_calls == []
