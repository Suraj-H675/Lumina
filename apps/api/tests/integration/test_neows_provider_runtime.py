"""PostgreSQL-backed NeoWs cache, outage, and quarantine contracts."""

from __future__ import annotations

import hashlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
import pytest_asyncio
from lumina.provenance.application.registry import ProviderRegistration, StaticProviderRegistry
from lumina.provenance.application.sync import ProviderSyncService
from lumina.provenance.composition import nasa_neows_runtime_config
from lumina.provenance.domain.neows import NasaNeowsCodec
from lumina.provenance.domain.runtime import (
    NEOWS_MAX_RESPONSE_BYTES,
    NEOWS_PROVIDER_CODE,
    CacheState,
    ProviderRuntimeConfig,
    ProviderSyncOutcome,
    RawProviderResponse,
)
from lumina.provenance.infrastructure.http import (
    FixedHttpRequest,
    ProviderTransportUnavailable,
)
from lumina.provenance.infrastructure.nasa_neows import NasaNeowsAdapter
from lumina.provenance.infrastructure.postgresql.runtime import PostgreSqlProviderRuntimeStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from pydantic import SecretStr
from sqlalchemy import URL, Connection, text
from sqlalchemy.engine import make_url

from .migration_lifecycle import run_migration_operation

_NOW = datetime(2026, 9, 12, 12, 0, tzinfo=UTC)
_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider"
_KEY = "fixture-neows-key-2026"


@asynccontextmanager
async def _no_timeout(_deadline: float) -> AsyncIterator[None]:
    """Keep the database-backed cycle deterministic; deadlines have unit coverage."""
    yield


@dataclass
class _Clock:
    current: datetime = _NOW

    def now(self) -> datetime:
        return self.current


@dataclass
class _ReplayTransport:
    outcomes: list[RawProviderResponse | BaseException]
    requests: list[FixedHttpRequest]

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        del attempt_deadline
        self.requests.append(request)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome


@dataclass
class _Context:
    settings: IntegrationTestSettings
    config: ProviderRuntimeConfig
    store: PostgreSqlProviderRuntimeStore
    runtime: DatabaseRuntime
    clock: _Clock


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _reset_neows(settings: IntegrationTestSettings) -> None:
    def reset(connection: Connection) -> None:
        connection.execute(
            text("DELETE FROM public.provider_quarantine_entry WHERE provider_code = 'nasa-neows'")
        )
        connection.execute(
            text("DELETE FROM public.provider_cache_entry WHERE provider_code = 'nasa-neows'")
        )
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
                "concurrent_lease_skips = 0 WHERE provider_code = 'nasa-neows'"
            )
        )
        connection.commit()

    run_migration_operation(_sync_url(settings), reset)


@pytest_asyncio.fixture
async def neows_context(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[_Context]:
    """Use only the disposable integration database and restore the NEO row."""
    _reset_neows(integration_settings)
    runtime = create_database_runtime(integration_settings.test_database_url)
    context = _Context(
        settings=integration_settings,
        config=nasa_neows_runtime_config(),
        store=PostgreSqlProviderRuntimeStore(runtime.session_factory),
        runtime=runtime,
        clock=_Clock(),
    )
    try:
        yield context
    finally:
        await runtime.engine.dispose()
        _reset_neows(integration_settings)


def _raw(body: bytes) -> RawProviderResponse:
    return RawProviderResponse(
        status_code=200,
        headers={"content-type": "application/json"},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=True,
        max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
    )


def _fixture_raw() -> RawProviderResponse:
    return _raw((_FIXTURES / "nasa-neows-feed.json").read_bytes())


def _service(
    context: _Context,
    transport: _ReplayTransport,
) -> ProviderSyncService:
    adapter = NasaNeowsAdapter(
        transport,
        api_key=SecretStr(_KEY),
        source_manifest=context.config.source_manifest,
        clock=context.clock.now,
    )
    registration = ProviderRegistration(
        config=context.config,
        adapter=adapter,
        request_factory=adapter.new_request,
        payload_codec=NasaNeowsCodec(),
        check_replacement=True,
        configuration_check=adapter.is_configured,
    )
    return ProviderSyncService(
        registry=StaticProviderRegistry({NEOWS_PROVIDER_CODE: registration}),
        store=context.store,
        clock=context.clock,
        sleeper=lambda _delay: _completed_sleep(),
        monotonic=lambda: 1.0,
        timeout_at=_no_timeout,
        lease_token_factory=lambda: "integration-neows-lease-token",
    )


async def _completed_sleep() -> None:
    return None


@pytest.mark.asyncio
async def test_neows_postgresql_cache_preserves_nested_payload_through_outage_and_expiry(
    neows_context: _Context,
) -> None:
    transport = _ReplayTransport(
        [_fixture_raw(), *(ProviderTransportUnavailable() for _ in range(6))], []
    )
    service = _service(neows_context, transport)
    await neows_context.store.set_enabled(
        neows_context.config,
        enabled=True,
        now=_NOW,
        payload_codec=NasaNeowsCodec(),
    )

    success = await service.sync(NEOWS_PROVIDER_CODE)
    assert success.outcome is ProviderSyncOutcome.SUCCESS
    assert success.normalized_payload is not None
    assert len(success.normalized_payload["encounters"]) == 3  # type: ignore[arg-type]
    assert success.raw_sha256 == hashlib.sha256(_fixture_raw().body).hexdigest()

    fresh = await neows_context.store.status(
        neows_context.config,
        now=_NOW,
        payload_codec=NasaNeowsCodec(),
    )
    assert fresh.cache_state is CacheState.FRESH
    assert fresh.cache is not None
    assert len(NasaNeowsCodec().decode(fresh.cache.normalized_payload).encounters) == 3

    neows_context.clock.current = _NOW + timedelta(hours=3, minutes=1)
    stale = await service.sync(NEOWS_PROVIDER_CODE)
    assert stale.outcome is ProviderSyncOutcome.STALE_FALLBACK
    assert stale.stale_fallback is True
    stale_status = await neows_context.store.status(
        neows_context.config,
        now=neows_context.clock.now(),
        payload_codec=NasaNeowsCodec(),
    )
    assert stale_status.cache_state is CacheState.STALE
    assert stale_status.cache is not None
    assert len(NasaNeowsCodec().decode(stale_status.cache.normalized_payload).encounters) == 3

    neows_context.clock.current = _NOW + timedelta(hours=15, minutes=1)
    expired = await service.sync(NEOWS_PROVIDER_CODE)
    assert expired.outcome is ProviderSyncOutcome.UPSTREAM_FAILURE
    assert expired.cache_state == "expired"
    expired_status = await neows_context.store.status(
        neows_context.config,
        now=neows_context.clock.now(),
        payload_codec=NasaNeowsCodec(),
    )
    assert expired_status.cache_state is CacheState.EXPIRED


@pytest.mark.asyncio
async def test_neows_postgresql_quarantine_redacts_key_bearing_evidence(
    neows_context: _Context,
) -> None:
    invalid_body = (
        '{"near_earth_objects": [], "links": '
        f'{{"self":"https://api.nasa.gov/neo/rest/v1/feed?api_key={_KEY}"}}}}'
    ).encode()
    transport = _ReplayTransport([_fixture_raw(), _raw(invalid_body)], [])
    service = _service(neows_context, transport)
    await neows_context.store.set_enabled(
        neows_context.config,
        enabled=True,
        now=_NOW,
        payload_codec=NasaNeowsCodec(),
    )
    assert (await service.sync(NEOWS_PROVIDER_CODE)).outcome is ProviderSyncOutcome.SUCCESS

    neows_context.clock.current = _NOW + timedelta(hours=2)
    failed = await service.sync(NEOWS_PROVIDER_CODE)
    assert failed.failure_code == "provider.payload_invalid"

    status = await neows_context.store.status(
        neows_context.config,
        now=neows_context.clock.now(),
        payload_codec=NasaNeowsCodec(),
    )
    assert status.cache is not None
    assert status.quarantine_exists is True
    assert status.quarantine_raw_sha256 is not None

    quarantined = run_migration_operation(
        _sync_url(neows_context.settings),
        lambda connection: connection.execute(
            text(
                "SELECT raw_body FROM public.provider_quarantine_entry "
                "WHERE provider_code = 'nasa-neows'"
            )
        ).scalar_one(),
    )
    quarantined_bytes = bytes(quarantined)
    assert _KEY.encode() not in quarantined_bytes
    assert b"api_key=<redacted>" in quarantined_bytes
