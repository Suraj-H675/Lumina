"""Launch Library 2 synchronization behavior independent of live provider availability."""

from __future__ import annotations

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
from lumina.provenance.composition import launch_library_runtime_config
from lumina.provenance.domain.launch_library import Ll2Codec
from lumina.provenance.domain.runtime import (
    LL2_MAX_RESPONSE_BYTES,
    LL2_PROVIDER_CODE,
    CacheState,
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
from lumina.provenance.infrastructure.launch_library import (
    LaunchLibraryAdapter,
    LaunchLibraryRequest,
)

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider"
_NOW = datetime(2026, 9, 15, 0, 0, tzinfo=UTC)


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
    stale_on_failure: bool = False
    success_payload: object | None = None
    failure_calls: list[object] = field(default_factory=list)

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        del config, kwargs
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("fixture-ll2-lease", half_open_probe=False),
        )

    async def finalize_success(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        del config
        self.success_payload = kwargs["normalized_payload"]
        return ProviderFinalization(ProviderFinalizationOutcome.COMMITTED, CacheState.FRESH)

    async def finalize_failure(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        del config
        self.failure_calls.append(kwargs["failure"])
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.STALE if self.stale_on_failure else CacheState.MISSING,
            stale_fallback=self.stale_on_failure,
        )

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        del config, kwargs
        return SimpleNamespace(state=SimpleNamespace(enabled=True), cache=None)


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


def _raw(
    *, status: int = 200, body: bytes | None = None, retry_after: str | None = None
) -> RawProviderResponse:
    payload = (_FIXTURES / "launch-library-upcoming.json").read_bytes() if body is None else body
    headers = {"content-type": "application/json"}
    if retry_after is not None:
        headers["retry-after"] = retry_after
    return RawProviderResponse(
        status_code=status,
        headers=headers,
        body=payload,
        raw_complete=True,
        observed_bytes=len(payload),
        content_type_valid=True,
        max_response_bytes=LL2_MAX_RESPONSE_BYTES,
    )


def _service(transport: _ReplayTransport, store: _Store) -> ProviderSyncService:
    config = launch_library_runtime_config()
    adapter = LaunchLibraryAdapter(transport, source_manifest=config.source_manifest)
    registration = ProviderRegistration(
        config=config,
        adapter=adapter,
        request_factory=LaunchLibraryRequest,
        payload_codec=Ll2Codec(),
        check_replacement=True,
    )
    return ProviderSyncService(
        registry=StaticProviderRegistry({LL2_PROVIDER_CODE: registration}),
        store=cast(ProviderRuntimeStore, store),
        clock=_Clock(),
        sleeper=_sleep_noop,
        monotonic=lambda: 0.0,
        timeout_at=_no_timeout,
        lease_token_factory=lambda: "fixture-ll2-lease",
    )


@pytest.mark.asyncio
async def test_ll2_success_commits_one_normalized_snapshot_from_one_fixed_request() -> None:
    transport = _ReplayTransport([_raw()])
    store = _Store()

    report = await _service(transport, store).sync(LL2_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert report.attempts == 1
    assert report.retries == 0
    assert store.success_payload is not None
    assert len(transport.requests) == 1
    request = transport.requests[0]
    assert request.url == "https://ll.thespacedevs.com/2.3.0/launches/upcoming/"
    assert request.params == (
        ("format", "json"),
        ("limit", "20"),
        ("mode", "detailed"),
        ("ordering", "net"),
    )


@pytest.mark.asyncio
async def test_ll2_rate_limit_uses_stale_fallback_without_retrying_429() -> None:
    transport = _ReplayTransport([_raw(status=429, body=b"", retry_after="3600")])
    store = _Store(stale_on_failure=True)

    report = await _service(transport, store).sync(LL2_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert report.failure_code == "provider.http_rate_limited"
    assert report.attempts == 1
    assert report.retries == 0
    assert report.stale_fallback is True
    assert len(store.failure_calls) == 1


@pytest.mark.asyncio
async def test_ll2_schema_drift_finalizes_as_contract_failure_without_replacing_cache() -> None:
    transport = _ReplayTransport([_raw(body=b'{"count":1,"results":[{"id":7}]}')])
    store = _Store()

    report = await _service(transport, store).sync(LL2_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == "provider.payload_invalid"
    assert report.attempts == 1
    assert report.retries == 0
    assert store.success_payload is None
    assert len(store.failure_calls) == 1
