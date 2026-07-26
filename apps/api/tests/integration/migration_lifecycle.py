"""Guarded, secret-safe connection establishment for integration migrations."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.migration_identity import (
    MigrationIdentity,
    validate_migration_identity,
)
from sqlalchemy import URL, Connection, create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.pool import NullPool

from .database_safety import require_local_test_database

_REPOSITORY_ROOT = Path(__file__).resolve().parents[4]


@contextmanager
def open_migration_connection(url: URL) -> Iterator[Connection]:
    """Open one Psycopg connection, sanitizing failures before any migration runs."""
    engine = create_engine(url, poolclass=NullPool)
    try:
        try:
            connection = engine.connect()
        except (InterfaceError, OperationalError):
            raise pytest.fail.Exception(
                "Integration migration operation failed.", pytrace=False
            ) from None
        try:
            yield connection
        finally:
            connection.close()
    finally:
        engine.dispose()


def run_migration_operation[Result](
    url: URL,
    operation: Callable[[Connection], Result],
) -> Result:
    """Guard a migration target, then execute outside the connection-failure boundary."""
    require_local_test_database(url)
    with open_migration_connection(url) as connection:
        return operation(connection)


def integration_migration_identity(
    settings: IntegrationTestSettings,
    *,
    runtime_url: URL | None = None,
) -> MigrationIdentity:
    """Pair the guarded test migration target with its selected runtime role."""
    migration_url = make_url(settings.test_database_sync_url.get_secret_value())
    selected_runtime = runtime_url or make_url(settings.test_database_url.get_secret_value())
    require_local_test_database(migration_url)
    return validate_migration_identity(migration_url, selected_runtime)


def migration_config() -> Config:
    """Build an Alembic configuration without embedding a connection URL."""
    return Config(str(_REPOSITORY_ROOT / "alembic.ini"))


def run_alembic(
    connection: Connection,
    identity: MigrationIdentity,
    revision: str,
    *,
    downgrade: bool,
) -> None:
    """Run Alembic on an already-open guarded connection and paired runtime identity."""
    config = migration_config()
    config.attributes["connection"] = connection
    config.attributes["migration_identity"] = identity
    try:
        if downgrade:
            command.downgrade(config, revision)
        else:
            command.upgrade(config, revision)
    finally:
        config.attributes.pop("connection", None)
        config.attributes.pop("migration_identity", None)
