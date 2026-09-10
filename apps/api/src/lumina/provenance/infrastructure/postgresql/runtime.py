"""Lease-fenced PostgreSQL provider state, cache, and quarantine repository."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from lumina.provenance.domain.runtime import (
    CacheState,
    CircuitFailureKind,
    CircuitState,
    NormalizedPayload,
    ProviderCacheEntry,
    ProviderClaim,
    ProviderClaimOutcome,
    ProviderFailure,
    ProviderFinalization,
    ProviderFinalizationOutcome,
    ProviderLease,
    ProviderPayloadCodec,
    ProviderQuarantineEntry,
    ProviderRuntimeConfig,
    ProviderRuntimeState,
    ProviderStatusSnapshot,
    ProviderStorageFailure,
    RuntimeCounters,
)

_OPERATION_TIMEOUT = "5000ms"
_COUNTER_COLUMNS = (
    "sync_cycles_started",
    "sync_successes",
    "sync_upstream_failures",
    "http_requests",
    "http_retries",
    "schema_failures",
    "quarantines",
    "stale_fallbacks",
    "circuit_openings",
    "disabled_skips",
    "circuit_open_skips",
    "concurrent_lease_skips",
)
_STATE_SELECT_SQL = (
    "SELECT provider_code, enabled, circuit_state, consecutive_failures, next_sync_at, "
    "next_probe_at, last_attempt_at, last_success_at, last_failure_at, last_failure_code, "
    "last_http_status, last_sync_duration_ms, active_sync_lease_token, "
    "active_sync_lease_expires_at, sync_cycles_started, sync_successes, "
    "sync_upstream_failures, http_requests, http_retries, schema_failures, quarantines, "
    "stale_fallbacks, circuit_openings, disabled_skips, circuit_open_skips, "
    "concurrent_lease_skips, updated_at "
    "FROM public.provider_runtime_state WHERE provider_code = :provider_code"
)
_STATE_SQL = text(f"{_STATE_SELECT_SQL} FOR UPDATE")
_STATE_READ_SQL = text(_STATE_SELECT_SQL)
_CACHE_SQL = text(
    "SELECT provider_code, cache_key, normalized_payload, normalized_schema_version, "
    "raw_sha256, fetched_at, fresh_until, stale_until FROM public.provider_cache_entry "
    "WHERE provider_code = :provider_code AND cache_key = :cache_key"
)
_QUARANTINE_SQL = text(
    "SELECT provider_code, cache_key, failure_code, observed_at, raw_complete, observed_bytes, "
    "raw_sha256, raw_body, http_status FROM public.provider_quarantine_entry "
    "WHERE provider_code = :provider_code AND cache_key = :cache_key"
)
_TIMEOUT_SQL = text(
    "SELECT set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)


class PostgreSqlProviderRuntimeStore:
    """Persist provider runtime state with short, explicitly bounded transactions."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def acquire(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        lease_token: str,
        lease_expires_at: datetime,
    ) -> ProviderClaim:
        """Atomically claim eligibility before network I/O."""
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await _set_timeouts(connection)
                row = (
                    (await connection.execute(_STATE_SQL, {"provider_code": config.provider_code}))
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    raise ProviderStorageFailure()
                return await self._acquire_row(
                    connection,
                    row,
                    config=config,
                    now=now,
                    lease_token=lease_token,
                    lease_expires_at=lease_expires_at,
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except ProviderStorageFailure:
            raise
        except (OSError, SQLAlchemyError, ValueError, TypeError):
            raise ProviderStorageFailure() from None

    async def _acquire_row(
        self,
        connection: AsyncConnection,
        row: RowMapping,
        *,
        config: ProviderRuntimeConfig,
        now: datetime,
        lease_token: str,
        lease_expires_at: datetime,
    ) -> ProviderClaim:
        active_expiry = _timestamp(row["active_sync_lease_expires_at"])
        if not bool(row["enabled"]):
            await _increment_skip(connection, "disabled_skips", config.provider_code, now)
            return ProviderClaim(ProviderClaimOutcome.DISABLED)
        if active_expiry is not None and active_expiry > now:
            await _increment_skip(connection, "concurrent_lease_skips", config.provider_code, now)
            return ProviderClaim(ProviderClaimOutcome.ALREADY_RUNNING)

        circuit = CircuitState(str(row["circuit_state"]))
        next_probe = _timestamp(row["next_probe_at"])
        half_open = circuit is CircuitState.HALF_OPEN
        if circuit is CircuitState.OPEN:
            if next_probe is None or now < next_probe:
                await _increment_skip(connection, "circuit_open_skips", config.provider_code, now)
                return ProviderClaim(ProviderClaimOutcome.CIRCUIT_OPEN)
            half_open = True
        elif circuit is not CircuitState.CLOSED:
            half_open = True

        next_sync = _timestamp(row["next_sync_at"])
        if not half_open and next_sync is not None and now < next_sync:
            return ProviderClaim(ProviderClaimOutcome.NOT_DUE)

        await connection.execute(
            text(
                "UPDATE public.provider_runtime_state SET "
                "circuit_state = :circuit_state, active_sync_lease_token = :lease_token, "
                "active_sync_lease_expires_at = :lease_expires_at, last_attempt_at = :now, "
                "sync_cycles_started = sync_cycles_started + 1, updated_at = :now "
                "WHERE provider_code = :provider_code"
            ),
            {
                "provider_code": config.provider_code,
                "circuit_state": CircuitState.HALF_OPEN.value
                if half_open
                else CircuitState.CLOSED.value,
                "lease_token": lease_token,
                "lease_expires_at": lease_expires_at,
                "now": now,
            },
        )
        return ProviderClaim(
            ProviderClaimOutcome.STARTED,
            lease=ProviderLease(token=lease_token, half_open_probe=half_open),
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
        """Atomically update last-known-good cache and healthy runtime state."""
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await _set_timeouts(connection)
                row = await self._locked_state(connection, config.provider_code)
                existing_cache = await self._cache_row(connection, config, lock=False)
                existing_state = _cache_state_from_row(existing_cache, now)
                if row is None:
                    raise ProviderStorageFailure()
                if not _lease_matches(row, lease_token, now=now):
                    return ProviderFinalization(
                        ProviderFinalizationOutcome.FENCED,
                        existing_state,
                    )
                if not bool(row["enabled"]):
                    await _clear_lease(connection, config.provider_code, now)
                    return ProviderFinalization(
                        ProviderFinalizationOutcome.DISABLED,
                        existing_state,
                    )
                fetched_at = now
                fresh_until = now + config.fresh_ttl
                stale_until = now + config.stale_ttl
                canonical_payload = _validated_payload(normalized_payload, payload_codec)
                payload = json.dumps(
                    dict(canonical_payload),
                    allow_nan=False,
                    ensure_ascii=False,
                    separators=(",", ":"),
                    sort_keys=True,
                )
                await connection.execute(
                    text(
                        "INSERT INTO public.provider_cache_entry "
                        "(provider_code, cache_key, normalized_payload, "
                        "normalized_schema_version, raw_sha256, fetched_at, fresh_until, "
                        "stale_until) VALUES "
                        "(:provider_code, :cache_key, CAST(:payload AS jsonb), "
                        ":schema_version, :raw_sha256, :fetched_at, :fresh_until, :stale_until) "
                        "ON CONFLICT (provider_code, cache_key) DO UPDATE SET "
                        "normalized_payload = EXCLUDED.normalized_payload, "
                        "normalized_schema_version = EXCLUDED.normalized_schema_version, "
                        "raw_sha256 = EXCLUDED.raw_sha256, fetched_at = EXCLUDED.fetched_at, "
                        "fresh_until = EXCLUDED.fresh_until, stale_until = EXCLUDED.stale_until"
                    ),
                    {
                        "provider_code": config.provider_code,
                        "cache_key": config.cache_key,
                        "payload": payload,
                        "schema_version": config.source_schema_version,
                        "raw_sha256": raw_sha256,
                        "fetched_at": fetched_at,
                        "fresh_until": fresh_until,
                        "stale_until": stale_until,
                    },
                )
                await connection.execute(
                    text(
                        "UPDATE public.provider_runtime_state SET circuit_state = 'closed', "
                        "consecutive_failures = 0, next_sync_at = :next_sync_at, "
                        "next_probe_at = NULL, last_success_at = :now, "
                        "last_failure_code = NULL, last_http_status = NULL, "
                        "last_sync_duration_ms = :duration_ms, active_sync_lease_token = NULL, "
                        "active_sync_lease_expires_at = NULL, sync_successes = sync_successes + 1, "
                        "http_requests = http_requests + :attempts, "
                        "http_retries = http_retries + :retries, updated_at = :now "
                        "WHERE provider_code = :provider_code"
                    ),
                    {
                        "provider_code": config.provider_code,
                        "next_sync_at": now + config.refresh_interval,
                        "now": now,
                        "duration_ms": duration_ms,
                        "attempts": attempts,
                        "retries": retries,
                    },
                )
                return ProviderFinalization(
                    ProviderFinalizationOutcome.COMMITTED,
                    CacheState.FRESH,
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except ProviderStorageFailure:
            raise
        except (OSError, SQLAlchemyError, ValueError, TypeError):
            raise ProviderStorageFailure() from None

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
        """Atomically persist failure/circuit state and latest bounded quarantine evidence."""
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await _set_timeouts(connection)
                row = await self._locked_state(connection, config.provider_code)
                if row is None:
                    raise ProviderStorageFailure()
                existing_cache = await self._cache_row(connection, config, lock=False)
                existing_state = _cache_state_from_row(existing_cache, now)
                if not _lease_matches(row, lease_token, now=now):
                    return ProviderFinalization(
                        ProviderFinalizationOutcome.FENCED,
                        existing_state,
                    )
                if not bool(row["enabled"]):
                    await _clear_lease(connection, config.provider_code, now)
                    return ProviderFinalization(
                        ProviderFinalizationOutcome.DISABLED,
                        existing_state,
                    )

                previous_failures = int(row["consecutive_failures"])
                if failure.kind is CircuitFailureKind.TRANSIENT:
                    consecutive = previous_failures + 1
                    circuit_open = consecutive >= config.transient_failure_threshold
                    interval = config.transient_open_interval
                elif failure.kind is CircuitFailureKind.RATE_LIMIT:
                    consecutive = previous_failures
                    circuit_open = True
                    interval = timedelta(seconds=failure.retry_after_seconds or 3_600)
                else:
                    consecutive = previous_failures
                    circuit_open = True
                    interval = config.contract_open_interval

                next_sync = now + (interval if circuit_open else timedelta(hours=1))
                next_probe = next_sync if circuit_open else None
                quarantine = failure.raw_response
                if quarantine is not None:
                    await _upsert_quarantine(
                        connection,
                        config=config,
                        failure=failure,
                        observed_at=now,
                    )
                await connection.execute(
                    text(
                        "UPDATE public.provider_runtime_state SET "
                        "circuit_state = :circuit_state, consecutive_failures = :consecutive, "
                        "next_sync_at = :next_sync_at, next_probe_at = :next_probe_at, "
                        "last_failure_at = :now, last_failure_code = :failure_code, "
                        "last_http_status = :http_status, "
                        "last_sync_duration_ms = :duration_ms, "
                        "active_sync_lease_token = NULL, active_sync_lease_expires_at = NULL, "
                        "sync_upstream_failures = sync_upstream_failures + 1, "
                        "http_requests = http_requests + :attempts, "
                        "http_retries = http_retries + :retries, "
                        "schema_failures = schema_failures + :schema_failure, "
                        "quarantines = quarantines + :quarantine, "
                        "stale_fallbacks = stale_fallbacks + :stale_fallback, "
                        "circuit_openings = circuit_openings + :circuit_opening, "
                        "updated_at = :now "
                        "WHERE provider_code = :provider_code"
                    ),
                    {
                        "provider_code": config.provider_code,
                        "circuit_state": CircuitState.OPEN.value
                        if circuit_open
                        else CircuitState.CLOSED.value,
                        "consecutive": consecutive,
                        "next_sync_at": next_sync,
                        "next_probe_at": next_probe,
                        "now": now,
                        "failure_code": failure.code.value,
                        "http_status": failure.http_status,
                        "duration_ms": duration_ms,
                        "attempts": attempts,
                        "retries": retries,
                        "schema_failure": int(failure.code.value == "provider.payload_invalid"),
                        "quarantine": int(quarantine is not None),
                        "stale_fallback": int(existing_state is CacheState.STALE),
                        "circuit_opening": int(circuit_open),
                    },
                )
                return ProviderFinalization(
                    ProviderFinalizationOutcome.COMMITTED,
                    existing_state,
                    stale_fallback=existing_state is CacheState.STALE,
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except ProviderStorageFailure:
            raise
        except (OSError, SQLAlchemyError, ValueError, TypeError):
            raise ProviderStorageFailure() from None

    async def status(
        self,
        config: ProviderRuntimeConfig,
        *,
        now: datetime,
        payload_codec: ProviderPayloadCodec,
    ) -> ProviderStatusSnapshot:
        """Read provider state and its bounded operational evidence."""
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await _set_timeouts(connection)
                state_row = await _read_state(connection, config.provider_code)
                if state_row is None:
                    raise ProviderStorageFailure()
                cache_row = await self._cache_row(connection, config, lock=False)
                quarantine_row = (
                    (
                        await connection.execute(
                            _QUARANTINE_SQL,
                            {
                                "provider_code": config.provider_code,
                                "cache_key": config.cache_key,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                return _status_snapshot(
                    state_row,
                    cache_row,
                    quarantine_row,
                    config=config,
                    now=now,
                    payload_codec=payload_codec,
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except ProviderStorageFailure:
            raise
        except (OSError, SQLAlchemyError, ValueError, TypeError):
            raise ProviderStorageFailure() from None

    async def set_enabled(
        self,
        config: ProviderRuntimeConfig,
        *,
        enabled: bool,
        now: datetime,
        payload_codec: ProviderPayloadCodec,
    ) -> ProviderStatusSnapshot:
        """Apply the explicit operator safety control and return its new status."""
        if type(enabled) is not bool:
            raise ProviderStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await _set_timeouts(connection)
                row = await self._locked_state(connection, config.provider_code)
                if row is None:
                    raise ProviderStorageFailure()
                if enabled:
                    statement = text(
                        "UPDATE public.provider_runtime_state SET enabled = true, "
                        "circuit_state = 'closed', consecutive_failures = 0, "
                        "next_probe_at = NULL, next_sync_at = :now, "
                        "active_sync_lease_token = NULL, active_sync_lease_expires_at = NULL, "
                        "updated_at = :now WHERE provider_code = :provider_code"
                    )
                else:
                    statement = text(
                        "UPDATE public.provider_runtime_state SET enabled = false, "
                        "active_sync_lease_token = NULL, active_sync_lease_expires_at = NULL, "
                        "updated_at = :now WHERE provider_code = :provider_code"
                    )
                await connection.execute(
                    statement,
                    {"provider_code": config.provider_code, "now": now},
                )
                state_row = await _read_state(connection, config.provider_code)
                if state_row is None:
                    raise ProviderStorageFailure()
                cache_row = await self._cache_row(connection, config, lock=False)
                quarantine_row = (
                    (
                        await connection.execute(
                            _QUARANTINE_SQL,
                            {
                                "provider_code": config.provider_code,
                                "cache_key": config.cache_key,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                return _status_snapshot(
                    state_row,
                    cache_row,
                    quarantine_row,
                    config=config,
                    now=now,
                    payload_codec=payload_codec,
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except ProviderStorageFailure:
            raise
        except (OSError, SQLAlchemyError, ValueError, TypeError):
            raise ProviderStorageFailure() from None

    async def _locked_state(
        self,
        connection: AsyncConnection,
        provider_code: str,
    ) -> RowMapping | None:
        return (
            (await connection.execute(_STATE_SQL, {"provider_code": provider_code}))
            .mappings()
            .one_or_none()
        )

    async def _cache_row(
        self,
        connection: AsyncConnection,
        config: ProviderRuntimeConfig,
        *,
        lock: bool,
    ) -> RowMapping | None:
        statement = _CACHE_SQL
        if lock:
            statement = text(f"{_CACHE_SQL.text} FOR UPDATE")
        return (
            (
                await connection.execute(
                    statement,
                    {"provider_code": config.provider_code, "cache_key": config.cache_key},
                )
            )
            .mappings()
            .one_or_none()
        )


async def _set_timeouts(connection: AsyncConnection) -> None:
    await connection.execute(_TIMEOUT_SQL, {"timeout": _OPERATION_TIMEOUT})


async def _increment_skip(
    connection: AsyncConnection,
    column: str,
    provider_code: str,
    now: datetime,
) -> None:
    if column not in {"disabled_skips", "concurrent_lease_skips", "circuit_open_skips"}:
        raise ProviderStorageFailure()
    await connection.execute(
        text(
            f"UPDATE public.provider_runtime_state SET {column} = {column} + 1, "
            "updated_at = :now WHERE provider_code = :provider_code"
        ),
        {"provider_code": provider_code, "now": now},
    )


async def _clear_lease(connection: AsyncConnection, provider_code: str, now: datetime) -> None:
    await connection.execute(
        text(
            "UPDATE public.provider_runtime_state SET active_sync_lease_token = NULL, "
            "active_sync_lease_expires_at = NULL, updated_at = :now "
            "WHERE provider_code = :provider_code"
        ),
        {"provider_code": provider_code, "now": now},
    )


def _lease_matches(row: RowMapping, token: str, *, now: datetime) -> bool:
    """Require token identity and a lease that is still valid at finalization time."""
    active_expiry = _timestamp(row["active_sync_lease_expires_at"])
    return bool(
        row["active_sync_lease_token"] == token
        and active_expiry is not None
        and now < active_expiry
    )


async def _upsert_quarantine(
    connection: AsyncConnection,
    *,
    config: ProviderRuntimeConfig,
    failure: ProviderFailure,
    observed_at: datetime,
) -> None:
    response = failure.raw_response
    if response is None:
        return
    raw_sha256 = None
    if response.raw_complete:
        import hashlib

        raw_sha256 = hashlib.sha256(response.body).hexdigest()
    await connection.execute(
        text(
            "INSERT INTO public.provider_quarantine_entry "
            "(provider_code, cache_key, failure_code, observed_at, raw_complete, observed_bytes, "
            "raw_sha256, raw_body, http_status) VALUES "
            "(:provider_code, :cache_key, :failure_code, :observed_at, :raw_complete, "
            ":observed_bytes, :raw_sha256, :raw_body, :http_status) "
            "ON CONFLICT (provider_code, cache_key) DO UPDATE SET "
            "failure_code = EXCLUDED.failure_code, observed_at = EXCLUDED.observed_at, "
            "raw_complete = EXCLUDED.raw_complete, observed_bytes = EXCLUDED.observed_bytes, "
            "raw_sha256 = EXCLUDED.raw_sha256, raw_body = EXCLUDED.raw_body, "
            "http_status = EXCLUDED.http_status"
        ),
        {
            "provider_code": config.provider_code,
            "cache_key": config.cache_key,
            "failure_code": failure.code.value,
            "observed_at": observed_at,
            "raw_complete": response.raw_complete,
            "observed_bytes": response.observed_bytes,
            "raw_sha256": raw_sha256,
            "raw_body": response.body if response.raw_complete else None,
            "http_status": response.status_code,
        },
    )


def _cache_state_from_row(row: RowMapping | None, now: datetime) -> CacheState:
    if row is None:
        return CacheState.MISSING
    fresh_until = _timestamp(row["fresh_until"])
    stale_until = _timestamp(row["stale_until"])
    if fresh_until is None or stale_until is None:
        raise ProviderStorageFailure()
    if now <= fresh_until:
        return CacheState.FRESH
    if now <= stale_until:
        return CacheState.STALE
    return CacheState.EXPIRED


def _validated_payload(
    payload: object,
    payload_codec: ProviderPayloadCodec,
) -> NormalizedPayload:
    try:
        decoded = payload_codec.decode(payload)
        encoded = payload_codec.encode(decoded)
    except (TypeError, ValueError):
        raise ProviderStorageFailure() from None
    if not isinstance(payload, Mapping) or dict(encoded) != dict(payload):
        raise ProviderStorageFailure()
    return encoded


def _cache_entry(
    row: RowMapping,
    config: ProviderRuntimeConfig,
    payload_codec: ProviderPayloadCodec,
) -> ProviderCacheEntry:
    if (
        str(row["provider_code"]) != config.provider_code
        or str(row["cache_key"]) != config.cache_key
        or str(row["normalized_schema_version"]) != config.source_schema_version
    ):
        raise ProviderStorageFailure()
    payload = row["normalized_payload"]
    normalized_payload = _validated_payload(payload, payload_codec)
    return ProviderCacheEntry(
        provider_code=str(row["provider_code"]),
        cache_key=str(row["cache_key"]),
        normalized_payload=normalized_payload,
        schema_version=str(row["normalized_schema_version"]),
        raw_sha256=str(row["raw_sha256"]),
        fetched_at=_required_timestamp(row["fetched_at"]),
        fresh_until=_required_timestamp(row["fresh_until"]),
        stale_until=_required_timestamp(row["stale_until"]),
    )


def _quarantine_entry(row: RowMapping) -> ProviderQuarantineEntry:
    from lumina.provenance.domain.runtime import ProviderFailureCode

    try:
        code = ProviderFailureCode(str(row["failure_code"]))
    except ValueError:
        raise ProviderStorageFailure() from None
    return ProviderQuarantineEntry(
        provider_code=str(row["provider_code"]),
        cache_key=str(row["cache_key"]),
        failure_code=code,
        observed_at=_required_timestamp(row["observed_at"]),
        raw_complete=bool(row["raw_complete"]),
        observed_bytes=int(row["observed_bytes"]),
        raw_sha256=None if row["raw_sha256"] is None else str(row["raw_sha256"]),
        raw_body=None if row["raw_body"] is None else bytes(row["raw_body"]),
        http_status=None if row["http_status"] is None else int(row["http_status"]),
    )


def _runtime_state(row: RowMapping, *, now: datetime) -> ProviderRuntimeState:
    active_expiry = _timestamp(row["active_sync_lease_expires_at"])
    counters = RuntimeCounters(**{column: int(row[column]) for column in _COUNTER_COLUMNS})
    from lumina.provenance.domain.runtime import ProviderFailureCode

    failure_code = None
    if row["last_failure_code"] is not None:
        try:
            failure_code = ProviderFailureCode(str(row["last_failure_code"]))
        except ValueError:
            raise ProviderStorageFailure() from None
    try:
        circuit_state = CircuitState(str(row["circuit_state"]))
    except ValueError:
        raise ProviderStorageFailure() from None
    return ProviderRuntimeState(
        provider_code=str(row["provider_code"]),
        enabled=bool(row["enabled"]),
        circuit_state=circuit_state,
        consecutive_failures=int(row["consecutive_failures"]),
        next_sync_at=_timestamp(row["next_sync_at"]),
        next_probe_at=_timestamp(row["next_probe_at"]),
        last_attempt_at=_timestamp(row["last_attempt_at"]),
        last_success_at=_timestamp(row["last_success_at"]),
        last_failure_at=_timestamp(row["last_failure_at"]),
        last_failure_code=failure_code,
        last_http_status=None if row["last_http_status"] is None else int(row["last_http_status"]),
        last_sync_duration_ms=(
            None if row["last_sync_duration_ms"] is None else int(row["last_sync_duration_ms"])
        ),
        sync_lease_active=active_expiry is not None and active_expiry > now,
        lease_expires_at=active_expiry,
        counters=counters,
        updated_at=_required_timestamp(row["updated_at"]),
    )


def _timestamp(value: Any) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, datetime):
        raise ProviderStorageFailure()
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ProviderStorageFailure()
    return value.astimezone(UTC)


def _required_timestamp(value: Any) -> datetime:
    timestamp = _timestamp(value)
    if timestamp is None:
        raise ProviderStorageFailure()
    return timestamp


async def _read_state(connection: AsyncConnection, provider_code: str) -> RowMapping | None:
    return (
        (await connection.execute(_STATE_READ_SQL, {"provider_code": provider_code}))
        .mappings()
        .one_or_none()
    )


def _status_snapshot(
    state_row: RowMapping,
    cache_row: RowMapping | None,
    quarantine_row: RowMapping | None,
    *,
    config: ProviderRuntimeConfig,
    now: datetime,
    payload_codec: ProviderPayloadCodec,
) -> ProviderStatusSnapshot:
    cache = _cache_entry(cache_row, config, payload_codec) if cache_row is not None else None
    quarantine = _quarantine_entry(quarantine_row) if quarantine_row is not None else None
    return ProviderStatusSnapshot(
        state=_runtime_state(state_row, now=now),
        cache=cache,
        cache_state=_cache_state_from_row(cache_row, now),
        quarantine_exists=quarantine is not None,
        quarantine_observed_at=None if quarantine is None else quarantine.observed_at,
        quarantine_failure_code=None if quarantine is None else quarantine.failure_code,
        quarantine_raw_sha256=None if quarantine is None else quarantine.raw_sha256,
    )


__all__ = ["PostgreSqlProviderRuntimeStore"]
