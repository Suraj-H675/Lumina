from __future__ import annotations

import math
from typing import Any
from urllib.parse import urlencode

import pytest
from fakes.http import get_asgi, request_asgi
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.orbit_routes import router
from lumina.astronomy.domain.orbit_sandbox import GRAVITATIONAL_CONSTANT_M3_KG_S2
from lumina.bootstrap import create_app
from lumina.settings import AppSettings

EARTH_MASS_KG = 5.9722e24
ORBIT_RADIUS_M = 7_000_000.0
CIRCULAR_SPEED_M_S = math.sqrt(GRAVITATIONAL_CONSTANT_M3_KG_S2 * EARTH_MASS_KG / ORBIT_RADIUS_M)


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://orbit_route:nonsecret@127.0.0.1:1/orbit_route"
                ),
                "LUMINA_ENABLE_API_DOCS": False,
                "LUMINA_ENV": "test",
                "LUMINA_LOG_LEVEL": "CRITICAL",
            }
        )
    )


_DEFAULT_QUERY = urlencode(
    {
        "central_mass_kg": EARTH_MASS_KG,
        "central_radius_m": 6_371_000.0,
        "orbiting_body_mass_kg": 0.0,
        "position_x_m": ORBIT_RADIUS_M,
        "position_y_m": 0.0,
        "velocity_x_m_s": 0.0,
        "velocity_y_m_s": CIRCULAR_SPEED_M_S,
        "duration_s": 100.0,
        "time_step_s": 10.0,
    }
)


def test_orbit_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/orbit-sandbox"
    assert routes[0].methods == {"GET"}


def test_orbit_route_returns_canonical_circular_result() -> None:
    response = get_asgi(_app(), f"/api/v1/simulations/orbit-sandbox?{_DEFAULT_QUERY}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "orbit-sandbox-v1"
    assert payload["schema_version"] == 1
    assert payload["classification"] == "bound"
    assert payload["eccentricity"] == pytest.approx(0.0, abs=1e-12)
    assert payload["semi_major_axis_m"] == pytest.approx(ORBIT_RADIUS_M, rel=1e-12)
    assert payload["reduced_mass_kg"] is None
    assert payload["orbital_energy_j"] is None
    assert len(payload["trajectory"]) == 11
    assert payload["trajectory"][0]["time_s"] == 0.0
    assert payload["trajectory"][-1]["time_s"] == 100.0


def test_orbit_route_rejects_extra_repeated_and_relationally_invalid_query() -> None:
    for query in (
        f"{_DEFAULT_QUERY}&unknown=value",
        f"{_DEFAULT_QUERY}&central_mass_kg={EARTH_MASS_KG}",
        _DEFAULT_QUERY.replace("time_step_s=10", "time_step_s=100"),
    ):
        response = get_asgi(_app(), f"/api/v1/simulations/orbit-sandbox?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "orbit_sandbox.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_orbit_route_rejects_non_get_requests() -> None:
    response = request_asgi(_app(), "POST", "/api/v1/simulations/orbit-sandbox")
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
