"""Structured logging and sensitive-data exclusion tests."""

from __future__ import annotations

import io
import json
import logging

import anyio
import httpx
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.settings import AppSettings
from lumina.shared.logging import JsonFormatter


def _request(app: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


def test_json_formatter_emits_utc_structure_without_exception_text() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="lumina.test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="safe.event",
        args=(),
        exc_info=(RuntimeError, RuntimeError("PRIVATE-EXCEPTION"), None),
    )
    record.request_id = "f6e8889e-8d4f-49ce-8bdf-fb638e8f734c"
    record.route = "/safe/{item_id}"
    record.method = "GET"
    record.status = 500
    record.duration_ms = 1.25
    record.error_code = "server.internal_error"

    serialized = formatter.format(record)
    payload = json.loads(serialized)

    assert payload["timestamp"].endswith("Z")
    assert payload["level"] == "ERROR"
    assert payload["event"] == "safe.event"
    assert payload["route"] == "/safe/{item_id}"
    assert payload["error_code"] == "server.internal_error"
    assert "PRIVATE-EXCEPTION" not in serialized


def test_request_log_uses_route_template_and_omits_secret_sentinels() -> None:
    setting_secret = "PRIVATE-SETTING-SENTINEL"
    app = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:secret@127.0.0.1:5432/lumina_test",
                "LUMINA_BUILD_COMMIT": setting_secret,
            }
        )
    )
    route_secret = "PRIVATE-ROUTE-SENTINEL"
    query_secret = "PRIVATE-QUERY-SENTINEL"
    exception_secret = "PRIVATE-EXCEPTION-SENTINEL"

    @app.get("/_test/failure/{item_id}")
    async def failure(item_id: str) -> None:
        del item_id
        raise RuntimeError(exception_secret)

    output = io.StringIO()
    handler = logging.StreamHandler(output)
    handler.setFormatter(JsonFormatter())
    logger = logging.getLogger("lumina")
    logger.addHandler(handler)
    try:
        response = _request(
            app,
            f"/_test/failure/{route_secret}?private={query_secret}",
        )
    finally:
        logger.removeHandler(handler)
    log_lines = [line for line in output.getvalue().splitlines() if line]

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "server.internal_error"
    assert len(log_lines) == 1
    payload = json.loads(log_lines[0])
    assert payload["event"] == "http.request.completed"
    assert payload["route"] == "/_test/failure/{item_id}"
    assert payload["method"] == "GET"
    assert payload["status"] == 500
    assert payload["error_code"] == "server.internal_error"
    assert payload["request_id"] == response.headers["X-Request-ID"]
    assert isinstance(payload["duration_ms"], float)
    serialized = response.text + output.getvalue()
    assert route_secret not in serialized
    assert query_secret not in serialized
    assert exception_secret not in serialized
    assert setting_secret not in serialized
