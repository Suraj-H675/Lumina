"""Phase 8D selected in-process ASGI latency measurements over the real application."""

from __future__ import annotations

import json
from math import ceil
from time import perf_counter_ns

import httpx
import pytest
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.settings import AppSettings, IntegrationTestSettings


def _percentile_ms(samples: list[float], fraction: float) -> float:
    ordered = sorted(samples)
    index = max(0, min(len(ordered) - 1, ceil(len(ordered) * fraction) - 1))
    return ordered[index]


@pytest.mark.asyncio
async def test_phase8d_selected_in_process_api_reports_p50_p95_latency(
    integration_settings: IntegrationTestSettings,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Report a non-gating in-process ASGI p50/p95 baseline without freezing a budget."""
    app: FastAPI = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": integration_settings.test_database_url.get_secret_value(),
            }
        )
    )
    workloads = (
        ("live", "/health/live", None, "status", "live"),
        ("meta", "/api/v1/meta", None, "application_name", "Lumina"),
        ("ready", "/health/ready", None, "status", "ready"),
        (
            "stellar_laboratory",
            "/api/v1/simulations/stellar-laboratory",
            {"initial_mass_msun": "1"},
            "model_version",
            "stellar-laboratory-v1",
        ),
    )
    metrics: dict[str, dict[str, float]] = {}

    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            for label, path, params, payload_key, expected_value in workloads:
                for _ in range(5):
                    warmup = await client.get(path, params=params)
                    assert warmup.status_code == 200
                    assert warmup.json().get(payload_key) == expected_value

                samples: list[float] = []
                for _ in range(25):
                    started = perf_counter_ns()
                    response = await client.get(path, params=params)
                    samples.append((perf_counter_ns() - started) / 1_000_000)
                    assert response.status_code == 200
                    assert response.json().get(payload_key) == expected_value

                metrics[label] = {
                    "p50_ms": _percentile_ms(samples, 0.50),
                    "p95_ms": _percentile_ms(samples, 0.95),
                }

    with capsys.disabled():
        print("PHASE8D_API_LATENCY=" + json.dumps(metrics, sort_keys=True))
