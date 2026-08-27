"""Focused, order-independent exact-state coverage for Phase 1B3."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import suppress
from typing import Final

import pytest
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, TextClause, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    integration_migration_identity,
    run_alembic,
    run_migration_operation,
)

_B2_REVISION: Final = "b7f3a2c81d4e"
_B3_REVISION: Final = "e8f4c1a9b362"
_CURRENT_HEAD: Final = "f2a6c8d9e0b1"
_PG_TRGM_CONTRACT: Final = ("pg_trgm", "1.6", "public", "lumina_admin")
_CREATE_PG_TRGM_SQL: Final = text("CREATE EXTENSION pg_trgm VERSION '1.6' SCHEMA public")
_DROP_PG_TRGM_SQL: Final = text("DROP EXTENSION pg_trgm")
_DROP_UNEXPECTED_INDEX_SQL: Final = text("DROP INDEX public.ix_unexpected_entity")
_UNEXPECTED_INDEX_SQL: Final = text("SELECT to_regclass('public.ix_unexpected_entity') IS NOT NULL")
_PG_TRGM_STATE_SQL: Final = text(
    "SELECT extension.extname, extension.extversion, namespace.nspname, "
    "pg_get_userbyid(extension.extowner) FROM pg_extension AS extension "
    "JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace "
    "WHERE extension.extname = 'pg_trgm'"
)
_REVISION_SQL: Final = text("SELECT version_num FROM public.alembic_version")


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _admin_test_url(
    settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> URL:
    return postgres_admin_sync_url.set(database="lumina_test")


def _execute_committed(connection: Connection, statement: TextClause) -> None:
    connection.execute(statement)
    connection.commit()


def _execute_committed_operation(
    settings: IntegrationTestSettings,
    statement: TextClause,
) -> None:
    run_migration_operation(
        _sync_url(settings),
        lambda connection: _execute_committed(connection, statement),
    )


def _run_upgrade(settings: IntegrationTestSettings, revision: str) -> None:
    identity = integration_migration_identity(settings)
    run_migration_operation(
        _sync_url(settings),
        lambda connection: run_alembic(connection, identity, revision, downgrade=False),
    )


def _run_downgrade(settings: IntegrationTestSettings, revision: str) -> None:
    identity = integration_migration_identity(settings)
    run_migration_operation(
        _sync_url(settings),
        lambda connection: run_alembic(connection, identity, revision, downgrade=True),
    )


def _revision(settings: IntegrationTestSettings) -> str | None:
    revision = run_migration_operation(
        _sync_url(settings),
        lambda connection: connection.execute(_REVISION_SQL).scalar_one(),
    )
    return None if revision is None else str(revision)


def _pg_trgm_state(
    settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> tuple[object, ...] | None:
    engine = create_engine(_admin_test_url(settings, postgres_admin_sync_url), poolclass=NullPool)
    try:
        with engine.connect() as connection:
            state = connection.execute(_PG_TRGM_STATE_SQL).one_or_none()
    finally:
        engine.dispose()
    return tuple(state) if state is not None else None


def _require_b3_baseline(
    settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    if _revision(settings) != _B3_REVISION:
        pytest.fail("B3 drift test requires the accepted B3 revision.")
    if _pg_trgm_state(settings, postgres_admin_sync_url) != _PG_TRGM_CONTRACT:
        pytest.fail("B3 drift test requires the exact owner-provisioned extension.")


@pytest.fixture(autouse=True)
def b3_test_database(
    integration_settings: IntegrationTestSettings,
    migrated_test_database: None,
) -> Iterator[None]:
    """Run B3-specific assertions at B3 while keeping the repository head current."""
    del migrated_test_database
    current = _revision(integration_settings)
    if current == _CURRENT_HEAD:
        _run_downgrade(integration_settings, _B3_REVISION)
    elif current != _B3_REVISION:
        pytest.fail("B3 test database is at an unexpected migration revision.")
    try:
        yield
    finally:
        current = _revision(integration_settings)
        if current == _B3_REVISION:
            _run_upgrade(integration_settings, _CURRENT_HEAD)
        elif current != _CURRENT_HEAD:
            pytest.fail("B3 test database was not restored to the current repository head.")


def _assert_no_unexpected_index(settings: IntegrationTestSettings) -> None:
    result = run_migration_operation(
        _sync_url(settings),
        lambda connection: connection.execute(_UNEXPECTED_INDEX_SQL).scalar_one(),
    )
    if result:
        pytest.fail("Unexpected index already exists; refusing test-owned cleanup.")


def _drop_unexpected_index_if_owned(settings: IntegrationTestSettings) -> None:
    engine = create_engine(_sync_url(settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(_DROP_UNEXPECTED_INDEX_SQL)
    finally:
        engine.dispose()


@pytest.mark.parametrize(
    ("mutation", "restoration"),
    [
        (
            "ALTER TABLE public.entity DROP CONSTRAINT ck_entity_slug_format",
            "ALTER TABLE public.entity ADD CONSTRAINT ck_entity_slug_format "
            "CHECK (char_length(slug) >= 1 AND char_length(slug) <= 100 "
            "AND (slug COLLATE \"C\") ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)",
        ),
        (
            "ALTER TABLE public.entity DROP CONSTRAINT ck_entity_type",
            "ALTER TABLE public.entity ADD CONSTRAINT ck_entity_type "
            "CHECK (entity_type::text ~ '^[a-z][a-z0-9_]{0,31}$'::text)",
        ),
        (
            "DROP INDEX public.ix_entity_normalized_canonical_name_prefix",
            "CREATE INDEX ix_entity_normalized_canonical_name_prefix ON public.entity "
            '(normalized_canonical_name COLLATE "C" text_pattern_ops)',
        ),
    ],
)
def test_b3_exact_state_rejects_schema_drift(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    mutation: str,
    restoration: str,
) -> None:
    """Prove exact-state rejection and restore only this committed mutation."""
    mutation_sql = text(mutation)
    restoration_sql = text(restoration)
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)
    try:
        _execute_committed_operation(integration_settings, mutation_sql)
        with pytest.raises(RuntimeError, match="precondition failed"):
            _run_downgrade(integration_settings, _B2_REVISION)
        assert _revision(integration_settings) == _B3_REVISION
    finally:
        with suppress(Exception):
            _execute_committed_operation(integration_settings, restoration_sql)
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)


def test_b3_rejects_unexpected_index(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)
    _assert_no_unexpected_index(integration_settings)
    engine = create_engine(_sync_url(integration_settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(text("CREATE INDEX ix_unexpected_entity ON public.entity (slug)"))
    finally:
        engine.dispose()
    try:
        with pytest.raises(RuntimeError, match="precondition failed"):
            _run_downgrade(integration_settings, _B2_REVISION)
    finally:
        _drop_unexpected_index_if_owned(integration_settings)
    _assert_no_unexpected_index(integration_settings)
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)


def test_b3_requires_external_pg_trgm(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    """Prove missing pg_trgm fails closed, then restore canonical B3 state."""
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)
    _run_downgrade(integration_settings, _B2_REVISION)
    assert _revision(integration_settings) == _B2_REVISION
    engine = create_engine(
        _admin_test_url(integration_settings, postgres_admin_sync_url),
        poolclass=NullPool,
    )
    try:
        with engine.begin() as connection:
            connection.execute(_DROP_PG_TRGM_SQL)
    finally:
        engine.dispose()
    assert _pg_trgm_state(integration_settings, postgres_admin_sync_url) is None
    try:
        with pytest.raises(RuntimeError, match="precondition failed"):
            _run_upgrade(integration_settings, _B3_REVISION)
        assert _revision(integration_settings) == _B2_REVISION
    finally:
        engine = create_engine(
            _admin_test_url(integration_settings, postgres_admin_sync_url),
            poolclass=NullPool,
        )
        try:
            with engine.begin() as connection:
                connection.execute(_CREATE_PG_TRGM_SQL)
        finally:
            engine.dispose()
        if _revision(integration_settings) != _B3_REVISION:
            _run_upgrade(integration_settings, _B3_REVISION)
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)


def test_valid_b3_lifecycle_and_extension_preservation(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)
    _run_downgrade(integration_settings, _B2_REVISION)
    assert _revision(integration_settings) == _B2_REVISION
    assert _pg_trgm_state(integration_settings, postgres_admin_sync_url) == (_PG_TRGM_CONTRACT)
    _run_upgrade(integration_settings, _B3_REVISION)
    _require_b3_baseline(integration_settings, postgres_admin_sync_url)
