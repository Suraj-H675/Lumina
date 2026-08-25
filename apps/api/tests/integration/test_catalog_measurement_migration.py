"""Phase 1A2 quantity and measurement contracts on guarded PostgreSQL."""

from __future__ import annotations

from collections.abc import Callable, Iterator, Mapping
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from uuid import UUID

import pytest
from alembic.script import ScriptDirectory
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    historical_migration_identity,
    historical_runtime_url,
    historical_sync_url,
    migration_config,
    normalize_historical_database_to_b2,
    read_historical_revision,
    run_alembic,
    run_migration_operation,
)

_PHASE_1A1_HEAD = "d502b5935120"
_PHASE_1A2_HEAD = "e4c9f1a7b362"
_HISTORICAL_B2 = "b7f3a2c81d4e"
_PHASE_1A3_HEAD = "a1a3c0f17c5e"
_PHASE_1A5_HEAD = "e8f4c1a9b362"
_PHASE_1A2_PARENT = _PHASE_1A1_HEAD
_PHASE_1A2_TABLES = (
    "quantity",
    "unit",
    "quantity_unit",
    "measurement",
    "canonical_measurement",
)
_CATALOG_TABLES = (
    "provider",
    "entity",
    "dataset",
    "source_record",
    *_PHASE_1A2_TABLES,
)
_PROTECTED_HASHES = {
    "0001_create_job.py": "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
    "0002_grant_job_runtime_dml.py": (
        "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889"
    ),
    "d502b5935120_create_catalog_identity_provenance.py": (
        "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b"
    ),
}

_EXPECTED_COLUMNS = {
    "quantity": [
        ("id", "uuid", False, "<none>", "<none>"),
        ("code", "character varying(128)", False, "<none>", "C"),
        ("name", "text", False, "<none>", "default"),
    ],
    "unit": [
        ("id", "uuid", False, "<none>", "<none>"),
        ("code", "character varying(128)", False, "<none>", "C"),
        ("symbol", "text", False, "<none>", "default"),
        ("name", "text", False, "<none>", "default"),
    ],
    "quantity_unit": [
        ("quantity_id", "uuid", False, "<none>", "<none>"),
        ("unit_id", "uuid", False, "<none>", "<none>"),
    ],
    "measurement": [
        ("id", "uuid", False, "<none>", "<none>"),
        ("entity_id", "uuid", False, "<none>", "<none>"),
        ("source_record_id", "uuid", False, "<none>", "<none>"),
        ("quantity_id", "uuid", False, "<none>", "<none>"),
        ("unit_id", "uuid", False, "<none>", "<none>"),
        ("value_numeric", "numeric", False, "<none>", "<none>"),
        ("created_at", "timestamp with time zone", False, "CURRENT_TIMESTAMP", "<none>"),
    ],
    "canonical_measurement": [
        ("id", "uuid", False, "<none>", "<none>"),
        ("entity_id", "uuid", False, "<none>", "<none>"),
        ("quantity_id", "uuid", False, "<none>", "<none>"),
        ("measurement_id", "uuid", False, "<none>", "<none>"),
        ("selection_rule", "character varying(128)", False, "<none>", "C"),
        ("selection_version", "character varying(128)", False, "<none>", "C"),
        ("explanation", "text", False, "<none>", "default"),
        ("selected_at", "timestamp with time zone", False, "CURRENT_TIMESTAMP", "<none>"),
        ("superseded_at", "timestamp with time zone", True, "<none>", "<none>"),
    ],
}

_EXPECTED_CONSTRAINTS = {
    "quantity": {
        ("ck_quantity_code_identifier", "c"),
        ("ck_quantity_name_nonempty", "c"),
        ("pk_quantity", "p"),
        ("uq_quantity_code", "u"),
    },
    "unit": {
        ("ck_unit_code_identifier", "c"),
        ("ck_unit_name_nonempty", "c"),
        ("ck_unit_symbol_nonempty", "c"),
        ("pk_unit", "p"),
        ("uq_unit_code", "u"),
    },
    "quantity_unit": {
        ("fk_quantity_unit_quantity", "f"),
        ("fk_quantity_unit_unit", "f"),
        ("pk_quantity_unit", "p"),
    },
    "measurement": {
        ("ck_measurement_value_numeric_finite", "c"),
        ("fk_measurement_quantity_unit", "f"),
        ("fk_measurement_source_record_entity", "f"),
        ("pk_measurement", "p"),
        ("uq_measurement_id_entity_id_quantity_id", "u"),
    },
    "canonical_measurement": {
        ("ck_canonical_measurement_explanation_nonempty", "c"),
        ("ck_canonical_measurement_selection_rule_identifier", "c"),
        ("ck_canonical_measurement_selection_version_identifier", "c"),
        ("ck_canonical_measurement_superseded_at_order", "c"),
        ("fk_canonical_measurement_measurement_entity_quantity", "f"),
        ("pk_canonical_measurement", "p"),
    },
}

_EXPECTED_INDEXES = {
    "quantity": {"pk_quantity", "uq_quantity_code"},
    "unit": {"pk_unit", "uq_unit_code"},
    "quantity_unit": {"pk_quantity_unit"},
    "measurement": {
        "pk_measurement",
        "uq_measurement_id_entity_id_quantity_id",
        "ix_measurement_source_record_id_entity_id",
        "ix_measurement_quantity_id_unit_id",
    },
    "canonical_measurement": {
        "pk_canonical_measurement",
        "ix_canonical_measurement_measurement_id_entity_id_quantity_id",
        "uq_canonical_measurement_active_entity_id_quantity_id",
    },
}

_PROVIDER_ID = UUID("10000000-0000-4000-8000-000000000001")
_DATASET_ID = UUID("20000000-0000-4000-8000-000000000001")
_ENTITY_A = UUID("30000000-0000-4000-8000-000000000001")
_ENTITY_B = UUID("30000000-0000-4000-8000-000000000002")
_QUANTITY_ID = UUID("50000000-0000-4000-8000-000000000001")
_QUANTITY_B = UUID("50000000-0000-4000-8000-000000000002")
_UNIT_ID = UUID("55000000-0000-4000-8000-000000000001")
_UNIT_B = UUID("55000000-0000-4000-8000-000000000002")
_MEASUREMENT_A = UUID("60000000-0000-4000-8000-000000000001")
_MEASUREMENT_B = UUID("60000000-0000-4000-8000-000000000002")
_MEASUREMENT_C = UUID("60000000-0000-4000-8000-000000000003")
_SOURCE_A = UUID("40000000-0000-4000-8000-000000000001")
_SOURCE_B = UUID("40000000-0000-4000-8000-000000000002")
_CANONICAL_A = UUID("70000000-0000-4000-8000-000000000001")
_CANONICAL_B = UUID("70000000-0000-4000-8000-000000000002")
_SELECTED_AT = datetime(2026, 1, 15, 10, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return historical_sync_url(settings)


def _head() -> str:
    script = ScriptDirectory.from_config(migration_config())
    heads = script.get_heads()
    assert len(heads) == 1
    return heads[0]


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


def _ensure_b2(settings: IntegrationTestSettings) -> None:
    revision = run_migration_operation(
        historical_sync_url(settings),
        lambda connection: connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one(),
    )
    if revision != "b7f3a2c81d4e":
        pytest.fail("History database is not at accepted B2.")


def _run_rolled_back_at_phase(
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], None],
) -> None:
    """Execute a transaction-only operation at the fixture-established phase."""

    def execute(connection: Connection) -> None:
        transaction = connection.begin()
        try:
            operation(connection)
        finally:
            transaction.rollback()

    run_migration_operation(historical_sync_url(settings), execute)


def _run_rolled_back(
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], None],
    historical_test_database: None,
) -> None:
    _ensure_b2(settings)

    def execute(connection: Connection) -> None:
        transaction = connection.begin()
        try:
            operation(connection)
        finally:
            transaction.rollback()

    run_migration_operation(historical_sync_url(settings), execute)


def _expect_integrity_error(
    connection: Connection,
    statement: str,
    parameters: Mapping[str, object] | None = None,
) -> None:
    with pytest.raises(IntegrityError), connection.begin_nested():
        connection.execute(text(statement), parameters or {})


def _insert_provider_dataset_entity_source(
    connection: Connection,
    *,
    source_id: UUID = _SOURCE_A,
    entity_id: UUID = _ENTITY_A,
    provider_record_id: str = "fixture-record-1",
) -> None:
    connection.execute(
        text(
            "INSERT INTO provider "
            "(id, code, name, documentation_url, terms_url, attribution_text) "
            "VALUES (:id, 'fixture.provider', 'Fixture Provider', "
            "'https://fixtures.invalid/provider', 'https://fixtures.invalid/terms', "
            "'Fictional test-only provider attribution.')"
        ),
        {"id": _PROVIDER_ID},
    )
    connection.execute(
        text(
            "INSERT INTO entity (id, entity_type, canonical_name) "
            "VALUES (:id, 'star', 'Fixture Star')"
        ),
        {"id": entity_id},
    )
    connection.execute(
        text(
            "INSERT INTO dataset "
            "(id, provider_id, code, name, release_version, source_url, licence, citation) "
            "VALUES (:id, :provider_id, 'fixture-dataset', 'Fixture Dataset', 'fixture-v1', "
            "'https://fixtures.invalid/dataset', 'Fictional test-only licence', "
            "'Fictional test-only citation')"
        ),
        {"id": _DATASET_ID, "provider_id": _PROVIDER_ID},
    )
    connection.execute(
        text(
            "INSERT INTO source_record "
            "(id, provider_id, dataset_id, provider_record_id, provider_version, "
            "canonical_entity_id, source_url, fetched_at) "
            "VALUES (:id, :provider_id, :dataset_id, :record_id, 'fixture-v1', "
            ":entity_id, 'https://fixtures.invalid/record', :fetched_at)"
        ),
        {
            "id": source_id,
            "provider_id": _PROVIDER_ID,
            "dataset_id": _DATASET_ID,
            "record_id": provider_record_id,
            "entity_id": entity_id,
            "fetched_at": _SELECTED_AT,
        },
    )


def _insert_quantity(
    connection: Connection,
    quantity_id: UUID = _QUANTITY_ID,
    *,
    code: str = "mass",
    name: str = "Mass",
) -> None:
    connection.execute(
        text("INSERT INTO quantity (id, code, name) VALUES (:id, :code, :name)"),
        {"id": quantity_id, "code": code, "name": name},
    )


def _insert_unit(
    connection: Connection,
    unit_id: UUID = _UNIT_ID,
    *,
    code: str = "kg",
    symbol: str = "kg",
    name: str = "Kilogram",
) -> None:
    connection.execute(
        text("INSERT INTO unit (id, code, symbol, name) VALUES (:id, :code, :symbol, :name)"),
        {"id": unit_id, "code": code, "symbol": symbol, "name": name},
    )


def _insert_quantity_unit(
    connection: Connection,
    *,
    quantity_id: UUID = _QUANTITY_ID,
    unit_id: UUID = _UNIT_ID,
) -> None:
    connection.execute(
        text("INSERT INTO quantity_unit (quantity_id, unit_id) VALUES (:quantity_id, :unit_id)"),
        {"quantity_id": quantity_id, "unit_id": unit_id},
    )


def _insert_measurement(
    connection: Connection,
    measurement_id: UUID,
    *,
    entity_id: UUID = _ENTITY_A,
    quantity_id: UUID = _QUANTITY_ID,
    unit_id: UUID = _UNIT_ID,
    source_id: UUID = _SOURCE_A,
    value: Decimal = Decimal("12.3400"),
) -> None:
    connection.execute(
        text(
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric) "
            "VALUES (:id, :entity_id, :source_record_id, :quantity_id, :unit_id, :value_numeric)"
        ),
        {
            "id": measurement_id,
            "entity_id": entity_id,
            "source_record_id": source_id,
            "quantity_id": quantity_id,
            "unit_id": unit_id,
            "value_numeric": value,
        },
    )


@pytest.fixture(autouse=True)
def phase1a2_schema(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> Iterator[None]:
    """Pin historical measurement tests to Phase 1A2 and restore the accepted head."""
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    normalize_historical_database_to_b2(integration_settings)
    if read_historical_revision(integration_settings) != _HISTORICAL_B2:
        pytest.fail("History database did not normalize to accepted B2.")
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=True),
    )
    try:
        yield
    finally:
        normalize_historical_database_to_b2(integration_settings)


def test_repository_head_and_phase1a2_lineage_are_exact() -> None:
    script = ScriptDirectory.from_config(migration_config())
    current_head = _head()
    assert current_head == _PHASE_1A5_HEAD
    assert script.get_revision(_PHASE_1A2_HEAD).down_revision == _PHASE_1A2_PARENT
    assert script.get_revision(_PHASE_1A3_HEAD).down_revision == _PHASE_1A2_HEAD


def test_protected_phase0_migrations_are_byte_for_byte_unchanged() -> None:
    root = Path(__file__).resolve().parents[4] / "migrations" / "versions"
    assert {
        name: sha256((root / name).read_bytes()).hexdigest() for name in _PROTECTED_HASHES
    } == _PROTECTED_HASHES


def test_phase1a2_catalogue_is_exact_and_has_no_deferred_schema(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    def assert_schema(connection: Connection) -> None:
        assert _revision(connection) == _PHASE_1A2_HEAD
        assert _table_names(connection) == {
            "alembic_version",
            "job",
            *_CATALOG_TABLES,
        }

        for table_name in _PHASE_1A2_TABLES:
            columns = [
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT attribute.attname, "
                        "format_type(attribute.atttypid, attribute.atttypmod), "
                        "NOT attribute.attnotnull, "
                        "COALESCE(pg_get_expr(default_value.adbin, "
                        "default_value.adrelid), '<none>'), "
                        "COALESCE(collation_data.collname, '<none>') "
                        "FROM pg_attribute AS attribute "
                        "LEFT JOIN pg_attrdef AS default_value "
                        "ON default_value.adrelid = attribute.attrelid "
                        "AND default_value.adnum = attribute.attnum "
                        "LEFT JOIN pg_collation AS collation_data "
                        "ON collation_data.oid = attribute.attcollation "
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

        forbidden_quantity_columns = connection.execute(
            text(
                "SELECT count(*) FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'quantity' "
                "AND column_name IN ('canonical_unit', 'preferred_unit', 'base_unit', "
                "'conversion_factor', 'conversion_offset', 'conversion_cycle')"
            )
        ).scalar_one()
        assert forbidden_quantity_columns == 0

        canonical_columns = [column[0] for column in _EXPECTED_COLUMNS["canonical_measurement"]]
        assert canonical_columns == [
            "id",
            "entity_id",
            "quantity_id",
            "measurement_id",
            "selection_rule",
            "selection_version",
            "explanation",
            "selected_at",
            "superseded_at",
        ]
        assert "reviewed_by" not in canonical_columns
        assert "replacement_actor" not in canonical_columns
        assert "computed_at" not in canonical_columns

        selected_at = connection.execute(
            text(
                "SELECT data_type, is_nullable, column_default FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'canonical_measurement' "
                "AND column_name = 'selected_at'"
            )
        ).one()
        assert tuple(selected_at) == (
            "timestamp with time zone",
            "NO",
            "CURRENT_TIMESTAMP",
        )

        created_at = connection.execute(
            text(
                "SELECT data_type, is_nullable, column_default "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = 'measurement' "
                "AND column_name = 'created_at'"
            )
        ).one()
        assert tuple(created_at) == (
            "timestamp with time zone",
            "NO",
            "CURRENT_TIMESTAMP",
        )

        indexes = {
            table_name: {
                row[0]
                for row in connection.execute(
                    text(
                        "SELECT index_class.relname "
                        "FROM pg_index AS index_data "
                        "JOIN pg_class AS index_class "
                        "ON index_class.oid = index_data.indexrelid "
                        "WHERE index_data.indrelid = to_regclass('public.' || :table_name)"
                    ),
                    {"table_name": table_name},
                )
            }
            for table_name in _PHASE_1A2_TABLES
        }
        assert indexes == _EXPECTED_INDEXES

        index_definitions = {
            row[0]: tuple(row[1])
            for row in connection.execute(
                text(
                    "SELECT index_class.relname, ARRAY("
                    "SELECT attribute.attname FROM unnest(index_data.indkey) "
                    "WITH ORDINALITY AS key(attribute_number, position) "
                    "JOIN pg_attribute AS attribute "
                    "ON attribute.attrelid = index_data.indrelid "
                    "AND attribute.attnum = key.attribute_number "
                    "ORDER BY key.position) "
                    "FROM pg_index AS index_data "
                    "JOIN pg_class AS index_class "
                    "ON index_class.oid = index_data.indexrelid "
                    "WHERE index_class.relname IN ("
                    "'ix_measurement_source_record_id_entity_id', "
                    "'ix_measurement_quantity_id_unit_id', "
                    "'ix_canonical_measurement_measurement_id_entity_id_quantity_id')"
                )
            )
        }
        assert index_definitions == {
            "ix_measurement_source_record_id_entity_id": ("source_record_id", "entity_id"),
            "ix_measurement_quantity_id_unit_id": ("quantity_id", "unit_id"),
            "ix_canonical_measurement_measurement_id_entity_id_quantity_id": (
                "measurement_id",
                "entity_id",
                "quantity_id",
            ),
        }

        foreign_keys = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT conname, pg_get_constraintdef(oid, true), "
                    "condeferrable, condeferred FROM pg_constraint "
                    "WHERE conname IN ('fk_quantity_unit_quantity', 'fk_quantity_unit_unit', "
                    "'fk_measurement_source_record_entity', 'fk_measurement_quantity_unit', "
                    "'fk_canonical_measurement_measurement_entity_quantity')"
                )
            )
        }
        assert foreign_keys == {
            (
                "fk_quantity_unit_quantity",
                "FOREIGN KEY (quantity_id) REFERENCES quantity(id) "
                "ON UPDATE RESTRICT ON DELETE RESTRICT",
                False,
                False,
            ),
            (
                "fk_quantity_unit_unit",
                "FOREIGN KEY (unit_id) REFERENCES unit(id) ON UPDATE RESTRICT ON DELETE RESTRICT",
                False,
                False,
            ),
            (
                "fk_measurement_source_record_entity",
                "FOREIGN KEY (source_record_id, entity_id) "
                "REFERENCES source_record(id, canonical_entity_id) "
                "ON UPDATE RESTRICT ON DELETE RESTRICT",
                False,
                False,
            ),
            (
                "fk_measurement_quantity_unit",
                "FOREIGN KEY (quantity_id, unit_id) "
                "REFERENCES quantity_unit(quantity_id, unit_id) "
                "ON UPDATE RESTRICT ON DELETE RESTRICT",
                False,
                False,
            ),
            (
                "fk_canonical_measurement_measurement_entity_quantity",
                "FOREIGN KEY (measurement_id, entity_id, quantity_id) "
                "REFERENCES measurement(id, entity_id, quantity_id) "
                "ON UPDATE RESTRICT ON DELETE RESTRICT",
                False,
                False,
            ),
        }

    run_migration_operation(historical_sync_url(integration_settings), assert_schema)


def test_quantity_unit_is_the_only_compatibility_boundary(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider_dataset_entity_source(connection)
        _insert_quantity(connection)
        _insert_quantity(connection, _QUANTITY_B, code="mass.alternate", name="Mass")
        _insert_unit(connection)
        _insert_unit(connection, _UNIT_B, code="kg.alternate", symbol="kg", name="Kilogram")
        _insert_quantity_unit(connection)
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO quantity_unit (quantity_id, unit_id) "
                    "VALUES (:quantity_id, :unit_id)"
                ),
                {"quantity_id": _QUANTITY_ID, "unit_id": _UNIT_ID},
            )
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO quantity_unit (quantity_id, unit_id) "
                    "VALUES (:quantity_id, :unit_id)"
                ),
                {
                    "quantity_id": UUID("50000000-0000-4000-8000-000000000099"),
                    "unit_id": _UNIT_ID,
                },
            )

        _expect_integrity_error(
            connection,
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric) "
            "VALUES (:id, :entity_id, :source_record_id, :quantity_id, :unit_id, 1)",
            {
                "id": _MEASUREMENT_A,
                "entity_id": _ENTITY_A,
                "source_record_id": _SOURCE_A,
                "quantity_id": _QUANTITY_ID,
                "unit_id": _UNIT_B,
            },
        )

        for statement, parameters in (
            (
                "INSERT INTO quantity (id, code, name) VALUES (:id, :code, 'Fixture')",
                {
                    "id": UUID("50000000-0000-4000-8000-000000000010"),
                    "code": "invalid code",
                },
            ),
            (
                "INSERT INTO quantity (id, code, name) VALUES (:id, 'valid-code', '   ')",
                {"id": UUID("50000000-0000-4000-8000-000000000011")},
            ),
            (
                "INSERT INTO unit (id, code, symbol, name) "
                "VALUES (:id, 'valid-unit', '   ', 'Fixture')",
                {"id": UUID("55000000-0000-4000-8000-000000000010")},
            ),
            (
                "INSERT INTO unit (id, code, symbol, name) "
                "VALUES (:id, 'valid-unit', 'u', ' Fixture ')",
                {"id": UUID("55000000-0000-4000-8000-000000000011")},
            ),
        ):
            _expect_integrity_error(connection, statement, parameters)

    _run_rolled_back_at_phase(integration_settings, exercise)


def test_measurement_numeric_decimal_is_finite_and_provenance_is_required(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider_dataset_entity_source(connection)
        connection.execute(
            text(
                "INSERT INTO source_record "
                "(id, provider_id, dataset_id, provider_record_id, provider_version, "
                "canonical_entity_id, source_url, fetched_at) "
                "VALUES (:id, :provider_id, :dataset_id, 'fixture-record-2', 'fixture-v1', "
                ":entity_id, 'https://fixtures.invalid/record-2', :fetched_at)"
            ),
            {
                "id": _SOURCE_B,
                "provider_id": _PROVIDER_ID,
                "dataset_id": _DATASET_ID,
                "entity_id": _ENTITY_A,
                "fetched_at": _SELECTED_AT,
            },
        )
        _insert_quantity(connection)
        _insert_unit(connection)
        _insert_quantity_unit(connection)

        exact_value = Decimal("123456789012345678901234567890.123456789012345678901234567890")
        _insert_measurement(connection, _MEASUREMENT_A, value=exact_value)
        _insert_measurement(
            connection,
            _MEASUREMENT_B,
            value=exact_value,
        )
        _insert_measurement(
            connection,
            _MEASUREMENT_C,
            source_id=_SOURCE_B,
            value=Decimal("12.3401"),
        )
        rows = connection.execute(
            text(
                "SELECT value_numeric, source_record_id, created_at FROM measurement "
                "WHERE entity_id = :entity_id AND quantity_id = :quantity_id "
                "ORDER BY id"
            ),
            {"entity_id": _ENTITY_A, "quantity_id": _QUANTITY_ID},
        ).all()
        assert [(row[0], row[1]) for row in rows] == [
            (exact_value, _SOURCE_A),
            (exact_value, _SOURCE_A),
            (Decimal("12.3401"), _SOURCE_B),
        ]
        assert all(row[2].tzinfo is not None for row in rows)

        connection.execute(
            text(
                "INSERT INTO entity (id, entity_type, canonical_name) "
                "VALUES (:id, 'planet', 'Fixture Planet')"
            ),
            {"id": _ENTITY_B},
        )
        with pytest.raises(IntegrityError), connection.begin_nested():
            connection.execute(
                text(
                    "INSERT INTO measurement "
                    "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric) "
                    "VALUES (:id, :entity_id, :source_record_id, :quantity_id, :unit_id, 1.0)"
                ),
                {
                    "id": UUID("60000000-0000-4000-8000-000000000010"),
                    "entity_id": _ENTITY_B,
                    "source_record_id": _SOURCE_A,
                    "quantity_id": _QUANTITY_ID,
                    "unit_id": _UNIT_ID,
                },
            )

        for offset, value in enumerate(("NaN", "Infinity", "-Infinity"), start=11):
            _expect_integrity_error(
                connection,
                "INSERT INTO measurement "
                "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric) "
                "VALUES (:id, :entity_id, :source_record_id, :quantity_id, :unit_id, "
                "CAST(:value AS numeric))",
                {
                    "id": UUID(f"60000000-0000-4000-8000-{offset:012d}"),
                    "entity_id": _ENTITY_A,
                    "source_record_id": _SOURCE_A,
                    "quantity_id": _QUANTITY_ID,
                    "unit_id": _UNIT_ID,
                    "value": value,
                },
            )

        unresolved_source = UUID("40000000-0000-4000-8000-000000000003")
        connection.execute(
            text(
                "INSERT INTO source_record "
                "(id, provider_id, dataset_id, provider_record_id, provider_version, fetched_at) "
                "VALUES (:id, :provider_id, :dataset_id, 'unresolved-fixture', "
                "'fixture-v1', :fetched_at)"
            ),
            {
                "id": unresolved_source,
                "provider_id": _PROVIDER_ID,
                "dataset_id": _DATASET_ID,
                "fetched_at": _SELECTED_AT,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric) "
            "VALUES (:id, :entity_id, :source_record_id, :quantity_id, :unit_id, 1)",
            {
                "id": UUID("60000000-0000-4000-8000-000000000020"),
                "entity_id": _ENTITY_A,
                "source_record_id": unresolved_source,
                "quantity_id": _QUANTITY_ID,
                "unit_id": _UNIT_ID,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO measurement "
            "(id, entity_id, quantity_id, unit_id, value_numeric) "
            "VALUES (:id, :entity_id, :quantity_id, :unit_id, 1.0)",
            {
                "id": UUID("60000000-0000-4000-8000-000000000005"),
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_ID,
                "unit_id": _UNIT_ID,
            },
        )

    _run_rolled_back_at_phase(integration_settings, exercise)


def test_measurement_and_canonical_entity_quantity_closure(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider_dataset_entity_source(connection)
        connection.execute(
            text(
                "INSERT INTO entity (id, entity_type, canonical_name) "
                "VALUES (:id, 'planet', 'Fixture Planet')"
            ),
            {"id": _ENTITY_B},
        )
        _insert_quantity(connection)
        _insert_quantity(connection, _QUANTITY_B, code="length", name="Length")
        _insert_unit(connection)
        _insert_quantity_unit(connection)
        _insert_measurement(connection, _MEASUREMENT_A)

        connection.execute(
            text(
                "INSERT INTO canonical_measurement "
                "(id, entity_id, quantity_id, measurement_id, selection_rule, "
                "selection_version, explanation, selected_at) "
                "VALUES (:id, :entity_id, :quantity_id, :measurement_id, 'fixture-rule', "
                "'fixture-v1', 'Fixture selection', :selected_at)"
            ),
            {
                "id": _CANONICAL_A,
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_ID,
                "measurement_id": _MEASUREMENT_A,
                "selected_at": _SELECTED_AT,
            },
        )

        for assignment in (
            "selection_rule = 'invalid rule'",
            "selection_version = 'invalid version'",
            "explanation = '   '",
        ):
            _expect_integrity_error(
                connection,
                f"UPDATE canonical_measurement SET {assignment} WHERE id = :id",
                {"id": _CANONICAL_A},
            )

        _expect_integrity_error(
            connection,
            "INSERT INTO canonical_measurement "
            "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
            "explanation, selected_at) VALUES (:id, :entity_id, :quantity_id, :measurement_id, "
            "'fixture-rule', 'fixture-v1', 'Fixture selection', :selected_at)",
            {
                "id": _CANONICAL_B,
                "entity_id": _ENTITY_B,
                "quantity_id": _QUANTITY_ID,
                "measurement_id": _MEASUREMENT_A,
                "selected_at": _SELECTED_AT,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO canonical_measurement "
            "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
            "explanation, selected_at) VALUES (:id, :entity_id, :quantity_id, :measurement_id, "
            "'fixture-rule', 'fixture-v1', 'Fixture selection', :selected_at)",
            {
                "id": UUID("70000000-0000-4000-8000-000000000003"),
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_B,
                "measurement_id": _MEASUREMENT_A,
                "selected_at": _SELECTED_AT,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO canonical_measurement "
            "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
            "explanation, selected_at) VALUES (:id, :entity_id, :quantity_id, :measurement_id, "
            "'fixture-rule', 'fixture-v1', 'Fixture selection', :selected_at)",
            {
                "id": UUID("70000000-0000-4000-8000-000000000004"),
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_ID,
                "measurement_id": UUID("60000000-0000-4000-8000-000000000099"),
                "selected_at": _SELECTED_AT,
            },
        )

    _run_rolled_back_at_phase(integration_settings, exercise)


def test_canonical_active_uniqueness_and_replacement_history(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_provider_dataset_entity_source(connection)
        connection.execute(
            text(
                "INSERT INTO source_record "
                "(id, provider_id, dataset_id, provider_record_id, provider_version, "
                "canonical_entity_id, source_url, fetched_at) "
                "VALUES (:id, :provider_id, :dataset_id, 'fixture-record-2', 'fixture-v1', "
                ":entity_id, 'https://fixtures.invalid/record-2', :fetched_at)"
            ),
            {
                "id": _SOURCE_B,
                "provider_id": _PROVIDER_ID,
                "dataset_id": _DATASET_ID,
                "entity_id": _ENTITY_A,
                "fetched_at": _SELECTED_AT,
            },
        )
        _insert_quantity(connection)
        _insert_unit(connection)
        _insert_quantity_unit(connection)
        _insert_measurement(connection, _MEASUREMENT_A)
        _insert_measurement(connection, _MEASUREMENT_B, source_id=_SOURCE_B, value=Decimal("13.0"))

        rule = "fixture-rule"
        version = "fixture-v1"
        explanation = "Fixture selection explanation"
        first_selected_at = connection.execute(
            text(
                "INSERT INTO canonical_measurement "
                "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
                "explanation) VALUES (:id, :entity_id, :quantity_id, :measurement_id, "
                ":selection_rule, :selection_version, :explanation) RETURNING selected_at"
            ),
            {
                "id": _CANONICAL_A,
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_ID,
                "measurement_id": _MEASUREMENT_A,
                "selection_rule": rule,
                "selection_version": version,
                "explanation": explanation,
            },
        ).scalar_one()
        assert first_selected_at.tzinfo is not None
        _expect_integrity_error(
            connection,
            "INSERT INTO canonical_measurement "
            "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
            "explanation, selected_at) VALUES (:id, :entity_id, :quantity_id, :measurement_id, "
            ":selection_rule, :selection_version, :explanation, :selected_at)",
            {
                "id": _CANONICAL_B,
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_ID,
                "measurement_id": _MEASUREMENT_B,
                "selection_rule": rule,
                "selection_version": version,
                "explanation": explanation,
                "selected_at": first_selected_at + timedelta(minutes=1),
            },
        )

        earlier = first_selected_at - timedelta(seconds=1)
        _expect_integrity_error(
            connection,
            "UPDATE canonical_measurement SET superseded_at = :superseded_at WHERE id = :id",
            {"id": _CANONICAL_A, "superseded_at": earlier},
        )
        replacement_at = first_selected_at + timedelta(minutes=1)
        replacement_rule = "fixture-replacement"
        replacement_version = "fixture-v2"
        replacement_explanation = "Fixture replacement explanation"
        connection.execute(
            text("UPDATE canonical_measurement SET superseded_at = :superseded_at WHERE id = :id"),
            {"id": _CANONICAL_A, "superseded_at": replacement_at},
        )
        connection.execute(
            text(
                "INSERT INTO canonical_measurement "
                "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
                "explanation, selected_at) VALUES (:id, :entity_id, :quantity_id, :measurement_id, "
                ":selection_rule, :selection_version, :explanation, :selected_at)"
            ),
            {
                "id": _CANONICAL_B,
                "entity_id": _ENTITY_A,
                "quantity_id": _QUANTITY_ID,
                "measurement_id": _MEASUREMENT_B,
                "selection_rule": replacement_rule,
                "selection_version": replacement_version,
                "explanation": replacement_explanation,
                "selected_at": replacement_at,
            },
        )
        rows = connection.execute(
            text(
                "SELECT id, measurement_id, selection_rule, selection_version, explanation, "
                "selected_at, superseded_at FROM canonical_measurement "
                "WHERE entity_id = :entity_id AND quantity_id = :quantity_id ORDER BY selected_at"
            ),
            {"entity_id": _ENTITY_A, "quantity_id": _QUANTITY_ID},
        ).all()
        assert len(rows) == 2
        assert rows[0][0] == _CANONICAL_A
        assert rows[0][1] == _MEASUREMENT_A
        assert tuple(rows[0][2:5]) == (rule, version, explanation)
        assert rows[0][5].tzinfo is not None
        assert rows[0][6] == replacement_at
        assert rows[1][0] == _CANONICAL_B
        assert rows[1][1] == _MEASUREMENT_B
        assert tuple(rows[1][2:5]) == (
            replacement_rule,
            replacement_version,
            replacement_explanation,
        )
        assert rows[1][5] == replacement_at
        assert rows[1][6] is None
        assert set(
            connection.execute(
                text("SELECT id FROM measurement WHERE id IN (:first, :second)"),
                {"first": _MEASUREMENT_A, "second": _MEASUREMENT_B},
            ).scalars()
        ) == {_MEASUREMENT_A, _MEASUREMENT_B}

    _run_rolled_back_at_phase(integration_settings, exercise)


def test_catalog_acl_excludes_phase1a2_tables_from_runtime_role(
    integration_settings: IntegrationTestSettings,
    historical_test_database: None,
) -> None:
    migration_role = make_url(
        integration_settings.test_database_sync_url.get_secret_value()
    ).username
    runtime_role = historical_runtime_url(integration_settings).username
    assert migration_role is not None
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
                {"tables": list(_PHASE_1A2_TABLES)},
            )
        )
        assert owners == {(table, migration_role) for table in _PHASE_1A2_TABLES}
        effective = connection.execute(
            text(
                "SELECT count(*) FROM unnest(CAST(:tables AS text[])) AS table_name "
                "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
                "WHERE has_table_privilege(:role, format('public.%I', table_name), privilege_name)"
            ),
            {
                "tables": list(_PHASE_1A2_TABLES),
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
                ":role, table_data.oid, attribute.attname, privilege_name)"
            ),
            {
                "tables": list(_PHASE_1A2_TABLES),
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
            {"tables": list(_PHASE_1A2_TABLES)},
        ).scalar_one()
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
            {"tables": list(_PHASE_1A2_TABLES)},
        ).scalar_one()
        assert non_owner_acl == 0
        assert non_owner_column_acl == 0

    run_migration_operation(historical_sync_url(integration_settings), assert_acl)

    runtime_url = historical_runtime_url(integration_settings).set(drivername="postgresql+psycopg")
    runtime_engine = create_engine(runtime_url, poolclass=NullPool)
    try:
        for table_name in _PHASE_1A2_TABLES:
            with pytest.raises(ProgrammingError), runtime_engine.connect() as connection:
                connection.execute(text(f"SELECT * FROM public.{table_name} LIMIT 0"))
    finally:
        runtime_engine.dispose()


def test_upgrade_from_phase1a1_downgrade_and_reupgrade(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    historical_test_database: None,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    phase1a2 = _PHASE_1A2_HEAD
    assert _head() == _PHASE_1A5_HEAD

    if True:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A1_HEAD, downgrade=True),
        )
        try:
            run_migration_operation(
                sync_url,
                lambda connection: assert_revision_and_tables(connection, _PHASE_1A1_HEAD),
            )
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(connection, identity, phase1a2, downgrade=False),
            )
            run_migration_operation(
                sync_url,
                lambda connection: assert_revision_and_tables(connection, phase1a2),
            )
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, _PHASE_1A1_HEAD, downgrade=True
                ),
            )
            run_migration_operation(
                sync_url,
                lambda connection: assert_revision_and_tables(connection, _PHASE_1A1_HEAD),
            )
        finally:
            normalize_historical_database_to_b2(integration_settings)


def assert_revision_and_tables(
    connection: Connection,
    revision: str,
) -> None:
    """Assert lifecycle revision and the table set implied by that revision."""
    assert _revision(connection) == revision
    if revision == _PHASE_1A1_HEAD:
        expected = {"alembic_version", "job", "provider", "entity", "dataset", "source_record"}
    else:
        expected = {"alembic_version", "job", *_CATALOG_TABLES}
    assert _table_names(connection) == expected
    source_record_entity_key = connection.execute(
        text(
            "SELECT pg_get_constraintdef(oid, true) FROM pg_constraint "
            "WHERE conrelid = 'public.source_record'::regclass "
            "AND conname = 'uq_source_record_id_canonical_entity_id' AND contype = 'u'"
        )
    ).scalar_one_or_none()
    if revision == _PHASE_1A1_HEAD:
        assert source_record_entity_key is None
    else:
        assert source_record_entity_key == "UNIQUE (id, canonical_entity_id)"


@pytest.mark.parametrize(
    ("mutate", "repair"),
    [
        (
            "ALTER TABLE public.entity ADD COLUMN phase1a1_schema_drift text",
            "ALTER TABLE public.entity DROP COLUMN phase1a1_schema_drift",
        ),
        (
            "ALTER TABLE public.measurement ADD COLUMN phase1a2_schema_drift text",
            "ALTER TABLE public.measurement DROP COLUMN phase1a2_schema_drift",
        ),
        (
            "GRANT SELECT ON TABLE public.measurement TO lumina_test_app",
            "REVOKE SELECT ON TABLE public.measurement FROM lumina_test_app",
        ),
    ],
)
def test_phase1a2_downgrade_fails_closed_on_schema_or_acl_drift(
    integration_settings: IntegrationTestSettings,
    mutate: str,
    repair: str,
    historical_test_database: None,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)

    def execute(statement: str) -> None:
        def operation(connection: Connection) -> None:
            connection.exec_driver_sql(statement)
            connection.commit()

        run_migration_operation(sync_url, operation)

    execute(mutate)
    try:
        before = run_migration_operation(sync_url, _table_names)
        with pytest.raises(
            RuntimeError,
            match="Catalog measurement migration precondition failed",
        ):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection,
                    identity,
                    _PHASE_1A1_HEAD,
                    downgrade=True,
                ),
            )
        assert run_migration_operation(sync_url, _table_names) == before
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A2_HEAD
    finally:
        execute(repair)
