"""The accepted migration lineage is exact and reversible on guarded PostgreSQL."""

from __future__ import annotations

import re

import pytest
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from .migration_lifecycle import (
    historical_migration_identity,
    historical_sync_url,
    normalize_historical_database_to_b2,
    open_migration_connection,
    read_migration_revision,
    run_alembic,
    run_migration_operation,
)

_HISTORICAL_B2 = "b7f3a2c81d4e"


def test_upgrade_downgrade_and_reupgrade(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)

    normalize_historical_database_to_b2(integration_settings)
    run_migration_operation(
        sync_url, lambda c: run_alembic(c, identity, "c4b9e2d7a6f1", downgrade=True)
    )
    assert read_migration_revision(sync_url) == "c4b9e2d7a6f1"

    try:
        run_migration_operation(
            sync_url, lambda c: run_alembic(c, identity, _HISTORICAL_B2, downgrade=False)
        )
        assert read_migration_revision(sync_url) == _HISTORICAL_B2
    finally:
        normalize_historical_database_to_b2(integration_settings)


@pytest.mark.parametrize(
    ("hostname", "port"),
    [("migration-host-sentinel", 6542), ("127.0.0.1", 1)],
)
def test_migration_connection_failure_is_sanitized(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
    hostname: str,
    port: int,
) -> None:
    password = "MIGRATION-SECRET-SENTINEL"
    username = "migration-user-sentinel"
    database = "migration-database-sentinel"
    url = URL.create(
        "postgresql+psycopg",
        username=username,
        password=password,
        host=hostname,
        port=port,
        database=database,
        query={"connect_timeout": "1"},
    )

    with pytest.raises(pytest.fail.Exception) as failure, open_migration_connection(url):
        pass
    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )

    assert "Integration migration operation failed." in serialized
    for secret_or_connection_detail in (password, username, hostname, str(port), database):
        assert secret_or_connection_detail not in serialized
    assert failure.value.__cause__ is None
    assert failure.value.__suppress_context__


def test_migration_assertions_remain_visible(integration_settings: IntegrationTestSettings) -> None:
    url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    with pytest.raises(AssertionError, match="schema sentinel"):
        run_migration_operation(
            url,
            lambda _connection: (_ for _ in ()).throw(AssertionError("schema sentinel")),
        )


@pytest.mark.parametrize(
    "error",
    [
        OperationalError("migration cancellation sentinel", None, Exception("cancelled")),
        OperationalError("migration lock sentinel", None, Exception("lock unavailable")),
        OperationalError("migration resource sentinel", None, Exception("resource exhausted")),
        RuntimeError("migration script sentinel"),
    ],
)
def test_non_connectivity_migration_failures_remain_visible(
    integration_settings: IntegrationTestSettings,
    error: Exception,
) -> None:
    url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    with pytest.raises(type(error), match=re.escape(str(error))):
        run_migration_operation(url, lambda _connection: (_ for _ in ()).throw(error))
