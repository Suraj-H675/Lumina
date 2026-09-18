from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.transit_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://transit_route:nonsecret@127.0.0.1:1/transit_route"
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


_DEFAULT_QUERY = urlencode(
    {
        "stellar_radius_m": 1.0e9,
        "planet_radius_m": 1.0e8,
        "semi_major_axis_m": 1.0e10,
        "orbital_period_s": 259_200.0,
        "inclination_deg": 90.0,
    }
)


def test_transit_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/transit-method"
    assert routes[0].methods == {"GET"}


def test_transit_route_returns_canonical_central_result() -> None:
    response = _request(_app(), f"/api/v1/simulations/transit-method?{_DEFAULT_QUERY}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "transit-method-v1"
    assert payload["schema_version"] == 1
    assert payload["classification"] == "full"
    assert payload["radius_ratio"] == pytest.approx(0.1)
    assert payload["maximum_depth_fraction"] == pytest.approx(0.01)
    assert payload["maximum_depth_ppm"] == pytest.approx(10_000.0)
    assert payload["total_duration_s"] is not None
    assert payload["full_duration_s"] is not None
    assert len(payload["light_curve"]) == 301
    assert payload["light_curve"][150]["time_from_mid_transit_s"] == 0.0
    assert payload["light_curve"][150]["relative_flux"] == pytest.approx(0.99)


def test_transit_route_returns_valid_no_transit_result() -> None:
    query = _DEFAULT_QUERY.replace("inclination_deg=90.0", "inclination_deg=80.0")
    response = _request(_app(), f"/api/v1/simulations/transit-method?{query}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["classification"] == "no_transit"
    assert payload["maximum_depth_fraction"] == 0.0
    assert payload["total_duration_s"] is None
    assert all(point["relative_flux"] == 1.0 for point in payload["light_curve"])


def test_transit_route_rejects_extra_repeated_and_relationally_invalid_query() -> None:
    for query in (
        f"{_DEFAULT_QUERY}&unknown=value",
        f"{_DEFAULT_QUERY}&stellar_radius_m=1000000000",
        _DEFAULT_QUERY.replace("planet_radius_m=100000000.0", "planet_radius_m=1000000000.0"),
    ):
        response = _request(_app(), f"/api/v1/simulations/transit-method?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "transit_method.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_transit_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/transit-method")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
