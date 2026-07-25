"""Role-separated PostgreSQL connectivity tests."""

from __future__ import annotations

import anyio
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from sqlalchemy import text


def test_test_runtime_connects(integration_settings: IntegrationTestSettings) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)

    async def check() -> None:
        async with runtime.engine.connect() as connection:
            assert (await connection.execute(text("SELECT 1"))).scalar_one() == 1
        await runtime.engine.dispose()

    anyio.run(check)
