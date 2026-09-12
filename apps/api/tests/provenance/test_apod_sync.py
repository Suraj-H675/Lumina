"""Deterministic APOD provider-sync freshness, outage, and replacement contracts."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, fields
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fakes.provider_runtime import DeterministicNasaTransport, timeout
from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.composition import nasa_apod_runtime_config
from lumina.provenance.domain.apod import NasaApodCodec, NasaApodNormalized
from lumina.provenance.domain.runtime import (
    APOD_PROVIDER_CODE,
    CacheState,
    CircuitFailureKind,
    CircuitState,
    NormalizedPayload,
    ProviderCacheEntry,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFailure,
    ProviderFailureCode,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderPayloadCodec,
    ProviderRuntimeConfig,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    ProviderSyncOutcome,
    RawProviderResponse,
    RuntimeCounters,
)
from lumina.provenance.infrastructure.nasa_apod import NasaApodAdapter, NasaApodRequest
from pydantic import SecretStr

_NOW = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider"
_TEST_KEY = "fixture-apod-key-2026"
_TEST_SECRET = SecretStr(_TEST_KEY)


def _json_response(
    body: bytes,
    *,
    status_code: int = 200,
    content_type: str = "application/json; charset=utf-8",
) -> RawProviderResponse:
    return RawProviderResponse(
        status_code=status_code,
        headers={"content-type": content_type},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=content_type.split(";", 1)[0].strip().lower() == "application/json",
    )


def _fixture(name: str) -> bytes:
    return (_FIXTURES / name).read_bytes()


def _rollback_body() -> bytes:
    return json.dumps(
        {
            "date": "2026-09-08",
            "title": "Rollback fixture",
            "explanation": "This otherwise-valid fixture is older than the accepted cache.",
            "media_type": "image",
            "url": "https://example.invalid/apod/rollback.jpg",
            "service_version": "v1",
        },
        separators=(",", ":"),
    ).encode()


def _oversized_apod_body() -> bytes:
    return json.dumps(
        {
            "date": "2026-09-10",
            "title": "T" * 512,
            "explanation": "x" * 60_000,
            "media_type": "image",
            "url": "https://example.invalid/apod/fixture.jpg",
            "hdurl": "https://example.invalid/apod/fixture-hd.jpg",
            "thumbnail_url": "https://example.invalid/apod/fixture-thumb.jpg",
            "copyright": "C" * 512,
            "service_version": "v1",
        },
        separators=(",", ":"),
    ).encode()


def _legacy_oversized_cache() -> ProviderCacheEntry:
    normalized = NasaApodNormalized(
        date="2026-09-09",
        title="T" * 512,
        explanation="x" * 60_000,
        media_type="image",
        source_media_url="https://example.invalid/apod/fixture.jpg",
        source_hd_media_url="https://example.invalid/apod/fixture-hd.jpg",
        source_thumbnail_url="https://example.invalid/apod/fixture-thumb.jpg",
        copyright="C" * 512,
        service_version="v1",
    )
    return ProviderCacheEntry(
        provider_code=APOD_PROVIDER_CODE,
        cache_key="daily-media",
        normalized_payload=NasaApodCodec().encode(normalized),
        schema_version="apod-v1-json-v1",
        raw_sha256="a" * 64,
        fetched_at=_NOW,
        fresh_until=_NOW + timedelta(hours=6),
        stale_until=_NOW + timedelta(hours=78),
    )


@dataclass
class _ApodStore:
    """Small stateful test double exercising the public sync-store seam."""

    enabled: bool = True
    cache: ProviderCacheEntry | None = None
    circuit_state: CircuitState = CircuitState.CLOSED
    consecutive_failures: int = 0
    next_sync_at: datetime | None = None
    next_probe_at: datetime | None = None
    active_token: str | None = None
    lease_expires_at: datetime | None = None
    last_attempt_at: datetime | None = None
    last_success_at: datetime | None = None
    last_failure_at: datetime | None = None
    last_failure_code: ProviderFailureCode | None = None
    last_http_status: int | None = None
    failure_calls: list[ProviderFailure] = field(default_factory=list)
    quarantine_exists: bool = False
    counters: RuntimeCounters = field(default_factory=RuntimeCounters)

    async def acquire(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        lease_expires_at: datetime,
    ) -> ProviderClaim:
        del config
        if not self.enabled:
            self.counters = _increment(self.counters, "disabled_skips")
            return ProviderClaim(ProviderClaimOutcome.DISABLED)
        if (
            self.active_token is not None
            and self.lease_expires_at is not None
            and self.lease_expires_at > now
        ):
            self.counters = _increment(self.counters, "concurrent_lease_skips")
            return ProviderClaim(ProviderClaimOutcome.ALREADY_RUNNING)
        half_open = False
        if self.circuit_state is CircuitState.OPEN:
            if self.next_probe_at is None or now < self.next_probe_at:
                self.counters = _increment(self.counters, "circuit_open_skips")
                return ProviderClaim(ProviderClaimOutcome.CIRCUIT_OPEN)
            half_open = True
        elif self.circuit_state is CircuitState.HALF_OPEN:
            half_open = True
        if not half_open and self.next_sync_at is not None and now < self.next_sync_at:
            return ProviderClaim(ProviderClaimOutcome.NOT_DUE)
        self.active_token = lease_token
        self.lease_expires_at = lease_expires_at
        self.last_attempt_at = now
        self.circuit_state = CircuitState.HALF_OPEN if half_open else CircuitState.CLOSED
        self.counters = _increment(self.counters, "sync_cycles_started")
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease(lease_token, half_open_probe=half_open),
        )

    async def finalize_success(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        normalized_payload: NormalizedPayload,
        payload_codec: ProviderPayloadCodec,
        raw_sha256: str,
        attempts: int,
        retries: int,
        duration_ms: int,
    ) -> ProviderFinalization:
        del duration_ms
        if not self._owns(lease_token, now):
            return ProviderFinalization(ProviderFinalizationOutcome.FENCED, self._cache_state(now))
        canonical = payload_codec.encode(payload_codec.decode(normalized_payload))
        self.cache = ProviderCacheEntry(
            provider_code=config.provider_code,
            cache_key=config.cache_key,
            normalized_payload=canonical,
            schema_version=config.source_schema_version,
            raw_sha256=raw_sha256,
            fetched_at=now,
            fresh_until=now + config.fresh_ttl,
            stale_until=now + config.stale_ttl,
        )
        self._clear_lease()
        self.circuit_state = CircuitState.CLOSED
        self.consecutive_failures = 0
        self.next_sync_at = now + config.refresh_interval
        self.next_probe_at = None
        self.last_success_at = now
        self.last_failure_code = None
        self.last_http_status = None
        self.counters = _increment(
            self.counters,
            "sync_successes",
            amount=1,
        )
        self.counters = _increment(self.counters, "http_requests", amount=attempts)
        self.counters = _increment(self.counters, "http_retries", amount=retries)
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
        del duration_ms
        current_state = self._cache_state(now)
        if not self._owns(lease_token, now):
            return ProviderFinalization(ProviderFinalizationOutcome.FENCED, current_state)
        self.failure_calls.append(failure)
        if failure.raw_response is not None:
            self.quarantine_exists = True
        self._clear_lease()
        self.last_failure_at = now
        self.last_failure_code = failure.code
        self.last_http_status = failure.http_status
        if failure.kind is CircuitFailureKind.TRANSIENT:
            self.consecutive_failures += 1
            is_open = self.consecutive_failures >= config.transient_failure_threshold
            interval = config.transient_open_interval
        elif failure.kind is CircuitFailureKind.RATE_LIMIT:
            is_open = True
            interval = timedelta(seconds=failure.retry_after_seconds or 3_600)
        else:
            is_open = True
            interval = config.contract_open_interval
        self.circuit_state = CircuitState.OPEN if is_open else CircuitState.CLOSED
        self.next_sync_at = now + (interval if is_open else timedelta(hours=1))
        self.next_probe_at = self.next_sync_at if is_open else None
        self.counters = _increment(self.counters, "sync_upstream_failures")
        self.counters = _increment(self.counters, "http_requests", amount=attempts)
        self.counters = _increment(self.counters, "http_retries", amount=retries)
        self.counters = _increment(
            self.counters,
            "schema_failures",
            amount=int(failure.code is ProviderFailureCode.PAYLOAD_INVALID),
        )
        self.counters = _increment(
            self.counters,
            "quarantines",
            amount=int(failure.raw_response is not None),
        )
        self.counters = _increment(
            self.counters,
            "stale_fallbacks",
            amount=int(current_state is CacheState.STALE),
        )
        self.counters = _increment(self.counters, "circuit_openings", amount=int(is_open))
        return ProviderFinalization(
            ProviderFinalizationOutcome.COMMITTED,
            current_state,
            stale_fallback=current_state is CacheState.STALE,
        )

    async def status(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        payload_codec: ProviderPayloadCodec,
    ) -> ProviderStatusSnapshot:
        if self.cache is not None:
            payload_codec.decode(self.cache.normalized_payload)
        return ProviderStatusSnapshot(
            state=self._state(config, now),
            cache=self.cache,
            cache_state=self._cache_state(now),
            quarantine_exists=self.quarantine_exists,
            quarantine_observed_at=None,
            quarantine_failure_code=None,
            quarantine_raw_sha256=None,
        )

    async def set_enabled(
        self,
        config: ProviderRuntimeConfig,
        *,
        enabled: bool,
        now: datetime,
        payload_codec: ProviderPayloadCodec,
    ) -> ProviderStatusSnapshot:
        del payload_codec
        self.enabled = enabled
        if enabled:
            self.circuit_state = CircuitState.CLOSED
            self.consecutive_failures = 0
            self.next_sync_at = now
            self.next_probe_at = None
        self._clear_lease()
        return await self.status(config, now=now, payload_codec=NasaApodCodec())

    def _owns(self, token: str, now: datetime) -> bool:
        return (
            self.active_token == token
            and self.lease_expires_at is not None
            and now < self.lease_expires_at
        )

    def _clear_lease(self) -> None:
        self.active_token = None
        self.lease_expires_at = None

    def _cache_state(self, now: datetime) -> CacheState:
        return CacheState.MISSING if self.cache is None else self.cache.state_at(now)

    def _state(self, config: ProviderRuntimeConfig, now: datetime) -> ProviderRuntimeState:
        return ProviderRuntimeState(
            provider_code=config.provider_code,
            enabled=self.enabled,
            circuit_state=self.circuit_state,
            consecutive_failures=self.consecutive_failures,
            next_sync_at=self.next_sync_at,
            next_probe_at=self.next_probe_at,
            last_attempt_at=self.last_attempt_at,
            last_success_at=self.last_success_at,
            last_failure_at=self.last_failure_at,
            last_failure_code=self.last_failure_code,
            last_http_status=self.last_http_status,
            last_sync_duration_ms=None,
            sync_lease_active=self.active_token is not None,
            lease_expires_at=self.lease_expires_at,
            counters=self.counters,
            updated_at=now,
        )


def _increment(counters: RuntimeCounters, field_name: str, *, amount: int = 1) -> RuntimeCounters:
    values = {
        definition.name: getattr(counters, definition.name) for definition in fields(counters)
    }
    values[field_name] += amount
    return RuntimeCounters(**values)


@dataclass
class _Clock:
    current: datetime = _NOW

    def now(self) -> datetime:
        return self.current


async def _no_sleep(_delay: float) -> None:
    return None


def _service(
    transport: DeterministicNasaTransport,
    store: _ApodStore,
    clock: _Clock,
    *,
    api_key: SecretStr | None = _TEST_SECRET,
) -> ProviderSyncService:
    config = nasa_apod_runtime_config()
    adapter = NasaApodAdapter(
        transport,
        api_key=api_key,
        source_manifest=config.source_manifest,
        clock=clock.now,
    )
    registration = ProviderRegistration(
        config=config,
        adapter=adapter,
        request_factory=NasaApodRequest,
        payload_codec=NasaApodCodec(),
        check_replacement=True,
        configuration_check=adapter.is_configured,
    )
    registry = StaticProviderRegistry({APOD_PROVIDER_CODE: registration})
    return ProviderSyncService(
        registry=registry,
        store=store,
        clock=clock,
        sleeper=_no_sleep,
        monotonic=lambda: 1.0,
        timeout_at=lambda _deadline: _NoTimeoutContext(),
        lease_token_factory=lambda: "fixture-apod-lease",
    )


class _NoTimeoutContext:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *_args: object) -> bool:
        return False


@pytest.mark.asyncio
async def test_apod_sync_applies_four_hour_refresh_and_six_hour_fresh_policy() -> None:
    clock = _Clock()
    store = _ApodStore()
    transport = DeterministicNasaTransport([_json_response(_fixture("nasa-apod-image.json"))])
    service = _service(transport, store, clock)

    success = await service.sync(APOD_PROVIDER_CODE)

    assert success.outcome is ProviderSyncOutcome.SUCCESS
    assert store.cache is not None
    assert store.next_sync_at == _NOW + timedelta(hours=4)
    assert store.cache.fresh_until == _NOW + timedelta(hours=6)
    assert store.cache.stale_until == _NOW + timedelta(hours=78)
    assert store.cache.normalized_payload["date"] == "2026-09-09"

    clock.current = _NOW + timedelta(hours=1)
    not_due = await service.sync(APOD_PROVIDER_CODE)
    assert not_due.outcome is ProviderSyncOutcome.NOT_DUE
    assert len(transport.requests) == 1


@pytest.mark.asyncio
async def test_apod_outage_preserves_stale_snapshot_then_expires_it() -> None:
    clock = _Clock()
    store = _ApodStore()
    transport = DeterministicNasaTransport(
        [
            _json_response(_fixture("nasa-apod-image.json")),
            timeout(),
            timeout(),
            timeout(),
            timeout(),
            timeout(),
            timeout(),
        ]
    )
    service = _service(transport, store, clock)
    await service.sync(APOD_PROVIDER_CODE)

    clock.current = _NOW + timedelta(hours=7)
    stale = await service.sync(APOD_PROVIDER_CODE)
    assert stale.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert stale.stale_fallback is True
    assert stale.cache_state == "stale"
    assert store.cache is not None
    assert store.cache.normalized_payload["date"] == "2026-09-09"
    assert store.cache.fetched_at == _NOW

    clock.current = _NOW + timedelta(hours=79)
    expired = await service.sync(APOD_PROVIDER_CODE)
    assert expired.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert expired.stale_fallback is False
    assert expired.cache_state == "expired"
    assert store.cache is not None
    assert store.cache.state_at(clock.now()) is CacheState.EXPIRED


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("outcome", "expected_code", "expected_attempts"),
    [
        (
            [_json_response(b'{"error":"limited"}', status_code=429)],
            "provider.http_rate_limited",
            1,
        ),
        (
            [
                _json_response(b"server", status_code=500),
                _json_response(b"server", status_code=500),
                _json_response(b"server", status_code=500),
            ],
            "provider.http_server_error",
            3,
        ),
        ([timeout(), timeout(), timeout()], "provider.timeout", 3),
    ],
)
async def test_apod_provider_failures_use_existing_transport_categories(
    outcome: list[RawProviderResponse | BaseException],
    expected_code: str,
    expected_attempts: int,
) -> None:
    clock = _Clock()
    store = _ApodStore()
    transport = DeterministicNasaTransport(outcome)
    service = _service(transport, store, clock)

    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == expected_code
    assert report.attempts == expected_attempts
    assert len(transport.requests) == expected_attempts
    assert store.failure_calls
    assert store.failure_calls[-1].kind in {
        CircuitFailureKind.TRANSIENT,
        CircuitFailureKind.RATE_LIMIT,
    }


@pytest.mark.asyncio
async def test_apod_missing_key_is_not_a_provider_failure_or_network_attempt() -> None:
    clock = _Clock()
    store = _ApodStore()
    transport = DeterministicNasaTransport([])
    service = _service(transport, store, clock, api_key=None)

    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.NOT_CONFIGURED
    assert report.failure_code == "provider.not_configured"
    assert transport.requests == []
    assert store.failure_calls == []
    assert store.circuit_state is CircuitState.CLOSED


@pytest.mark.asyncio
async def test_disabled_apod_stays_disabled_even_without_a_key() -> None:
    clock = _Clock()
    store = _ApodStore(enabled=False)
    transport = DeterministicNasaTransport([])
    service = _service(transport, store, clock, api_key=None)

    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.DISABLED
    assert report.failure_code == "provider.disabled"
    assert transport.requests == []
    assert store.failure_calls == []
    assert store.counters.disabled_skips == 0


@pytest.mark.asyncio
async def test_older_apod_response_is_quarantined_without_rolling_back_cache() -> None:
    clock = _Clock()
    store = _ApodStore()
    transport = DeterministicNasaTransport(
        [
            _json_response(_fixture("nasa-apod-image.json")),
            _json_response(_rollback_body()),
        ]
    )
    service = _service(transport, store, clock)
    await service.sync(APOD_PROVIDER_CODE)
    assert store.cache is not None
    original = store.cache

    clock.current = _NOW + timedelta(hours=5)
    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == ProviderFailureCode.PAYLOAD_INVALID.value
    assert store.failure_calls[-1].kind is CircuitFailureKind.CONTRACT
    assert store.failure_calls[-1].raw_response is not None
    assert store.quarantine_exists is True
    assert store.cache == original
    assert store.circuit_state is CircuitState.OPEN


@pytest.mark.asyncio
async def test_apod_payload_schema_failure_is_quarantined_and_does_not_replace_cache() -> None:
    clock = _Clock()
    store = _ApodStore()
    malformed = json.dumps(
        {
            "date": "2026-09-10",
            "title": "Malformed",
            "explanation": "Missing media type.",
            "url": "https://example.invalid/malformed.jpg",
            "service_version": "v1",
        }
    ).encode()
    transport = DeterministicNasaTransport(
        [_json_response(_fixture("nasa-apod-image.json")), _json_response(malformed)]
    )
    service = _service(transport, store, clock)
    await service.sync(APOD_PROVIDER_CODE)
    original = store.cache

    clock.current = _NOW + timedelta(hours=5)
    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == ProviderFailureCode.PAYLOAD_INVALID.value
    assert store.quarantine_exists is True
    assert store.cache == original
    assert store.counters.schema_failures == 1


@pytest.mark.asyncio
async def test_oversized_apod_content_fails_normalization_and_preserves_last_good_cache() -> None:
    clock = _Clock()
    original = _legacy_oversized_cache()
    store = _ApodStore(cache=original)
    transport = DeterministicNasaTransport([_json_response(_oversized_apod_body())])
    service = _service(transport, store, clock)

    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert report.failure_code == ProviderFailureCode.NORMALIZATION_FAILED.value
    assert store.cache == original
    assert store.failure_calls[-1].code is ProviderFailureCode.NORMALIZATION_FAILED
    assert store.failure_calls[-1].raw_response is not None
    assert store.quarantine_exists is True


@pytest.mark.asyncio
async def test_valid_apod_replacement_recovers_from_legacy_oversized_cache() -> None:
    clock = _Clock()
    store = _ApodStore(cache=_legacy_oversized_cache())
    transport = DeterministicNasaTransport([_json_response(_fixture("nasa-apod-image.json"))])
    service = _service(transport, store, clock)

    report = await service.sync(APOD_PROVIDER_CODE)

    assert report.outcome is ProviderSyncOutcome.SUCCESS
    assert store.cache is not None
    assert store.cache.normalized_payload["date"] == "2026-09-09"
    assert store.cache.normalized_payload["title"] == "Fixture Image APOD"
    assert store.cache.normalized_payload["explanation"] != "x" * 60_000
