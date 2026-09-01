"""Unit contracts for separated database configuration."""

from __future__ import annotations

import lumina.shared.infrastructure.database.runtime as runtime_module
import pytest
from lumina.settings import (
    AppSettings,
    CatalogOperatorSettings,
    IntegrationTestSettings,
    MigrationSettings,
)
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from lumina.shared.infrastructure.database.target import DatabaseTargetError
from pydantic import SecretStr, ValidationError


def test_runtime_database_url_is_secret_and_requires_asyncpg() -> None:
    settings = AppSettings.model_validate(
        {
            "LUMINA_ENV": "test",
            "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:private@127.0.0.1:5432/lumina_test",
        }
    )

    assert "private" not in repr(settings)
    assert "***" in str(settings.database_url)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://lumina_app:private@127.0.0.1:5432/lumina",
        "postgresql+psycopg://lumina_app:private@127.0.0.1:5432/lumina",
        "postgresql+asyncpg://lumina_app@127.0.0.1:5432/lumina",
        "postgresql+asyncpg://lumina_app:private@/lumina",
        "postgresql+asyncpg://lumina_app:private@127.0.0.1/lumina",
        "postgresql+asyncpg://lumina_app:private@127.0.0.1:5432/lumina#fragment",
    ],
)
def test_runtime_url_rejects_wrong_driver_or_missing_components(url: str) -> None:
    with pytest.raises(ValidationError) as error:
        AppSettings.model_validate({"LUMINA_ENV": "test", "LUMINA_DATABASE_URL": url})

    assert "private" not in str(error.value)


def test_migration_settings_require_psycopg() -> None:
    settings = MigrationSettings.model_validate(
        {
            "LUMINA_DATABASE_URL": (
                "postgresql+asyncpg://runtime:runtime-private@127.0.0.1:5432/lumina"
            ),
            "LUMINA_DATABASE_SYNC_URL": (
                "postgresql+psycopg://migrate:migration-private@127.0.0.1:5432/lumina"
            ),
        }
    )
    assert settings.database_sync_url.get_secret_value().startswith("postgresql+psycopg://")
    assert "runtime-private" not in repr(settings)
    assert "migration-private" not in repr(settings)


def test_catalog_operator_settings_require_the_dedicated_local_role_and_database() -> None:
    settings = CatalogOperatorSettings.model_validate(
        {
            "LUMINA_CATALOG_OPERATOR_DATABASE_URL": (
                "postgresql+asyncpg://lumina_catalog_operator:operator-private@127.0.0.1:5432/lumina"
            )
        }
    )

    assert settings.database_url.get_secret_value().startswith("postgresql+asyncpg://")
    assert "operator-private" not in repr(settings)

    with pytest.raises(ValidationError):
        CatalogOperatorSettings.model_validate(
            {
                "LUMINA_CATALOG_OPERATOR_DATABASE_URL": (
                    "postgresql+asyncpg://lumina_app:operator-private@127.0.0.1:5432/lumina"
                )
            }
        )


def test_integration_settings_refuse_development_target() -> None:
    values = {
        "LUMINA_ENV": "test",
        "LUMINA_DATABASE_URL": "postgresql+asyncpg://lumina_app:one@127.0.0.1:5432/lumina",
        "LUMINA_DATABASE_SYNC_URL": "postgresql+psycopg://lumina_migrate:two@127.0.0.1:5432/lumina",
        "LUMINA_TEST_DATABASE_URL": "postgresql+asyncpg://lumina_test_app:three@127.0.0.1:5432/lumina",
        "LUMINA_TEST_DATABASE_SYNC_URL": "postgresql+psycopg://lumina_test_migrate:four@127.0.0.1:5432/lumina",
        "LUMINA_TEST_CATALOG_OPERATOR_DATABASE_URL": "postgresql+asyncpg://lumina_test_catalog_operator:five@127.0.0.1:5432/lumina",
    }
    with pytest.raises(ValidationError, match="lumina_test"):
        IntegrationTestSettings.model_validate(values)


@pytest.mark.parametrize(
    "query",
    [
        "",
        "host=",
        "unknown",
        "unknown=",
        "&",
        "host=&port=",
        "host=remote",
        "host=remote&",
        "host=remote&&port=5432",
        "host=&host=",
        "port=6543",
        "host=remote&port=6543",
        "dbname=production",
        "database=production",
        "hostaddr=203.0.113.1",
        "service=production",
        "options=-c%20search_path%3Dunsafe",
        "target_session_attrs=read-write",
        "unknown=value",
        "host=remote%2Cother",
        "host=remote&host=other",
    ],
)
def test_runtime_settings_reject_every_query_parameter_without_disclosure(
    query: str,
) -> None:
    url = (
        "postgresql+asyncpg://runtime-user:QUERY-PASSWORD-SENTINEL"
        f"@127.0.0.1:5432/lumina_test?{query}"
    )

    with pytest.raises(ValidationError) as failure:
        AppSettings.model_validate(
            {
                "LUMINA_ENV": "test",
                "LUMINA_DATABASE_URL": url,
            }
        )

    rendered = str(failure.value) + repr(failure.value)
    assert "Database URL is invalid" in rendered
    for hidden in (
        url,
        query,
        "QUERY-PASSWORD-SENTINEL",
        "runtime-user",
        "127.0.0.1",
        "5432",
        "lumina_test",
    ):
        if hidden:
            assert hidden not in rendered


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://runtime:private@db.example.test:5432/lumina",
        "postgresql+asyncpg://runtime:private@192.0.2.10:5432/lumina",
        "postgresql+asyncpg://runtime:private@[::1]:5432/lumina",
        "postgresql+asyncpg://runtime:private@localhost:5432/lumina_test",
        "postgresql+asyncpg://runtime:private%3Fvalue@localhost:5432/lumina",
    ],
)
def test_query_free_single_runtime_targets_are_accepted(url: str) -> None:
    settings = AppSettings.model_validate(
        {
            "LUMINA_ENV": "test",
            "LUMINA_DATABASE_URL": url,
        }
    )

    assert settings.database_url.get_secret_value() == url


def test_integration_test_runtime_url_rejects_target_query() -> None:
    values = {
        "LUMINA_ENV": "test",
        "LUMINA_DATABASE_URL": ("postgresql+asyncpg://lumina_app:one@127.0.0.1:5432/lumina"),
        "LUMINA_DATABASE_SYNC_URL": (
            "postgresql+psycopg://lumina_migrate:two@127.0.0.1:5432/lumina"
        ),
        "LUMINA_TEST_DATABASE_URL": (
            "postgresql+asyncpg://lumina_test_app:three@127.0.0.1:5432/lumina_test?host=remote"
        ),
        "LUMINA_TEST_DATABASE_SYNC_URL": (
            "postgresql+psycopg://lumina_test_migrate:four@127.0.0.1:5432/lumina_test"
        ),
        "LUMINA_TEST_CATALOG_OPERATOR_DATABASE_URL": (
            "postgresql+asyncpg://lumina_test_catalog_operator:five@127.0.0.1:5432/lumina_test"
        ),
    }

    with pytest.raises(ValidationError) as failure:
        IntegrationTestSettings.model_validate(values)

    assert "Database URL is invalid" in str(failure.value)
    assert "remote" not in repr(failure.value)


@pytest.mark.parametrize("query_suffix", ["?", "?host=", "?unknown"])
def test_runtime_target_validation_precedes_engine_construction(
    monkeypatch: pytest.MonkeyPatch,
    query_suffix: str,
) -> None:
    constructed = False

    def forbidden_engine(*args: object, **kwargs: object) -> None:
        nonlocal constructed
        del args, kwargs
        constructed = True

    monkeypatch.setattr(runtime_module, "create_async_engine", forbidden_engine)
    with pytest.raises(DatabaseTargetError) as failure:
        create_database_runtime(
            SecretStr(
                "postgresql+asyncpg://runtime:ENGINE-PASSWORD-SENTINEL"
                f"@127.0.0.1:5432/lumina{query_suffix}"
            )
        )

    assert not constructed
    assert str(failure.value) == "Database target is invalid."
    assert "ENGINE-PASSWORD-SENTINEL" not in repr(failure.value)
