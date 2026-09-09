from __future__ import annotations

from typing import Any

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.telescope_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://telescope_route:nonsecret@127.0.0.1:1/telescope_route"
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


_DEFAULT_QUERY = (
    "aperture_mm=100&telescope_focal_length_mm=1000&telescope_type=refractor"
    "&eyepiece_focal_length_mm=20&eyepiece_apparent_field_deg=50"
    "&optical_modifier_kind=none&optical_modifier_factor=1&target_angular_size_arcmin=30"
)


def test_telescope_builder_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]

    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/telescope-builder"
    assert routes[0].methods == {"GET"}


def test_telescope_builder_route_returns_literal_default_geometry() -> None:
    response = _request(_app(), f"/api/v1/simulations/telescope-builder?{_DEFAULT_QUERY}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "telescope-builder-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"] == {
        "aperture_mm": 100.0,
        "telescope_focal_length_mm": 1000.0,
        "telescope_type": "refractor",
        "eyepiece_focal_length_mm": 20.0,
        "eyepiece_apparent_field_deg": 50.0,
        "optical_modifier_kind": "none",
        "optical_modifier_factor": 1.0,
        "target_angular_size_arcmin": 30.0,
    }
    assert payload["effective_focal_length_mm"] == 1000.0
    assert payload["native_focal_ratio"] == 10.0
    assert payload["effective_focal_ratio"] == 10.0
    assert payload["magnification_x"] == 50.0
    assert payload["approx_true_field_deg"] == 1.0
    assert payload["exit_pupil_mm"] == 2.0
    assert payload["dawes_limit_arcsec"] == 1.16
    assert payload["rayleigh_limit_arcsec"] == 1.3840368499180167
    assert payload["ideal_light_gathering_ratio_vs_7mm_pupil"] == 204.08163265306123
    assert payload["target_angular_size_deg"] == 0.5
    assert payload["target_field_fraction"] == 0.5
    assert payload["target_fit"] == "fits"
    assert payload["warning_codes"] == []


def test_telescope_builder_route_rejects_extra_repeated_and_relationally_invalid_query() -> None:
    for query in (
        f"{_DEFAULT_QUERY}&unknown=value",
        f"{_DEFAULT_QUERY}&aperture_mm=100",
        "aperture_mm=20&telescope_focal_length_mm=100&telescope_type=refractor"
        "&eyepiece_focal_length_mm=60&eyepiece_apparent_field_deg=50"
        "&optical_modifier_kind=reducer&optical_modifier_factor=0.5&target_angular_size_arcmin=30",
    ):
        response = _request(_app(), f"/api/v1/simulations/telescope-builder?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "telescope_builder.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_telescope_builder_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/telescope-builder")

    response = anyio.run(send)

    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
