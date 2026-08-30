"""Fixtures for guarded real-PostgreSQL integration tests."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from lumina.settings import IntegrationTestSettings, load_integration_test_settings
from pydantic import SecretStr
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from .database_safety import require_local_test_database
from .migration_lifecycle import (
    historical_admin_connection_url,
    integration_migration_identity,
    run_alembic,
    run_migration_operation,
)

_PG_TRGM_CONTRACT = ("pg_trgm", "1.6", "public", "lumina_admin")
_CURRENT_HEAD = "a7d4e9f2c1b3"
_B3_REVISION = "e8f4c1a9b362"
_ALEMBIC_TABLE_SQL = text("SELECT to_regclass('public.alembic_version')")
_REVISION_SQL = text("SELECT version_num FROM public.alembic_version")
_CREATE_PG_TRGM_SQL = text("CREATE EXTENSION pg_trgm VERSION '1.6' SCHEMA public")
_PG_TRGM_STATE_SQL = text(
    "SELECT extension.extname, extension.extversion, namespace.nspname, "
    "pg_get_userbyid(extension.extowner) FROM pg_extension AS extension "
    "JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace "
    "WHERE extension.extname = 'pg_trgm'"
)


@pytest.fixture(scope="session")
def integration_settings() -> IntegrationTestSettings:
    """Load the four-URL contract only when `LUMINA_ENV=test` is explicit."""
    return load_integration_test_settings()


def _pg_trgm_state(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> tuple[object, ...] | None:
    admin_test_url = postgres_admin_sync_url.set(database="lumina_test")
    require_local_test_database(admin_test_url)
    engine = create_engine(admin_test_url, poolclass=NullPool)
    try:
        with engine.connect() as connection:
            state = connection.execute(_PG_TRGM_STATE_SQL).one_or_none()
    finally:
        engine.dispose()
    return tuple(state) if state is not None else None


@pytest.fixture(scope="session", autouse=True)
def migrated_test_database(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    """Establish B2 without pg_trgm, owner-provision it, then apply guarded head."""
    admin_test_url = postgres_admin_sync_url.set(database="lumina_test")
    require_local_test_database(admin_test_url)
    sync_url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    identity = integration_migration_identity(integration_settings)

    def read_revision() -> str | None:
        def operation(connection: Connection) -> str | None:
            table = connection.execute(_ALEMBIC_TABLE_SQL).scalar_one()
            if table is None:
                return None
            revision = connection.execute(_REVISION_SQL).scalar_one()
            return None if revision is None else str(revision)

        return run_migration_operation(sync_url, operation)

    revision = read_revision()
    if revision is None:
        public_tables = run_migration_operation(
            sync_url,
            lambda connection: connection.execute(
                text(
                    "SELECT count(*) FROM pg_class AS table_data "
                    "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                    "WHERE namespace.nspname = 'public' AND table_data.relkind = 'r'"
                )
            ).scalar_one(),
        )
        if public_tables != 0:
            pytest.fail("Fresh test database unexpectedly contains public tables.")
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
        )
        if read_revision() != "b7f3a2c81d4e":
            pytest.fail("Historical lineage did not commit exactly to the accepted B2 revision.")
    elif revision in {_B3_REVISION, _CURRENT_HEAD}:
        state = _pg_trgm_state(integration_settings, postgres_admin_sync_url)
        if state is None or tuple(state) != _PG_TRGM_CONTRACT:
            pytest.fail("Existing guarded test database has an invalid Phase 1B3 contract.")
        if revision == _CURRENT_HEAD:
            return
    elif revision == "b7f3a2c81d4e":
        state = _pg_trgm_state(integration_settings, postgres_admin_sync_url)
        if state is not None and tuple(state) != _PG_TRGM_CONTRACT:
            pytest.fail("pg_trgm exists at accepted B2 state with the wrong contract.")
    else:
        pytest.fail("Guarded test database is at an unexpected migration revision.")

    engine = create_engine(admin_test_url, poolclass=NullPool)
    try:
        with engine.connect() as connection:
            existing = connection.execute(_PG_TRGM_STATE_SQL).one_or_none()
        if existing is None:
            with engine.begin() as connection:
                connection.execute(_CREATE_PG_TRGM_SQL)
        with engine.connect() as connection:
            actual = connection.execute(_PG_TRGM_STATE_SQL).one_or_none()
            if actual is None or tuple(actual) != _PG_TRGM_CONTRACT:
                pytest.fail("pg_trgm provisioning did not produce the required contract.")
    finally:
        engine.dispose()
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "head", downgrade=False),
    )
    if read_revision() != _CURRENT_HEAD:
        pytest.fail("Guarded migration did not commit exactly to the current repository head.")


@pytest.fixture(scope="module")
def historical_test_database(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> Iterator[None]:
    """Create the disposable pre-B3 history database and migrate it to B2."""
    from .migration_lifecycle import (
        create_historical_database,
        historical_migration_identity,
        historical_sync_url,
        run_alembic,
        run_migration_operation,
    )

    create_historical_database(integration_settings, postgres_admin_sync_url)
    identity = historical_migration_identity(integration_settings)
    run_migration_operation(
        historical_sync_url(integration_settings),
        lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
    )
    yield


@pytest.fixture
def historical_test_database_with_pg_trgm(
    historical_test_database: None,
    postgres_admin_sync_url: URL,
) -> Iterator[None]:
    """Temporarily prepare the guarded history DB for B3 migration tests."""
    del historical_test_database
    admin_url = historical_admin_connection_url(postgres_admin_sync_url)
    engine = create_engine(admin_url, poolclass=NullPool)
    created = False
    try:
        with engine.connect() as connection:
            database = connection.execute(text("SELECT current_database()")).scalar_one()
            if database != "lumina_history_test":
                pytest.fail("Historical extension fixture targeted an unexpected database.")
            present = connection.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")
            ).scalar_one_or_none()
        if present is None:
            with engine.begin() as connection:
                connection.exec_driver_sql("CREATE EXTENSION pg_trgm VERSION '1.6' SCHEMA public")
            created = True
        yield
    finally:
        if created:
            with engine.begin() as connection:
                database = connection.execute(text("SELECT current_database()")).scalar_one()
                if database != "lumina_history_test":
                    pytest.fail("Historical extension teardown targeted an unexpected database.")
                connection.exec_driver_sql("DROP EXTENSION pg_trgm")
        engine.dispose()


@pytest.fixture(scope="session")
def postgres_admin_sync_url() -> URL:
    """Build the local-only bootstrap-admin URL without printing its secret value."""
    password: SecretStr | None = None
    port: int | None = None
    host = "127.0.0.1"
    for line in (
        (Path(__file__).resolve().parents[4] / ".env").read_text(encoding="utf-8").splitlines()
    ):
        if line.startswith("POSTGRES_PASSWORD="):
            password = SecretStr(line.removeprefix("POSTGRES_PASSWORD="))
        elif line.startswith("POSTGRES_HOST_PORT="):
            port = (
                int(line.removeprefix("POSTGRES_HOST_PORT="))
                if os.environ.get("POSTGRES_TEST_DB_HOST") != "db"
                else 5432
            )
    if os.environ.get("POSTGRES_TEST_DB_HOST") == "db":
        host = "db"
    assert password is not None
    assert port is not None
    return URL.create(
        "postgresql+psycopg",
        username="lumina_admin",
        password=password.get_secret_value(),
        host=host,
        port=port,
        database="postgres",
    )
