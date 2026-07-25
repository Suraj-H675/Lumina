"""Application composition and console runner tests."""

from __future__ import annotations

import importlib
import sys
from collections.abc import Callable
from types import ModuleType

import anyio
import httpx
import lumina.settings
import pytest
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.settings import AppSettings


def _settings(**overrides: object) -> AppSettings:
    values: dict[str, object] = {"LUMINA_ENV": "test"}
    values.update(overrides)
    return AppSettings.model_validate(values)


def _request(app: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


@pytest.mark.parametrize(
    ("environment", "expected_enabled"),
    [
        ("development", True),
        ("test", True),
        ("staging", False),
        ("production", False),
    ],
)
def test_api_documentation_environment_defaults(
    environment: str,
    expected_enabled: bool,
) -> None:
    app = create_app(_settings(LUMINA_ENV=environment))
    expected_status = 200 if expected_enabled else 404

    assert _request(app, "/docs").status_code == expected_status
    assert _request(app, "/redoc").status_code == expected_status
    assert _request(app, "/openapi.json").status_code == expected_status


@pytest.mark.parametrize(("override", "expected_status"), [(True, 200), (False, 404)])
def test_api_documentation_explicit_override(override: bool, expected_status: int) -> None:
    app = create_app(_settings(LUMINA_ENABLE_API_DOCS=override))

    assert _request(app, "/docs").status_code == expected_status
    assert _request(app, "/redoc").status_code == expected_status
    assert _request(app, "/openapi.json").status_code == expected_status


def test_console_runner_reuses_module_settings_and_application(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved_settings = _settings(
        LUMINA_API_HOST="0.0.0.0",
        LUMINA_API_PORT=8123,
    )
    load_calls = 0

    def fake_load_settings() -> AppSettings:
        nonlocal load_calls
        load_calls += 1
        return resolved_settings

    monkeypatch.setattr(lumina.settings, "load_settings", fake_load_settings)
    sys.modules.pop("lumina.main", None)
    module: ModuleType = importlib.import_module("lumina.main")
    calls: list[tuple[object, dict[str, object]]] = []

    def fake_uvicorn_run(application: object, **kwargs: object) -> None:
        calls.append((application, kwargs))

    monkeypatch.setattr(module.uvicorn, "run", fake_uvicorn_run)
    run: Callable[[], None] = module.run
    run()

    assert load_calls == 1
    assert module.app.state.settings is resolved_settings
    assert calls == [
        (
            module.app,
            {
                "host": "0.0.0.0",
                "port": 8123,
                "access_log": False,
                "log_config": None,
            },
        )
    ]
    sys.modules.pop("lumina.main", None)
