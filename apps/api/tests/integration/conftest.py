"""Fixtures for guarded real-PostgreSQL integration tests."""

from __future__ import annotations

from pathlib import Path

import pytest
from lumina.settings import IntegrationTestSettings, load_integration_test_settings
from pydantic import SecretStr
from sqlalchemy import URL


@pytest.fixture(scope="session")
def integration_settings() -> IntegrationTestSettings:
    """Load the four-URL contract only when `LUMINA_ENV=test` is explicit."""
    return load_integration_test_settings()


@pytest.fixture(scope="session")
def postgres_admin_sync_url() -> URL:
    """Build the local-only bootstrap-admin URL without printing its secret value."""
    password: SecretStr | None = None
    port: int | None = None
    for line in (
        (Path(__file__).resolve().parents[4] / ".env").read_text(encoding="utf-8").splitlines()
    ):
        if line.startswith("POSTGRES_PASSWORD="):
            password = SecretStr(line.removeprefix("POSTGRES_PASSWORD="))
        elif line.startswith("POSTGRES_HOST_PORT="):
            port = int(line.removeprefix("POSTGRES_HOST_PORT="))
    assert password is not None
    assert port is not None
    return URL.create(
        "postgresql+psycopg",
        username="lumina_admin",
        password=password.get_secret_value(),
        host="127.0.0.1",
        port=port,
        database="postgres",
    )
