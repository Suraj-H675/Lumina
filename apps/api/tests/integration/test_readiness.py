"""Readiness API against the actual isolated test database."""

from __future__ import annotations

import anyio
import httpx
from fastapi import FastAPI
from lumina.bootstrap import create_app
from lumina.settings import AppSettings, IntegrationTestSettings


def test_readiness_returns_exact_success(integration_settings: IntegrationTestSettings) -> None:
    app: FastAPI = create_app(
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": integration_settings.test_database_url.get_secret_value(),
            }
        )
    )

    async def request() -> httpx.Response:
        async with app.router.lifespan_context(app):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.get("/health/ready")

    response = anyio.run(request)
    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
