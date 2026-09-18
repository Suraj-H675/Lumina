from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import anyio
import httpx
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.astronomy.api.spectroscopy_lab_routes import router
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _app() -> FastAPI:
    return create_app(
        AppSettings.model_validate(
            {
                "LUMINA_DATABASE_URL": (
                    "postgresql+asyncpg://spectroscopy_route:nonsecret@127.0.0.1:1/"
                    "spectroscopy_route"
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
    mode: str = "absorption",
    temperature_k: float = 5772.0,
    selected_elements: str = "H I,Na I,Ca II",
    radial_velocity_km_s: float = 0.0,
    resolving_power: float = 500.0,
    noise_sigma: float = 0.0,
    noise_seed: int = 42,
) -> str:
    return urlencode(
        {
            "mode": mode,
            "temperature_k": temperature_k,
            "selected_elements": selected_elements,
            "radial_velocity_km_s": radial_velocity_km_s,
            "resolving_power": resolving_power,
            "noise_sigma": noise_sigma,
            "noise_seed": noise_seed,
        }
    )


def test_spectroscopy_lab_route_is_one_read_only_get_endpoint() -> None:
    routes = [route for route in router.routes if isinstance(route, APIRoute)]
    assert len(routes) == 1
    assert routes[0].path == "/api/v1/simulations/spectroscopy-lab"
    assert routes[0].methods == {"GET"}


def test_spectroscopy_lab_route_returns_compact_absorption_result() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/spectroscopy-lab?" + _query(),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["model_version"] == "spectroscopy-lab-v1"
    assert payload["schema_version"] == 1
    assert payload["inputs"]["selected_elements"] == ["H I", "Na I", "Ca II"]
    assert len(payload["wavelength_nm"]) == 741
    assert len(payload["normalized_flux"]) == 741
    assert payload["wavelength_nm"][0] == 380.0
    assert payload["wavelength_nm"][-1] == 750.0
    assert len(payload["representative_lines"]) == 8
    assert payload["fingerprints"] == [
        {"element": "H I", "representative_line_count": 4},
        {"element": "Na I", "representative_line_count": 2},
        {"element": "Ca II", "representative_line_count": 2},
    ]
    assert 501.0 < payload["wien_peak_nm"] < 503.0


def test_spectroscopy_lab_route_supports_continuum_with_empty_element_field() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/spectroscopy-lab?" + _query(mode="continuum", selected_elements=""),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["inputs"]["selected_elements"] == []
    assert payload["representative_lines"] == []
    assert payload["fingerprints"] == []
    assert max(payload["normalized_flux"]) == 1.0


def test_spectroscopy_lab_route_returns_redshifted_hydrogen_metadata() -> None:
    response = _request(
        _app(),
        "/api/v1/simulations/spectroscopy-lab?"
        + _query(
            mode="emission",
            temperature_k=10000.0,
            selected_elements="H I",
            radial_velocity_km_s=150.0,
            resolving_power=300.0,
        ),
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["representative_lines"]) == 4
    assert all(
        line["shifted_wavelength_vacuum_nm"] > line["rest_wavelength_vacuum_nm"]
        for line in payload["representative_lines"]
    )


def test_spectroscopy_lab_route_rejects_extra_repeated_and_invalid_query() -> None:
    base = _query()
    invalid_queries = (
        f"{base}&unknown=value",
        f"{base}&mode=absorption",
        _query(mode="absorption", selected_elements=""),
        _query(mode="continuum", selected_elements="H I"),
        _query(mode="emission", selected_elements="Fe I"),
        _query(temperature_k=15001.0),
        _query(noise_seed=-1),
    )
    for query in invalid_queries:
        response = _request(_app(), f"/api/v1/simulations/spectroscopy-lab?{query}")
        assert response.status_code == 422
        payload: dict[str, Any] = response.json()
        assert payload["error"]["code"] in {
            "spectroscopy_lab.model_invalid",
            "request.validation_failed",
        }
        assert "unknown" not in response.text


def test_spectroscopy_lab_route_rejects_non_get_requests() -> None:
    async def send() -> httpx.Response:
        app = _app()
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.post("/api/v1/simulations/spectroscopy-lab")

    response = anyio.run(send)
    assert response.status_code == 405
    assert response.json()["error"]["code"] == "request.method_not_allowed"
