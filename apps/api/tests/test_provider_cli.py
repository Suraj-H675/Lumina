"""Safe operator CLI contracts for the fixed Phase 4A provider."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import UUID

import lumina.provider_cli as cli
import pytest
from lumina.jobs.domain.models import EnqueueJobOutcome, JobStatus
from lumina.provenance.application.sync import ProviderSyncReport
from lumina.provenance.domain.runtime import ProviderSyncOutcome


def test_cli_rejects_arbitrary_provider_without_echoing_argument(
    capsys: pytest.CaptureFixture[str],
) -> None:
    secret_like_url = "https://user" + ":secret@example.invalid"

    assert cli.main(["status", "--provider", secret_like_url]) == 2

    captured = capsys.readouterr()
    assert captured.out == ""
    assert captured.err == "Invalid provider command.\n"
    assert secret_like_url not in captured.err


def test_enqueue_payload_is_fixed_and_safe() -> None:
    payload = cli._enqueue_payload(
        EnqueueJobOutcome(
            UUID("12345678-1234-4234-9234-123456789abc"),
            JobStatus.QUEUED,
            replayed=True,
        ),
        "provider.sync:nasa-exoplanet-archive:2026091012",
        "nasa-exoplanet-archive",
    )

    assert payload == {
        "provider_code": "nasa-exoplanet-archive",
        "job_id": "12345678-1234-4234-9234-123456789abc",
        "status": "queued",
        "replayed": True,
        "idempotency_key": "provider.sync:nasa-exoplanet-archive:2026091012",
    }
    assert "secret" not in json.dumps(payload)


def test_provider_sync_buckets_preserve_hourly_phase4a_and_add_five_minute_swpc() -> None:
    moment = datetime(2026, 9, 12, 14, 17, 42, 123456, tzinfo=UTC)

    assert cli._sync_bucket(moment, "nasa-neows") == "2026091214"
    assert cli._sync_bucket(moment, "noaa-swpc") == "202609121415"


def test_direct_sync_payload_omits_provider_content_and_hashes() -> None:
    payload = cli._sync_payload(
        ProviderSyncReport(
            provider_code="noaa-swpc",
            outcome=ProviderSyncOutcome.STALE_FALLBACK,
            failure_code="provider.timeout",
            attempts=2,
            retries=1,
            cache_state="stale",
            stale_fallback=True,
            normalized_payload={"private": "provider-content-sentinel"},
            raw_sha256="a" * 64,
        )
    )

    assert payload == {
        "provider_code": "noaa-swpc",
        "outcome": "stale_fallback",
        "failure_code": "provider.timeout",
        "attempts": 2,
        "retries": 1,
        "cache_state": "stale",
        "stale_fallback": True,
    }
    serialized = json.dumps(payload)
    assert "provider-content-sentinel" not in serialized
    assert "a" * 64 not in serialized


def test_parser_exposes_direct_sync_only_for_approved_provider_codes() -> None:
    namespace = cli._parser().parse_args(["sync", "--provider", "noaa-swpc"])

    assert namespace.command == "sync"
    assert namespace.provider == "noaa-swpc"


@pytest.mark.asyncio
async def test_direct_sync_uses_composed_service_and_disposes_runtime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    class Engine:
        async def dispose(self) -> None:
            calls.append("dispose")

    class Registry:
        def resolve(self, provider_code: str) -> object | None:
            calls.append(f"resolve:{provider_code}")
            return object()

    class SyncService:
        async def sync(self, provider_code: str) -> ProviderSyncReport:
            calls.append(f"sync:{provider_code}")
            return ProviderSyncReport(
                provider_code=provider_code,
                outcome=ProviderSyncOutcome.NOT_DUE,
                failure_code=None,
                attempts=0,
                retries=0,
                cache_state="fresh",
                stale_fallback=False,
            )

    runtime = SimpleNamespace(session_factory=object(), engine=Engine())
    settings = SimpleNamespace(
        database_url=object(),
        resolved_database_tls_mode="verify-full",
        nasa_api_key=None,
    )
    monkeypatch.setattr(cli, "load_settings", lambda: settings)
    monkeypatch.setattr(cli, "create_database_runtime", lambda *_args, **_kwargs: runtime)
    monkeypatch.setattr(
        cli,
        "compose_provider_runtime",
        lambda *_args, **_kwargs: SimpleNamespace(registry=Registry(), sync_service=SyncService()),
    )

    result = await cli._run(cli._parser().parse_args(["sync", "--provider", "noaa-swpc"]))

    assert result == {
        "provider_code": "noaa-swpc",
        "outcome": "not_due",
        "failure_code": None,
        "attempts": 0,
        "retries": 0,
        "cache_state": "fresh",
        "stale_fallback": False,
    }
    assert calls == ["resolve:noaa-swpc", "sync:noaa-swpc", "dispose"]
