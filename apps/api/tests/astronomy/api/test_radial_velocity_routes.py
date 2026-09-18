from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.radial_velocity_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://rv_route:nonsecret@127.0.0.1:1/rv_route"
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
        "stellar_mass_kg": 2.0e30,
        "planet_mass_kg": 2.0e27,
        "orbital_period_s": 31_557_600.0,
        "eccentricity": 0.0,
        "inclination_deg": 90.0,
        "stellar_argument_of_periastron_deg": 0.0,
        "mean_anomaly_at_epoch_deg": 0.0,
    }
)


def test_radial_velocity_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/radial-velocity"
    assert routes[0].methods == {"GET"}


def test_radial_velocity_route_returns_canonical_circular_result() -> None:
    response = _request(_app(), f"/api/v1/simulations/radial-velocity?{_DEFAULT_QUERY}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "radial-velocity-v1"
    assert payload["schema_version"] == 1
    assert payload["inclination_projection"] == pytest.approx(1.0)
    assert payload["semi_amplitude_m_s"] > 0.0
    assert payload["projected_planet_mass_kg"] == pytest.approx(2.0e27)
    assert payload["mass_function_kg"] > 0.0
    assert payload["edge_on_minimum_mass_kg"] == pytest.approx(2.0e27, rel=1.0e-12)
    assert len(payload["curve"]) == 301
    assert payload["curve"][0]["radial_velocity_m_s"] == pytest.approx(
        payload["semi_amplitude_m_s"]
    )
    assert payload["curve"][150]["radial_velocity_m_s"] == pytest.approx(
        -payload["semi_amplitude_m_s"]
    )


def test_radial_velocity_route_returns_valid_face_on_zero_signal() -> None:
    query = _DEFAULT_QUERY.replace("inclination_deg=90.0", "inclination_deg=0.0")
    response = _request(_app(), f"/api/v1/simulations/radial-velocity?{query}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["semi_amplitude_m_s"] == 0.0
    assert payload["projected_planet_mass_kg"] == 0.0
    assert payload["mass_function_kg"] == 0.0
    assert payload["edge_on_minimum_mass_kg"] == 0.0
    assert all(point["radial_velocity_m_s"] == 0.0 for point in payload["curve"])


def test_radial_velocity_route_rejects_extra_repeated_and_invalid_query() -> None:
    for query in (
        f"{_DEFAULT_QUERY}&unknown=value",
        f"{_DEFAULT_QUERY}&stellar_mass_kg=2e30",
        _DEFAULT_QUERY.replace("eccentricity=0.0", "eccentricity=0.96"),
        _DEFAULT_QUERY.replace("inclination_deg=90.0", "inclination_deg=90.1"),
    ):
        response = _request(_app(), f"/api/v1/simulations/radial-velocity?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "radial_velocity.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_radial_velocity_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/radial-velocity")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
