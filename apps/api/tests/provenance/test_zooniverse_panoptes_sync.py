"""Atomic Panoptes plan execution, retry, and stale/expired contracts."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fakes.provider_runtime import (
    DeterministicProviderStore,
    DeterministicProviderTransport,
    no_timeout,
    sleep_noop,
)
from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.domain.provider import ProviderFetchTimeout, ProviderFetchUnavailable
from lumina.provenance.domain.request_plan import ProviderRequestPlan
from lumina.provenance.domain.runtime import (
    PANOPTES_PROVIDER_CODE,
    CacheState,
    ProviderRuntimeConfig,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.zooniverse_panoptes import (
    ZooniversePanoptesAdapter,
    compose_panoptes_snapshot,
    load_zooniverse_panoptes_source_manifest,
    zooniverse_panoptes_request_plan,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
_FIXTURE_ROOT = (
    _REPOSITORY_ROOT / "apps" / "api" / "tests" / "fixtures" / "provider" / "zooniverse-panoptes"
)
_FILES = (
    "galaxy-zoo.json",
    "planet-hunters-tess.json",
    "daily-minor-planet.json",
    "redshift-wrangler.json",
    "active-asteroids.json",
    "cloudspotting-on-mars.json",
)
_NOW = datetime(2026, 9, 19, 7, 0, tzinfo=UTC)


def _config() -> ProviderRuntimeConfig:
    from lumina.provenance.composition import zooniverse_panoptes_runtime_config

    return zooniverse_panoptes_runtime_config(repository_root=_REPOSITORY_ROOT)


def _raw(index: int, *, body: bytes | None = None) -> RawProviderResponse:
    selected = (_FIXTURE_ROOT / _FILES[index]).read_bytes() if body is None else body
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/vnd.api+json; charset=utf-8"},
        body=selected,
        raw_complete=True,
        observed_bytes=len(selected),
        content_type_valid=True,
        max_response_bytes=32_768,
    )


def _service(
    transport: DeterministicProviderTransport,
    store: DeterministicProviderStore,
    sleeper: Any,
    *,
    plan_factory: Any = zooniverse_panoptes_request_plan,
    monotonic: Any = lambda: 1.0,
) -> ProviderSyncService:
    config = _config()
    adapter = ZooniversePanoptesAdapter(
        transport,
        source_manifest=load_zooniverse_panoptes_source_manifest(_REPOSITORY_ROOT),
    )
    registration = ProviderRegistration(
        config=config,
        adapter=adapter,
        request_factory=plan_factory,
        payload_codec=adapter.codec,
        snapshot_normalizer=compose_panoptes_snapshot,
    )
    return ProviderSyncService(
        registry=StaticProviderRegistry({PANOPTES_PROVIDER_CODE: registration}),
        store=store,
        clock=type("Clock", (), {"now": lambda _self: _NOW})(),
        sleeper=sleeper,
        monotonic=monotonic,
        timeout_at=no_timeout,
        lease_token_factory=lambda: "panoptes-test-lease",
    )


def test_retry_refetches_only_failed_panoptes_component() -> None:
    transport = DeterministicProviderTransport(
        [
            _raw(0),
            ProviderFetchTimeout(),
            _raw(1),
            _raw(2),
            _raw(3),
            _raw(4),
            _raw(5),
        ]
    )
    store = DeterministicProviderStore(lease_token="panoptes-test-lease")
    sleeps: list[float] = []

    async def sleeper(delay: float) -> None:
        sleeps.append(delay)

    report = asyncio.run(_service(transport, store, sleeper).sync(PANOPTES_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert report.attempts == 7
    assert report.retries == 1
    assert sleeps == [1.0]
    assert (
        transport.requests[1].url
        == transport.requests[2].url
        == "https://www.zooniverse.org/api/projects/7929"
    )
    assert len(store.success_calls) == 1
    assert store.failure_calls == []


def test_late_component_failure_never_publishes_partial_panoptes_snapshot() -> None:
    transport = DeterministicProviderTransport(
        [
            _raw(0),
            _raw(1),
            _raw(2),
            _raw(3),
            _raw(4),
            ProviderFetchUnavailable(),
            ProviderFetchUnavailable(),
            ProviderFetchUnavailable(),
        ]
    )
    store = DeterministicProviderStore(lease_token="panoptes-test-lease")

    report = asyncio.run(_service(transport, store, sleep_noop).sync(PANOPTES_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.transport_unavailable"
    assert report.cache_state == "stale"
    assert report.stale_fallback is True
    assert report.attempts == 8
    assert report.retries == 2
    assert store.success_calls == []
    assert len(store.failure_calls) == 1
    assert store.failure_calls[0]["failure"].component_id == "cloudspotting-on-mars"


def test_identity_contract_failure_stops_before_later_components_and_keeps_body() -> None:
    malformed = json.loads((_FIXTURE_ROOT / _FILES[2]).read_text())
    malformed["projects"][0]["slug"] = "invented/project"
    malformed_body = json.dumps(malformed).encode()
    transport = DeterministicProviderTransport(
        [_raw(0), _raw(1), _raw(2, body=malformed_body), _raw(3)]
    )
    store = DeterministicProviderStore(lease_token="panoptes-test-lease")

    report = asyncio.run(_service(transport, store, sleep_noop).sync(PANOPTES_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.payload_invalid"
    assert [request.url for request in transport.requests] == [
        "https://www.zooniverse.org/api/projects/5733",
        "https://www.zooniverse.org/api/projects/7929",
        "https://www.zooniverse.org/api/projects/19413",
    ]
    failure = store.failure_calls[0]["failure"]
    assert failure.component_id == "daily-minor-planet"
    assert failure.raw_response is not None
    assert failure.raw_response.body == malformed_body
    assert store.success_calls == []


def test_total_evidence_bound_rejects_without_publishing_snapshot() -> None:
    production_plan = zooniverse_panoptes_request_plan()
    bounded_plan = ProviderRequestPlan(
        components=production_plan.components,
        max_total_response_bytes=32_768,
        checksum_domain=production_plan.checksum_domain,
    )
    final = json.loads((_FIXTURE_ROOT / _FILES[5]).read_text())
    final["projects"][0]["description"] = "x" * 29_000
    large_final_body = json.dumps(final, separators=(",", ":")).encode()
    assert len(large_final_body) < 32_768
    transport = DeterministicProviderTransport(
        [_raw(0), _raw(1), _raw(2), _raw(3), _raw(4), _raw(5, body=large_final_body)]
    )
    store = DeterministicProviderStore(lease_token="panoptes-test-lease")

    report = asyncio.run(
        _service(
            transport,
            store,
            sleep_noop,
            plan_factory=lambda: bounded_plan,
        ).sync(PANOPTES_PROVIDER_CODE)
    )

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.response_too_large"
    assert transport.requests[-1].url.endswith("/api/projects/13718")
    assert store.success_calls == []


def test_request_cycle_deadline_is_shared_across_panoptes_attempts() -> None:
    monotonic_value = 0.0

    def monotonic() -> float:
        return monotonic_value

    class SlowTransport(DeterministicProviderTransport):
        async def request(
            self,
            request: Any,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            nonlocal monotonic_value
            self.requests.append(request)
            self.attempt_deadlines.append(attempt_deadline)
            monotonic_value += 30.0
            raise ProviderFetchTimeout()

    transport = SlowTransport([])
    store = DeterministicProviderStore(lease_token="panoptes-test-lease")

    report = asyncio.run(
        _service(transport, store, sleep_noop, monotonic=monotonic).sync(PANOPTES_PROVIDER_CODE)
    )

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.timeout"
    assert report.attempts == 3
    assert report.retries == 2
    assert len(transport.requests) == 3
    assert all(request.url.endswith("/api/projects/5733") for request in transport.requests)
    assert store.success_calls == []


def test_expired_cache_failure_is_not_reported_as_stale_fallback() -> None:
    transport = DeterministicProviderTransport(
        [
            ProviderFetchUnavailable(),
            ProviderFetchUnavailable(),
            ProviderFetchUnavailable(),
        ]
    )
    store = DeterministicProviderStore(
        lease_token="panoptes-test-lease",
        failure_cache_state=CacheState.EXPIRED,
        failure_stale_fallback=False,
    )

    report = asyncio.run(_service(transport, store, sleep_noop).sync(PANOPTES_PROVIDER_CODE))

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == "provider.transport_unavailable"
    assert report.cache_state == "expired"
    assert report.stale_fallback is False
    assert store.success_calls == []
