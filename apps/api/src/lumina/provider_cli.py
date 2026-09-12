"""Secret-safe operator commands for the static Phase 4A provider."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import NoReturn

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from lumina.jobs.application.enqueue import EnqueueJobService
from lumina.jobs.domain.models import EnqueueJobOutcome, JobType
from lumina.jobs.infrastructure.postgresql.enqueue import PostgreSqlEnqueueJobStore
from lumina.provenance.application.registry import PRODUCTION_PROVIDER_CODES, ProviderRegistration
from lumina.provenance.composition import compose_provider_runtime
from lumina.provenance.domain.runtime import (
    PROVIDER_CODE,
    SWPC_PROVIDER_CODE,
    ProviderStatusSnapshot,
)
from lumina.settings import AppSettings, load_settings
from lumina.shared.infrastructure.database.runtime import create_database_runtime

_INVALID_MESSAGE = "Invalid provider command."
_CONFIGURATION_MESSAGE = "Provider is not configured."
_FAILURE_MESSAGE = "Provider command failed."


class InvalidProviderInvocation(ValueError):
    """Fixed marker for parser failures that must not reflect an argument value."""


class ProviderConfigurationError(InvalidProviderInvocation):
    """Fixed marker for an enable operation without a valid provider secret."""


class _SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        del message
        raise InvalidProviderInvocation()


def _parser() -> _SafeArgumentParser:
    parser = _SafeArgumentParser(
        prog="lumina-provider",
        description="Operate the statically approved Lumina provider.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    for command, help_text in (
        ("status", "Read safe provider runtime status."),
        ("enable", "Enable provider synchronization."),
        ("disable", "Disable provider synchronization."),
        ("enqueue-sync", "Enqueue the provider sync for its approved UTC cadence."),
    ):
        command_parser = commands.add_parser(command, help=help_text)
        command_parser.add_argument(
            "--provider",
            choices=tuple(sorted(PRODUCTION_PROVIDER_CODES)),
            default=PROVIDER_CODE,
        )
    return parser


async def _run(namespace: argparse.Namespace) -> dict[str, object]:
    settings = load_settings()
    runtime = create_database_runtime(settings.database_url)
    try:
        provider_composition = compose_provider_runtime(
            runtime.session_factory,
            nasa_api_key=settings.nasa_api_key,
        )
        registry = provider_composition.registry
        registration = registry.resolve(namespace.provider)
        if registration is None:
            raise InvalidProviderInvocation()
        sync_service = provider_composition.sync_service
        if namespace.command == "status":
            snapshot = await sync_service.status(namespace.provider)
            return _status_payload(registration, snapshot)
        if namespace.command in {"enable", "disable"}:
            if namespace.command == "enable" and not registration.is_configured():
                raise ProviderConfigurationError()
            snapshot = await sync_service.set_enabled(
                namespace.provider,
                enabled=namespace.command == "enable",
            )
            return _status_payload(registration, snapshot)
        if namespace.command == "enqueue-sync":
            return await _enqueue_sync(settings, runtime.session_factory, namespace.provider)
        raise InvalidProviderInvocation()
    finally:
        await runtime.engine.dispose()


async def _enqueue_sync(
    settings: AppSettings,
    session_factory: async_sessionmaker[AsyncSession],
    provider_code: str,
) -> dict[str, object]:
    """Enqueue only the fixed provider payload and provider-specific cadence key."""
    job_service = EnqueueJobService(
        PostgreSqlEnqueueJobStore(
            session_factory,
            wait_timeout_ms=settings.job_enqueue_wait_timeout_ms,
        ),
        payload_max_bytes=settings.job_payload_max_bytes,
        default_max_attempts=settings.job_default_max_attempts,
    )
    bucket = _sync_bucket(datetime.now(UTC), provider_code)
    idempotency_key = f"provider.sync:{provider_code}:{bucket}"
    outcome = await job_service.enqueue(
        job_type=JobType.PROVIDER_SYNC,
        payload={"provider_code": provider_code},
        idempotency_key=idempotency_key,
        max_attempts=1,
    )
    return _enqueue_payload(outcome, idempotency_key, provider_code)


def _sync_bucket(now: datetime, provider_code: str) -> str:
    """Return the fixed UTC idempotency bucket for one approved provider."""
    if provider_code == SWPC_PROVIDER_CODE:
        minute_bucket = (now.minute // 5) * 5
        return now.replace(minute=minute_bucket, second=0, microsecond=0).strftime("%Y%m%d%H%M")
    return now.strftime("%Y%m%d%H")


def _status_payload(
    registration: ProviderRegistration,
    snapshot: ProviderStatusSnapshot,
) -> dict[str, object]:
    cache = snapshot.cache
    counters = snapshot.state.counters
    return {
        "provider_code": registration.config.provider_code,
        "source_name": registration.config.source_manifest.source_name,
        "official_documentation_url": str(
            registration.config.source_manifest.official_documentation_url
        ),
        "terms_or_licence_url": str(registration.config.source_manifest.terms_or_licence_url),
        "attribution_text": registration.config.source_manifest.attribution_text,
        "enabled": snapshot.state.enabled,
        "circuit_state": snapshot.state.circuit_state.value,
        "cache_state": snapshot.cache_state.value,
        "cache_active": snapshot.state.enabled and snapshot.cache_state.value in {"fresh", "stale"},
        "sync_lease_active": snapshot.state.sync_lease_active,
        "consecutive_failures": snapshot.state.consecutive_failures,
        "last_attempt_at": _timestamp(snapshot.state.last_attempt_at),
        "last_success_at": _timestamp(snapshot.state.last_success_at),
        "last_failure_at": _timestamp(snapshot.state.last_failure_at),
        "last_failure_code": _enum_value(snapshot.state.last_failure_code),
        "last_http_status": snapshot.state.last_http_status,
        "last_sync_duration_ms": snapshot.state.last_sync_duration_ms,
        "next_sync_at": _timestamp(snapshot.state.next_sync_at),
        "next_probe_at": _timestamp(snapshot.state.next_probe_at),
        "cache_fetched_at": None if cache is None else _timestamp(cache.fetched_at),
        "cache_fresh_until": None if cache is None else _timestamp(cache.fresh_until),
        "cache_stale_until": None if cache is None else _timestamp(cache.stale_until),
        "quarantine_exists": snapshot.quarantine_exists,
        "quarantine_observed_at": _timestamp(snapshot.quarantine_observed_at),
        "quarantine_failure_code": _enum_value(snapshot.quarantine_failure_code),
        "quarantine_raw_sha256": snapshot.quarantine_raw_sha256,
        "metrics": {
            "sync_cycles_started": counters.sync_cycles_started,
            "sync_successes": counters.sync_successes,
            "sync_upstream_failures": counters.sync_upstream_failures,
            "http_requests": counters.http_requests,
            "http_retries": counters.http_retries,
            "schema_failures": counters.schema_failures,
            "quarantines": counters.quarantines,
            "stale_fallbacks": counters.stale_fallbacks,
            "circuit_openings": counters.circuit_openings,
            "disabled_skips": counters.disabled_skips,
            "circuit_open_skips": counters.circuit_open_skips,
            "concurrent_lease_skips": counters.concurrent_lease_skips,
        },
    }


def _enqueue_payload(
    outcome: EnqueueJobOutcome,
    idempotency_key: str,
    provider_code: str,
) -> dict[str, object]:
    return {
        "provider_code": provider_code,
        "job_id": str(outcome.id),
        "status": outcome.status.value,
        "replayed": outcome.replayed,
        "idempotency_key": idempotency_key,
    }


def _enum_value(value: object | None) -> str | None:
    return None if value is None else str(getattr(value, "value", value))


def _timestamp(value: datetime | None) -> str | None:
    return None if value is None else value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _write_stdout(payload: dict[str, object]) -> None:
    rendered = json.dumps(payload, allow_nan=False, separators=(",", ":"), sort_keys=True)
    sys.stdout.write(f"{rendered}\n")


def _write_stderr(message: str) -> None:
    sys.stderr.write(f"{message}\n")


def main(argv: Sequence[str] | None = None) -> int:
    """Parse and execute one bounded operator command."""
    parser = _parser()
    try:
        namespace = parser.parse_args(argv)
    except InvalidProviderInvocation:
        _write_stderr(_INVALID_MESSAGE)
        return 2
    except SystemExit as error:
        return 0 if error.code == 0 else 2

    try:
        _write_stdout(asyncio.run(_run(namespace)))
        return 0
    except (KeyboardInterrupt, SystemExit):
        raise
    except ProviderConfigurationError:
        _write_stderr(_CONFIGURATION_MESSAGE)
        return 2
    except InvalidProviderInvocation:
        _write_stderr(_INVALID_MESSAGE)
        return 2
    except BaseException:
        _write_stderr(_FAILURE_MESSAGE)
        return 1


__all__ = ["main"]
