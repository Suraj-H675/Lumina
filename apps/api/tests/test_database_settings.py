"""Unit contracts for separated database configuration."""

from __future__ import annotations

import pytest
from lumina.settings import AppSettings, IntegrationTestSettings, MigrationSettings
from pydantic import ValidationError


def test_runtime_database_url_is_secret_and_requires_asyncpg() -> None:
    settings = AppSettings.model_validate(
        {
            "LUMINA_ENV": "test",
            "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:private@127.0.0.1/lumina_test",
        }
    )

    assert "private" not in repr(settings)
    assert "***" in str(settings.database_url)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://lumina_app:private@127.0.0.1/lumina",
        "postgresql+psycopg://lumina_app:private@127.0.0.1/lumina",
        "postgresql+asyncpg://lumina_app@127.0.0.1/lumina",
        "postgresql+asyncpg://lumina_app:private@/lumina",
    ],
)
def test_runtime_url_rejects_wrong_driver_or_missing_components(url: str) -> None:
    with pytest.raises(ValidationError) as error:
        AppSettings.model_validate({"LUMINA_ENV": "test", "LUMINA_DATABASE_URL": url})

    assert "private" not in str(error.value)


def test_migration_settings_require_psycopg() -> None:
    settings = MigrationSettings.model_validate(
        {"LUMINA_DATABASE_SYNC_URL": "postgresql+psycopg://migrate:private@127.0.0.1/lumina"}
    )
    assert settings.database_sync_url.get_secret_value().startswith("postgresql+psycopg://")


def test_integration_settings_refuse_development_target() -> None:
    values = {
        "LUMINA_ENV": "test",
        "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_app:one@127.0.0.1/lumina",
        "LUMINA_DATABASE_SYNC_URL": "postgresql+psycopg://lumina_migrate:two@127.0.0.1/lumina",
        "LUMINA_TEST_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:three@127.0.0.1/lumina",
        "LUMINA_TEST_DATABASE_SYNC_URL": "postgresql+psycopg://lumina_test_migrate:four@127.0.0.1/lumina",
    }
    with pytest.raises(ValidationError, match="lumina_test"):
        IntegrationTestSettings.model_validate(values)
