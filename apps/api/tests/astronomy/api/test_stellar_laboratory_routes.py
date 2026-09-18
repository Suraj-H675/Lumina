from __future__ import annotations

from typing import Any

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.stellar_laboratory_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://stellar_route:nonsecret@127.0.0.1:1/stellar_route"
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


def test_stellar_laboratory_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/stellar-laboratory"
    assert routes[0].methods == {"GET"}


def test_stellar_laboratory_route_returns_approximate_solar_mass_mapping() -> None:
    response = _request(_app(), "/api/v1/simulations/stellar-laboratory?initial_mass_msun=1")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "stellar-laboratory-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"] == {"initial_mass_msun": 1.0}
    assert payload["luminosity_lsun"] == pytest.approx(10**-0.007)
    assert payload["radius_rsun"] > 0
    assert payload["effective_temperature_k"] > 0
    assert payload["main_sequence_lifetime_years"] > 0
    assert payload["expected_remnant"] == "carbon-oxygen white dwarf"
    assert "grid" in payload["metallicity_scope"]


def test_stellar_laboratory_route_preserves_remnant_boundary() -> None:
    response = _request(_app(), "/api/v1/simulations/stellar-laboratory?initial_mass_msun=10")
    assert response.status_code == 200
    payload = response.json()
    assert payload["expected_remnant"] == "neutron star"
    assert payload["evolutionary_path"][-1] == "neutron star"
    assert "boundaries may change" in payload["remnant_boundary_note"]


def test_stellar_laboratory_route_rejects_extra_repeated_and_invalid_query() -> None:
    for query in (
        "initial_mass_msun=1&unknown=value",
        "initial_mass_msun=1&initial_mass_msun=1",
        "initial_mass_msun=0.3999",
        "initial_mass_msun=29.67",
    ):
        response = _request(_app(), f"/api/v1/simulations/stellar-laboratory?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "stellar_laboratory.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_stellar_laboratory_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/stellar-laboratory")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
