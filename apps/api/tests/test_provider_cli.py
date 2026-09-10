"""Safe operator CLI contracts for the fixed Phase 4A provider."""

from __future__ import annotations

import json
from uuid import UUID

import lumina.provider_cli as cli
import pytest
from lumina.jobs.domain.models import EnqueueJobOutcome, JobStatus


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
