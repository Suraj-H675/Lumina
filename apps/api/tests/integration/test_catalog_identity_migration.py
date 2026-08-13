"""Phase 1A1 identity/provenance schema contracts on guarded PostgreSQL."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from datetime import UTC, datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path
from uuid import UUID

import pytest
from alembic.script import ScriptDirectory
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DataError, IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    integration_migration_identity,
    migration_config,
    run_alembic,
    run_migration_operation,
)

_REVISION = "d502b5935120"
_PHASE_1A2_HEAD = "e4c9f1a7b362"
_PHASE_1A3_HEAD = "a1a3c0f17c5e"
_PHASE_0_HEAD = "0002_grant_job_runtime_dml"
_TABLES = ("provider", "entity", "dataset", "source_record")
_PROTECTED_HASHES = {
    "0001_create_job.py": "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
    "0002_grant_job_runtime_dml.py": (
        "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889"
    ),
    "d502b5935120_create_catalog_identity_provenance.py": (
        "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b"
    ),
}

_PROVIDER_A = UUID("10000000-0000-4000-8000-000000000001")
_PROVIDER_B = UUID("10000000-0000-4000-8000-000000000002")
_DATASET_A = UUID("20000000-0000-4000-8000-000000000001")
_DATASET_B = UUID("20000000-0000-4000-8000-000000000002")
_ENTITY_A = UUID("30000000-0000-4000-8000-000000000001")
_ENTITY_B = UUID("30000000-0000-4000-8000-000000000002")
_SOURCE_A = UUID("40000000-0000-4000-8000-000000000001")
_FETCHED_AT = datetime(2026, 1, 15, 10, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))

_EXPECTED_COLUMNS = {
    "entity": [
        ("id", "uuid", False, "<none>"),
        ("entity_type", "character varying(32)", False, "<none>"),
        ("canonical_name", "text", False, "<none>"),
        ("created_at", "timestamp with time zone", False, "CURRENT_TIMESTAMP"),
    ],
    "provider": [
        ("id", "uuid", False, "<none>"),
        ("code", "character varying(128)", False, "<none>"),
        ("name", "text", False, "<none>"),
        ("documentation_url", "text", False, "<none>"),
        ("terms_url", "text", False, "<none>"),
        ("attribution_text", "text", False, "<none>"),
    ],
    "dataset": [
        ("id", "uuid", False, "<none>"),
        ("provider_id", "uuid", False, "<none>"),
        ("code", "character varying(128)", False, "<none>"),
        ("name", "text", False, "<none>"),
        ("release_version", "character varying(128)", False, "<none>"),
        ("source_url", "text", False, "<none>"),
        ("licence", "text", False, "<none>"),
        ("citation", "text", False, "<none>"),
    ],
    "source_record": [
        ("id", "uuid", False, "<none>"),
        ("provider_id", "uuid", False, "<none>"),
        ("dataset_id", "uuid", False, "<none>"),
        ("provider_record_id", "text", False, "<none>"),
        ("provider_version", "text", False, "<none>"),
        ("canonical_entity_id", "uuid", True, "<none>"),
        ("source_url", "text", True, "<none>"),
        ("fetched_at", "timestamp with time zone", False, "<none>"),
    ],
}

_EXPECTED_CONSTRAINTS = {
    "entity": {
        ("ck_entity_canonical_name_nonempty", "c"),
        ("ck_entity_type", "c"),
        ("pk_entity", "p"),
    },
    "provider": {
        ("ck_provider_attribution_text_nonempty", "c"),
        ("ck_provider_code_identifier", "c"),
        ("ck_provider_documentation_url_nonempty", "c"),
        ("ck_provider_name_nonempty", "c"),
        ("ck_provider_terms_url_nonempty", "c"),
        ("pk_provider", "p"),
        ("uq_provider_code", "u"),
    },
    "dataset": {
        ("ck_dataset_citation_nonempty", "c"),
        ("ck_dataset_code_identifier", "c"),
        ("ck_dataset_licence_nonempty", "c"),
        ("ck_dataset_name_nonempty", "c"),
        ("ck_dataset_release_version_identifier", "c"),
        ("ck_dataset_source_url_nonempty", "c"),
        ("fk_dataset_provider", "f"),
        ("pk_dataset", "p"),
        ("uq_dataset_id_provider_id", "u"),
        ("uq_dataset_provider_code_release_version", "u"),
    },
    "source_record": {
        ("ck_source_record_provider_record_id_nonempty", "c"),
        ("ck_source_record_provider_version_nonempty", "c"),
        ("ck_source_record_source_url_nonempty", "c"),
        ("fk_source_record_canonical_entity", "f"),
        ("fk_source_record_dataset_provider", "f"),
        ("pk_source_record", "p"),
        ("uq_source_record_dataset_provider_record_version", "u"),
    },
}

_EXPECTED_INDEXES = {
    "entity": {"pk_entity"},
    "provider": {"pk_provider", "uq_provider_code"},
    "dataset": {
        "pk_dataset",
        "uq_dataset_id_provider_id",
        "uq_dataset_provider_code_release_version",
    },
    "source_record": {
        "ix_source_record_canonical_entity_id",
        "pk_source_record",
        "uq_source_record_dataset_provider_record_version",
    },
}


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _revision(connection: Connection) -> str | None:
    return connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()


def _table_names(connection: Connection) -> set[str]:
    return set(
        connection.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        ).scalars()
    )


def _run_rolled_back(
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], None],
) -> None:
    def execute(connection: Connection) -> None:
        transaction = connection.begin()
        try:
            operation(connection)
        finally:
            transaction.rollback()

    run_migration_operation(_sync_url(settings), execute)


def _expect_integrity_error(
    connection: Connection,
    statement: str,
    parameters: Mapping[str, object],
) -> None:
    with pytest.raises(IntegrityError), connection.begin_nested():
        connection.execute(text(statement), parameters)


def _insert_provider(connection: Connection, provider_id: UUID, code: str) -> None:
    connection.execute(
        text(
            "INSERT INTO provider "
            "(id, code, name, documentation_url, terms_url, attribution_text) "
            "VALUES (:id, :code, :name, :documentation_url, :terms_url, :attribution_text)"
        ),
        {
            "id": provider_id,
            "code": code,
            "name": f"Fixture Provider {code}",
            "documentation_url": f"https://fixtures.invalid/{provider_id}/documentation",
            "terms_url": f"https://fixtures.invalid/{provider_id}/terms",
            "attribution_text": "Fictional test-only provider attribution.",
        },
    )


def _insert_entity(
    connection: Connection,
    entity_id: UUID,
    *,
    name: str = "Fixture Entity",
) -> datetime:
    created_at = connection.execute(
        text(
            "INSERT INTO entity (id, entity_type, canonical_name) "
            "VALUES (:id, 'star', :name) RETURNING created_at"
        ),
        {"id": entity_id, "name": name},
    ).scalar_one()
    assert isinstance(created_at, datetime)
    return created_at


def _insert_dataset(
    connection: Connection,
    dataset_id: UUID,
    provider_id: UUID,
    *,
    code: str = "fixture-dataset",
    release_version: str = "fixture-release-v1",
) -> None:
    connection.execute(
        text(
            "INSERT INTO dataset "
            "(id, provider_id, code, name, release_version, source_url, licence, citation) "
            "VALUES (:id, :provider_id, :code, :name, :release_version, "
            ":source_url, :licence, :citation)"
        ),
        {
            "id": dataset_id,
            "provider_id": provider_id,
            "code": code,
            "name": f"Fixture Dataset {code}",
            "release_version": release_version,
            "source_url": f"https://fixtures.invalid/{dataset_id}/source",
            "licence": "Fictional test-only licence.",
            "citation": "Fictional test-only citation.",
        },
    )


def _insert_source_record(
    connection: Connection,
    source_id: UUID,
    provider_id: UUID,
    dataset_id: UUID,
    *,
    entity_id: UUID | None = None,
    provider_record_id: str = "fixture-record-1",
    provider_version: str = "fixture-version-1",
    source_url: str | None = None,
    fetched_at: datetime = _FETCHED_AT,
) -> tuple[UUID | None, str | None, datetime]:
    row = connection.execute(
        text(
            "INSERT INTO source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version, "
            "canonical_entity_id, source_url, fetched_at) "
            "VALUES (:id, :provider_id, :dataset_id, :provider_record_id, :provider_version, "
            ":canonical_entity_id, :source_url, :fetched_at) "
            "RETURNING canonical_entity_id, source_url, fetched_at"
        ),
        {
            "id": source_id,
            "provider_id": provider_id,
            "dataset_id": dataset_id,
            "provider_record_id": provider_record_id,
            "provider_version": provider_version,
            "canonical_entity_id": entity_id,
            "source_url": source_url,
            "fetched_at": fetched_at,
        },
    ).one()
    return row[0], row[1], row[2]


def _insert_graph(connection: Connection) -> None:
    _insert_provider(connection, _PROVIDER_A, "Fixture.Provider")
    _insert_entity(connection, _ENTITY_A)
    _insert_dataset(connection, _DATASET_A, _PROVIDER_A)
    _insert_source_record(
        connection,
        _SOURCE_A,
        _PROVIDER_A,
        _DATASET_A,
        entity_id=_ENTITY_A,
        source_url="https://fixtures.invalid/record/1",
    )


@pytest.fixture(autouse=True)
def phase1a1_schema(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    """Pin historical identity tests to Phase 1A1 and restore the accepted head."""
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _REVISION, downgrade=True),
    )
    try:
        yield
    finally:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A3_HEAD, downgrade=False),
        )


def test_phase1a1_retains_its_accepted_parent_below_phase1a3_head() -> None:
    script = ScriptDirectory.from_config(migration_config())
    assert script.get_heads() == [_PHASE_1A3_HEAD]
    assert script.get_revision(_REVISION).down_revision == _PHASE_0_HEAD
    assert script.get_revision(_PHASE_1A2_HEAD).down_revision == _REVISION
    assert script.get_revision(_PHASE_1A3_HEAD).down_revision == _PHASE_1A2_HEAD


def test_protected_migrations_are_byte_for_byte_unchanged() -> None:
    root = Path(__file__).resolve().parents[4] / "migrations" / "versions"
    assert {
        name: sha256((root / name).read_bytes()).hexdigest() for name in _PROTECTED_HASHES
    } == _PROTECTED_HASHES


def test_catalog_columns_constraints_indexes_and_collations_are_exact(
    integration_settings: IntegrationTestSettings,
) -> None:
    def assert_catalog(connection: Connection) -> None:
        assert _revision(connection) == _REVISION
        assert _table_names(connection) == {"alembic_version", "job", *_TABLES}

        for table_name in _TABLES:
            columns = [
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT attribute.attname, "
                        "format_type(attribute.atttypid, attribute.atttypmod), "
                        "NOT attribute.attnotnull, "
                        "COALESCE(pg_get_expr(default_value.adbin, "
                        "default_value.adrelid), '<none>') "
                        "FROM pg_attribute AS attribute "
                        "LEFT JOIN pg_attrdef AS default_value "
                        "ON default_value.adrelid = attribute.attrelid "
                        "AND default_value.adnum = attribute.attnum "
                        "WHERE attribute.attrelid = to_regclass('public.' || :table_name) "
                        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                        "ORDER BY attribute.attnum"
                    ),
                    {"table_name": table_name},
                )
            ]
            assert columns == _EXPECTED_COLUMNS[table_name]

            constraints = {
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT constraint_data.conname, constraint_data.contype "
                        "FROM pg_constraint AS constraint_data "
                        "WHERE constraint_data.conrelid = "
                        "to_regclass('public.' || :table_name) "
                        "AND constraint_data.contype IN ('p', 'u', 'c', 'f')"
                    ),
                    {"table_name": table_name},
                )
            }
            assert constraints == _EXPECTED_CONSTRAINTS[table_name]

            indexes = set(
                connection.execute(
                    text(
                        "SELECT index_class.relname FROM pg_index AS index_data "
                        "JOIN pg_class AS index_class "
                        "ON index_class.oid = index_data.indexrelid "
                        "WHERE index_data.indrelid = to_regclass('public.' || :table_name)"
                    ),
                    {"table_name": table_name},
                ).scalars()
            )
            assert indexes == _EXPECTED_INDEXES[table_name]

        c_collations = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT table_data.relname, attribute.attname "
                    "FROM pg_class AS table_data "
                    "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                    "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                    "JOIN pg_collation AS collation_data "
                    "ON collation_data.oid = attribute.attcollation "
                    "WHERE namespace.nspname = 'public' "
                    "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                    "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                    "AND collation_data.collname = 'C'"
                ),
                {"tables": list(_TABLES)},
            )
        }
        assert c_collations == {
            ("provider", "code"),
            ("dataset", "code"),
            ("dataset", "release_version"),
            ("source_record", "provider_record_id"),
            ("source_record", "provider_version"),
        }

        forbidden_columns = connection.execute(
            text(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "AND column_name IN ('updated_at', 'published_at', 'observed_at') "
                "AND table_name = ANY(CAST(:tables AS text[]))"
            ),
            {"tables": list(_TABLES)},
        ).scalar_one()
        assert forbidden_columns == 0
        assert (
            connection.execute(
                text(
                    "SELECT count(*) FROM pg_constraint WHERE conname = 'ck_entity_timestamp_order'"
                )
            ).scalar_one()
            == 0
        )

        foreign_keys = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT conname, confupdtype, confdeltype FROM pg_constraint "
                    "WHERE conname IN ('fk_dataset_provider', "
                    "'fk_source_record_dataset_provider', "
                    "'fk_source_record_canonical_entity')"
                )
            )
        }
        assert foreign_keys == {
            ("fk_dataset_provider", "r", "r"),
            ("fk_source_record_dataset_provider", "r", "r"),
            ("fk_source_record_canonical_entity", "r", "r"),
        }

    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _REVISION, downgrade=True),
    )
    try:
        run_migration_operation(sync_url, assert_catalog)
    finally:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=False),
        )


def test_upgrade_from_phase0_downgrade_and_reupgrade(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)

    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _PHASE_0_HEAD, downgrade=True),
    )
    try:

        def assert_phase0(connection: Connection) -> None:
            assert _revision(connection) == _PHASE_0_HEAD
            assert _table_names(connection) == {"alembic_version", "job"}

        run_migration_operation(sync_url, assert_phase0)
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _REVISION, downgrade=False),
        )

        def assert_phase1a1(connection: Connection) -> None:
            assert _revision(connection) == _REVISION
            assert _table_names(connection) == {"alembic_version", "job", *_TABLES}

        run_migration_operation(sync_url, assert_phase1a1)
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_0_HEAD, downgrade=True),
        )
        run_migration_operation(sync_url, assert_phase0)
    finally:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, "head", downgrade=False),
        )


def test_uuid_null_and_timestamp_semantics(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider(connection, _PROVIDER_A, "Fixture.Provider")
        created_at = _insert_entity(connection, _ENTITY_A)
        _insert_dataset(connection, _DATASET_A, _PROVIDER_A)
        canonical_entity_id, source_url, fetched_at = _insert_source_record(
            connection,
            _SOURCE_A,
            _PROVIDER_A,
            _DATASET_A,
        )

        assert created_at.tzinfo is not None
        assert canonical_entity_id is None
        assert source_url is None
        assert fetched_at.tzinfo is not None
        assert fetched_at.astimezone(UTC) == _FETCHED_AT.astimezone(UTC)
        assert (
            connection.execute(
                text("SELECT id FROM entity WHERE id = :id"), {"id": _ENTITY_A}
            ).scalar_one()
            == _ENTITY_A
        )

        _expect_integrity_error(
            connection,
            "INSERT INTO source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version) "
            "VALUES (:id, :provider_id, :dataset_id, 'missing-time', 'fixture-version')",
            {
                "id": UUID("40000000-0000-4000-8000-000000000002"),
                "provider_id": _PROVIDER_A,
                "dataset_id": _DATASET_A,
            },
        )
        with pytest.raises(DataError), connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO entity (id, entity_type, canonical_name) "
                    "VALUES (CAST('not-a-uuid' AS uuid), 'star', 'Fixture Invalid UUID')"
                )
            )

    _run_rolled_back(integration_settings, exercise)


def test_identity_checks_and_case_sensitive_uniqueness(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider(connection, _PROVIDER_A, "Fixture.Provider")
        _insert_provider(connection, _PROVIDER_B, "fixture.provider")
        _expect_integrity_error(
            connection,
            "INSERT INTO provider "
            "(id, code, name, documentation_url, terms_url, attribution_text) "
            "VALUES (:id, 'Fixture.Provider', 'Duplicate', 'https://fixtures.invalid/doc', "
            "'https://fixtures.invalid/terms', 'Fixture attribution')",
            {"id": UUID("10000000-0000-4000-8000-000000000003")},
        )

        _insert_entity(connection, _ENTITY_A, name="Duplicate Fixture Name")
        _insert_entity(connection, _ENTITY_B, name="Duplicate Fixture Name")
        _expect_integrity_error(
            connection,
            "INSERT INTO entity (id, entity_type, canonical_name) "
            "VALUES (:id, 'unapproved_type', 'Fixture Invalid Type')",
            {"id": UUID("30000000-0000-4000-8000-000000000003")},
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO entity (id, entity_type, canonical_name) VALUES (:id, 'star', '   ')",
            {"id": UUID("30000000-0000-4000-8000-000000000004")},
        )

        _insert_dataset(connection, _DATASET_A, _PROVIDER_A)
        _insert_dataset(
            connection,
            _DATASET_B,
            _PROVIDER_A,
            release_version="fixture-release-v2",
        )
        _insert_dataset(
            connection,
            UUID("20000000-0000-4000-8000-000000000003"),
            _PROVIDER_B,
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO dataset "
            "(id, provider_id, code, name, release_version, source_url, licence, citation) "
            "VALUES (:id, :provider_id, 'fixture-dataset', 'Duplicate', "
            "'fixture-release-v1', 'https://fixtures.invalid/source', "
            "'Fixture licence', 'Fixture citation')",
            {
                "id": UUID("20000000-0000-4000-8000-000000000004"),
                "provider_id": _PROVIDER_A,
            },
        )

        _insert_source_record(connection, _SOURCE_A, _PROVIDER_A, _DATASET_A)
        _expect_integrity_error(
            connection,
            "INSERT INTO source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version, fetched_at) "
            "VALUES (:id, :provider_id, :dataset_id, "
            "'fixture-record-1', 'fixture-version-1', :fetched_at)",
            {
                "id": UUID("40000000-0000-4000-8000-000000000003"),
                "provider_id": _PROVIDER_A,
                "dataset_id": _DATASET_A,
                "fetched_at": _FETCHED_AT,
            },
        )
        _insert_source_record(
            connection,
            UUID("40000000-0000-4000-8000-000000000004"),
            _PROVIDER_A,
            _DATASET_A,
            provider_record_id="Fixture-Record-1",
        )
        _insert_source_record(
            connection,
            UUID("40000000-0000-4000-8000-000000000006"),
            _PROVIDER_A,
            _DATASET_A,
            provider_version="Fixture-Version-1",
        )
        _insert_source_record(
            connection,
            UUID("40000000-0000-4000-8000-000000000005"),
            _PROVIDER_A,
            _DATASET_B,
        )

    _run_rolled_back(integration_settings, exercise)


def test_invalid_fk_states_and_source_record_fields_are_rejected(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider(connection, _PROVIDER_A, "Fixture.Provider")
        _insert_provider(connection, _PROVIDER_B, "fixture.provider")
        _insert_dataset(connection, _DATASET_A, _PROVIDER_A)

        _expect_integrity_error(
            connection,
            "INSERT INTO dataset "
            "(id, provider_id, code, name, release_version, source_url, licence, citation) "
            "VALUES (:id, :provider_id, 'missing-provider', 'Fixture Missing Provider', "
            "'fixture-release-v1', 'https://fixtures.invalid/source', "
            "'Fixture licence', 'Fixture citation')",
            {
                "id": _DATASET_B,
                "provider_id": UUID("10000000-0000-4000-8000-000000000099"),
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version, fetched_at) "
            "VALUES (:id, :provider_id, :dataset_id, 'mismatched', 'fixture-version', :fetched_at)",
            {
                "id": _SOURCE_A,
                "provider_id": _PROVIDER_B,
                "dataset_id": _DATASET_A,
                "fetched_at": _FETCHED_AT,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version, "
            "canonical_entity_id, fetched_at) "
            "VALUES (:id, :provider_id, :dataset_id, 'missing-entity', "
            "'fixture-version', :entity_id, :fetched_at)",
            {
                "id": UUID("40000000-0000-4000-8000-000000000002"),
                "provider_id": _PROVIDER_A,
                "dataset_id": _DATASET_A,
                "entity_id": UUID("30000000-0000-4000-8000-000000000099"),
                "fetched_at": _FETCHED_AT,
            },
        )
        for field, value in (
            ("provider_record_id", ""),
            ("provider_version", ""),
            ("source_url", "   "),
        ):
            values = {
                "id": UUID(f"40000000-0000-4000-8000-{10 + len(field):012d}"),
                "provider_id": _PROVIDER_A,
                "dataset_id": _DATASET_A,
                "provider_record_id": "fixture-record",
                "provider_version": "fixture-version",
                "source_url": None,
                "fetched_at": _FETCHED_AT,
            }
            values[field] = value
            _expect_integrity_error(
                connection,
                "INSERT INTO source_record "
                "(id, provider_id, dataset_id, provider_record_id, provider_version, "
                "source_url, fetched_at) VALUES (:id, :provider_id, :dataset_id, "
                ":provider_record_id, :provider_version, :source_url, :fetched_at)",
                values,
            )

    _run_rolled_back(integration_settings, exercise)


def test_fk_updates_and_deletes_are_restrictive(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_graph(connection)
        for statement, parameters in (
            ("DELETE FROM provider WHERE id = :id", {"id": _PROVIDER_A}),
            ("DELETE FROM dataset WHERE id = :id", {"id": _DATASET_A}),
            ("DELETE FROM entity WHERE id = :id", {"id": _ENTITY_A}),
            (
                "UPDATE provider SET id = :replacement WHERE id = :id",
                {"id": _PROVIDER_A, "replacement": _PROVIDER_B},
            ),
            (
                "UPDATE dataset SET id = :replacement WHERE id = :id",
                {"id": _DATASET_A, "replacement": _DATASET_B},
            ),
            (
                "UPDATE entity SET id = :replacement WHERE id = :id",
                {"id": _ENTITY_A, "replacement": _ENTITY_B},
            ),
        ):
            _expect_integrity_error(connection, statement, parameters)

        connection.execute(text("DELETE FROM source_record WHERE id = :id"), {"id": _SOURCE_A})
        connection.execute(text("DELETE FROM dataset WHERE id = :id"), {"id": _DATASET_A})
        connection.execute(text("DELETE FROM entity WHERE id = :id"), {"id": _ENTITY_A})
        connection.execute(text("DELETE FROM provider WHERE id = :id"), {"id": _PROVIDER_A})

    _run_rolled_back(integration_settings, exercise)


def test_runtime_and_public_have_no_catalog_privileges(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    runtime_role = make_url(integration_settings.test_database_url.get_secret_value()).username
    assert runtime_role is not None

    def assert_acl(connection: Connection) -> None:
        owners = set(
            connection.execute(
                text(
                    "SELECT table_data.relname, pg_get_userbyid(table_data.relowner) "
                    "FROM pg_class AS table_data "
                    "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                    "WHERE namespace.nspname = 'public' "
                    "AND table_data.relname = ANY(CAST(:tables AS text[]))"
                ),
                {"tables": list(_TABLES)},
            )
        )
        assert owners == {(table, "lumina_test_migrate") for table in _TABLES}

        effective = connection.execute(
            text(
                "SELECT count(*) FROM unnest(CAST(:tables AS text[])) AS table_name "
                "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
                "WHERE has_table_privilege("
                ":role, format('public.%I', table_name), privilege_name"
                ")"
            ),
            {
                "tables": list(_TABLES),
                "privileges": [
                    "SELECT",
                    "INSERT",
                    "UPDATE",
                    "DELETE",
                    "TRUNCATE",
                    "REFERENCES",
                    "TRIGGER",
                ],
                "role": runtime_role,
            },
        ).scalar_one()
        assert effective == 0

        effective_columns = connection.execute(
            text(
                "SELECT count(*) FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "AND has_column_privilege("
                ":role, table_data.oid, attribute.attname, privilege_name"
                ")"
            ),
            {
                "tables": list(_TABLES),
                "privileges": ["SELECT", "INSERT", "UPDATE", "REFERENCES"],
                "role": runtime_role,
            },
        ).scalar_one()
        assert effective_columns == 0

        non_owner_acl = connection.execute(
            text(
                "SELECT count(*) FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "CROSS JOIN LATERAL aclexplode("
                "COALESCE(table_data.relacl, acldefault('r', table_data.relowner))"
                ") AS privilege "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND privilege.grantee <> table_data.relowner"
            ),
            {"tables": list(_TABLES)},
        ).scalar_one()
        assert non_owner_acl == 0

        non_owner_column_acl = connection.execute(
            text(
                "SELECT count(*) FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "AND privilege.grantee <> table_data.relowner"
            ),
            {"tables": list(_TABLES)},
        ).scalar_one()
        assert non_owner_column_acl == 0

    run_migration_operation(sync_url, assert_acl)

    runtime_url = make_url(integration_settings.test_database_url.get_secret_value()).set(
        drivername="postgresql+psycopg"
    )
    runtime_engine = create_engine(runtime_url, poolclass=NullPool)
    try:
        for table_name in _TABLES:
            with pytest.raises(ProgrammingError), runtime_engine.connect() as connection:
                connection.execute(text(f"SELECT * FROM public.{table_name} LIMIT 0"))
    finally:
        runtime_engine.dispose()


def test_acl_drift_refuses_downgrade_without_partial_changes(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)

    def grant(connection: Connection) -> None:
        connection.exec_driver_sql("GRANT SELECT ON TABLE public.entity TO lumina_test_app")
        connection.commit()

    def revoke(connection: Connection) -> None:
        connection.exec_driver_sql("REVOKE SELECT ON TABLE public.entity FROM lumina_test_app")
        connection.commit()

    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _REVISION, downgrade=True),
    )
    run_migration_operation(sync_url, grant)
    try:
        before = run_migration_operation(sync_url, _table_names)
        with pytest.raises(RuntimeError, match="Catalog ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection,
                    identity,
                    _PHASE_0_HEAD,
                    downgrade=True,
                ),
            )
        assert run_migration_operation(sync_url, _table_names) == before
        assert run_migration_operation(sync_url, _revision) == _REVISION
    finally:
        run_migration_operation(sync_url, revoke)
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=False),
        )
