from __future__ import annotations

from typing import Any

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.eclipse_simulator_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://eclipse_route:nonsecret@127.0.0.1:1/eclipse_route"
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


def _query(*, at_utc: str, latitude: float, longitude: float, elevation: float) -> str:
    return (
        f"at_utc={at_utc}&latitude_deg={latitude}&longitude_deg={longitude}&elevation_m={elevation}"
    )


def test_eclipse_simulator_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/eclipse-simulator"
    assert routes[0].methods == {"GET"}


def test_eclipse_simulator_route_returns_dallas_total_reference() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/eclipse-simulator?"
        + _query(
            at_utc="2024-04-08T18:42:00Z",
            latitude=32.7767,
            longitude=-96.797,
            elevation=130,
        ),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "eclipse-simulator-v1"
    assert payload["schema_version"] == 1
    assert payload["instant"]["phase"] == "total"
    assert payload["instant"]["shadow_region"] == "umbra"
    assert payload["instant"]["obscuration_fraction"] == 1.0
    assert payload["local_event"]["classification"] == "total"
    assert payload["local_event"]["central_begin_utc"] is not None
    assert payload["local_event"]["central_end_utc"] is not None
    assert payload["safety_reference_id"] == "nasa-eclipse-safety"
    assert "whole UTC minutes" in payload["timing_note"]


def test_eclipse_simulator_route_returns_albuquerque_annular_reference() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/eclipse-simulator?"
        + _query(
            at_utc="2023-10-14T16:35:00Z",
            latitude=35.0844,
            longitude=-106.6504,
            elevation=1619,
        ),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["instant"]["phase"] == "annular"
    assert payload["instant"]["shadow_region"] == "antumbra"
    assert 0.0 < payload["instant"]["obscuration_fraction"] < 1.0
    assert payload["local_event"]["classification"] == "annular"


def test_eclipse_simulator_route_returns_no_event_for_next_day_control() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/eclipse-simulator?"
        + _query(
            at_utc="2024-04-09T18:42:00Z",
            latitude=32.7767,
            longitude=-96.797,
            elevation=130,
        ),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["instant"]["phase"] == "none"
    assert payload["instant"]["obscuration_fraction"] == 0.0
    assert payload["local_event"] is None


def test_eclipse_simulator_route_rejects_extra_repeated_and_invalid_query() -> None:
    base = _query(
        at_utc="2024-04-08T18:42:00Z",
        latitude=32.7767,
        longitude=-96.797,
        elevation=130,
    )
    for query in (
        f"{base}&unknown=value",
        f"{base}&latitude_deg=32.7767",
        _query(
            at_utc="2027-08-28T00:00:00Z",
            latitude=32.7767,
            longitude=-96.797,
            elevation=130,
        ),
        _query(
            at_utc="2024-04-08T18:42:00%2B05:30",
            latitude=32.7767,
            longitude=-96.797,
            elevation=130,
        ),
        _query(
            at_utc="2024-04-08T18:42:00Z",
            latitude=91,
            longitude=-96.797,
            elevation=130,
        ),
    ):
        response = _request(_app(), f"/api/v1/simulations/eclipse-simulator?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "eclipse_simulator.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_eclipse_simulator_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/eclipse-simulator")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
