"""Add deterministic, immutable catalogue provenance ingestion storage.

Revision ID: a1a3c0f17c5e
Revises: e4c9f1a7b362
Create Date: 2026-08-11
"""

from __future__ import annotations

from hashlib import sha256
from typing import NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "a1a3c0f17c5e"
down_revision = "e4c9f1a7b362"
branch_labels = None
depends_on = None

_PHASE_1A1_TABLES = ("provider", "entity", "dataset", "source_record")
_PHASE_1A2_TABLES = (
    "quantity",
    "unit",
    "quantity_unit",
    "measurement",
    "canonical_measurement",
)
_PHASE_1A3_TABLES = (*_PHASE_1A1_TABLES, *_PHASE_1A2_TABLES, "ingestion_conflict")
_PUBLIC_TABLES = ("alembic_version", "job")
_MUTABLE_CONTENT_TABLES = ("source_record", "measurement", "canonical_measurement")
_ALL_TABLE_PRIVILEGES = (
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
)
_ALL_COLUMN_PRIVILEGES = ("SELECT", "INSERT", "UPDATE", "REFERENCES")
_STABLE_TOKEN_PATTERN = "^[A-Za-z0-9._-]{1,128}$"
_SOURCE_FACT_KEY_PATTERN = "^[A-Za-z0-9._-]{1,128}(:[A-Za-z0-9._-]{1,128})?$"
_JSON_NUMBER_PATTERN = "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?$"
_RESOLUTION_FUNCTION = "enforce_source_record_resolution"
_RESOLUTION_TRIGGER = "trg_source_record_resolution_guard"
_SAFE_ERROR = "Runtime ACL migration precondition failed."
_PARENT_SCHEMA_SHA256 = "de43f6b3ea11d92f94aa95af7c63100f60843d87dc823e2eb12819b6798f7609"
_DOWNGRADE_LOCK_TABLES = (
    "source_record",
    "measurement",
    "canonical_measurement",
    "ingestion_conflict",
)
_RESOLUTION_FUNCTION_DEFINITION = (
    "CREATE OR REPLACE FUNCTION public.enforce_source_record_resolution() "
    "RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog', 'public' "
    "AS $function$ BEGIN IF OLD.canonical_entity_id IS NULL "
    "AND NEW.canonical_entity_id IS NOT NULL "
    "AND (to_jsonb(NEW) - 'canonical_entity_id') "
    "IS NOT DISTINCT FROM (to_jsonb(OLD) - 'canonical_entity_id') "
    "AND NOT EXISTS (SELECT 1 FROM public.measurement "
    "WHERE measurement.source_record_id = OLD.id) THEN RETURN NEW; END IF; "
    "RAISE EXCEPTION 'source_record resolution update denied' "
    "USING ERRCODE = '23514'; END; $function$"
)

_SOURCE_RECORD_COLUMNS = (
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
)
_MEASUREMENT_COLUMNS = (
    "id",
    "entity_id",
    "source_record_id",
    "quantity_id",
    "unit_id",
    "value_numeric",
    "created_at",
    "source_fact_key",
    "original_value",
    "original_unit",
)
_CONFLICT_COLUMNS = (
    "fingerprint",
    "category",
    "provider_id",
    "dataset_id",
    "source_record_id",
    "measurement_id",
    "source_fact_key",
    "incoming_evidence",
    "status",
    "created_at",
    "resolved_at",
)
_SOURCE_RECORD_ADDED_CONSTRAINTS = {
    "ck_source_record_adapter_id_identifier",
    "ck_source_record_adapter_version_identifier",
    "ck_source_record_normalized_content_sha256",
    "ck_source_record_parser_version_identifier",
}
_MEASUREMENT_ADDED_CONSTRAINTS = {
    "ck_measurement_original_unit_nonempty_control_free",
    "ck_measurement_original_value_json_number",
    "ck_measurement_source_fact_key_identifier",
}
_CONFLICT_CONSTRAINTS = {
    "ck_ingestion_conflict_anchor",
    "ck_ingestion_conflict_category",
    "ck_ingestion_conflict_evidence_object_size",
    "ck_ingestion_conflict_fingerprint_sha256",
    "ck_ingestion_conflict_source_fact_key_identifier",
    "ck_ingestion_conflict_status",
    "ck_ingestion_conflict_status_resolved_at",
    "fk_ingestion_conflict_dataset",
    "fk_ingestion_conflict_measurement",
    "fk_ingestion_conflict_provider",
    "fk_ingestion_conflict_source_record",
    "pk_ingestion_conflict",
}
_MEASUREMENT_FACT_UNIQUE = "uq_measurement_source_record_source_fact_key"
_CONFLICT_OPEN_INDEX = "ix_ingestion_conflict_open_category_created_at_fingerprint"


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _identity() -> MigrationIdentity:
    configuration = context.get_context().config
    if configuration is None:
        _fail()
    configured = configuration.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _connection() -> Connection:
    return op.get_bind()


def _role_is_safe(connection: Connection, identity: MigrationIdentity) -> None:
    current_user, session_user = connection.execute(
        sa.text("SELECT current_user, session_user")
    ).one()
    if (
        current_user != identity.migration_role
        or session_user != identity.migration_role
        or identity.runtime_role == identity.migration_role
    ):
        _fail()

    role = connection.execute(
        sa.text(
            "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, "
            "rolreplication, rolbypassrls "
            "FROM pg_roles WHERE rolname = :role"
        ),
        {"role": identity.runtime_role},
    ).one_or_none()
    if role is None or tuple(role) != (True, False, False, False, False, False):
        _fail()

    related_roles = connection.execute(
        sa.text(
            "WITH RECURSIVE runtime_role(role_oid) AS ("
            "SELECT oid FROM pg_roles WHERE rolname = :role"
            "), upstream(role_oid) AS ("
            "SELECT role_oid FROM runtime_role "
            "UNION "
            "SELECT membership.roleid FROM pg_auth_members AS membership "
            "JOIN upstream ON membership.member = upstream.role_oid"
            "), downstream(role_oid) AS ("
            "SELECT role_oid FROM runtime_role "
            "UNION "
            "SELECT membership.member FROM pg_auth_members AS membership "
            "JOIN downstream ON membership.roleid = downstream.role_oid"
            ") "
            "SELECT count(*) FROM ("
            "SELECT role_oid FROM upstream UNION SELECT role_oid FROM downstream"
            ") AS related "
            "WHERE role_oid <> (SELECT role_oid FROM runtime_role)"
        ),
        {"role": identity.runtime_role},
    ).scalar_one()
    if related_roles != 0:
        _fail()

    unsafe_runtime_capabilities = connection.execute(
        sa.text(
            "SELECT has_database_privilege(:role, current_database(), 'TEMP') "
            "OR has_schema_privilege(:role, 'public', 'CREATE')"
        ),
        {"role": identity.runtime_role},
    ).scalar_one()
    if unsafe_runtime_capabilities:
        _fail()


def _assert_revision(connection: Connection, expected: str) -> None:
    version = connection.execute(
        sa.text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()
    if version != expected:
        _fail()


def _assert_table_catalogue(connection: Connection, catalog_tables: tuple[str, ...]) -> None:
    actual = {
        str(table)
        for table in connection.execute(
            sa.text(
                "SELECT table_data.relname FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' AND table_data.relkind = 'r'"
            )
        ).scalars()
    }
    if actual != {*_PUBLIC_TABLES, *catalog_tables}:
        _fail()


def _schema_digest(connection: Connection, tables: tuple[str, ...]) -> str:
    columns = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, attribute.attnum, attribute.attname, "
                "format_type(attribute.atttypid, attribute.atttypmod), "
                "attribute.attnotnull, "
                "COALESCE(pg_get_expr(default_value.adbin, default_value.adrelid), '<none>'), "
                "COALESCE(collation_data.collname, '<none>') "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "LEFT JOIN pg_attrdef AS default_value "
                "ON default_value.adrelid = table_data.oid "
                "AND default_value.adnum = attribute.attnum "
                "LEFT JOIN pg_collation AS collation_data "
                "ON collation_data.oid = attribute.attcollation "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "ORDER BY table_data.relname, attribute.attnum"
            ),
            {"tables": list(tables)},
        )
    )
    constraints = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, constraint_data.conname, "
                "constraint_data.contype, pg_get_constraintdef(constraint_data.oid, true), "
                "constraint_data.condeferrable, constraint_data.condeferred "
                "FROM pg_constraint AS constraint_data "
                "JOIN pg_class AS table_data ON table_data.oid = constraint_data.conrelid "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND constraint_data.contype IN ('p', 'u', 'c', 'f') "
                "ORDER BY table_data.relname, constraint_data.conname"
            ),
            {"tables": list(tables)},
        )
    )
    indexes = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, index_class.relname, index_data.indisunique, "
                "index_data.indisprimary, pg_get_indexdef(index_data.indexrelid), "
                "COALESCE(pg_get_expr(index_data.indpred, index_data.indrelid), '<none>') "
                "FROM pg_index AS index_data "
                "JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid "
                "JOIN pg_class AS table_data ON table_data.oid = index_data.indrelid "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "ORDER BY table_data.relname, index_class.relname"
            ),
            {"tables": list(tables)},
        )
    )
    return sha256(repr((columns, constraints, indexes)).encode("utf-8")).hexdigest()


def _assert_parent_schema(connection: Connection) -> None:
    if _schema_digest(connection, _PHASE_1A3_TABLES[:-1]) != _PARENT_SCHEMA_SHA256:
        _fail()
    public_functions = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_proc AS procedure "
            "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
            "WHERE namespace.nspname = 'public'"
        )
    ).scalar_one()
    if public_functions != 0:
        _fail()


def _assert_empty(connection: Connection, tables: tuple[str, ...]) -> None:
    for table in tables:
        count = connection.execute(sa.text(f"SELECT count(*) FROM public.{table}")).scalar_one()
        if count != 0:
            _fail()


def _catalog_acl_rows(
    connection: Connection, tables: tuple[str, ...]
) -> tuple[tuple[object, ...], ...]:
    return tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, pg_get_userbyid(privilege.grantor), "
                "pg_get_userbyid(privilege.grantee), privilege.privilege_type, "
                "privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "CROSS JOIN LATERAL aclexplode("
                "COALESCE(table_data.relacl, acldefault('r', table_data.relowner))"
                ") AS privilege "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND privilege.grantee <> table_data.relowner "
                "ORDER BY table_data.relname, privilege.grantor, privilege.grantee, "
                "privilege.privilege_type"
            ),
            {"tables": list(tables)},
        )
    )


def _column_acl_rows(
    connection: Connection, tables: tuple[str, ...]
) -> tuple[tuple[object, ...], ...]:
    return tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, attribute.attname, "
                "pg_get_userbyid(privilege.grantor), pg_get_userbyid(privilege.grantee), "
                "privilege.privilege_type, privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "AND privilege.grantee <> table_data.relowner "
                "ORDER BY table_data.relname, attribute.attname, privilege.grantor, "
                "privilege.grantee, privilege.privilege_type"
            ),
            {"tables": list(tables)},
        )
    )


def _assert_parent_acl(connection: Connection, identity: MigrationIdentity) -> None:
    owners = set(
        connection.execute(
            sa.text(
                "SELECT table_data.relname, pg_get_userbyid(table_data.relowner) "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND table_data.relkind = 'r'"
            ),
            {"tables": list(_PHASE_1A3_TABLES[:-1])},
        )
    )
    if owners != {(table, identity.migration_role) for table in _PHASE_1A3_TABLES[:-1]}:
        _fail()
    if _catalog_acl_rows(connection, _PHASE_1A3_TABLES[:-1]):
        _fail()
    if _column_acl_rows(connection, _PHASE_1A3_TABLES[:-1]):
        _fail()

    effective_table_acl = connection.execute(
        sa.text(
            "SELECT count(*) FROM unnest(CAST(:tables AS text[])) AS table_name "
            "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
            "WHERE has_table_privilege("
            ":role, format('public.%I', table_name), privilege_name"
            ")"
        ),
        {
            "tables": list(_PHASE_1A3_TABLES[:-1]),
            "privileges": list(_ALL_TABLE_PRIVILEGES),
            "role": identity.runtime_role,
        },
    ).scalar_one()
    effective_column_acl = connection.execute(
        sa.text(
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
            "tables": list(_PHASE_1A3_TABLES[:-1]),
            "privileges": list(_ALL_COLUMN_PRIVILEGES),
            "role": identity.runtime_role,
        },
    ).scalar_one()
    if effective_table_acl != 0 or effective_column_acl != 0:
        _fail()


def _revoke_catalog_access(
    connection: Connection,
    identity: MigrationIdentity,
    tables: tuple[str, ...],
) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    for table in tables:
        quoted_table = preparer.quote(table)
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM PUBLIC"
        )
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM {quoted_role}"
        )


def _grant_runtime_catalog_access(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    select_tables = (
        "provider",
        "dataset",
        "entity",
        "source_record",
        "quantity",
        "unit",
        "quantity_unit",
        "measurement",
        "canonical_measurement",
        "ingestion_conflict",
    )
    for table in select_tables:
        connection.exec_driver_sql(
            f"GRANT SELECT ON TABLE public.{preparer.quote(table)} TO {quoted_role}"
        )

    grants = {
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
        "source_record": _SOURCE_RECORD_COLUMNS,
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
    for table, columns in grants.items():
        quoted_columns = ", ".join(preparer.quote(column) for column in columns)
        connection.exec_driver_sql(
            "GRANT INSERT ("
            f"{quoted_columns}) ON TABLE public.{preparer.quote(table)} TO {quoted_role}"
        )
    connection.exec_driver_sql(
        f"GRANT UPDATE (canonical_entity_id) ON TABLE public.source_record TO {quoted_role}"
    )


def _assert_resolution_function_acl(connection: Connection, identity: MigrationIdentity) -> None:
    function_acl = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT pg_get_userbyid(privilege.grantee), privilege.privilege_type, "
                "privilege.is_grantable "
                "FROM pg_proc AS procedure "
                "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
                "CROSS JOIN LATERAL aclexplode("
                "COALESCE(procedure.proacl, acldefault('f', procedure.proowner))"
                ") AS privilege "
                "WHERE namespace.nspname = 'public' "
                "AND procedure.proname = :name "
                "AND privilege.grantee <> procedure.proowner"
            ),
            {"name": _RESOLUTION_FUNCTION},
        )
    )
    if function_acl:
        _fail()
    if connection.execute(
        sa.text(
            "SELECT has_function_privilege(:role, "
            "'public.enforce_source_record_resolution()'::regprocedure, 'EXECUTE')"
        ),
        {"role": identity.runtime_role},
    ).scalar_one():
        _fail()


def _lock_downgrade_tables(connection: Connection) -> None:
    preparer = connection.dialect.identifier_preparer
    for table in _DOWNGRADE_LOCK_TABLES:
        connection.exec_driver_sql(
            f"LOCK TABLE public.{preparer.quote(table)} IN ACCESS EXCLUSIVE MODE"
        )


def _assert_final_schema(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_table_catalogue(connection, _PHASE_1A3_TABLES)
    owners = set(
        connection.execute(
            sa.text(
                "SELECT table_data.relname, pg_get_userbyid(table_data.relowner) "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND table_data.relkind = 'r'"
            ),
            {"tables": list(_PHASE_1A3_TABLES)},
        )
    )
    if owners != {(table, identity.migration_role) for table in _PHASE_1A3_TABLES}:
        _fail()

    columns = {
        table: tuple(
            connection.execute(
                sa.text(
                    "SELECT attribute.attname FROM pg_attribute AS attribute "
                    "WHERE attribute.attrelid = to_regclass('public.' || :table) "
                    "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                    "ORDER BY attribute.attnum"
                ),
                {"table": table},
            ).scalars()
        )
        for table in ("source_record", "measurement", "ingestion_conflict")
    }
    if columns != {
        "source_record": _SOURCE_RECORD_COLUMNS,
        "measurement": _MEASUREMENT_COLUMNS,
        "ingestion_conflict": _CONFLICT_COLUMNS,
    }:
        _fail()

    column_profiles = set(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, attribute.attname, "
                "format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull, "
                "COALESCE(collation_data.collname, '<none>') "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "LEFT JOIN pg_collation AS collation_data "
                "ON collation_data.oid = attribute.attcollation "
                "WHERE namespace.nspname = 'public' "
                "AND (table_data.relname, attribute.attname) IN ("
                "('source_record', 'adapter_id'), "
                "('source_record', 'adapter_version'), "
                "('source_record', 'parser_version'), "
                "('source_record', 'normalized_content_sha256'), "
                "('measurement', 'source_fact_key'), "
                "('measurement', 'original_value'), "
                "('measurement', 'original_unit'), "
                "('ingestion_conflict', 'fingerprint'), "
                "('ingestion_conflict', 'category'), "
                "('ingestion_conflict', 'source_fact_key'), "
                "('ingestion_conflict', 'incoming_evidence'), "
                "('ingestion_conflict', 'status')"
                ")"
            )
        )
    )
    expected_profiles = {
        ("source_record", "adapter_id", "character varying(128)", True, "C"),
        ("source_record", "adapter_version", "character varying(128)", True, "C"),
        ("source_record", "parser_version", "character varying(128)", True, "C"),
        ("source_record", "normalized_content_sha256", "character(64)", True, "C"),
        ("measurement", "source_fact_key", "character varying(257)", True, "C"),
        ("measurement", "original_value", "text", True, "C"),
        ("measurement", "original_unit", "text", True, "default"),
        ("ingestion_conflict", "fingerprint", "character(64)", True, "C"),
        ("ingestion_conflict", "category", "character varying(64)", True, "C"),
        ("ingestion_conflict", "source_fact_key", "character varying(257)", False, "C"),
        ("ingestion_conflict", "incoming_evidence", "jsonb", True, "<none>"),
        ("ingestion_conflict", "status", "character varying(16)", True, "C"),
    }
    if column_profiles != expected_profiles:
        _fail()

    constraints = {
        table: {
            str(name)
            for name in connection.execute(
                sa.text(
                    "SELECT constraint_data.conname FROM pg_constraint AS constraint_data "
                    "WHERE constraint_data.conrelid = to_regclass('public.' || :table) "
                    "AND constraint_data.contype IN ('p', 'u', 'c', 'f')"
                ),
                {"table": table},
            ).scalars()
        }
        for table in ("source_record", "measurement", "ingestion_conflict")
    }
    expected_source_constraints = {
        "ck_source_record_provider_record_id_nonempty",
        "ck_source_record_provider_version_nonempty",
        "ck_source_record_source_url_nonempty",
        "fk_source_record_canonical_entity",
        "fk_source_record_dataset_provider",
        "pk_source_record",
        "uq_source_record_dataset_provider_record_version",
        "uq_source_record_id_canonical_entity_id",
        *_SOURCE_RECORD_ADDED_CONSTRAINTS,
    }
    expected_measurement_constraints = {
        "ck_measurement_value_numeric_finite",
        "fk_measurement_quantity_unit",
        "fk_measurement_source_record_entity",
        "pk_measurement",
        "uq_measurement_id_entity_id_quantity_id",
        _MEASUREMENT_FACT_UNIQUE,
        *_MEASUREMENT_ADDED_CONSTRAINTS,
    }
    if constraints != {
        "source_record": expected_source_constraints,
        "measurement": expected_measurement_constraints,
        "ingestion_conflict": _CONFLICT_CONSTRAINTS,
    }:
        _fail()

    conflict_index = connection.execute(
        sa.text(
            "SELECT pg_get_indexdef(index_data.indexrelid), "
            "COALESCE(pg_get_expr(index_data.indpred, index_data.indrelid), '<none>') "
            "FROM pg_index AS index_data "
            "JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid "
            "WHERE index_data.indrelid = 'public.ingestion_conflict'::regclass "
            "AND index_class.relname = :name"
        ),
        {"name": _CONFLICT_OPEN_INDEX},
    ).one_or_none()
    if conflict_index != (
        "CREATE INDEX ix_ingestion_conflict_open_category_created_at_fingerprint "
        "ON public.ingestion_conflict USING btree (category, created_at, fingerprint) "
        "WHERE ((status)::text = 'open'::text)",
        "((status)::text = 'open'::text)",
    ):
        _fail()

    fact_unique = connection.execute(
        sa.text(
            "SELECT pg_get_constraintdef(constraint_data.oid, true) "
            "FROM pg_constraint AS constraint_data "
            "WHERE constraint_data.conrelid = 'public.measurement'::regclass "
            "AND constraint_data.conname = :name"
        ),
        {"name": _MEASUREMENT_FACT_UNIQUE},
    ).scalar_one_or_none()
    if fact_unique != "UNIQUE (source_record_id, source_fact_key)":
        _fail()

    function = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(procedure.proowner), procedure.prokind, "
            "procedure.prosecdef, procedure.proconfig, "
            "pg_get_function_identity_arguments(procedure.oid), "
            "pg_get_function_result(procedure.oid), "
            "btrim(regexp_replace(pg_get_functiondef(procedure.oid), '[[:space:]]+', ' ', 'g')) "
            "FROM pg_proc AS procedure "
            "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
            "WHERE namespace.nspname = 'public' "
            "AND procedure.proname = :name "
            "AND procedure.pronargs = 0"
        ),
        {"name": _RESOLUTION_FUNCTION},
    ).one_or_none()
    if function != (
        identity.migration_role,
        "f",
        False,
        ["search_path=pg_catalog, public"],
        "",
        "trigger",
        _RESOLUTION_FUNCTION_DEFINITION,
    ):
        _fail()
    trigger = connection.execute(
        sa.text(
            "SELECT pg_get_triggerdef(trigger_data.oid, true) "
            "FROM pg_trigger AS trigger_data "
            "WHERE trigger_data.tgrelid = 'public.source_record'::regclass "
            "AND trigger_data.tgname = :name AND NOT trigger_data.tgisinternal"
        ),
        {"name": _RESOLUTION_TRIGGER},
    ).scalar_one_or_none()
    if trigger != (
        "CREATE TRIGGER trg_source_record_resolution_guard BEFORE UPDATE ON source_record "
        "FOR EACH ROW EXECUTE FUNCTION enforce_source_record_resolution()"
    ):
        _fail()

    expected_table_acl = tuple(
        (table, identity.migration_role, identity.runtime_role, "SELECT", False)
        for table in (
            "canonical_measurement",
            "dataset",
            "entity",
            "ingestion_conflict",
            "measurement",
            "provider",
            "quantity",
            "quantity_unit",
            "source_record",
            "unit",
        )
    )
    if _catalog_acl_rows(connection, _PHASE_1A3_TABLES) != expected_table_acl:
        _fail()

    insert_grants = {
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
        "source_record": _SOURCE_RECORD_COLUMNS,
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
    expected_column_acl = sorted(
        [
            (table, column, identity.migration_role, identity.runtime_role, "INSERT", False)
            for table, columns in insert_grants.items()
            for column in columns
        ]
        + [
            (
                "source_record",
                "canonical_entity_id",
                identity.migration_role,
                identity.runtime_role,
                "UPDATE",
                False,
            )
        ]
    )
    if list(_column_acl_rows(connection, _PHASE_1A3_TABLES)) != expected_column_acl:
        _fail()
    _assert_resolution_function_acl(connection, identity)


def _create_resolution_guard(connection: Connection, identity: MigrationIdentity) -> None:
    op.execute(
        sa.text(
            "CREATE FUNCTION public.enforce_source_record_resolution() "
            "RETURNS trigger "
            "LANGUAGE plpgsql "
            "SECURITY INVOKER "
            "SET search_path = pg_catalog, public "
            "AS $$ "
            "BEGIN "
            "IF OLD.canonical_entity_id IS NULL "
            "AND NEW.canonical_entity_id IS NOT NULL "
            "AND (to_jsonb(NEW) - 'canonical_entity_id') "
            "IS NOT DISTINCT FROM (to_jsonb(OLD) - 'canonical_entity_id') "
            "AND NOT EXISTS ("
            "SELECT 1 FROM public.measurement "
            "WHERE measurement.source_record_id = OLD.id"
            ") THEN "
            "RETURN NEW; "
            "END IF; "
            "RAISE EXCEPTION 'source_record resolution update denied' "
            "USING ERRCODE = '23514'; "
            "END; "
            "$$"
        )
    )
    op.execute(
        sa.text(
            "CREATE TRIGGER trg_source_record_resolution_guard "
            "BEFORE UPDATE ON public.source_record "
            "FOR EACH ROW EXECUTE FUNCTION public.enforce_source_record_resolution()"
        )
    )
    quoted_role = connection.dialect.identifier_preparer.quote(identity.runtime_role)
    connection.exec_driver_sql(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_source_record_resolution() FROM PUBLIC"
    )
    connection.exec_driver_sql(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_source_record_resolution() "
        f"FROM {quoted_role}"
    )


def upgrade() -> None:
    """Install the immutable Phase 1A3 ingestion provenance boundary."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_table_catalogue(connection, _PHASE_1A3_TABLES[:-1])
    _assert_parent_schema(connection)
    _assert_parent_acl(connection, identity)
    _assert_empty(connection, _MUTABLE_CONTENT_TABLES)

    op.add_column(
        "source_record",
        sa.Column("adapter_id", sa.String(length=128, collation="C"), nullable=False),
    )
    op.add_column(
        "source_record",
        sa.Column("adapter_version", sa.String(length=128, collation="C"), nullable=False),
    )
    op.add_column(
        "source_record",
        sa.Column("parser_version", sa.String(length=128, collation="C"), nullable=False),
    )
    op.add_column(
        "source_record",
        sa.Column("normalized_content_sha256", sa.CHAR(length=64, collation="C"), nullable=False),
    )
    op.create_check_constraint(
        "ck_source_record_adapter_id_identifier",
        "source_record",
        f"adapter_id ~ '{_STABLE_TOKEN_PATTERN}'",
    )
    op.create_check_constraint(
        "ck_source_record_adapter_version_identifier",
        "source_record",
        f"adapter_version ~ '{_STABLE_TOKEN_PATTERN}'",
    )
    op.create_check_constraint(
        "ck_source_record_parser_version_identifier",
        "source_record",
        f"parser_version ~ '{_STABLE_TOKEN_PATTERN}'",
    )
    op.create_check_constraint(
        "ck_source_record_normalized_content_sha256",
        "source_record",
        "normalized_content_sha256 ~ '^[0-9a-f]{64}$'",
    )

    op.add_column(
        "measurement",
        sa.Column("source_fact_key", sa.String(length=257, collation="C"), nullable=False),
    )
    op.add_column(
        "measurement", sa.Column("original_value", sa.Text(collation="C"), nullable=False)
    )
    op.add_column("measurement", sa.Column("original_unit", sa.Text(), nullable=False))
    op.create_check_constraint(
        "ck_measurement_source_fact_key_identifier",
        "measurement",
        f"source_fact_key ~ '{_SOURCE_FACT_KEY_PATTERN}'",
    )
    op.create_check_constraint(
        "ck_measurement_original_value_json_number",
        "measurement",
        f"original_value ~ '{_JSON_NUMBER_PATTERN}' AND original_value::numeric = value_numeric",
    )
    op.create_check_constraint(
        "ck_measurement_original_unit_nonempty_control_free",
        "measurement",
        "length(original_unit) > 0 AND original_unit !~ '[[:cntrl:]]'",
    )
    op.create_unique_constraint(
        _MEASUREMENT_FACT_UNIQUE,
        "measurement",
        ["source_record_id", "source_fact_key"],
    )

    op.create_table(
        "ingestion_conflict",
        sa.Column("fingerprint", sa.CHAR(length=64, collation="C"), nullable=False),
        sa.Column("category", sa.String(length=64, collation="C"), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("measurement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_fact_key", sa.String(length=257, collation="C"), nullable=True),
        sa.Column("incoming_evidence", postgresql.JSONB(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16, collation="C"),
            nullable=False,
            server_default=sa.text("'open'"),
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("resolved_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("fingerprint", name="pk_ingestion_conflict"),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["provider.id"],
            name="fk_ingestion_conflict_provider",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["dataset.id"],
            name="fk_ingestion_conflict_dataset",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_record_id"],
            ["source_record.id"],
            name="fk_ingestion_conflict_source_record",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["measurement_id"],
            ["measurement.id"],
            name="fk_ingestion_conflict_measurement",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.CheckConstraint(
            "fingerprint ~ '^[0-9a-f]{64}$'",
            name="ck_ingestion_conflict_fingerprint_sha256",
        ),
        sa.CheckConstraint(
            "category IN ('provider_metadata_mismatch', 'dataset_metadata_mismatch', "
            "'source_record_content_mismatch', 'source_record_entity_mismatch', "
            "'measurement_fact_mismatch')",
            name="ck_ingestion_conflict_category",
        ),
        sa.CheckConstraint(
            "(category = 'provider_metadata_mismatch' "
            "AND provider_id IS NOT NULL AND dataset_id IS NULL "
            "AND source_record_id IS NULL AND measurement_id IS NULL "
            "AND source_fact_key IS NULL) "
            "OR (category = 'dataset_metadata_mismatch' "
            "AND provider_id IS NULL AND dataset_id IS NOT NULL "
            "AND source_record_id IS NULL AND measurement_id IS NULL "
            "AND source_fact_key IS NULL) "
            "OR (category IN ('source_record_content_mismatch', "
            "'source_record_entity_mismatch') "
            "AND provider_id IS NULL AND dataset_id IS NULL "
            "AND source_record_id IS NOT NULL AND measurement_id IS NULL "
            "AND source_fact_key IS NULL) "
            "OR (category = 'measurement_fact_mismatch' "
            "AND provider_id IS NULL AND dataset_id IS NULL "
            "AND source_record_id IS NULL AND measurement_id IS NOT NULL "
            "AND source_fact_key IS NOT NULL)",
            name="ck_ingestion_conflict_anchor",
        ),
        sa.CheckConstraint(
            f"source_fact_key IS NULL OR source_fact_key ~ '{_SOURCE_FACT_KEY_PATTERN}'",
            name="ck_ingestion_conflict_source_fact_key_identifier",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(incoming_evidence) = 'object' "
            "AND octet_length(convert_to(incoming_evidence::text, 'UTF8')) <= 8192",
            name="ck_ingestion_conflict_evidence_object_size",
        ),
        sa.CheckConstraint("status IN ('open', 'resolved')", name="ck_ingestion_conflict_status"),
        sa.CheckConstraint(
            "(status = 'open' AND resolved_at IS NULL) "
            "OR (status = 'resolved' AND resolved_at IS NOT NULL)",
            name="ck_ingestion_conflict_status_resolved_at",
        ),
    )
    op.create_index(
        _CONFLICT_OPEN_INDEX,
        "ingestion_conflict",
        ["category", "created_at", "fingerprint"],
        unique=False,
        postgresql_where=sa.text("status = 'open'"),
    )

    _create_resolution_guard(connection, identity)
    _revoke_catalog_access(connection, identity, _PHASE_1A3_TABLES)
    _grant_runtime_catalog_access(connection, identity)
    _assert_final_schema(connection, identity)


def downgrade() -> None:
    """Remove Phase 1A3 only when no immutable ingestion facts exist."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    _assert_revision(connection, revision)
    _lock_downgrade_tables(connection)
    _assert_final_schema(connection, identity)
    _assert_empty(connection, (*_MUTABLE_CONTENT_TABLES, "ingestion_conflict"))

    _revoke_catalog_access(connection, identity, _PHASE_1A3_TABLES)
    quoted_role = connection.dialect.identifier_preparer.quote(identity.runtime_role)
    connection.exec_driver_sql(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_source_record_resolution() FROM PUBLIC"
    )
    connection.exec_driver_sql(
        "REVOKE ALL PRIVILEGES ON FUNCTION public.enforce_source_record_resolution() "
        f"FROM {quoted_role}"
    )
    op.execute(sa.text("DROP TRIGGER trg_source_record_resolution_guard ON public.source_record"))
    op.execute(sa.text("DROP FUNCTION public.enforce_source_record_resolution()"))
    op.drop_index(_CONFLICT_OPEN_INDEX, table_name="ingestion_conflict")
    op.drop_table("ingestion_conflict")
    op.drop_constraint(_MEASUREMENT_FACT_UNIQUE, "measurement", type_="unique")
    for constraint in sorted(_MEASUREMENT_ADDED_CONSTRAINTS):
        op.drop_constraint(constraint, "measurement", type_="check")
    for column in ("original_unit", "original_value", "source_fact_key"):
        op.drop_column("measurement", column)
    for constraint in sorted(_SOURCE_RECORD_ADDED_CONSTRAINTS):
        op.drop_constraint(constraint, "source_record", type_="check")
    for column in (
        "normalized_content_sha256",
        "parser_version",
        "adapter_version",
        "adapter_id",
    ):
        op.drop_column("source_record", column)

    _assert_table_catalogue(connection, _PHASE_1A3_TABLES[:-1])
    _assert_parent_schema(connection)
    _assert_parent_acl(connection, identity)
