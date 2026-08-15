"""Phase 1A3 deterministic catalogue-ingestion migration contracts."""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from hashlib import sha256
from pathlib import Path
from threading import Event, Thread
from time import monotonic, sleep
from uuid import UUID

import pytest
from alembic.script import ScriptDirectory
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    integration_migration_identity,
    migration_config,
    run_alembic,
    run_migration_operation,
)

_PHASE_1A2_HEAD = "e4c9f1a7b362"
_PHASE_1A3_HEAD = "a1a3c0f17c5e"
_PHASE_1A5_HEAD = "c4b9e2d7a6f1"
_CATALOG_TABLES = (
    "provider",
    "entity",
    "dataset",
    "source_record",
    "quantity",
    "unit",
    "quantity_unit",
    "measurement",
    "canonical_measurement",
    "ingestion_conflict",
)
_RUNTIME_INSERT_COLUMNS = {
    "provider": (
        "id",
        "code",
        "name",
        "documentation_url",
        "terms_url",
        "attribution_text",
    ),
    "dataset": (
        "id",
        "provider_id",
        "code",
        "name",
        "release_version",
        "source_url",
        "licence",
        "citation",
    ),
    "source_record": (
        "id",
        "provider_id",
        "dataset_id",
        "provider_record_id",
        "provider_version",
        "canonical_entity_id",
        "source_url",
        "fetched_at",
        "adapter_id",
        "adapter_version",
        "parser_version",
        "normalized_content_sha256",
    ),
    "measurement": (
        "id",
        "entity_id",
        "source_record_id",
        "quantity_id",
        "unit_id",
        "value_numeric",
        "source_fact_key",
        "original_value",
        "original_unit",
    ),
    "ingestion_conflict": (
        "fingerprint",
        "category",
        "provider_id",
        "dataset_id",
        "source_record_id",
        "measurement_id",
        "source_fact_key",
        "incoming_evidence",
    ),
}
_RUNTIME_UPDATE_COLUMNS = {"source_record": ("canonical_entity_id",)}
_PROTECTED_HASHES = {
    "0001_create_job.py": "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
    "0002_grant_job_runtime_dml.py": (
        "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889"
    ),
    "d502b5935120_create_catalog_identity_provenance.py": (
        "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b"
    ),
    "e4c9f1a7b362_add_measurement_provenance.py": (
        "336a59a593c1f1d5fcfd4b32c3b8405bb290b1f13c9a6fee094e8170249c8c2d"
    ),
}
_PROVIDER_ID = UUID("81000000-0000-4000-8000-000000000001")
_DATASET_ID = UUID("82000000-0000-4000-8000-000000000001")
_ENTITY_ID = UUID("83000000-0000-4000-8000-000000000001")
_ENTITY_B_ID = UUID("83000000-0000-4000-8000-000000000002")
_SOURCE_ID = UUID("84000000-0000-4000-8000-000000000001")
_UNRESOLVED_SOURCE_ID = UUID("84000000-0000-4000-8000-000000000002")
_QUANTITY_ID = UUID("85000000-0000-4000-8000-000000000001")
_UNIT_ID = UUID("86000000-0000-4000-8000-000000000001")
_MEASUREMENT_ID = UUID("87000000-0000-4000-8000-000000000001")
_FETCHED_AT = datetime(2026, 8, 11, 12, 0, tzinfo=UTC)


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _runtime_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_url.get_secret_value()).set(
        drivername="postgresql+psycopg"
    )


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
    parameters: Mapping[str, object] | None = None,
) -> None:
    with pytest.raises(IntegrityError), connection.begin_nested():
        connection.execute(text(statement), parameters or {})


def _insert_graph(
    connection: Connection,
    *,
    resolved: bool = True,
    include_measurement: bool = False,
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
            "VALUES (:id, 'star', 'Fixture Star'), (:second, 'star', 'Fixture Star B')"
        ),
        {"id": _ENTITY_ID, "second": _ENTITY_B_ID},
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
            "canonical_entity_id, source_url, fetched_at, adapter_id, adapter_version, "
            "parser_version, normalized_content_sha256) "
            "VALUES (:id, :provider_id, :dataset_id, 'fixture-record', 'fixture-v1', "
            ":canonical_entity_id, 'https://fixtures.invalid/record', :fetched_at, "
            "'fixture.adapter', 'fixture-adapter-v1', 'fixture-parser-v1', :checksum), "
            "(:unresolved_id, :provider_id, :dataset_id, 'fixture-unresolved', 'fixture-v1', "
            "NULL, 'https://fixtures.invalid/unresolved', :fetched_at, "
            "'fixture.adapter', 'fixture-adapter-v1', 'fixture-parser-v1', :unresolved_checksum)"
        ),
        {
            "id": _SOURCE_ID,
            "unresolved_id": _UNRESOLVED_SOURCE_ID,
            "provider_id": _PROVIDER_ID,
            "dataset_id": _DATASET_ID,
            "canonical_entity_id": _ENTITY_ID if resolved else None,
            "fetched_at": _FETCHED_AT,
            "checksum": "a" * 64,
            "unresolved_checksum": "b" * 64,
        },
    )
    if not include_measurement:
        return
    if not resolved:
        raise ValueError("Fixture measurement needs an explicitly resolved source record")
    connection.execute(
        text(
            "INSERT INTO quantity (id, code, name) "
            "VALUES (:id, 'fixture.quantity', 'Fixture Quantity')"
        ),
        {"id": _QUANTITY_ID},
    )
    connection.execute(
        text(
            "INSERT INTO unit (id, code, symbol, name) "
            "VALUES (:id, 'fixture.unit', 'fu', 'Fixture Unit')"
        ),
        {"id": _UNIT_ID},
    )
    connection.execute(
        text("INSERT INTO quantity_unit (quantity_id, unit_id) VALUES (:quantity_id, :unit_id)"),
        {"quantity_id": _QUANTITY_ID, "unit_id": _UNIT_ID},
    )
    connection.execute(
        text(
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, "
            "source_fact_key, original_value, original_unit) "
            "VALUES (:id, :entity_id, :source_id, :quantity_id, :unit_id, "
            "CAST('1.2300' AS numeric), 'fixture.field:source-1', '1.2300', 'fixture unit')"
        ),
        {
            "id": _MEASUREMENT_ID,
            "entity_id": _ENTITY_ID,
            "source_id": _SOURCE_ID,
            "quantity_id": _QUANTITY_ID,
            "unit_id": _UNIT_ID,
        },
    )


def _delete_graph(connection: Connection) -> None:
    connection.execute(text("DELETE FROM ingestion_conflict"))
    connection.execute(text("DELETE FROM canonical_measurement"))
    connection.execute(text("DELETE FROM measurement"))
    connection.execute(text("DELETE FROM quantity_unit"))
    connection.execute(text("DELETE FROM quantity"))
    connection.execute(text("DELETE FROM unit"))
    connection.execute(text("DELETE FROM source_record"))
    connection.execute(text("DELETE FROM dataset"))
    connection.execute(text("DELETE FROM entity"))
    connection.execute(text("DELETE FROM provider"))


def test_lineage_and_protected_history_are_exact() -> None:
    script = ScriptDirectory.from_config(migration_config())
    assert script.get_heads() == [_PHASE_1A5_HEAD]
    assert script.get_revision(_PHASE_1A3_HEAD).down_revision == _PHASE_1A2_HEAD
    root = Path(__file__).resolve().parents[4] / "migrations" / "versions"
    assert {
        name: sha256((root / name).read_bytes()).hexdigest() for name in _PROTECTED_HASHES
    } == _PROTECTED_HASHES


def test_phase1a3_schema_trigger_and_conflict_contract_are_exact(
    integration_settings: IntegrationTestSettings,
) -> None:
    def assert_schema(connection: Connection) -> None:
        assert _revision(connection) == _PHASE_1A3_HEAD
        assert _table_names(connection) == {"alembic_version", "job", *_CATALOG_TABLES}

        columns = {
            table: [
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
                        "WHERE attribute.attrelid = to_regclass('public.' || :table) "
                        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                        "ORDER BY attribute.attnum"
                    ),
                    {"table": table},
                )
            ]
            for table in ("source_record", "measurement", "ingestion_conflict")
        }
        assert columns == {
            "source_record": [
                ("id", "uuid", False, "<none>", "<none>"),
                ("provider_id", "uuid", False, "<none>", "<none>"),
                ("dataset_id", "uuid", False, "<none>", "<none>"),
                ("provider_record_id", "text", False, "<none>", "C"),
                ("provider_version", "text", False, "<none>", "C"),
                ("canonical_entity_id", "uuid", True, "<none>", "<none>"),
                ("source_url", "text", True, "<none>", "default"),
                ("fetched_at", "timestamp with time zone", False, "<none>", "<none>"),
                ("adapter_id", "character varying(128)", False, "<none>", "C"),
                ("adapter_version", "character varying(128)", False, "<none>", "C"),
                ("parser_version", "character varying(128)", False, "<none>", "C"),
                ("normalized_content_sha256", "character(64)", False, "<none>", "C"),
            ],
            "measurement": [
                ("id", "uuid", False, "<none>", "<none>"),
                ("entity_id", "uuid", False, "<none>", "<none>"),
                ("source_record_id", "uuid", False, "<none>", "<none>"),
                ("quantity_id", "uuid", False, "<none>", "<none>"),
                ("unit_id", "uuid", False, "<none>", "<none>"),
                ("value_numeric", "numeric", False, "<none>", "<none>"),
                ("created_at", "timestamp with time zone", False, "CURRENT_TIMESTAMP", "<none>"),
                ("source_fact_key", "character varying(257)", False, "<none>", "C"),
                ("original_value", "text", False, "<none>", "C"),
                ("original_unit", "text", False, "<none>", "default"),
            ],
            "ingestion_conflict": [
                ("fingerprint", "character(64)", False, "<none>", "C"),
                ("category", "character varying(64)", False, "<none>", "C"),
                ("provider_id", "uuid", True, "<none>", "<none>"),
                ("dataset_id", "uuid", True, "<none>", "<none>"),
                ("source_record_id", "uuid", True, "<none>", "<none>"),
                ("measurement_id", "uuid", True, "<none>", "<none>"),
                ("source_fact_key", "character varying(257)", True, "<none>", "C"),
                ("incoming_evidence", "jsonb", False, "<none>", "<none>"),
                ("status", "character varying(16)", False, "'open'::character varying", "C"),
                ("created_at", "timestamp with time zone", False, "CURRENT_TIMESTAMP", "<none>"),
                ("resolved_at", "timestamp with time zone", True, "<none>", "<none>"),
            ],
        }

        constraints = {
            table: {
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT constraint_data.conname, constraint_data.contype "
                        "FROM pg_constraint AS constraint_data "
                        "WHERE constraint_data.conrelid = to_regclass('public.' || :table) "
                        "AND constraint_data.contype IN ('p', 'u', 'c', 'f')"
                    ),
                    {"table": table},
                )
            }
            for table in ("source_record", "measurement", "ingestion_conflict")
        }
        assert {name for name, _kind in constraints["source_record"]} >= {
            "ck_source_record_adapter_id_identifier",
            "ck_source_record_adapter_version_identifier",
            "ck_source_record_parser_version_identifier",
            "ck_source_record_normalized_content_sha256",
        }
        assert {name for name, _kind in constraints["measurement"]} >= {
            "ck_measurement_source_fact_key_identifier",
            "ck_measurement_original_value_json_number",
            "ck_measurement_original_unit_nonempty_control_free",
            "uq_measurement_source_record_source_fact_key",
        }
        assert {name for name, _kind in constraints["ingestion_conflict"]} == {
            "pk_ingestion_conflict",
            "fk_ingestion_conflict_provider",
            "fk_ingestion_conflict_dataset",
            "fk_ingestion_conflict_source_record",
            "fk_ingestion_conflict_measurement",
            "ck_ingestion_conflict_fingerprint_sha256",
            "ck_ingestion_conflict_category",
            "ck_ingestion_conflict_anchor",
            "ck_ingestion_conflict_source_fact_key_identifier",
            "ck_ingestion_conflict_evidence_object_size",
            "ck_ingestion_conflict_status",
            "ck_ingestion_conflict_status_resolved_at",
        }
        assert {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT conname, confupdtype, confdeltype FROM pg_constraint "
                    "WHERE conname LIKE 'fk_ingestion_conflict_%' ORDER BY conname"
                )
            )
        } == {
            ("fk_ingestion_conflict_dataset", "r", "r"),
            ("fk_ingestion_conflict_measurement", "r", "r"),
            ("fk_ingestion_conflict_provider", "r", "r"),
            ("fk_ingestion_conflict_source_record", "r", "r"),
        }
        assert (
            connection.execute(
                text(
                    "SELECT pg_get_constraintdef(oid, true) FROM pg_constraint "
                    "WHERE conname = 'uq_measurement_source_record_source_fact_key'"
                )
            ).scalar_one()
            == "UNIQUE (source_record_id, source_fact_key)"
        )
        assert (
            connection.execute(
                text(
                    "SELECT pg_get_indexdef(index_data.indexrelid) "
                    "FROM pg_index AS index_data "
                    "JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid "
                    "WHERE index_class.relname = "
                    "'ix_ingestion_conflict_open_category_created_at_fingerprint'"
                )
            )
            .scalar_one()
            .endswith("(category, created_at, fingerprint) WHERE ((status)::text = 'open'::text)")
        )
        assert connection.execute(
            text(
                "SELECT procedure.prosecdef, procedure.proconfig "
                "FROM pg_proc AS procedure "
                "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
                "WHERE namespace.nspname = 'public' "
                "AND procedure.proname = 'enforce_source_record_resolution'"
            )
        ).one() == (False, ["search_path=pg_catalog, public"])
        assert connection.execute(
            text(
                "SELECT pg_get_triggerdef(trigger_data.oid, true) FROM pg_trigger AS trigger_data "
                "WHERE trigger_data.tgrelid = 'public.source_record'::regclass "
                "AND trigger_data.tgname = 'trg_source_record_resolution_guard' "
                "AND NOT trigger_data.tgisinternal"
            )
        ).scalar_one() == (
            "CREATE TRIGGER trg_source_record_resolution_guard BEFORE UPDATE ON source_record "
            "FOR EACH ROW EXECUTE FUNCTION enforce_source_record_resolution()"
        )

    run_migration_operation(_sync_url(integration_settings), assert_schema)


def test_source_truth_and_conflict_constraints_preserve_exact_contract(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_graph(connection, include_measurement=True)
        row = connection.execute(
            text(
                "SELECT value_numeric::text, original_value, original_unit "
                "FROM measurement WHERE id = :id"
            ),
            {"id": _MEASUREMENT_ID},
        ).one()
        assert tuple(row) == ("1.2300", "1.2300", "fixture unit")
        _expect_integrity_error(
            connection,
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, "
            "source_fact_key, original_value, original_unit) "
            "VALUES ('87000000-0000-4000-8000-000000000002', :entity_id, :source_id, "
            ":quantity_id, :unit_id, 1.23, 'fixture.field:source-1', '1.23', 'fixture unit')",
            {
                "entity_id": _ENTITY_ID,
                "source_id": _SOURCE_ID,
                "quantity_id": _QUANTITY_ID,
                "unit_id": _UNIT_ID,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, "
            "source_fact_key, original_value, original_unit) "
            "VALUES ('87000000-0000-4000-8000-000000000003', :entity_id, :source_id, "
            ":quantity_id, :unit_id, 1.23, 'fixture field', '1.23', 'fixture unit')",
            {
                "entity_id": _ENTITY_ID,
                "source_id": _SOURCE_ID,
                "quantity_id": _QUANTITY_ID,
                "unit_id": _UNIT_ID,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO measurement "
            "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, "
            "source_fact_key, original_value, original_unit) "
            "VALUES ('87000000-0000-4000-8000-000000000004', :entity_id, :source_id, "
            ":quantity_id, :unit_id, 1.23, 'fixture.field:source-2', '1.24', 'fixture unit')",
            {
                "entity_id": _ENTITY_ID,
                "source_id": _SOURCE_ID,
                "quantity_id": _QUANTITY_ID,
                "unit_id": _UNIT_ID,
            },
        )
        connection.execute(
            text(
                "INSERT INTO ingestion_conflict "
                "(fingerprint, category, provider_id, incoming_evidence) "
                "VALUES (:fingerprint, 'provider_metadata_mismatch', :provider_id, "
                'CAST(\'{"existing":{},"incoming":{}}\' AS jsonb))'
            ),
            {"fingerprint": "c" * 64, "provider_id": _PROVIDER_ID},
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO ingestion_conflict "
            "(fingerprint, category, provider_id, dataset_id, incoming_evidence) "
            "VALUES (:fingerprint, 'provider_metadata_mismatch', :provider_id, "
            ":dataset_id, '{}'::jsonb)",
            {
                "fingerprint": "d" * 64,
                "provider_id": _PROVIDER_ID,
                "dataset_id": _DATASET_ID,
            },
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO ingestion_conflict "
            "(fingerprint, category, measurement_id, source_fact_key, incoming_evidence, "
            "status, resolved_at) VALUES (:fingerprint, 'measurement_fact_mismatch', "
            ":measurement_id, 'fixture.field', '{}'::jsonb, 'open', CURRENT_TIMESTAMP)",
            {"fingerprint": "e" * 64, "measurement_id": _MEASUREMENT_ID},
        )
        _expect_integrity_error(
            connection,
            "INSERT INTO ingestion_conflict "
            "(fingerprint, category, provider_id, incoming_evidence) "
            "VALUES (:fingerprint, 'provider_metadata_mismatch', :provider_id, '[]'::jsonb)",
            {"fingerprint": "f" * 64, "provider_id": _PROVIDER_ID},
        )

    _run_rolled_back(integration_settings, exercise)


def test_source_resolution_trigger_allows_only_one_unmeasured_null_to_uuid_transition(
    integration_settings: IntegrationTestSettings,
) -> None:
    def exercise(connection: Connection) -> None:
        _insert_graph(connection, include_measurement=True)
        connection.execute(
            text("UPDATE source_record SET canonical_entity_id = :entity_id WHERE id = :source_id"),
            {"entity_id": _ENTITY_ID, "source_id": _UNRESOLVED_SOURCE_ID},
        )
        assert (
            connection.execute(
                text("SELECT canonical_entity_id FROM source_record WHERE id = :source_id"),
                {"source_id": _UNRESOLVED_SOURCE_ID},
            ).scalar_one()
            == _ENTITY_ID
        )
        for statement, parameters in (
            (
                "UPDATE source_record SET canonical_entity_id = :entity_id WHERE id = :source_id",
                {"entity_id": _ENTITY_B_ID, "source_id": _UNRESOLVED_SOURCE_ID},
            ),
            (
                "UPDATE source_record SET source_url = 'https://fixtures.invalid/changed' "
                "WHERE id = :source_id",
                {"source_id": _UNRESOLVED_SOURCE_ID},
            ),
            (
                "UPDATE source_record SET canonical_entity_id = :entity_id WHERE id = :source_id",
                {"entity_id": _ENTITY_B_ID, "source_id": _SOURCE_ID},
            ),
        ):
            _expect_integrity_error(connection, statement, parameters)

    _run_rolled_back(integration_settings, exercise)


def test_runtime_acl_is_exact_and_the_trigger_remains_enforceable(
    integration_settings: IntegrationTestSettings,
) -> None:
    def prepare(connection: Connection) -> None:
        _insert_graph(connection, include_measurement=True)
        connection.execute(
            text(
                "INSERT INTO ingestion_conflict "
                "(fingerprint, category, provider_id, incoming_evidence) "
                "VALUES (:fingerprint, 'provider_metadata_mismatch', :provider_id, '{}'::jsonb)"
            ),
            {"fingerprint": "9" * 64, "provider_id": _PROVIDER_ID},
        )
        connection.commit()

    def cleanup(connection: Connection) -> None:
        _delete_graph(connection)
        connection.commit()

    run_migration_operation(_sync_url(integration_settings), prepare)
    engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    try:
        identity = integration_migration_identity(integration_settings)

        def assert_acl(connection: Connection) -> None:
            direct_acl = {
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT table_data.relname, NULL::text, "
                        "pg_get_userbyid(privilege.grantor), "
                        "COALESCE(pg_get_userbyid(privilege.grantee), 'PUBLIC'), "
                        "privilege.privilege_type, privilege.is_grantable "
                        "FROM pg_class AS table_data "
                        "JOIN pg_namespace AS namespace "
                        "ON namespace.oid = table_data.relnamespace "
                        "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
                        "WHERE namespace.nspname = 'public' "
                        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                        "AND privilege.grantee <> table_data.relowner "
                        "UNION ALL "
                        "SELECT table_data.relname, attribute.attname, "
                        "pg_get_userbyid(privilege.grantor), "
                        "COALESCE(pg_get_userbyid(privilege.grantee), 'PUBLIC'), "
                        "privilege.privilege_type, privilege.is_grantable "
                        "FROM pg_class AS table_data "
                        "JOIN pg_namespace AS namespace "
                        "ON namespace.oid = table_data.relnamespace "
                        "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                        "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                        "WHERE namespace.nspname = 'public' "
                        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                        "AND privilege.grantee <> table_data.relowner"
                    ),
                    {"tables": list(_CATALOG_TABLES)},
                )
            }
            assert direct_acl == (
                {
                    (table, None, identity.migration_role, identity.runtime_role, "SELECT", False)
                    for table in _CATALOG_TABLES
                }
                | {
                    (
                        table,
                        column,
                        identity.migration_role,
                        identity.runtime_role,
                        "INSERT",
                        False,
                    )
                    for table, columns in _RUNTIME_INSERT_COLUMNS.items()
                    for column in columns
                }
                | {
                    (
                        table,
                        column,
                        identity.migration_role,
                        identity.runtime_role,
                        "UPDATE",
                        False,
                    )
                    for table, columns in _RUNTIME_UPDATE_COLUMNS.items()
                    for column in columns
                }
            )

            effective_table_acl = {
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT table_data.relname, privilege_name "
                        "FROM pg_class AS table_data "
                        "JOIN pg_namespace AS namespace "
                        "ON namespace.oid = table_data.relnamespace "
                        "CROSS JOIN unnest("
                        "ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', "
                        "'REFERENCES', 'TRIGGER']::text[]"
                        ") AS privilege_data(privilege_name) "
                        "WHERE namespace.nspname = 'public' "
                        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                        "AND has_table_privilege(:role, table_data.oid, privilege_name)"
                    ),
                    {"tables": list(_CATALOG_TABLES), "role": identity.runtime_role},
                )
            }
            assert effective_table_acl == {(table, "SELECT") for table in _CATALOG_TABLES}

            actual_columns = {
                (str(row.table_name), str(row.column_name))
                for row in connection.execute(
                    text(
                        "SELECT table_data.relname AS table_name, attribute.attname AS column_name "
                        "FROM pg_class AS table_data "
                        "JOIN pg_namespace AS namespace "
                        "ON namespace.oid = table_data.relnamespace "
                        "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                        "WHERE namespace.nspname = 'public' "
                        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                        "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
                    ),
                    {"tables": list(_CATALOG_TABLES)},
                )
            }
            effective_column_acl = {
                tuple(row)
                for row in connection.execute(
                    text(
                        "SELECT table_data.relname, attribute.attname, privilege_name "
                        "FROM pg_class AS table_data "
                        "JOIN pg_namespace AS namespace "
                        "ON namespace.oid = table_data.relnamespace "
                        "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                        "CROSS JOIN unnest("
                        "ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']::text[]"
                        ") AS privilege_data(privilege_name) "
                        "WHERE namespace.nspname = 'public' "
                        "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                        "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                        "AND has_column_privilege("
                        ":role, table_data.oid, attribute.attname, privilege_name"
                        ")"
                    ),
                    {"tables": list(_CATALOG_TABLES), "role": identity.runtime_role},
                )
            }
            assert effective_column_acl == (
                {(table, column, "SELECT") for table, column in actual_columns}
                | {
                    (table, column, "INSERT")
                    for table, columns in _RUNTIME_INSERT_COLUMNS.items()
                    for column in columns
                }
                | {
                    (table, column, "UPDATE")
                    for table, columns in _RUNTIME_UPDATE_COLUMNS.items()
                    for column in columns
                }
            )

            function_acl = connection.execute(
                text(
                    "SELECT count(*) FROM pg_proc AS procedure "
                    "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
                    "CROSS JOIN LATERAL aclexplode(procedure.proacl) AS privilege "
                    "WHERE namespace.nspname = 'public' "
                    "AND procedure.proname = 'enforce_source_record_resolution' "
                    "AND privilege.grantee <> procedure.proowner"
                )
            ).scalar_one()
            assert function_acl == 0
            assert not connection.execute(
                text(
                    "SELECT has_function_privilege("
                    ":role, 'public.enforce_source_record_resolution()'::regprocedure, 'EXECUTE'"
                    ")"
                ),
                {"role": identity.runtime_role},
            ).scalar_one()

        run_migration_operation(_sync_url(integration_settings), assert_acl)
        with engine.connect() as connection:
            for table in _CATALOG_TABLES:
                connection.execute(text(f"SELECT * FROM public.{table} LIMIT 0"))
            connection.commit()
        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE source_record SET canonical_entity_id = :entity_id "
                    "WHERE id = :source_id"
                ),
                {"entity_id": _ENTITY_ID, "source_id": _UNRESOLVED_SOURCE_ID},
            )
        with engine.connect() as connection:
            with pytest.raises(IntegrityError), connection.begin_nested():
                connection.execute(
                    text(
                        "UPDATE source_record SET canonical_entity_id = :entity_id "
                        "WHERE id = :source_id"
                    ),
                    {"entity_id": _ENTITY_B_ID, "source_id": _UNRESOLVED_SOURCE_ID},
                )
            with pytest.raises(ProgrammingError), connection.begin_nested():
                connection.execute(
                    text("UPDATE measurement SET original_value = '2' WHERE id = :id"),
                    {"id": _MEASUREMENT_ID},
                )
            with pytest.raises(ProgrammingError), connection.begin_nested():
                connection.execute(
                    text("DELETE FROM measurement WHERE id = :id"), {"id": _MEASUREMENT_ID}
                )
            with pytest.raises(ProgrammingError), connection.begin_nested():
                connection.execute(text("UPDATE ingestion_conflict SET status = 'resolved'"))
            with pytest.raises(ProgrammingError), connection.begin_nested():
                connection.execute(text("SELECT public.enforce_source_record_resolution()"))
    finally:
        engine.dispose()
        run_migration_operation(_sync_url(integration_settings), cleanup)


def test_upgrade_and_downgrade_refuse_unbackfillable_or_immutable_rows(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=True),
    )
    try:

        def insert_parent_source(connection: Connection) -> None:
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
                    "INSERT INTO dataset "
                    "(id, provider_id, code, name, release_version, source_url, licence, "
                    "citation) VALUES (:id, :provider_id, 'fixture-dataset', 'Fixture Dataset', "
                    "'fixture-v1', "
                    "'https://fixtures.invalid/dataset', 'Fictional test-only licence', "
                    "'Fictional test-only citation')"
                ),
                {"id": _DATASET_ID, "provider_id": _PROVIDER_ID},
            )
            connection.execute(
                text(
                    "INSERT INTO source_record "
                    "(id, provider_id, dataset_id, provider_record_id, provider_version, "
                    "fetched_at) VALUES (:id, :provider_id, :dataset_id, 'unbackfillable', "
                    "'fixture-v1', :fetched_at)"
                ),
                {
                    "id": _SOURCE_ID,
                    "provider_id": _PROVIDER_ID,
                    "dataset_id": _DATASET_ID,
                    "fetched_at": _FETCHED_AT,
                },
            )
            connection.commit()

        run_migration_operation(sync_url, insert_parent_source)
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, _PHASE_1A3_HEAD, downgrade=False
                ),
            )
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A2_HEAD

        def clean_parent(connection: Connection) -> None:
            connection.execute(text("DELETE FROM source_record"))
            connection.execute(text("DELETE FROM dataset"))
            connection.execute(text("DELETE FROM provider"))
            connection.commit()

        run_migration_operation(sync_url, clean_parent)
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A3_HEAD, downgrade=False),
        )

        def insert_immutable_source(connection: Connection) -> None:
            _insert_graph(connection, include_measurement=False)
            connection.commit()

        run_migration_operation(sync_url, insert_immutable_source)
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, _PHASE_1A2_HEAD, downgrade=True
                ),
            )
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A3_HEAD

        def clean_head(connection: Connection) -> None:
            _delete_graph(connection)
            connection.commit()

        run_migration_operation(sync_url, clean_head)
    finally:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A3_HEAD, downgrade=False),
        )


def test_downgrade_locks_before_emptiness_guard_preserve_concurrent_ingestion(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)
    conflict_fingerprint = "d" * 64

    def insert_provider(connection: Connection) -> None:
        connection.execute(
            text(
                "INSERT INTO provider "
                "(id, code, name, documentation_url, terms_url, attribution_text) "
                "VALUES (:id, 'concurrent.provider', 'Concurrent Provider', "
                "'https://fixtures.invalid/provider', 'https://fixtures.invalid/terms', "
                "'Fictional test-only provider attribution.')"
            ),
            {"id": _PROVIDER_ID},
        )
        connection.commit()

    run_migration_operation(sync_url, insert_provider)
    runtime_engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    blocker = runtime_engine.connect()
    backend_pid: list[int] = []
    failures: list[BaseException] = []
    downgrade_started = Event()
    downgrade_finished = Event()
    downgrade_thread: Thread | None = None
    try:
        blocker.execute(
            text(
                "INSERT INTO ingestion_conflict "
                "(fingerprint, category, provider_id, incoming_evidence) "
                "VALUES (:fingerprint, 'provider_metadata_mismatch', :provider_id, '{}'::jsonb)"
            ),
            {"fingerprint": conflict_fingerprint, "provider_id": _PROVIDER_ID},
        )

        def downgrade() -> None:
            def operation(connection: Connection) -> None:
                backend_pid.append(
                    int(connection.execute(text("SELECT pg_backend_pid()")).scalar_one())
                )
                downgrade_started.set()
                run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=True)

            try:
                run_migration_operation(sync_url, operation)
            except BaseException as error:
                failures.append(error)
            finally:
                downgrade_finished.set()

        downgrade_thread = Thread(target=downgrade, name="phase1a3-downgrade-lock-test")
        downgrade_thread.start()
        assert downgrade_started.wait(timeout=5)
        assert len(backend_pid) == 1

        deadline = monotonic() + 5
        while monotonic() < deadline:
            waiting = run_migration_operation(
                sync_url,
                lambda connection: connection.execute(
                    text(
                        "SELECT EXISTS ("
                        "SELECT 1 FROM pg_locks "
                        "WHERE pid = :pid "
                        "AND relation = 'public.ingestion_conflict'::regclass "
                        "AND mode = 'AccessExclusiveLock' AND NOT granted"
                        ")"
                    ),
                    {"pid": backend_pid[0]},
                ).scalar_one(),
            )
            if waiting:
                break
            sleep(0.01)
        assert waiting

        blocker.commit()
        assert downgrade_finished.wait(timeout=5)
        downgrade_thread.join(timeout=5)
        assert not downgrade_thread.is_alive()
        assert len(failures) == 1
        assert type(failures[0]) is RuntimeError
        assert str(failures[0]) == "Runtime ACL migration precondition failed."
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A3_HEAD
        assert (
            run_migration_operation(
                sync_url,
                lambda connection: connection.execute(
                    text(
                        "SELECT count(*) FROM ingestion_conflict WHERE fingerprint = :fingerprint"
                    ),
                    {"fingerprint": conflict_fingerprint},
                ).scalar_one(),
            )
            == 1
        )
    finally:
        if blocker.in_transaction():
            blocker.rollback()
        if downgrade_thread is not None:
            downgrade_thread.join(timeout=5)
        blocker.close()
        runtime_engine.dispose()

        def cleanup(connection: Connection) -> None:
            connection.execute(
                text("DELETE FROM ingestion_conflict WHERE fingerprint = :fingerprint"),
                {"fingerprint": conflict_fingerprint},
            )
            connection.execute(text("DELETE FROM provider WHERE id = :id"), {"id": _PROVIDER_ID})
            connection.commit()

        run_migration_operation(sync_url, cleanup)
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A3_HEAD, downgrade=False),
        )


def test_downgrade_refuses_resolution_function_body_drift(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)
    original_definition = run_migration_operation(
        sync_url,
        lambda connection: str(
            connection.execute(
                text(
                    "SELECT pg_get_functiondef("
                    "'public.enforce_source_record_resolution()'::regprocedure)"
                )
            ).scalar_one()
        ),
    )

    def drift_function_body(connection: Connection) -> None:
        connection.exec_driver_sql(
            "CREATE OR REPLACE FUNCTION public.enforce_source_record_resolution() "
            "RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER "
            "SET search_path = pg_catalog, public "
            "AS $$ BEGIN RETURN NEW; END; $$"
        )
        connection.commit()

    run_migration_operation(sync_url, drift_function_body)
    try:
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, _PHASE_1A2_HEAD, downgrade=True
                ),
            )
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A3_HEAD
    finally:

        def restore_function_body(connection: Connection) -> None:
            connection.exec_driver_sql(original_definition)
            connection.commit()

        run_migration_operation(sync_url, restore_function_body)


def test_clean_upgrade_downgrade_and_reupgrade_restore_the_parent(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = _sync_url(integration_settings)
    identity = integration_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=True),
    )
    try:
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A2_HEAD
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A3_HEAD, downgrade=False),
        )
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A3_HEAD
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A2_HEAD, downgrade=True),
        )
        assert run_migration_operation(sync_url, _revision) == _PHASE_1A2_HEAD
    finally:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _PHASE_1A3_HEAD, downgrade=False),
        )
