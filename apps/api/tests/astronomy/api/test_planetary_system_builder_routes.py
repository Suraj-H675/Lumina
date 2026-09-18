from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.planetary_system_builder_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://builder_route:nonsecret@127.0.0.1:1/builder_route"
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
    stellar_mass_msun: float = 1.0,
    stellar_luminosity_lsun: float = 1.0,
    stellar_effective_temperature_k: float = 5780.0,
    planet_mass_mearth: tuple[float, ...] = (1.0, 1.0, 1.0),
    semi_major_axis_au: tuple[float, ...] = (0.7, 1.0, 2.0),
) -> str:
    items: list[tuple[str, str | float]] = [
        ("stellar_mass_msun", stellar_mass_msun),
        ("stellar_luminosity_lsun", stellar_luminosity_lsun),
        ("stellar_effective_temperature_k", stellar_effective_temperature_k),
    ]
    items.extend(("planet_mass_mearth", mass) for mass in planet_mass_mearth)
    items.extend(("semi_major_axis_au", axis) for axis in semi_major_axis_au)
    return urlencode(items)


def test_planetary_system_builder_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/planetary-system-builder"
    assert routes[0].methods == {"GET"}


def test_planetary_system_builder_route_returns_synthetic_reference_system() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/planetary-system-builder?" + _query(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "planetary-system-builder-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"]["planets"] == [
        {"mass_mearth": 1.0, "semi_major_axis_au": 0.7},
        {"mass_mearth": 1.0, "semi_major_axis_au": 1.0},
        {"mass_mearth": 1.0, "semi_major_axis_au": 2.0},
    ]
    assert payload["habitable_zone"]["inner_edge_au"] == 0.950443247520335
    assert payload["habitable_zone"]["outer_edge_au"] == 1.6760038078849773
    assert [planet["habitable_zone_relation"] for planet in payload["planets"]] == [
        "interior_to_reference_hz",
        "inside_reference_hz",
        "exterior_to_reference_hz",
    ]
    assert payload["planets"][1]["orbital_period_days"] == 365.25634986267556
    assert len(payload["adjacent_pairs"]) == 2
    assert all(
        pair["spacing_assessment"] == "no_pairwise_hill_warning"
        for pair in payload["adjacent_pairs"]
    )
    assert (
        "does not establish habitability or life" in payload["habitable_zone"]["habitability_note"]
    )
    assert "no long-term multi-planet stability claim" in payload["stability_note"]


def test_planetary_system_builder_route_supports_single_planet_without_pair_diagnostic() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/planetary-system-builder?"
        + _query(planet_mass_mearth=(1.0,), semi_major_axis_au=(1.0,)),
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["planets"]) == 1
    assert payload["adjacent_pairs"] == []


def test_planetary_system_builder_route_rejects_transport_and_domain_violations() -> None:
    base = _query()
    invalid_queries = (
        f"{base}&unknown=value",
        f"{base}&stellar_mass_msun=1.0",
        _query(planet_mass_mearth=(1.0, 1.0), semi_major_axis_au=(1.0,)),
        _query(planet_mass_mearth=(1.0, 1.0), semi_major_axis_au=(1.0, 1.0)),
        _query(stellar_mass_msun=0.01),
        base.replace("stellar_mass_msun=1.0", "stellar_mass_msun=not-a-number"),
    )
    for query in invalid_queries:
        response = _request(_app(), f"/api/v1/simulations/planetary-system-builder?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "planetary_system_builder.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text
        assert "not-a-number" not in response.text


def test_planetary_system_builder_route_rejects_missing_or_oversized_repeated_arrays() -> None:
    missing_axis = (
        "stellar_mass_msun=1&stellar_luminosity_lsun=1&stellar_effective_temperature_k=5780"
        "&planet_mass_mearth=1"
    )
    too_many = _query(
        planet_mass_mearth=(1.0,) * 9,
        semi_major_axis_au=tuple(float(index) for index in range(1, 10)),
    )
    for query in (missing_axis, too_many):
        response = _request(_app(), f"/api/v1/simulations/planetary-system-builder?{query}")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "request.validation_failed"


def test_planetary_system_builder_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/planetary-system-builder")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
