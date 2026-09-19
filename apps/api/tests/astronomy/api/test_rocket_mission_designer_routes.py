from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.rocket_mission_designer_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://rocket_route:nonsecret@127.0.0.1:1/rocket_route"
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
    gravity_body: str = "earth",
    delta_v_reference_id: str = "earth_200_mile_orbit_example",
    payload_mass_kg: float = 5_000.0,
    stage_dry_mass_kg: tuple[float, ...] = (30_000.0, 8_000.0),
    stage_propellant_mass_kg: tuple[float, ...] = (400_000.0, 40_000.0),
    stage_specific_impulse_s: tuple[float, ...] = (300.0, 350.0),
    stage_thrust_n: tuple[float, ...] = (7_000_000.0, 1_000_000.0),
) -> str:
    items: list[tuple[str, str | float]] = [
        ("gravity_body", gravity_body),
        ("delta_v_reference_id", delta_v_reference_id),
        ("payload_mass_kg", payload_mass_kg),
    ]
    items.extend(("stage_dry_mass_kg", value) for value in stage_dry_mass_kg)
    items.extend(("stage_propellant_mass_kg", value) for value in stage_propellant_mass_kg)
    items.extend(("stage_specific_impulse_s", value) for value in stage_specific_impulse_s)
    items.extend(("stage_thrust_n", value) for value in stage_thrust_n)
    return urlencode(items)


def test_rocket_mission_designer_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/rocket-mission-designer"
    assert routes[0].methods == {"GET"}


def test_rocket_mission_designer_route_returns_synthetic_reference_vehicle() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/rocket-mission-designer?" + _query(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "rocket-mission-designer-v1"
    assert payload["schema_version"] == 1
    assert payload["selected_surface_gravity_m_s2"] == 9.8
    assert payload["mass_fractions"]["launch_mass_kg"] == 483_000.0
    assert len(payload["stages"]) == 2
    assert payload["stages"][0]["ignition_mass_kg"] == 483_000.0
    assert payload["stages"][0]["burnout_before_jettison_mass_kg"] == 83_000.0
    assert payload["stages"][1]["ignition_mass_kg"] == 53_000.0
    assert payload["stages"][1]["burnout_before_jettison_mass_kg"] == 13_000.0
    assert payload["payload_tradeoff"][2]["payload_mass_kg"] == 5_000.0
    assert (
        payload["payload_tradeoff"][2]["total_ideal_delta_v_m_s"]
        == (payload["total_ideal_delta_v_m_s"])
    )
    assert payload["reference_comparison"]["reference_value_m_s"] == 7_620.0
    assert "not a mission delta-v requirement" in payload["reference_comparison"]["interpretation"]
    assert "operational launch planning" in payload["model_note"]


def test_rocket_mission_designer_route_rejects_transport_and_domain_violations() -> None:
    base = _query()
    invalid_queries = (
        f"{base}&unknown=value",
        f"{base}&payload_mass_kg=5000",
        _query(stage_dry_mass_kg=(30_000.0,), stage_propellant_mass_kg=(400_000.0, 40_000.0)),
        _query(gravity_body="venus"),
        _query(payload_mass_kg=0.0),
        base.replace("stage_specific_impulse_s=300.0", "stage_specific_impulse_s=not-a-number"),
    )
    for query in invalid_queries:
        response = _request(_app(), f"/api/v1/simulations/rocket-mission-designer?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "rocket_mission_designer.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text
        assert "not-a-number" not in response.text


def test_rocket_mission_designer_route_rejects_missing_or_oversized_repeated_arrays() -> None:
    missing_thrust = (
        "gravity_body=earth&delta_v_reference_id=earth_200_mile_orbit_example"
        "&payload_mass_kg=5000&stage_dry_mass_kg=100&stage_propellant_mass_kg=400"
        "&stage_specific_impulse_s=300"
    )
    too_many = _query(
        stage_dry_mass_kg=(100.0,) * 5,
        stage_propellant_mass_kg=(400.0,) * 5,
        stage_specific_impulse_s=(300.0,) * 5,
        stage_thrust_n=(20_000.0,) * 5,
    )
    for query in (missing_thrust, too_many):
        response = _request(_app(), f"/api/v1/simulations/rocket-mission-designer?{query}")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "request.validation_failed"


def test_rocket_mission_designer_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/rocket-mission-designer")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
