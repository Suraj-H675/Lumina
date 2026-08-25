"""Guarded, secret-safe connection establishment for integration migrations."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Final

import pytest
from alembic import command
from alembic.config import Config
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.migration_identity import (
    MigrationIdentity,
    validate_migration_identity,
)
from sqlalchemy import URL, Connection, create_engine, text
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


_HISTORY_DATABASE: Final = "lumina_history_test"
_B3_REVISION = "e8f4c1a9b362"
_HISTORICAL_B2 = "b7f3a2c81d4e"


def historical_sync_url(settings: IntegrationTestSettings) -> URL:
    """Return the guarded sync URL for the disposable pre-B3 history database."""
    url = make_url(settings.test_database_sync_url.get_secret_value()).set(
        database=_HISTORY_DATABASE
    )
    require_local_test_database(url)
    return url


def historical_runtime_url(settings: IntegrationTestSettings) -> URL:
    """Return the guarded runtime URL for the disposable pre-B3 history database."""
    url = make_url(settings.test_database_url.get_secret_value()).set(database=_HISTORY_DATABASE)
    return url


def historical_admin_connection_url(admin_url: URL) -> URL:
    """Return an admin URL scoped to the disposable pre-B3 history database."""
    return make_url(admin_url).set(database=_HISTORY_DATABASE)


def read_historical_revision(settings: IntegrationTestSettings) -> str | None:
    """Read the disposable history database revision through a guarded connection."""
    revision = run_migration_operation(
        historical_sync_url(settings),
        lambda connection: connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none(),
    )
    return None if revision is None else str(revision)


def normalize_historical_database_to_b2(settings: IntegrationTestSettings) -> None:
    """Normalize the history database to B2 using Alembic only, never B3."""
    accepted_revisions = {
        "0002_grant_job_runtime_dml",
        "d502b5935120",
        "e4c9f1a7b362",
        "a1a3c0f17c5e",
        "c4b9e2d7a6f1",
        _HISTORICAL_B2,
    }
    revision = read_historical_revision(settings)
    if revision is None:
        run_migration_operation(
            historical_sync_url(settings),
            lambda connection: run_alembic(
                connection, historical_migration_identity(settings), _HISTORICAL_B2, downgrade=False
            ),
        )
    elif revision == _B3_REVISION or revision not in accepted_revisions:
        pytest.fail("History database is at an unexpected migration revision.")
    elif revision != _HISTORICAL_B2:
        run_migration_operation(
            historical_sync_url(settings),
            lambda connection: run_alembic(
                connection, historical_migration_identity(settings), _HISTORICAL_B2, downgrade=False
            ),
        )
    if read_historical_revision(settings) != _HISTORICAL_B2:
        pytest.fail("History normalization did not reach accepted B2.")


def historical_migration_identity(settings: IntegrationTestSettings) -> MigrationIdentity:
    """Pair the guarded history migration/runtime roles against the history DB."""
    runtime_url = historical_runtime_url(settings)
    return validate_migration_identity(historical_sync_url(settings), runtime_url)


def historical_migration_identity_with_runtime(
    settings: IntegrationTestSettings,
    *,
    runtime_url: URL,
) -> MigrationIdentity:
    """Pair the guarded history migration target with an explicit runtime identity."""
    return validate_migration_identity(historical_sync_url(settings), runtime_url)


def create_historical_database(settings: IntegrationTestSettings, admin_url: URL) -> None:
    """Create the disposable pre-B3 database using accepted bootstrap ACL semantics."""
    admin_engine = create_engine(make_url(admin_url).set(database="postgres"), poolclass=NullPool)
    try:
        with admin_engine.connect() as connection:
            connection.execution_options(isolation_level="AUTOCOMMIT")
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :database"),
                {"database": _HISTORY_DATABASE},
            ).scalar_one_or_none()
            if exists:
                connection.exec_driver_sql(f"DROP DATABASE {_HISTORY_DATABASE}")
            connection.exec_driver_sql(f"CREATE DATABASE {_HISTORY_DATABASE} OWNER lumina_admin")
            connection.exec_driver_sql(f"ALTER DATABASE {_HISTORY_DATABASE} OWNER TO lumina_admin")
            connection.exec_driver_sql(
                f"REVOKE CONNECT, TEMPORARY ON DATABASE {_HISTORY_DATABASE} FROM PUBLIC"
            )
            connection.exec_driver_sql(
                f"GRANT CONNECT ON DATABASE {_HISTORY_DATABASE} "
                "TO lumina_admin, lumina_test_migrate, lumina_test_app"
            )
    finally:
        admin_engine.dispose()

    history_engine = create_engine(
        make_url(admin_url).set(database=_HISTORY_DATABASE), poolclass=NullPool
    )
    try:
        with history_engine.begin() as connection:
            connection.exec_driver_sql("REVOKE ALL ON SCHEMA public FROM PUBLIC")
            connection.exec_driver_sql(
                "GRANT USAGE, CREATE ON SCHEMA public TO lumina_test_migrate"
            )
            connection.exec_driver_sql("GRANT USAGE ON SCHEMA public TO lumina_test_app")
        with history_engine.connect() as connection:
            owner = connection.execute(
                text(
                    "SELECT pg_get_userbyid(datdba) FROM pg_database "
                    "WHERE datname = current_database()"
                )
            ).scalar_one()
            public_connect = connection.execute(
                text("SELECT has_database_privilege('public', current_database(), 'CONNECT')")
            ).scalar_one()
            public_temp = connection.execute(
                text("SELECT has_database_privilege('public', current_database(), 'TEMP')")
            ).scalar_one()
            migrate_usage = connection.execute(
                text("SELECT has_schema_privilege('lumina_test_migrate', 'public', 'USAGE')")
            ).scalar_one()
            migrate_create = connection.execute(
                text("SELECT has_schema_privilege('lumina_test_migrate', 'public', 'CREATE')")
            ).scalar_one()
            app_usage = connection.execute(
                text("SELECT has_schema_privilege('lumina_test_app', 'public', 'USAGE')")
            ).scalar_one()
            app_create = connection.execute(
                text("SELECT has_schema_privilege('lumina_test_app', 'public', 'CREATE')")
            ).scalar_one()
            trgm_count = connection.execute(
                text("SELECT count(*) FROM pg_extension WHERE extname = 'pg_trgm'")
            ).scalar_one()
            table_count = connection.execute(
                text(
                    "SELECT count(*) FROM pg_class AS t JOIN pg_namespace AS n "
                    "ON n.oid = t.relnamespace WHERE n.nspname='public' AND t.relkind='r'"
                )
            ).scalar_one()
        if (
            owner != "lumina_admin"
            or public_connect
            or public_temp
            or not migrate_usage
            or not migrate_create
            or not app_usage
            or app_create
            or trgm_count != 0
            or table_count != 0
        ):
            pytest.fail("Historical database ACL/bootstrap contract is invalid.")
    finally:
        history_engine.dispose()


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
