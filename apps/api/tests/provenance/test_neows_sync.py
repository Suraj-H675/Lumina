"""NeoWs provider-runtime integration contracts kept independent of live NASA."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import pytest
from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.composition import nasa_neows_runtime_config
from lumina.provenance.domain.neows import NasaNeowsCodec
from lumina.provenance.domain.runtime import (
    NEOWS_MAX_RESPONSE_BYTES,
    NEOWS_PROVIDER_CODE,
    CacheState,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFailure,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderRuntimeConfig,
    ProviderRuntimeStore,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.http import ProviderTransportUnavailable
from lumina.provenance.infrastructure.nasa_neows import NasaNeowsAdapter
from pydantic import SecretStr

_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider"
_KEY = SecretStr("fixture-neows-key-2026")
_START = datetime(2026, 9, 12, 23, 59, tzinfo=UTC)


@asynccontextmanager
async def _no_timeout(_deadline: float) -> AsyncIterator[None]:
    yield


@dataclass
class _Clock:
    current: datetime

    def now(self) -> datetime:
        return self.current


@dataclass
class _Store:
    enabled: bool = True
    claim: ProviderClaim = field(
        default_factory=lambda: ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("fixture-neows-lease", half_open_probe=False),
        )
    )
    success_payload: object | None = None
    failure_calls: list[object] = field(default_factory=list)
    status_calls: int = 0

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        del config, kwargs
        return self.claim

    async def finalize_success(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        del config
        self.success_payload = kwargs["normalized_payload"]
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.FRESH,
        )

    async def finalize_failure(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        del config
        self.failure_calls.append(kwargs["failure"])
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.MISSING,
        )

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        del config, kwargs
        self.status_calls += 1
        return SimpleNamespace(state=SimpleNamespace(enabled=self.enabled))


class _ReplayTransport:
    def __init__(self, outcomes: list[RawProviderResponse | BaseException]) -> None:
        self.outcomes = outcomes
        self.requests: list[Any] = []

    async def request(
        self, request: Any, *, attempt_deadline: float | None = None
    ) -> RawProviderResponse:
        del attempt_deadline
        self.requests.append(request)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


def _raw_fixture() -> RawProviderResponse:
    body = (_FIXTURES / "nasa-neows-feed.json").read_bytes()
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=True,
        max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
    )


def _service(
    adapter: NasaNeowsAdapter,
    store: _Store,
    config: ProviderRuntimeConfig,
    *,
    clock: _Clock,
    sleeper: Callable[[float], Any],
) -> ProviderSyncService:
    registration = ProviderRegistration(
        config=config,
        adapter=adapter,
        request_factory=adapter.new_request,
        payload_codec=NasaNeowsCodec(),
        configuration_check=adapter.is_configured,
    )
    registry = StaticProviderRegistry({NEOWS_PROVIDER_CODE: registration})
    return ProviderSyncService(
        registry=registry,
        store=cast(ProviderRuntimeStore, store),
        clock=clock,
        sleeper=sleeper,
        monotonic=lambda: 0.0,
        timeout_at=_no_timeout,
        lease_token_factory=lambda: "fixture-neows-lease",
    )


@pytest.mark.asyncio
async def test_neows_retries_reuse_one_frozen_window_across_utc_midnight() -> None:
    clock = _Clock(_START)
    transport = _ReplayTransport([ProviderTransportUnavailable(), _raw_fixture(), _raw_fixture()])
    adapter = NasaNeowsAdapter(
        transport,
        api_key=_KEY,
        source_manifest=nasa_neows_runtime_config().source_manifest,
        clock=clock.now,
    )
    store = _Store()

    async def cross_midnight(_delay: float) -> None:
        clock.current = datetime(2026, 9, 13, 0, 1, tzinfo=UTC)

    service = _service(
        adapter,
        store,
        nasa_neows_runtime_config(),
        clock=clock,
        sleeper=cross_midnight,
    )

    first = await service.sync(NEOWS_PROVIDER_CODE)
    _ = await service.sync(NEOWS_PROVIDER_CODE)

    assert first.outcome is ProviderSyncOutcome.SUCCESS
    assert first.attempts == 2
    assert [request.params[:2] for request in transport.requests[:2]] == [
        (("start_date", "2026-09-12"), ("end_date", "2026-09-18")),
        (("start_date", "2026-09-12"), ("end_date", "2026-09-18")),
    ]
    assert transport.requests[2].params[:2] == (
        ("start_date", "2026-09-13"),
        ("end_date", "2026-09-19"),
    )
    assert store.success_payload is not None


@pytest.mark.asyncio
async def test_neows_missing_key_skips_network_and_does_not_record_provider_failure() -> None:
    config = nasa_neows_runtime_config()
    transport = _ReplayTransport([])
    adapter = NasaNeowsAdapter(
        transport,
        api_key=None,
        source_manifest=config.source_manifest,
    )
    store = _Store()
    service = _service(
        adapter,
        store,
        config,
        clock=_Clock(_START),
        sleeper=lambda _delay: None,
    )

    report = await service.sync(NEOWS_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.NOT_CONFIGURED
    assert report.failure_code == "provider.not_configured"
    assert transport.requests == []
    assert store.failure_calls == []
    assert store.status_calls == 1


@pytest.mark.asyncio
async def test_neows_short_key_bounded_invalid_response_reaches_failure_finalization() -> None:
    clock = _Clock(_START)
    key = SecretStr("x")
    body = b"x" * NEOWS_MAX_RESPONSE_BYTES
    raw = RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=True,
        max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
    )
    transport = _ReplayTransport([raw])
    config = nasa_neows_runtime_config()
    adapter = NasaNeowsAdapter(
        transport,
        api_key=key,
        source_manifest=config.source_manifest,
        clock=clock.now,
    )
    store = _Store()
    service = _service(
        adapter,
        store,
        config,
        clock=clock,
        sleeper=lambda _delay: None,
    )

    report = await service.sync(NEOWS_PROVIDER_CODE)

    assert report.failure_code == "provider.payload_invalid"
    assert len(store.failure_calls) == 1
    failure = store.failure_calls[0]
    assert isinstance(failure, ProviderFailure)
    assert failure.raw_response is not None
    assert failure.raw_response.quarantine_body is not None
    assert len(failure.raw_response.quarantine_body) == NEOWS_MAX_RESPONSE_BYTES
    assert b"x" not in failure.raw_response.quarantine_body
