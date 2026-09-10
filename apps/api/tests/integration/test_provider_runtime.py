"""Disposable PostgreSQL contracts for the Phase 4A provider runtime path."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from fakes.provider_runtime import DeterministicNasaTransport, response, timeout
from lumina.provenance.application.registry import (
    ProviderRegistration,
    StaticProviderRegistry,
)
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.composition import nasa_runtime_config
from lumina.provenance.domain.runtime import (
    CacheState,
    CircuitFailureKind,
    CircuitState,
    ProviderFailure,
    ProviderFailureCode,
    ProviderFinalizationOutcome,
    ProviderRuntimeConfig,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.http import FixedHttpRequest
from lumina.provenance.infrastructure.nasa_exoplanet_archive import (
    NasaCountRequest,
    NasaExoplanetArchiveAdapter,
)
from lumina.provenance.infrastructure.postgresql.runtime import PostgreSqlProviderRuntimeStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import URL, Connection, text
from sqlalchemy.engine import make_url

from .migration_lifecycle import (
    integration_migration_identity,
    run_alembic,
    run_migration_operation,
)

_PROVIDER_CODE = "nasa-exoplanet-archive"
_NOW = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
_RUNTIME_TABLES = {
    "provider_runtime_state",
    "provider_cache_entry",
    "provider_quarantine_entry",
}


@asynccontextmanager
async def _no_timeout(_deadline: float) -> AsyncIterator[None]:
    """Keep database tests deterministic; deadline behavior has dedicated unit coverage."""
    yield


@dataclass
class _Clock:
    current: datetime = _NOW

    def now(self) -> datetime:
        return self.current


@dataclass
class _ProviderContext:
    settings: IntegrationTestSettings
    config: ProviderRuntimeConfig
    store: PostgreSqlProviderRuntimeStore
    clock: _Clock
    runtime: DatabaseRuntime


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _reset_runtime_state(settings: IntegrationTestSettings) -> None:
    def reset(connection: Connection) -> None:
        connection.execute(text("DELETE FROM public.provider_quarantine_entry"))
        connection.execute(text("DELETE FROM public.provider_cache_entry"))
        connection.execute(
            text(
                "UPDATE public.provider_runtime_state SET enabled = false, "
                "circuit_state = 'closed', consecutive_failures = 0, next_sync_at = NULL, "
                "next_probe_at = NULL, last_attempt_at = NULL, last_success_at = NULL, "
                "last_failure_at = NULL, last_failure_code = NULL, last_http_status = NULL, "
                "last_sync_duration_ms = NULL, active_sync_lease_token = NULL, "
                "active_sync_lease_expires_at = NULL, sync_cycles_started = 0, "
                "sync_successes = 0, sync_upstream_failures = 0, http_requests = 0, "
                "http_retries = 0, schema_failures = 0, quarantines = 0, stale_fallbacks = 0, "
                "circuit_openings = 0, disabled_skips = 0, circuit_open_skips = 0, "
                "concurrent_lease_skips = 0 WHERE provider_code = :provider_code"
            ),
            {"provider_code": _PROVIDER_CODE},
        )
        connection.commit()

    run_migration_operation(_sync_url(settings), reset)


@pytest_asyncio.fixture
async def provider_context(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[_ProviderContext]:
    """Use only the disposable integration database and restore its provider row."""
    _reset_runtime_state(integration_settings)
    runtime = create_database_runtime(integration_settings.test_database_url)
    context = _ProviderContext(
        settings=integration_settings,
        config=nasa_runtime_config(),
        store=PostgreSqlProviderRuntimeStore(runtime.session_factory),
        clock=_Clock(),
        runtime=runtime,
    )
    try:
        yield context
    finally:
        await runtime.engine.dispose()
        _reset_runtime_state(integration_settings)


def _service(
    context: _ProviderContext,
    transport: Any,
    *,
    sleeper: Callable[[float], Any] | None = None,
) -> ProviderSyncService:
    registration = ProviderRegistration(
        config=context.config,
        adapter=NasaExoplanetArchiveAdapter(
            transport,
            source_manifest=context.config.source_manifest,
        ),
        request_factory=NasaCountRequest,
    )
    registry = StaticProviderRegistry({_PROVIDER_CODE: registration})

    async def no_sleep(_delay: float) -> None:
        return None

    return ProviderSyncService(
        registry=registry,
        store=context.store,
        clock=context.clock,
        sleeper=sleeper or no_sleep,
        monotonic=lambda: 1.0,
        timeout_at=_no_timeout,
        lease_token_factory=lambda: "integration-provider-lease-token",
    )


def test_provider_migration_round_trips_only_its_three_operational_tables(
    integration_settings: IntegrationTestSettings,
) -> None:
    identity = integration_migration_identity(integration_settings)
    url = _sync_url(integration_settings)

    def operation(connection: Connection) -> None:
        assert connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one() == ("d7e8f9a0b1c2")
        run_alembic(connection, identity, "c9f6a2b3d4e5", downgrade=True)
        remaining = set(
            connection.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
                    "AND tablename = ANY(CAST(:tables AS text[]))"
                ),
                {"tables": list(_RUNTIME_TABLES)},
            ).scalars()
        )
        assert remaining == set()
        run_alembic(connection, identity, "head", downgrade=False)
        assert connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one() == ("d7e8f9a0b1c2")
        seed = connection.execute(
            text(
                "SELECT enabled, circuit_state FROM public.provider_runtime_state "
                "WHERE provider_code = :provider_code"
            ),
            {"provider_code": _PROVIDER_CODE},
        ).one()
        assert tuple(seed) == (False, "closed")

    run_migration_operation(url, operation)


def test_provider_runtime_acl_is_least_privilege(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime_role = make_url(integration_settings.test_database_url.get_secret_value()).username
    assert runtime_role is not None

    def inspect(connection: Connection) -> None:
        for table in _RUNTIME_TABLES:
            expected = {
                "provider_runtime_state": {"SELECT", "UPDATE"},
                "provider_cache_entry": {"SELECT", "INSERT", "UPDATE"},
                "provider_quarantine_entry": {"SELECT", "INSERT", "UPDATE"},
            }[table]
            for privilege in {
                "SELECT",
                "INSERT",
                "UPDATE",
                "DELETE",
                "TRUNCATE",
                "REFERENCES",
                "TRIGGER",
            }:
                actual = connection.execute(
                    text(
                        "SELECT has_table_privilege(:role, "
                        "format('public.%I', CAST(:table AS text)), :privilege)"
                    ),
                    {"role": runtime_role, "table": table, "privilege": privilege},
                ).scalar_one()
                assert bool(actual) is (privilege in expected)
            public_select = connection.execute(
                text(
                    "SELECT has_table_privilege('public', "
                    "format('public.%I', CAST(:table AS text)), 'SELECT')"
                ),
                {"table": table},
            ).scalar_one()
            assert bool(public_select) is False

    run_migration_operation(_sync_url(integration_settings), inspect)


@pytest.mark.asyncio
async def test_fake_provider_gate_success_stale_fallback_and_expiry(
    provider_context: _ProviderContext,
) -> None:
    outcomes: list[RawProviderResponse | BaseException] = [response()]
    outcomes.extend(timeout() for _ in range(6))
    transport = DeterministicNasaTransport(outcomes)
    service = _service(provider_context, transport)
    await provider_context.store.set_enabled(
        provider_context.config,
        enabled=True,
        now=provider_context.clock.now(),
    )

    success = await service.sync(_PROVIDER_CODE)
    assert success.outcome is ProviderSyncOutcome.SUCCESS
    assert success.normalized_payload == {"confirmed_planet_count": 6360}
    assert success.raw_sha256 is not None
    fresh = await provider_context.store.status(
        provider_context.config,
        now=provider_context.clock.now(),
    )
    assert fresh.cache_state is CacheState.FRESH
    assert fresh.cache is not None

    provider_context.clock.current = _NOW + timedelta(hours=8, minutes=1)
    stale = await service.sync(_PROVIDER_CODE)
    assert stale.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert stale.stale_fallback is True
    stale_status = await provider_context.store.status(
        provider_context.config,
        now=provider_context.clock.now(),
    )
    assert stale_status.cache_state is CacheState.STALE
    assert stale_status.cache is not None
    assert stale_status.cache.normalized_payload == {"confirmed_planet_count": 6360}
    assert stale_status.state.counters.stale_fallbacks == 1

    provider_context.clock.current = _NOW + timedelta(hours=80, minutes=1)
    expired = await service.sync(_PROVIDER_CODE)
    assert expired.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert expired.cache_state == "expired"
    expired_status = await provider_context.store.status(
        provider_context.config,
        now=provider_context.clock.now(),
    )
    assert expired_status.cache_state is CacheState.EXPIRED


@pytest.mark.asyncio
async def test_schema_failure_quarantines_without_replacing_good_cache(
    provider_context: _ProviderContext,
) -> None:
    valid = response()
    malformed = response(b"count(pl_name)\nnot-a-count\n")
    transport = DeterministicNasaTransport([valid, malformed])
    service = _service(provider_context, transport)
    await provider_context.store.set_enabled(
        provider_context.config,
        enabled=True,
        now=provider_context.clock.now(),
    )
    assert (await service.sync(_PROVIDER_CODE)).outcome is ProviderSyncOutcome.SUCCESS

    provider_context.clock.current = _NOW + timedelta(hours=6)
    failed = await service.sync(_PROVIDER_CODE)
    assert failed.failure_code == "provider.payload_invalid"
    assert failed.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    status = await provider_context.store.status(
        provider_context.config,
        now=provider_context.clock.now(),
    )
    assert status.cache is not None
    assert status.cache.normalized_payload == {"confirmed_planet_count": 6360}
    assert status.quarantine_exists is True
    assert status.quarantine_failure_code is not None
    assert status.quarantine_failure_code.value == "provider.payload_invalid"
    assert status.quarantine_raw_sha256 is not None
    assert status.state.circuit_state is CircuitState.OPEN
    assert status.state.next_probe_at == _NOW + timedelta(hours=12)


@pytest.mark.asyncio
async def test_transient_circuit_opens_then_one_half_open_probe_recovers(
    provider_context: _ProviderContext,
) -> None:
    outcomes: list[RawProviderResponse | BaseException] = [timeout() for _ in range(9)]
    outcomes.append(response())
    transport = DeterministicNasaTransport(outcomes)
    service = _service(provider_context, transport)
    await provider_context.store.set_enabled(
        provider_context.config,
        enabled=True,
        now=provider_context.clock.now(),
    )

    for current in (_NOW, _NOW + timedelta(hours=1), _NOW + timedelta(hours=2)):
        provider_context.clock.current = current
        report = await service.sync(_PROVIDER_CODE)
        assert report.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE

    skipped = await service.sync(_PROVIDER_CODE)
    assert skipped.outcome is ProviderSyncOutcome.CIRCUIT_OPEN
    assert len(transport.requests) == 9

    provider_context.clock.current = _NOW + timedelta(hours=3)
    recovered = await service.sync(_PROVIDER_CODE)
    assert recovered.outcome is ProviderSyncOutcome.SUCCESS
    assert recovered.attempts == 1
    status = await provider_context.store.status(
        provider_context.config,
        now=provider_context.clock.now(),
    )
    assert status.state.circuit_state is CircuitState.CLOSED
    assert status.state.consecutive_failures == 0


@pytest.mark.asyncio
async def test_disable_fences_inflight_result_and_reenable_is_immediately_eligible(
    provider_context: _ProviderContext,
) -> None:
    class BlockingTransport:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.release = asyncio.Event()
            self.requests: list[FixedHttpRequest] = []

        async def request(
            self,
            request: FixedHttpRequest,
            *,
            attempt_deadline: float | None = None,
        ) -> RawProviderResponse:
            del attempt_deadline
            self.requests.append(request)
            self.started.set()
            await self.release.wait()
            return response()

    transport = BlockingTransport()
    service = _service(provider_context, transport)
    await provider_context.store.set_enabled(
        provider_context.config,
        enabled=True,
        now=provider_context.clock.now(),
    )
    running = asyncio.create_task(service.sync(_PROVIDER_CODE))
    await asyncio.wait_for(transport.started.wait(), timeout=2)

    contender = await service.sync(_PROVIDER_CODE)
    assert contender.outcome is ProviderSyncOutcome.ALREADY_RUNNING
    disabled = await provider_context.store.set_enabled(
        provider_context.config,
        enabled=False,
        now=provider_context.clock.now(),
    )
    assert disabled.state.enabled is False
    transport.release.set()
    fenced = await running
    assert fenced.outcome is not ProviderSyncOutcome.SUCCESS
    assert len(transport.requests) == 1

    disabled_skip = await service.sync(_PROVIDER_CODE)
    assert disabled_skip.outcome is ProviderSyncOutcome.DISABLED
    assert len(transport.requests) == 1

    await provider_context.store.set_enabled(
        provider_context.config,
        enabled=True,
        now=provider_context.clock.now(),
    )
    reenabled = await service.sync(_PROVIDER_CODE)
    assert reenabled.outcome is ProviderSyncOutcome.SUCCESS
    assert len(transport.requests) == 2


@pytest.mark.asyncio
async def test_expired_matching_lease_fences_success_and_failure_finalization(
    provider_context: _ProviderContext,
) -> None:
    await provider_context.store.set_enabled(
        provider_context.config,
        enabled=True,
        now=_NOW,
    )

    first = await provider_context.store.acquire(
        provider_context.config,
        now=_NOW,
        lease_token="expired-success-token",
        lease_expires_at=_NOW + timedelta(seconds=120),
    )
    assert first.outcome.value == "started"
    expired_at = _NOW + timedelta(seconds=121)
    success = await provider_context.store.finalize_success(
        provider_context.config,
        now=expired_at,
        lease_token="expired-success-token",
        normalized_payload={"confirmed_planet_count": 6360},
        raw_sha256="a" * 64,
        attempts=1,
        retries=0,
        duration_ms=1,
    )
    assert success.outcome is ProviderFinalizationOutcome.FENCED

    second = await provider_context.store.acquire(
        provider_context.config,
        now=expired_at,
        lease_token="expired-failure-token",
        lease_expires_at=expired_at - timedelta(seconds=1),
    )
    assert second.outcome.value == "started"
    failure = await provider_context.store.finalize_failure(
        provider_context.config,
        now=expired_at,
        lease_token="expired-failure-token",
        failure=ProviderFailure(
            code=ProviderFailureCode.TIMEOUT,
            kind=CircuitFailureKind.TRANSIENT,
        ),
        attempts=1,
        retries=0,
        duration_ms=1,
    )
    assert failure.outcome is ProviderFinalizationOutcome.FENCED

    status = await provider_context.store.status(
        provider_context.config,
        now=expired_at,
    )
    assert status.cache is None
    assert status.state.counters.sync_successes == 0
    assert status.state.counters.sync_upstream_failures == 0
