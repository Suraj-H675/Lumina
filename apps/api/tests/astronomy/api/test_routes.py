from __future__ import annotations

from typing import Any

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://seasons_route:nonsecret@127.0.0.1:1/seasons_route"
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


def test_seasons_route_is_registered_as_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]

    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/seasons"
    assert routes[0].methods == {"GET"}


def test_seasons_route_returns_the_versioned_canonical_result() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/seasons?axial_tilt_deg=23.43928&orbital_position_deg=90"
        "&latitude_deg=40&eccentricity_preset=earth",
    )

    assert response.status_code == 200
    assert response.json() == {
        "model_version": "seasons-simulator-v1",
        "schema_version": 1,
        "inputs": {
            "axial_tilt_deg": 23.43928,
            "orbital_position_deg": 90.0,
            "latitude_deg": 40.0,
            "eccentricity_preset": "earth",
        },
        "solar_declination_deg": 23.43928,
        "selected": {
            "latitude_deg": 40.0,
            "noon_solar_zenith_deg": 16.560719999999996,
            "noon_sun_altitude_deg": 73.43928,
            "illumination_incidence_deg": 16.560719999999996,
            "day_length_hours": 14.844451127514816,
            "polar_state": "none",
        },
        "comparison_latitude_deg": -40.0,
        "opposite_hemisphere": {
            "latitude_deg": -40.0,
            "noon_solar_zenith_deg": 63.439280000000004,
            "noon_sun_altitude_deg": 26.560719999999996,
            "illumination_incidence_deg": 63.439280000000004,
            "day_length_hours": 9.155548872485184,
            "polar_state": "none",
        },
        "eccentricity": 0.01671123,
        "distance_over_semimajor_axis": 1.0162727707813541,
        "relative_solar_flux": 0.9682319752100141,
    }


def test_seasons_route_rejects_unknown_and_repeated_query_fields() -> None:
    required = (
        "axial_tilt_deg=23.43928&orbital_position_deg=90&latitude_deg=40&eccentricity_preset=earth"
    )
    for suffix in ("&unknown=value", "&latitude_deg=40"):
        response = _request(_app(), f"/api/v1/simulations/seasons?{required}{suffix}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] == "seasons.model_invalid"
        assert payload["error"]["message"] == "The Seasons Simulator inputs are invalid."
        assert "unknown" not in response.text


def test_seasons_route_rejects_out_of_range_and_unknown_preset_without_fallback() -> None:
    for query in (
        "axial_tilt_deg=91&orbital_position_deg=90&latitude_deg=40&eccentricity_preset=earth",
        "axial_tilt_deg=23.43928&orbital_position_deg=360&latitude_deg=40&eccentricity_preset=earth",
        "axial_tilt_deg=23.43928&orbital_position_deg=90&latitude_deg=40&eccentricity_preset=unknown",
    ):
        response = _request(_app(), f"/api/v1/simulations/seasons?{query}")
        assert response.status_code == 422
        assert response.json()["error"]["code"] in {
            "seasons.model_invalid",
            "request.validation_failed",
        }


def test_seasons_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/seasons")

    response = anyio.run(send)

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
