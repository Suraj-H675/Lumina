from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.impact_simulator_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://impact_route:nonsecret@127.0.0.1:1/impact_route"
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
    diameter_m: float = 1_500.0,
    impactor_density_kg_m3: float = 3_000.0,
    speed_km_s: float = 17.0,
    impact_angle_deg: float = 45.0,
    target_material: str = "sedimentary_rock",
) -> str:
    return urlencode(
        {
            "diameter_m": diameter_m,
            "impactor_density_kg_m3": impactor_density_kg_m3,
            "speed_km_s": speed_km_s,
            "impact_angle_deg": impact_angle_deg,
            "target_material": target_material,
        }
    )


def test_impact_simulator_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/impact-simulator"
    assert routes[0].methods == {"GET"}


def test_impact_simulator_route_returns_synthetic_default() -> None:
    response = _request(_app(), "/api/v1/simulations/impact-simulator?" + _query())
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "impact-simulator-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"]["target_material"] == "sedimentary_rock"
    assert payload["target_density_kg_m3"] == 2_500.0
    assert payload["best_estimate_crater"]["classification"] == "complex"
    assert len(payload["coefficient_sensitivity"]) == 3
    assert len(payload["ejecta_thickness_radii"]) == 4
    assert [row["thickness_m"] for row in payload["ejecta_thickness_radii"]] == [
        100.0,
        10.0,
        1.0,
        0.1,
    ]
    assert "not a complete statistical confidence interval" in payload["uncertainty_note"]
    assert "targeting" in payload["model_note"]


def test_impact_simulator_route_matches_source_validation_case() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/impact-simulator?"
        + _query(impactor_density_kg_m3=1_500.0, target_material="crystalline_rock"),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["kinetic_energy_j"] == 3.83028866811893e20
    assert payload["best_estimate_crater"]["transient_diameter_m"] == (11_155.651401627216)
    assert payload["best_estimate_crater"]["final_diameter_m"] == pytest.approx(
        15_352.731007637304,
        rel=0,
        abs=1e-9,
    )


def test_impact_simulator_route_rejects_transport_and_domain_violations() -> None:
    base = _query()
    invalid_queries = (
        f"{base}&unknown=value",
        f"{base}&diameter_m=1500",
        _query(diameter_m=1_499.0),
        _query(impactor_density_kg_m3=8_001.0),
        _query(speed_km_s=72.01),
        _query(impact_angle_deg=14.99),
        _query(target_material="water"),
        base.replace("speed_km_s=17.0", "speed_km_s=not-a-number"),
    )
    for query in invalid_queries:
        response = _request(_app(), f"/api/v1/simulations/impact-simulator?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "impact_simulator.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text
        assert "not-a-number" not in response.text


def test_impact_simulator_route_rejects_missing_or_non_get_requests() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/impact-simulator?"
        "diameter_m=1500&impactor_density_kg_m3=3000&speed_km_s=17&impact_angle_deg=45",
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.validation_failed"

    async def post() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/impact-simulator")

    post_response = anyio.run(post)
    assert post_response.status_code == 405
    assert post_response.json()["error"]["code"] == "request.method_not_allowed"
