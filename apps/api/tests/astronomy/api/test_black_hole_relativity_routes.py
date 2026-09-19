from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.black_hole_relativity_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://black_hole_route:nonsecret@127.0.0.1:1/black_hole_route"
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
    mass_nominal_solar: float = 10.0,
    static_observer_radius_rs: float = 2.0,
) -> str:
    return urlencode(
        {
            "mass_nominal_solar": mass_nominal_solar,
            "static_observer_radius_rs": static_observer_radius_rs,
        }
    )


def test_black_hole_relativity_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/black-hole-relativity"
    assert routes[0].methods == {"GET"}


def test_black_hole_relativity_route_returns_synthetic_default() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/black-hole-relativity?" + _query(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "black-hole-relativity-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"] == {
        "mass_nominal_solar": 10.0,
        "static_observer_radius_rs": 2.0,
    }
    assert payload["schwarzschild_radius_m"] == pytest.approx(
        29_532.5007610025,
        rel=0,
        abs=1e-10,
    )
    assert [row["id"] for row in payload["landmarks"]] == [
        "event_horizon",
        "photon_sphere",
        "isco",
    ]
    assert [row["radius_rs"] for row in payload["landmarks"]] == [1.0, 1.5, 3.0]
    assert payload["proper_time_rate_vs_infinity"] == pytest.approx(
        2**-0.5,
        rel=0,
        abs=1e-15,
    )
    assert "accelerated" in payload["observer_note"]
    assert "ray tracing" in payload["model_note"]


def test_black_hole_relativity_route_matches_openstax_rounded_solar_case() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/black-hole-relativity?" + _query(mass_nominal_solar=1.0),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["schwarzschild_radius_m"] == pytest.approx(2_950.0, abs=5.0)
    assert payload["schwarzschild_radius_m"] == pytest.approx(
        2_953.2500761002498,
        rel=0,
        abs=1e-12,
    )


def test_black_hole_relativity_route_rejects_transport_and_domain_violations() -> None:
    base = _query()
    invalid_queries = (
        f"{base}&unknown=value",
        f"{base}&mass_nominal_solar=10",
        _query(mass_nominal_solar=0.99),
        _query(mass_nominal_solar=1.0e10 + 1.0),
        _query(static_observer_radius_rs=1.0),
        _query(static_observer_radius_rs=100.01),
        base.replace("mass_nominal_solar=10.0", "mass_nominal_solar=not-a-number"),
    )
    for query in invalid_queries:
        response = _request(
            _app(),
            f"/api/v1/simulations/black-hole-relativity?{query}",
        )
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "black_hole_relativity.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text
        assert "not-a-number" not in response.text


def test_black_hole_relativity_route_rejects_missing_or_non_get_requests() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/black-hole-relativity?mass_nominal_solar=10",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"

    async def post() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/black-hole-relativity")

    post_response = anyio.run(post)
    assert post_response.status_code == 405
    assert post_response.json()["error"]["code"] == "request.method_not_allowed"
