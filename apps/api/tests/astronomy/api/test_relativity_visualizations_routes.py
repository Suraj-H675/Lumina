from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.relativity_visualizations_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://relativity_route:nonsecret@127.0.0.1:1/relativity_route"
                ),
                "LUMINA_ENABLE_API_DOCS": False,
                "LUMINA_ENV": "test",
                "LUMINA_LOG_LEVEL": "CRITICAL",
            }
        )
    )


def _request(app: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


def _query(
    *,
    relative_speed_fraction_c: float = 0.6,
    proper_time_s: float = 10.0,
    proper_length_m: float = 100.0,
    simultaneous_event_separation_m: float = 299_792_458.0,
) -> str:
    return urlencode(
        {
            "relative_speed_fraction_c": relative_speed_fraction_c,
            "proper_time_s": proper_time_s,
            "proper_length_m": proper_length_m,
            "simultaneous_event_separation_m": simultaneous_event_separation_m,
        }
    )


def test_relativity_visualizations_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/relativity-visualizations"
    assert routes[0].methods == {"GET"}


def test_relativity_visualizations_route_returns_exact_reference_case() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/relativity-visualizations?" + _query(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "relativity-visualizations-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"] == {
        "relative_speed_fraction_c": 0.6,
        "proper_time_s": 10.0,
        "proper_length_m": 100.0,
        "simultaneous_event_separation_m": 299_792_458.0,
    }
    assert payload["lorentz_factor"] == pytest.approx(1.25, rel=0, abs=1e-15)
    assert payload["dilated_time_s"] == pytest.approx(12.5, rel=0, abs=1e-14)
    assert payload["contracted_length_m"] == pytest.approx(80.0, rel=0, abs=1e-13)
    assert payload["simultaneity_offset_s"] == pytest.approx(-0.75, rel=0, abs=1e-15)
    assert "B at +x occurs earlier" in payload["simultaneity_interpretation"]
    assert "not a photographic appearance" in payload["length_contraction_note"]
    assert "general relativity" in payload["model_note"]


def test_relativity_visualizations_route_returns_zero_speed_identity() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/relativity-visualizations?" + _query(relative_speed_fraction_c=0.0),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["relative_speed_m_s"] == 0.0
    assert payload["lorentz_factor"] == 1.0
    assert payload["dilated_time_s"] == 10.0
    assert payload["contracted_length_m"] == 100.0
    assert payload["simultaneity_offset_s"] == 0.0


def test_relativity_visualizations_route_rejects_transport_and_domain_violations() -> None:
    base = _query()
    invalid_queries = (
        f"{base}&unknown=value",
        f"{base}&relative_speed_fraction_c=0.6",
        _query(relative_speed_fraction_c=-0.001),
        _query(relative_speed_fraction_c=0.991),
        _query(proper_time_s=0.0),
        _query(proper_length_m=0.0),
        _query(simultaneous_event_separation_m=-1.0),
        base.replace("relative_speed_fraction_c=0.6", "relative_speed_fraction_c=not-a-number"),
    )
    for query in invalid_queries:
        response = _request(
            _app(),
            f"/api/v1/simulations/relativity-visualizations?{query}",
        )
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "relativity_visualizations.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text
        assert "not-a-number" not in response.text


def test_relativity_visualizations_route_rejects_missing_or_non_get_requests() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/relativity-visualizations?relative_speed_fraction_c=0.6",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"

    async def post() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/relativity-visualizations")

    post_response = anyio.run(post)
    assert post_response.status_code == 405
    assert post_response.json()["error"]["code"] == "request.method_not_allowed"
