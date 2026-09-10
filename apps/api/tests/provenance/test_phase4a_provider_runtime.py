"""Deterministic Phase 4A provider transport, adapter, and sync contracts."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from importlib import resources
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fakes.provider_runtime import (
    VALID_COUNT_BODY,
    DeterministicNasaTransport,
    oversized_response,
    response,
    timeout,
)
from lumina.provenance.application.registry import ProviderRegistration
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.composition import (
    nasa_runtime_config,
    production_provider_registry,
)
from lumina.provenance.domain.provider import ProviderPayloadInvalid
from lumina.provenance.domain.runtime import (
    PROVIDER_ATTEMPT_TOTAL_SECONDS,
    PROVIDER_REQUEST_CYCLE_SECONDS,
    SYNC_LEASE_SECONDS,
    CacheState,
    CircuitFailureKind,
    HttpTimeoutPolicy,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFailure,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderRuntimeConfig,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.http import (
    BoundedHttpTransport,
    FixedHttpRequest,
    ProviderTransportTimeout,
    ProviderTransportUnavailable,
)
from lumina.provenance.infrastructure.nasa_exoplanet_archive import (
    NasaCountRequest,
    NasaExoplanetArchiveAdapter,
    NasaTransport,
    load_nasa_source_manifest,
)

_NOW = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)


@asynccontextmanager
async def _no_timeout(_deadline: float) -> AsyncIterator[None]:
    """Keep existing unit cases deterministic while deadline cases inject their own clock."""
    yield


@dataclass
class _Monotonic:
    value: float = 0.0

    def __call__(self) -> float:
        return self.value


class _DeterministicCancellationTimeout:
    """Test-only absolute timeout that cancels at a controlled stream boundary."""

    def __init__(self, deadline: float) -> None:
        self.deadline = deadline
        self.task: asyncio.Task[object] | None = None
        self.expired = False

    async def __aenter__(self) -> _DeterministicCancellationTimeout:
        self.task = asyncio.current_task()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: object | None,
    ) -> bool:
        del exc_value, traceback
        if self.expired and exc_type is asyncio.CancelledError:
            current = asyncio.current_task()
            if current is not None:
                current.uncancel()
            raise TimeoutError()
        return False

    def expire(self) -> None:
        assert self.task is not None
        self.expired = True
        self.task.cancel()


def _config() -> ProviderRuntimeConfig:
    return nasa_runtime_config()


def _adapter(transport: NasaTransport) -> NasaExoplanetArchiveAdapter:
    return NasaExoplanetArchiveAdapter(transport, source_manifest=_config().source_manifest)


@dataclass
class _StoreDouble:
    claim: ProviderClaim = field(
        default_factory=lambda: ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("fixture-lease-token", half_open_probe=False),
        )
    )
    success_result: ProviderFinalization = field(
        default_factory=lambda: ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.FRESH,
        )
    )
    failure_result: ProviderFinalization = field(
        default_factory=lambda: ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            CacheState.MISSING,
        )
    )
    success_calls: list[dict[str, Any]] = field(default_factory=list)
    failure_calls: list[dict[str, Any]] = field(default_factory=list)
    acquire_calls: list[dict[str, Any]] = field(default_factory=list)

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        self.acquire_calls.append({"config": config, **kwargs})
        return self.claim

    async def finalize_success(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        self.success_calls.append({"config": config, **kwargs})
        return self.success_result

    async def finalize_failure(
        self, config: ProviderRuntimeConfig, **kwargs: Any
    ) -> ProviderFinalization:
        self.failure_calls.append({"config": config, **kwargs})
        return self.failure_result

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("status is not part of this sync test double")

    async def set_enabled(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("operator mutation is not part of this sync test double")


@dataclass
class _MutableUtcClock:
    value: datetime = _NOW

    def now(self) -> datetime:
        return self.value


@dataclass
class _CancellationStore:
    """Lease-fenced deterministic store used by the cancellation regression."""

    clock: _MutableUtcClock
    active_token: str | None = None
    lease_expires_at: datetime | None = None
    successful_tokens: list[str] = field(default_factory=list)
    failure_tokens: list[str] = field(default_factory=list)

    async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
        del config
        now = kwargs["now"]
        if (
            self.active_token is not None
            and self.lease_expires_at is not None
            and now < self.lease_expires_at
        ):
            return ProviderClaim(ProviderClaimOutcome.ALREADY_RUNNING)
        token = kwargs["lease_token"]
        assert isinstance(token, str)
        self.active_token = token
        self.lease_expires_at = kwargs["lease_expires_at"]
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease(token, half_open_probe=False),
        )

    def _owns(self, token: str, now: datetime) -> bool:
        return (
            self.active_token == token
            and self.lease_expires_at is not None
            and now < self.lease_expires_at
        )

    async def finalize_success(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        normalized_payload: Any,
        raw_sha256: str,
        attempts: int,
        retries: int,
        duration_ms: int,
    ) -> ProviderFinalization:
        del config, normalized_payload, raw_sha256, attempts, retries, duration_ms
        if not self._owns(lease_token, now):
            return ProviderFinalization(ProviderFinalizationOutcome.FENCED, None)
        self.successful_tokens.append(lease_token)
        self.active_token = None
        self.lease_expires_at = None
        return ProviderFinalization(ProviderFinalizationOutcome.COMMITTED, CacheState.FRESH)

    async def finalize_failure(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        failure: ProviderFailure,
        attempts: int,
        retries: int,
        duration_ms: int,
    ) -> ProviderFinalization:
        del config, failure, attempts, retries, duration_ms
        if not self._owns(lease_token, now):
            return ProviderFinalization(ProviderFinalizationOutcome.FENCED, None)
        self.failure_tokens.append(lease_token)
        self.active_token = None
        self.lease_expires_at = None
        return ProviderFinalization(ProviderFinalizationOutcome.COMMITTED, CacheState.MISSING)

    async def status(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("status is not part of this cancellation test double")

    async def set_enabled(self, config: ProviderRuntimeConfig, **kwargs: Any) -> Any:
        raise AssertionError("operator mutation is not part of this cancellation test double")


def _service(
    transport: NasaTransport,
    store: Any,
    *,
    sleeper: Any | None = None,
    monotonic: Any | None = None,
    timeout_at: Any | None = None,
    clock: Any | None = None,
    lease_token_factory: Any | None = None,
) -> ProviderSyncService:
    config = _config()
    registration = ProviderRegistration(
        config=config,
        adapter=_adapter(transport),
        request_factory=NasaCountRequest,
    )
    registry = SimpleNamespace(
        resolve=lambda provider_code: (
            registration if provider_code == config.provider_code else None
        )
    )
    return ProviderSyncService(
        registry=registry,
        store=store,
        clock=clock or SimpleNamespace(now=lambda: _NOW),
        sleeper=sleeper or (lambda _delay: _completed_sleep()),
        monotonic=monotonic or (lambda: 10.0),
        timeout_at=timeout_at or _no_timeout,
        lease_token_factory=lease_token_factory or (lambda: "fixture-lease-token"),
    )


async def _completed_sleep() -> None:
    return None


def test_static_registry_binds_manifest_and_runtime_policy_without_network() -> None:
    registry = production_provider_registry()

    assert registry.registered_codes == frozenset({"nasa-exoplanet-archive"})
    registration = registry.resolve("nasa-exoplanet-archive")
    assert registration is not None
    assert registration.config.adapter_id == "nasa-exoplanet-archive-tap-count"
    assert registration.config.source_manifest.source_id == "nasa-exoplanet-archive"
    assert registration.config.source_manifest.normalized_fields == ("confirmed_planet_count",)
    adapter = registration.adapter
    assert adapter.source_manifest is registration.config.source_manifest


def test_nasa_source_manifest_pins_official_provenance_without_a_licence_claim() -> None:
    manifest = _config().source_manifest

    assert str(manifest.official_documentation_url) == (
        "https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html"
    )
    assert str(manifest.terms_or_licence_url) == (
        "https://exoplanetarchive.ipac.caltech.edu/docs/acknowledge.html"
    )
    assert manifest.source_name == "NASA Exoplanet Archive"
    assert manifest.normalized_fields == ("confirmed_planet_count",)
    assert manifest.capabilities == ("batch_fetch",)
    assert manifest.attribution_text.startswith(
        "This research has made use of the NASA Exoplanet Archive"
    )
    assert "licence" not in manifest.attribution_text.lower()
    assert "DataManifest" in manifest.fetch_time_policy


def test_packaged_source_manifest_matches_reviewed_repository_manifest() -> None:
    repository_root = Path(__file__).resolve().parents[4]
    packaged = resources.files("lumina").joinpath(
        "data/manifests/sources/nasa-exoplanet-archive.json"
    )

    assert (
        packaged.read_bytes()
        == (repository_root / "data/manifests/sources/nasa-exoplanet-archive.json").read_bytes()
    )


def test_source_manifest_falls_back_to_packaged_resource_when_repository_is_absent(
    tmp_path: Path,
) -> None:
    assert load_nasa_source_manifest(tmp_path).source_id == "nasa-exoplanet-archive"


def test_runtime_policy_rejects_manifest_endpoint_drift() -> None:
    manifest = _config().source_manifest.model_copy(
        update={"endpoint_or_base_url": "https://example.invalid/TAP/sync"}
    )

    with pytest.raises(ValueError, match="disagrees with its source manifest"):
        ProviderRuntimeConfig(
            provider_code="nasa-exoplanet-archive",
            adapter_id="nasa-exoplanet-archive-tap-count",
            adapter_version="1",
            cache_key="confirmed-planet-count",
            source_schema_version="ps-confirmed-count-v1",
            source_manifest=manifest,
            endpoint_host="exoplanetarchive.ipac.caltech.edu",
            endpoint_path="/TAP/sync",
            query="select count(pl_name) from ps where default_flag=1",
            output_format="csv",
            timeout=HttpTimeoutPolicy(),
        )


@pytest.mark.asyncio
async def test_nasa_adapter_accepts_exact_fixture_and_normalizes_wire_name() -> None:
    transport = DeterministicNasaTransport([response()])
    adapter = _adapter(transport)

    raw = await adapter.fetch(NasaCountRequest())
    assert isinstance(raw, RawProviderResponse)
    payload = adapter.validate_payload(raw)
    assert payload.count == 6360
    assert adapter.normalize(NasaCountRequest(), payload) == {"confirmed_planet_count": 6360}
    assert len(transport.requests) == 1
    request = transport.requests[0]
    assert request.url == "https://exoplanetarchive.ipac.caltech.edu/TAP/sync"
    assert request.params == (
        ("query", "select count(pl_name) from ps where default_flag=1"),
        ("format", "csv"),
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        b"count\n6360\n",
        b"count(pl_name)\n",
        b"count(pl_name)\n6360\n1\n",
        b"count(pl_name)\nnot-a-count\n",
        b"count(pl_name)\n\n",
        b"count(pl_name)\n-1\n",
        b"count(pl_name),extra\n6360,unused\n",
        b"count(pl_name)\n\xff\n",
    ],
)
async def test_nasa_adapter_rejects_wire_schema_drift(body: bytes) -> None:
    adapter = _adapter(DeterministicNasaTransport([response(body)]))
    raw = await adapter.fetch(NasaCountRequest())

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(raw)


@pytest.mark.asyncio
async def test_nasa_adapter_rejects_wrong_content_type_before_normalization() -> None:
    adapter = _adapter(DeterministicNasaTransport([response(content_type="application/json")]))
    raw = await adapter.fetch(NasaCountRequest())

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(raw)


@pytest.mark.asyncio
async def test_bounded_transport_preserves_bytes_and_rejects_oversize() -> None:
    seen: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["user_agent"] = request.headers["user-agent"]
        seen["accept_encoding"] = request.headers["accept-encoding"]
        return httpx.Response(
            200,
            headers={"content-type": "text/plain; charset=UTF-8"},
            content=VALID_COUNT_BODY,
            request=request,
        )

    timeout_values: list[httpx.Timeout] = []

    def factory(*, timeout: httpx.Timeout) -> httpx.AsyncClient:
        timeout_values.append(timeout)
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)

    transport = BoundedHttpTransport(timeout=_config().timeout, client_factory=factory)
    request = FixedHttpRequest(
        url="https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
        params=(("query", "select count(pl_name) from ps where default_flag=1"), ("format", "csv")),
    )
    raw = await transport.request(request)

    assert raw.body == VALID_COUNT_BODY
    assert raw.raw_complete is True
    assert raw.content_type_valid is True
    assert "query=select+count%28pl_name%29+from+ps+where+default_flag%3D1" in str(seen["url"])
    assert seen["user_agent"] == "Lumina/0.0 Phase-4A provider-sync"
    assert seen["accept_encoding"] == "identity"
    assert timeout_values[0].connect == 5.0
    assert timeout_values[0].read == 10.0
    assert timeout_values[0].write == 5.0
    assert timeout_values[0].pool == 5.0

    class OversizedStream(httpx.AsyncByteStream):
        async def __aiter__(self) -> AsyncIterator[bytes]:
            yield b"x" * 65_536
            yield b"x"

        async def aclose(self) -> None:
            return None

    async def oversized_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            stream=OversizedStream(),
            request=request,
        )

    oversized_transport = BoundedHttpTransport(
        timeout=_config().timeout,
        client_factory=lambda *, timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(oversized_handler), timeout=timeout
        ),
    )
    oversized = await oversized_transport.request(request)
    assert oversized.raw_complete is False
    assert oversized.observed_bytes == 65_537
    assert len(oversized.body) == 65_536

    async def huge_length_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={
                "content-type": "text/plain",
                "content-length": "9" * 5_000,
            },
            content=VALID_COUNT_BODY,
            request=request,
        )

    huge_length_transport = BoundedHttpTransport(
        timeout=_config().timeout,
        client_factory=lambda *, timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(huge_length_handler), timeout=timeout
        ),
    )
    oversized_by_header = await huge_length_transport.request(request)
    assert oversized_by_header.raw_complete is False
    assert oversized_by_header.observed_bytes == 65_537
    assert oversized_by_header.body == b""


@pytest.mark.asyncio
async def test_bounded_transport_maps_httpx_timeout_to_safe_category() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("private timeout evidence", request=request)

    transport = BoundedHttpTransport(
        timeout=_config().timeout,
        client_factory=lambda *, timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(handler), timeout=timeout
        ),
    )
    request = FixedHttpRequest(
        url="https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
        params=(("query", "select count(pl_name) from ps where default_flag=1"), ("format", "csv")),
    )

    with pytest.raises(ProviderTransportTimeout) as captured:
        await transport.request(request)
    assert str(captured.value) == "provider.timeout"
    assert "private timeout evidence" not in repr(captured.value)


def test_provider_timeout_hierarchy_preserves_the_frozen_lease_margin() -> None:
    assert SYNC_LEASE_SECONDS == 120
    assert PROVIDER_REQUEST_CYCLE_SECONDS == 90
    assert PROVIDER_ATTEMPT_TOTAL_SECONDS == 30
    assert PROVIDER_REQUEST_CYCLE_SECONDS < SYNC_LEASE_SECONDS
    assert SYNC_LEASE_SECONDS - PROVIDER_REQUEST_CYCLE_SECONDS == 30
    assert PROVIDER_ATTEMPT_TOTAL_SECONDS <= PROVIDER_REQUEST_CYCLE_SECONDS


@pytest.mark.asyncio
async def test_slow_drip_is_bounded_by_attempt_deadline_not_read_inactivity() -> None:
    clock = _Monotonic()
    timeout_context: _DeterministicCancellationTimeout | None = None

    def timeout_at(deadline: float) -> _DeterministicCancellationTimeout:
        nonlocal timeout_context
        timeout_context = _DeterministicCancellationTimeout(deadline)
        return timeout_context

    request = FixedHttpRequest(
        url="https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
        params=(
            ("query", "select count(pl_name) from ps where default_flag=1"),
            ("format", "csv"),
        ),
    )

    class SlowDripStream(httpx.AsyncByteStream):
        def __init__(self) -> None:
            self.closed = False
            self.chunks = 0

        async def __aiter__(self) -> AsyncIterator[bytes]:
            while True:
                self.chunks += 1
                yield b"x"
                if self.chunks == 5:
                    assert timeout_context is not None
                    timeout_context.expire()
                await asyncio.sleep(0)

        async def aclose(self) -> None:
            self.closed = True

    stream = SlowDripStream()

    async def handler(http_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            stream=stream,
            request=http_request,
        )

    transport = BoundedHttpTransport(
        timeout=_config().timeout,
        client_factory=lambda *, timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(handler), timeout=timeout
        ),
        timeout_at=timeout_at,
        monotonic=clock,
    )

    with pytest.raises(ProviderTransportTimeout):
        await transport.request(request, attempt_deadline=5.0)

    assert stream.chunks == 5
    assert stream.closed is True
    assert timeout_context is not None
    assert timeout_context.deadline == 5.0


@pytest.mark.asyncio
async def test_request_cycle_timeout_during_retry_sleep_is_one_failure_without_new_http() -> None:
    clock = _Monotonic()
    timeout_context: _DeterministicCancellationTimeout | None = None

    def timeout_at(deadline: float) -> _DeterministicCancellationTimeout:
        nonlocal timeout_context
        timeout_context = _DeterministicCancellationTimeout(deadline)
        return timeout_context

    async def sleeper(_delay: float) -> None:
        clock.value = 90.0
        assert timeout_context is not None
        timeout_context.expire()
        await asyncio.sleep(0)

    transport = DeterministicNasaTransport([timeout(), response()])
    store = _StoreDouble()
    report = await _service(
        transport,
        store,
        sleeper=sleeper,
        monotonic=clock,
        timeout_at=timeout_at,
    ).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == "provider.timeout"
    assert report.attempts == 1
    assert report.retries == 1
    assert len(transport.requests) == 1
    assert len(store.failure_calls) == 1
    assert store.failure_calls[0]["failure"].kind is CircuitFailureKind.TRANSIENT
    assert timeout_context is not None
    assert timeout_context.deadline == 90.0


@pytest.mark.asyncio
async def test_request_cycle_deadline_is_anchored_before_lease_acquisition() -> None:
    clock = _Monotonic()

    class SlowAcquireStore(_StoreDouble):
        async def acquire(self, config: ProviderRuntimeConfig, **kwargs: Any) -> ProviderClaim:
            clock.value = 75.0
            return await super().acquire(config, **kwargs)

    transport = DeterministicNasaTransport([response()])
    store = SlowAcquireStore()
    report = await _service(transport, store, monotonic=clock).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert transport.attempt_deadlines == [90.0]


@pytest.mark.asyncio
async def test_later_attempt_receives_only_remaining_cycle_budget() -> None:
    clock = _Monotonic()

    class TruncatedRetryTransport(DeterministicNasaTransport):
        async def request(
            self,
            request: FixedHttpRequest,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            self.requests.append(request)
            self.attempt_deadlines.append(attempt_deadline)
            if len(self.requests) == 1:
                clock.value = 75.0
                raise ProviderTransportTimeout()
            clock.value = 90.0
            raise ProviderTransportUnavailable()

    transport = TruncatedRetryTransport([])
    store = _StoreDouble()
    report = await _service(transport, store, monotonic=clock).sync("nasa-exoplanet-archive")

    assert report.failure_code == "provider.timeout"
    assert report.attempts == 2
    assert report.retries == 1
    assert transport.attempt_deadlines == [30.0, 90.0]


@pytest.mark.asyncio
async def test_retry_sleeps_consume_the_single_request_cycle_budget() -> None:
    clock = _Monotonic()
    delays: list[float] = []

    class ExhaustingTransport(DeterministicNasaTransport):
        async def request(
            self,
            request: FixedHttpRequest,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            self.requests.append(request)
            self.attempt_deadlines.append(attempt_deadline)
            clock.value = attempt_deadline or clock.value
            raise ProviderTransportTimeout()

    async def sleeper(delay: float) -> None:
        delays.append(delay)
        clock.value += delay

    transport = ExhaustingTransport([])
    store = _StoreDouble()
    report = await _service(
        transport,
        store,
        sleeper=sleeper,
        monotonic=clock,
    ).sync("nasa-exoplanet-archive")

    assert report.failure_code == "provider.timeout"
    assert report.attempts == 3
    assert report.retries == 2
    assert delays == [1.0, 2.0]
    assert transport.attempt_deadlines == [30.0, 61.0, 90.0]


@pytest.mark.asyncio
async def test_attempt_total_timeout_can_retry_and_succeed_without_circuit_failure() -> None:
    clock = _Monotonic()

    class TimeoutThenSuccessTransport(DeterministicNasaTransport):
        async def request(
            self,
            request: FixedHttpRequest,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            self.requests.append(request)
            self.attempt_deadlines.append(attempt_deadline)
            if len(self.requests) == 1:
                assert attempt_deadline is not None
                clock.value = attempt_deadline
                raise ProviderTransportTimeout()
            return response()

    transport = TimeoutThenSuccessTransport([])
    store = _StoreDouble()

    async def sleeper(delay: float) -> None:
        clock.value += delay

    report = await _service(
        transport,
        store,
        sleeper=sleeper,
        monotonic=clock,
    ).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert report.attempts == 2
    assert report.retries == 1
    assert transport.attempt_deadlines == [30.0, 61.0]
    assert store.failure_calls == []
    assert store.success_calls[0]["retries"] == 1


@pytest.mark.asyncio
async def test_half_open_attempt_uses_same_total_deadline_without_retry() -> None:
    clock = _Monotonic()
    transport = DeterministicNasaTransport([timeout(), response()])
    store = _StoreDouble(
        claim=ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("fixture-half-open", half_open_probe=True),
        )
    )

    report = await _service(transport, store, monotonic=clock).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.attempts == 1
    assert report.retries == 0
    assert transport.attempt_deadlines == [30.0]


@pytest.mark.asyncio
async def test_external_cancellation_closes_transport_and_preserves_lease_fencing() -> None:
    clock = _MutableUtcClock()

    class BlockingTransport:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.closed = asyncio.Event()
            self.requests = 0

        async def request(
            self,
            request: FixedHttpRequest,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            del request, attempt_deadline
            self.requests += 1
            self.started.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                self.closed.set()
                raise
            raise AssertionError("blocking fixture unexpectedly completed")

    cancelled_transport = BlockingTransport()
    store = _CancellationStore(clock)
    cancelled_service = _service(
        cancelled_transport,
        store,
        clock=clock,
        lease_token_factory=lambda: "cancelled-token",
    )
    cancelled_task = asyncio.create_task(cancelled_service.sync("nasa-exoplanet-archive"))
    await cancelled_transport.started.wait()

    cancelled_task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cancelled_task

    assert cancelled_transport.closed.is_set()
    assert store.failure_tokens == []
    assert store.successful_tokens == []
    assert store.active_token == "cancelled-token"

    before_expiry_transport = DeterministicNasaTransport([response()])
    before_expiry_report = await _service(
        before_expiry_transport,
        store,
        clock=clock,
        lease_token_factory=lambda: "blocked-token",
    ).sync("nasa-exoplanet-archive")
    assert before_expiry_report.outcome is ProviderSyncOutcome.ALREADY_RUNNING
    assert before_expiry_transport.requests == []

    clock.value = _NOW.replace(second=0) + timedelta(seconds=121)
    replacement_transport = DeterministicNasaTransport([response()])
    replacement_report = await _service(
        replacement_transport,
        store,
        clock=clock,
        lease_token_factory=lambda: "replacement-token",
    ).sync("nasa-exoplanet-archive")
    assert replacement_report.outcome is ProviderSyncOutcome.SUCCESS
    assert store.successful_tokens == ["replacement-token"]
    assert store.failure_tokens == []

    stale_finalization = await store.finalize_success(
        _config(),
        now=clock.now(),
        lease_token="cancelled-token",
        normalized_payload={"confirmed_planet_count": 6360},
        raw_sha256="a" * 64,
        attempts=1,
        retries=0,
        duration_ms=1,
    )
    assert stale_finalization.outcome is ProviderFinalizationOutcome.FENCED


@pytest.mark.asyncio
async def test_sync_retry_success_counts_transport_retry_not_failed_cycle() -> None:
    transport = DeterministicNasaTransport([timeout(), response()])
    store = _StoreDouble()
    delays: list[float] = []

    async def sleeper(delay: float) -> None:
        delays.append(delay)

    report = await _service(transport, store, sleeper=sleeper).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert report.attempts == 2
    assert report.retries == 1
    assert delays == [1.0]
    assert len(store.failure_calls) == 0
    assert len(store.success_calls) == 1
    assert store.success_calls[0]["normalized_payload"] == {"confirmed_planet_count": 6360}
    assert store.success_calls[0]["raw_sha256"] == hashlib.sha256(VALID_COUNT_BODY).hexdigest()


@pytest.mark.asyncio
async def test_fenced_success_is_not_logged_as_a_successful_provider_cycle(
    caplog: pytest.LogCaptureFixture,
) -> None:
    transport = DeterministicNasaTransport([response()])
    store = _StoreDouble(
        success_result=ProviderFinalization(
            ProviderFinalizationOutcome.FENCED,
            CacheState.FRESH,
        )
    )

    with caplog.at_level(logging.INFO, logger="lumina.provider"):
        report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert [getattr(record, "outcome_code", None) for record in caplog.records] == [
        "provider.fenced"
    ]


@pytest.mark.asyncio
async def test_schema_failure_is_quarantinable_and_never_normalized() -> None:
    malformed = b"count(pl_name)\nnot-a-count\n"
    transport = DeterministicNasaTransport([response(malformed)])
    store = _StoreDouble()

    report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == "provider.payload_invalid"
    assert report.attempts == 1
    assert len(store.success_calls) == 0
    assert len(store.failure_calls) == 1
    failure = store.failure_calls[0]["failure"]
    assert isinstance(failure, ProviderFailure)
    assert failure.kind is CircuitFailureKind.CONTRACT
    assert failure.raw_response is not None
    assert failure.raw_response.body == malformed
    assert failure.raw_response.raw_complete is True
    assert (
        hashlib.sha256(failure.raw_response.body).hexdigest()
        == hashlib.sha256(malformed).hexdigest()
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("claim_outcome", "expected"),
    [
        (ProviderClaimOutcome.DISABLED, ProviderSyncOutcome.DISABLED),
        (ProviderClaimOutcome.CIRCUIT_OPEN, ProviderSyncOutcome.CIRCUIT_OPEN),
        (ProviderClaimOutcome.ALREADY_RUNNING, ProviderSyncOutcome.ALREADY_RUNNING),
        (ProviderClaimOutcome.NOT_DUE, ProviderSyncOutcome.NOT_DUE),
    ],
)
async def test_sync_skips_without_network_for_non_started_claims(
    claim_outcome: ProviderClaimOutcome,
    expected: ProviderSyncOutcome,
) -> None:
    transport = DeterministicNasaTransport([])
    store = _StoreDouble(claim=ProviderClaim(claim_outcome))

    report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.outcome is expected
    assert transport.requests == []
    assert store.success_calls == []
    assert store.failure_calls == []


@pytest.mark.asyncio
async def test_half_open_probe_allows_exactly_one_attempt() -> None:
    transport = DeterministicNasaTransport([timeout(), response()])
    store = _StoreDouble(
        claim=ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease("fixture-half-open", half_open_probe=True),
        )
    )

    report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.attempts == 1
    assert report.retries == 0
    assert len(transport.requests) == 1
    assert len(store.failure_calls) == 1


@pytest.mark.asyncio
async def test_rate_limit_is_immediate_handled_failure_without_transport_retry() -> None:
    transport = DeterministicNasaTransport(
        [response(b"rate limited", status_code=429, headers={"retry-after": "1"})]
    )
    store = _StoreDouble()
    report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == "provider.http_rate_limited"
    assert report.attempts == 1
    assert report.retries == 0
    assert store.failure_calls[0]["failure"].retry_after_seconds == 60


@pytest.mark.asyncio
async def test_oversized_numeric_retry_after_is_bounded_without_leaking_or_aborting() -> None:
    transport = DeterministicNasaTransport(
        [response(b"rate limited", status_code=429, headers={"retry-after": "9" * 4_301})]
    )
    store = _StoreDouble()

    report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.failure_code == "provider.http_rate_limited"
    assert len(store.failure_calls) == 1
    assert store.failure_calls[0]["failure"].retry_after_seconds == 86_400


@pytest.mark.asyncio
async def test_oversized_transport_evidence_is_incomplete_and_not_checksum_claimed() -> None:
    transport = DeterministicNasaTransport([oversized_response()])
    store = _StoreDouble()

    report = await _service(transport, store).sync("nasa-exoplanet-archive")

    assert report.failure_code == "provider.response_too_large"
    failure = store.failure_calls[0]["failure"]
    assert failure.raw_response is not None
    assert failure.raw_response.raw_complete is False
    assert failure.raw_response.observed_bytes == 65_537
    assert not hasattr(failure.raw_response, "raw_sha256")
