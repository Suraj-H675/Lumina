"""Add the bounded Phase 1B1 public identity foundation.

Revision ID: b7f3a2c81d4e
Revises: c4b9e2d7a6f1
Create Date: 2026-08-20

This revision intentionally establishes storage only.  It adds no alias data,
search extension, runtime repository contract, or runtime access to the new
tables.  ``entity_alias`` is an alias identity; source-specific attestations
are retained separately in ``entity_alias_evidence``.
"""

from __future__ import annotations

from collections.abc import Callable
from hashlib import sha256
from typing import NoReturn
from uuid import UUID

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "b7f3a2c81d4e"
down_revision = "c4b9e2d7a6f1"
branch_labels = None
depends_on = None

_SAFE_ERROR = "Phase 1B1 public identity migration precondition failed."
_PHASE_1A_TABLES = (
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
_IDENTITY_TABLES = ("entity_alias", "entity_alias_evidence")
_PUBLIC_TABLES = ("alembic_version", "job")
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
_SOURCE_RECORD_ENTITY_UNIQUE = "uq_source_record_id_canonical_entity_id"
_MIGRATION_WAIT_TIMEOUT = "5s"
_RESOLUTION_FUNCTION = "enforce_source_record_resolution"
_RESOLUTION_TRIGGER = "trg_source_record_resolution_guard"
_PHASE_1A_SCHEMA_SHA256 = "6bd8d4257981cdc81fcedb7da0d50089a40058ba39fa59ab8d8e0a7c5e31335f"
_FINAL_SCHEMA_SHA256 = "108cf4a0bc15323b7f6877f7376eb79a140d069397a30aad76340075580f8d3c"
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

_ENTITY_ROWS = (
    (
        UUID("26f4b667-ecd9-524d-8121-29508723715a"),
        "star",
        "HD 209458",
        "hd-209458",
    ),
    (
        UUID("bbfe8678-81ca-5e70-ac95-c597d7655540"),
        "star",
        "Kepler-186",
        "kepler-186",
    ),
    (
        UUID("bfd42670-3013-598e-8eb5-5a1c084dd1a0"),
        "star",
        "Kepler-452",
        "kepler-452",
    ),
    (
        UUID("c593bd18-c4bc-5551-8a41-09f1b501f981"),
        "star",
        "51 Pegasi",
        "51-pegasi",
    ),
    (
        UUID("403d0e71-8d81-5c52-abad-c4666c1b5cd6"),
        "star",
        "K2-18",
        "k2-18",
    ),
)
_ENTITY_IDS = tuple(row[0] for row in _ENTITY_ROWS)
_ENTITY_PRESTATE_ROWS = tuple(row[:3] for row in _ENTITY_ROWS)

_PHASE_1A_COLUMNS = {
    "provider": (
        "id",
        "code",
        "name",
        "documentation_url",
        "terms_url",
        "attribution_text",
    ),
    "entity": ("id", "entity_type", "canonical_name", "created_at"),
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
    "quantity": ("id", "code", "name"),
    "unit": ("id", "code", "symbol", "name"),
    "quantity_unit": ("quantity_id", "unit_id"),
    "measurement": (
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
    ),
    "canonical_measurement": (
        "id",
        "entity_id",
        "quantity_id",
        "measurement_id",
        "selection_rule",
        "selection_version",
        "explanation",
        "selected_at",
        "superseded_at",
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
        "status",
        "created_at",
        "resolved_at",
    ),
}

_PHASE_1A_CONSTRAINTS = {
    "provider": {
        "pk_provider",
        "uq_provider_code",
        "ck_provider_code_identifier",
        "ck_provider_name_nonempty",
        "ck_provider_documentation_url_nonempty",
        "ck_provider_terms_url_nonempty",
        "ck_provider_attribution_text_nonempty",
    },
    "entity": {
        "pk_entity",
        "ck_entity_type",
        "ck_entity_canonical_name_nonempty",
    },
    "dataset": {
        "pk_dataset",
        "fk_dataset_provider",
        "uq_dataset_provider_code_release_version",
        "uq_dataset_id_provider_id",
        "ck_dataset_code_identifier",
        "ck_dataset_name_nonempty",
        "ck_dataset_release_version_identifier",
        "ck_dataset_source_url_nonempty",
        "ck_dataset_licence_nonempty",
        "ck_dataset_citation_nonempty",
    },
    "source_record": {
        "pk_source_record",
        "fk_source_record_dataset_provider",
        "fk_source_record_canonical_entity",
        "uq_source_record_dataset_provider_record_version",
        _SOURCE_RECORD_ENTITY_UNIQUE,
        "ck_source_record_provider_record_id_nonempty",
        "ck_source_record_provider_version_nonempty",
        "ck_source_record_source_url_nonempty",
        "ck_source_record_adapter_id_identifier",
        "ck_source_record_adapter_version_identifier",
        "ck_source_record_parser_version_identifier",
        "ck_source_record_normalized_content_sha256",
    },
    "quantity": {
        "pk_quantity",
        "uq_quantity_code",
        "ck_quantity_code_identifier",
        "ck_quantity_name_nonempty",
    },
    "unit": {
        "pk_unit",
        "uq_unit_code",
        "ck_unit_code_identifier",
        "ck_unit_symbol_nonempty",
        "ck_unit_name_nonempty",
    },
    "quantity_unit": {
        "pk_quantity_unit",
        "fk_quantity_unit_quantity",
        "fk_quantity_unit_unit",
    },
    "measurement": {
        "pk_measurement",
        "uq_measurement_id_entity_id_quantity_id",
        "uq_measurement_source_record_source_fact_key",
        "fk_measurement_source_record_entity",
        "fk_measurement_quantity_unit",
        "ck_measurement_value_numeric_finite",
        "ck_measurement_source_fact_key_identifier",
        "ck_measurement_original_value_json_number",
        "ck_measurement_original_unit_nonempty_control_free",
    },
    "canonical_measurement": {
        "pk_canonical_measurement",
        "fk_canonical_measurement_measurement_entity_quantity",
        "ck_canonical_measurement_selection_rule_identifier",
        "ck_canonical_measurement_selection_version_identifier",
        "ck_canonical_measurement_explanation_nonempty",
        "ck_canonical_measurement_superseded_at_order",
    },
    "ingestion_conflict": {
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
    },
}

_PHASE_1A_INDEXES = {
    "provider": {"pk_provider", "uq_provider_code"},
    "entity": {"pk_entity"},
    "dataset": {
        "pk_dataset",
        "uq_dataset_provider_code_release_version",
        "uq_dataset_id_provider_id",
    },
    "source_record": {
        "pk_source_record",
        "uq_source_record_dataset_provider_record_version",
        _SOURCE_RECORD_ENTITY_UNIQUE,
        "ix_source_record_canonical_entity_id",
    },
    "quantity": {"pk_quantity", "uq_quantity_code"},
    "unit": {"pk_unit", "uq_unit_code"},
    "quantity_unit": {"pk_quantity_unit"},
    "measurement": {
        "pk_measurement",
        "uq_measurement_id_entity_id_quantity_id",
        "uq_measurement_source_record_source_fact_key",
        "ix_measurement_source_record_id_entity_id",
        "ix_measurement_quantity_id_unit_id",
    },
    "canonical_measurement": {
        "pk_canonical_measurement",
        "uq_canonical_measurement_active_entity_id_quantity_id",
        "ix_canonical_measurement_measurement_id_entity_id_quantity_id",
    },
    "ingestion_conflict": {
        "pk_ingestion_conflict",
        "ix_ingestion_conflict_open_category_created_at_fingerprint",
    },
}

_ALIAS_COLUMNS = (
    "id",
    "entity_id",
    "alias",
    "normalized_alias",
    "normalization_version",
    "alias_type",
    "catalog_name",
    "language",
)
_EVIDENCE_COLUMNS = ("alias_id", "entity_id", "source_record_id")
_ALIAS_CONSTRAINTS = {
    "pk_entity_alias",
    "fk_entity_alias_entity",
    "uq_entity_alias_normalized_entity",
    "uq_entity_alias_id_entity_id",
    "ck_entity_alias_alias",
    "ck_entity_alias_normalized_alias",
    "ck_entity_alias_normalization_version",
    "ck_entity_alias_type",
    "ck_entity_alias_catalog_name",
    "ck_entity_alias_language",
}
_EVIDENCE_CONSTRAINTS = {
    "pk_entity_alias_evidence",
    "fk_entity_alias_evidence_alias_entity",
    "fk_entity_alias_evidence_source_record_entity",
}
_ENTITY_SLUG_CONSTRAINT_DEFINITIONS = {
    "ck_entity_slug_format": (
        "CHECK (char_length(slug) >= 1 AND char_length(slug) <= 100 "
        "AND (slug COLLATE \"C\") ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)"
    ),
    "uq_entity_slug": "UNIQUE (slug)",
}
_ALIAS_CONSTRAINT_DEFINITIONS = {
    "pk_entity_alias": "PRIMARY KEY (id)",
    "fk_entity_alias_entity": (
        "FOREIGN KEY (entity_id) REFERENCES entity(id) ON UPDATE RESTRICT ON DELETE RESTRICT"
    ),
    "uq_entity_alias_normalized_entity": "UNIQUE (normalized_alias, entity_id)",
    "uq_entity_alias_id_entity_id": "UNIQUE (id, entity_id)",
    "ck_entity_alias_alias": (
        "CHECK (char_length(alias) >= 1 AND char_length(alias) <= 255 "
        "AND alias = btrim(alias, ((((' '::text || chr(9)) || chr(10)) || chr(11)) "
        "|| chr(12)) || chr(13)) AND (alias COLLATE \"C\") !~ '[[:cntrl:]]'::text)"
    ),
    "ck_entity_alias_normalized_alias": (
        "CHECK (char_length(normalized_alias) >= 1 "
        "AND char_length(normalized_alias) <= 255 "
        "AND normalized_alias = btrim(normalized_alias, ' '::text) "
        "AND strpos(normalized_alias, '  '::text) = 0 "
        "AND (normalized_alias COLLATE \"C\") !~ '[[:cntrl:]]'::text)"
    ),
    "ck_entity_alias_normalization_version": "CHECK (normalization_version = 1)",
    "ck_entity_alias_type": (
        "CHECK (char_length(alias_type::text) >= 1 "
        "AND char_length(alias_type::text) <= 32 "
        "AND (alias_type::text COLLATE \"C\") ~ '^[a-z][a-z0-9_]{0,31}$'::text)"
    ),
    "ck_entity_alias_catalog_name": (
        "CHECK (catalog_name IS NULL OR char_length(catalog_name::text) >= 1 "
        "AND char_length(catalog_name::text) <= 128 "
        'AND (catalog_name::text COLLATE "C") '
        "~ '^[a-z0-9][a-z0-9_.-]{0,127}$'::text)"
    ),
    "ck_entity_alias_language": (
        "CHECK (language IS NULL OR char_length(language::text) >= 2 "
        "AND char_length(language::text) <= 35 "
        'AND (language::text COLLATE "C") '
        "~ '^[a-z]{2,8}(-[a-z0-9]{1,8})*$'::text)"
    ),
}
_EVIDENCE_CONSTRAINT_DEFINITIONS = {
    "pk_entity_alias_evidence": "PRIMARY KEY (alias_id, source_record_id)",
    "fk_entity_alias_evidence_alias_entity": (
        "FOREIGN KEY (alias_id, entity_id) REFERENCES entity_alias(id, entity_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT"
    ),
    "fk_entity_alias_evidence_source_record_entity": (
        "FOREIGN KEY (source_record_id, entity_id) "
        "REFERENCES source_record(id, canonical_entity_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT"
    ),
}


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _connection() -> Connection:
    return op.get_bind()


def _identity() -> MigrationIdentity:
    configuration = context.get_context().config
    if configuration is None:
        _fail()
    configured = configuration.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_role_has_safe_properties(connection: Connection, role_name: str) -> None:
    flags = connection.execute(
        sa.text(
            "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, "
            "rolreplication, rolbypassrls "
            "FROM pg_roles WHERE rolname = :role"
        ),
        {"role": role_name},
    ).one_or_none()
    if flags is None or tuple(flags) != (True, False, False, False, False, False):
        _fail()

    related_roles = connection.execute(
        sa.text(
            "WITH RECURSIVE selected_role(role_oid) AS ("
            "SELECT oid FROM pg_roles WHERE rolname = :role"
            "), upstream(role_oid) AS ("
            "SELECT role_oid FROM selected_role "
            "UNION "
            "SELECT membership.roleid FROM pg_auth_members AS membership "
            "JOIN upstream ON membership.member = upstream.role_oid"
            "), downstream(role_oid) AS ("
            "SELECT role_oid FROM selected_role "
            "UNION "
            "SELECT membership.member FROM pg_auth_members AS membership "
            "JOIN downstream ON membership.roleid = downstream.role_oid"
            ") "
            "SELECT count(*) FROM ("
            "SELECT role_oid FROM upstream UNION SELECT role_oid FROM downstream"
            ") AS related "
            "WHERE role_oid <> (SELECT role_oid FROM selected_role)"
        ),
        {"role": role_name},
    ).scalar_one()
    if related_roles != 0:
        _fail()


def _assert_runtime_role_is_safe(connection: Connection, role_name: str) -> None:
    _assert_role_has_safe_properties(connection, role_name)
    unsafe_runtime_capabilities = connection.execute(
        sa.text(
            "SELECT has_database_privilege(:role, current_database(), 'TEMP') "
            "OR has_database_privilege(:role, current_database(), 'CREATE') "
            "OR has_schema_privilege(:role, 'public', 'CREATE')"
        ),
        {"role": role_name},
    ).scalar_one()
    if unsafe_runtime_capabilities:
        _fail()


def _assert_role_is_safe(connection: Connection, identity: MigrationIdentity) -> None:
    current_user, session_user = connection.execute(
        sa.text("SELECT current_user, session_user")
    ).one()
    if (
        current_user != identity.migration_role
        or session_user != identity.migration_role
        or identity.runtime_role == identity.migration_role
    ):
        _fail()
    _assert_role_has_safe_properties(connection, identity.migration_role)
    _assert_runtime_role_is_safe(connection, identity.runtime_role)


def _configure_timeouts(connection: Connection) -> None:
    connection.execute(
        sa.text(
            "SELECT set_config('statement_timeout', :timeout, true), "
            "set_config('lock_timeout', :timeout, true)"
        ),
        {"timeout": _MIGRATION_WAIT_TIMEOUT},
    ).one()


def _assert_revision(connection: Connection, expected: str) -> None:
    version = connection.execute(
        sa.text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()
    if version != expected:
        _fail()


def _lock_tables(connection: Connection, tables: tuple[str, ...], mode: str) -> None:
    preparer = connection.dialect.identifier_preparer
    connection.exec_driver_sql(
        "LOCK TABLE "
        + ", ".join(f"public.{preparer.quote(table)}" for table in tables)
        + f" IN {mode} MODE"
    )


def _run_preconditions(
    connection: Connection,
    identity: MigrationIdentity,
    *,
    tables: tuple[str, ...],
    lock_mode: str,
    expected_revision: str,
    verify: Callable[[Connection, MigrationIdentity], None],
) -> None:
    """Run lock-first migration guards without leaking database error details."""
    try:
        _assert_role_is_safe(connection, identity)
        _configure_timeouts(connection)
        _lock_tables(connection, tables, lock_mode)
        _assert_revision(connection, expected_revision)
        verify(connection, identity)
    except sa.exc.SQLAlchemyError:
        _fail()


def _table_names(connection: Connection) -> set[str]:
    return {
        str(name)
        for name in connection.execute(
            sa.text(
                "SELECT table_data.relname FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' AND table_data.relkind = 'r'"
            )
        ).scalars()
    }


def _assert_table_catalogue(connection: Connection, tables: tuple[str, ...]) -> None:
    if _table_names(connection) != {*_PUBLIC_TABLES, *tables}:
        _fail()


def _schema_digest(connection: Connection, tables: tuple[str, ...]) -> str:
    """Return the exact accepted visible PostgreSQL schema signature.

    Physical ``pg_attribute.attnum`` slots are intentionally excluded: PostgreSQL
    retains a dropped column's slot, so a safe downgrade/re-upgrade can assign a
    later physical slot to the same visible final column.  Column order remains
    fail-closed through ``_assert_table_columns``.
    """
    columns = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT table_data.relname, attribute.attname, "
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
                "constraint_data.contype, "
                "pg_get_constraintdef(constraint_data.oid, true), "
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


def _table_columns(connection: Connection, table: str) -> tuple[str, ...]:
    return tuple(
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


def _assert_table_columns(
    connection: Connection,
    expected: dict[str, tuple[str, ...]],
) -> None:
    if {table: _table_columns(connection, table) for table in expected} != expected:
        _fail()


def _constraint_names(connection: Connection, table: str) -> set[str]:
    return {
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


def _assert_constraint_names(
    connection: Connection,
    expected: dict[str, set[str]],
) -> None:
    if {table: _constraint_names(connection, table) for table in expected} != expected:
        _fail()


def _constraint_definitions(connection: Connection, table: str) -> dict[str, str]:
    return {
        str(name): str(definition)
        for name, definition in connection.execute(
            sa.text(
                "SELECT constraint_data.conname, "
                "pg_get_constraintdef(constraint_data.oid, true) "
                "FROM pg_constraint AS constraint_data "
                "WHERE constraint_data.conrelid = to_regclass('public.' || :table) "
                "AND constraint_data.contype IN ('p', 'u', 'c', 'f')"
            ),
            {"table": table},
        )
    }


def _index_names(connection: Connection, table: str) -> set[str]:
    return {
        str(name)
        for name in connection.execute(
            sa.text(
                "SELECT index_class.relname FROM pg_index AS index_data "
                "JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid "
                "WHERE index_data.indrelid = to_regclass('public.' || :table)"
            ),
            {"table": table},
        ).scalars()
    }


def _assert_index_names(connection: Connection, expected: dict[str, set[str]]) -> None:
    if {table: _index_names(connection, table) for table in expected} != expected:
        _fail()


def _assert_owners(
    connection: Connection, identity: MigrationIdentity, tables: tuple[str, ...]
) -> None:
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
            {"tables": list(tables)},
        )
    )
    if owners != {(table, identity.migration_role) for table in tables}:
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


def _assert_phase1a_acl(connection: Connection, identity: MigrationIdentity) -> str:
    actual_table_acl = _catalog_acl_rows(connection, _PHASE_1A_TABLES)
    actual_column_acl = _column_acl_rows(connection, _PHASE_1A_TABLES)
    runtime_roles = {str(row[2]) for row in actual_table_acl} | {
        str(row[3]) for row in actual_column_acl
    }
    if len(runtime_roles) != 1:
        _fail()
    phase1a_runtime_role = runtime_roles.pop()

    expected_table_acl = tuple(
        (table, identity.migration_role, phase1a_runtime_role, "SELECT", False)
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
    if actual_table_acl != expected_table_acl:
        _fail()

    insert_grants = {
        "provider": _PHASE_1A_COLUMNS["provider"],
        "dataset": _PHASE_1A_COLUMNS["dataset"],
        "source_record": _PHASE_1A_COLUMNS["source_record"],
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
            (table, column, identity.migration_role, phase1a_runtime_role, "INSERT", False)
            for table, columns in insert_grants.items()
            for column in columns
        ]
        + [
            (
                "source_record",
                "canonical_entity_id",
                identity.migration_role,
                phase1a_runtime_role,
                "UPDATE",
                False,
            )
        ]
    )
    if list(actual_column_acl) != expected_column_acl:
        _fail()
    return phase1a_runtime_role


def _assert_source_record_candidate_key(connection: Connection) -> None:
    definition = connection.execute(
        sa.text(
            "SELECT pg_get_constraintdef(constraint_data.oid, true) "
            "FROM pg_constraint AS constraint_data "
            "WHERE constraint_data.conrelid = 'public.source_record'::regclass "
            "AND constraint_data.conname = :name "
            "AND constraint_data.contype = 'u'"
        ),
        {"name": _SOURCE_RECORD_ENTITY_UNIQUE},
    ).scalar_one_or_none()
    if definition != "UNIQUE (id, canonical_entity_id)":
        _fail()
    duplicates = connection.execute(
        sa.text(
            "SELECT id, canonical_entity_id FROM public.source_record "
            "GROUP BY id, canonical_entity_id HAVING count(*) > 1"
        )
    ).first()
    if duplicates is not None:
        _fail()


def _assert_phase1a_function_contract(
    connection: Connection,
    identity: MigrationIdentity,
    phase1a_runtime_role: str,
) -> None:
    function = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(procedure.proowner), procedure.prokind, "
            "procedure.prosecdef, procedure.proconfig, "
            "pg_get_function_identity_arguments(procedure.oid), "
            "pg_get_function_result(procedure.oid), "
            "btrim(regexp_replace(pg_get_functiondef(procedure.oid), "
            "'[[:space:]]+', ' ', 'g')) "
            "FROM pg_proc AS procedure "
            "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
            "WHERE namespace.nspname = 'public' "
            "AND procedure.proname = :name AND procedure.pronargs = 0"
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
    non_owner_function_acl = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_proc AS procedure "
            "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(procedure.proacl, acldefault('f', procedure.proowner))"
            ") AS privilege "
            "WHERE namespace.nspname = 'public' "
            "AND procedure.proname = :name "
            "AND privilege.grantee <> procedure.proowner"
        ),
        {"name": _RESOLUTION_FUNCTION},
    ).scalar_one()
    runtime_function_access = connection.execute(
        sa.text(
            "SELECT count(*) FROM unnest(CAST(:roles AS text[])) AS role_name "
            "WHERE has_function_privilege(role_name, "
            "'public.enforce_source_record_resolution()'::regprocedure, 'EXECUTE')"
        ),
        {"roles": sorted({identity.runtime_role, phase1a_runtime_role})},
    ).scalar_one()
    if non_owner_function_acl != 0 or runtime_function_access != 0:
        _fail()

    public_function_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_proc AS procedure "
            "JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace "
            "WHERE namespace.nspname = 'public'"
        )
    ).scalar_one()
    if public_function_count != 1:
        _fail()


def _assert_no_public_sequences(connection: Connection) -> None:
    sequence_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS item "
            "JOIN pg_namespace AS namespace ON namespace.oid = item.relnamespace "
            "WHERE namespace.nspname = 'public' AND item.relkind = 'S'"
        )
    ).scalar_one()
    if sequence_count != 0:
        _fail()


def _assert_database_schema_capabilities(
    connection: Connection,
    identity: MigrationIdentity,
    phase1a_runtime_role: str,
) -> None:
    role_capabilities = {
        str(role): tuple(capabilities)
        for role, *capabilities in connection.execute(
            sa.text(
                "SELECT role_data.rolname, "
                "has_database_privilege(role_data.rolname, current_database(), 'CONNECT'), "
                "has_database_privilege(role_data.rolname, current_database(), 'CREATE'), "
                "has_database_privilege(role_data.rolname, current_database(), 'TEMP'), "
                "has_schema_privilege(role_data.rolname, 'public', 'USAGE'), "
                "has_schema_privilege(role_data.rolname, 'public', 'CREATE') "
                "FROM pg_roles AS role_data "
                "WHERE role_data.rolname = ANY(CAST(:roles AS text[]))"
            ),
            {"roles": [identity.migration_role, phase1a_runtime_role]},
        )
    }
    if role_capabilities != {
        identity.migration_role: (True, False, False, True, True),
        phase1a_runtime_role: (True, False, False, True, False),
    }:
        _fail()

    public_database_acl = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_database AS database "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(database.datacl, acldefault('d', database.datdba))"
            ") AS privilege "
            "WHERE database.datname = current_database() "
            "AND privilege.grantee = 0"
        )
    ).scalar_one()
    public_schema_acl = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_namespace AS namespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))"
            ") AS privilege "
            "WHERE namespace.nspname = 'public' AND privilege.grantee = 0"
        )
    ).scalar_one()
    if public_database_acl != 0 or public_schema_acl != 0:
        _fail()


def _assert_extension_contract(connection: Connection) -> None:
    extensions = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text("SELECT extname, extversion FROM pg_extension ORDER BY extname")
        )
    )
    if extensions != (("plpgsql", "1.0"),):
        _fail()


def _assert_no_trigram(connection: Connection) -> None:
    if connection.execute(
        sa.text("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')")
    ).scalar_one():
        _fail()
    trigram_indexes = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_index AS index_data "
            "JOIN pg_class AS index_class ON index_class.oid = index_data.indexrelid "
            "JOIN pg_namespace AS namespace ON namespace.oid = index_class.relnamespace "
            "WHERE namespace.nspname = 'public' "
            "AND (pg_get_indexdef(index_data.indexrelid) LIKE '%gin_trgm_ops%' "
            "OR pg_get_indexdef(index_data.indexrelid) LIKE '%gist_trgm_ops%')"
        )
    ).scalar_one()
    if trigram_indexes != 0:
        _fail()


def _assert_phase1a_contract(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_table_catalogue(connection, _PHASE_1A_TABLES)
    _assert_owners(connection, identity, _PHASE_1A_TABLES)
    if _schema_digest(connection, _PHASE_1A_TABLES) != _PHASE_1A_SCHEMA_SHA256:
        _fail()
    _assert_table_columns(connection, _PHASE_1A_COLUMNS)
    _assert_constraint_names(connection, _PHASE_1A_CONSTRAINTS)
    _assert_index_names(connection, _PHASE_1A_INDEXES)
    phase1a_runtime_role = _assert_phase1a_acl(connection, identity)
    _assert_runtime_role_is_safe(connection, phase1a_runtime_role)
    _assert_source_record_candidate_key(connection)
    _assert_phase1a_function_contract(connection, identity, phase1a_runtime_role)
    _assert_no_public_sequences(connection)
    _assert_database_schema_capabilities(connection, identity, phase1a_runtime_role)
    _assert_extension_contract(connection)
    _assert_no_trigram(connection)


def _assert_entity_rows(connection: Connection, *, with_slugs: bool) -> None:
    if with_slugs:
        actual = {
            tuple(row)
            for row in connection.execute(
                sa.text("SELECT id, entity_type, canonical_name, slug FROM public.entity")
            )
        }
        expected: set[tuple[object, ...]] = set(_ENTITY_ROWS)
    else:
        actual = {
            tuple(row)
            for row in connection.execute(
                sa.text("SELECT id, entity_type, canonical_name FROM public.entity")
            )
        }
        expected = set(_ENTITY_PRESTATE_ROWS)
    if actual != expected or len(actual) != len(_ENTITY_ROWS):
        _fail()


def _assert_entity_slug_contract(connection: Connection) -> None:
    profile = connection.execute(
        sa.text(
            "SELECT format_type(attribute.atttypid, attribute.atttypmod), "
            "attribute.attnotnull, COALESCE(collation_data.collname, '<none>') "
            "FROM pg_attribute AS attribute "
            "LEFT JOIN pg_collation AS collation_data "
            "ON collation_data.oid = attribute.attcollation "
            "WHERE attribute.attrelid = 'public.entity'::regclass "
            "AND attribute.attname = 'slug' "
            "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
        )
    ).one_or_none()
    if profile != ("text", True, "C"):
        _fail()
    expected_names = {
        *_PHASE_1A_CONSTRAINTS["entity"],
        "ck_entity_slug_format",
        "uq_entity_slug",
    }
    if _constraint_names(connection, "entity") != expected_names:
        _fail()
    if _index_names(connection, "entity") != {"pk_entity", "uq_entity_slug"}:
        _fail()
    definitions = _constraint_definitions(connection, "entity")
    if {
        name: definitions.get(name) for name in _ENTITY_SLUG_CONSTRAINT_DEFINITIONS
    } != _ENTITY_SLUG_CONSTRAINT_DEFINITIONS:
        _fail()


def _assert_alias_contract(connection: Connection) -> None:
    if _table_columns(connection, "entity_alias") != _ALIAS_COLUMNS:
        _fail()
    profiles = {
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT attribute.attname, "
                "format_type(attribute.atttypid, attribute.atttypmod), "
                "attribute.attnotnull, COALESCE(collation_data.collname, '<none>') "
                "FROM pg_attribute AS attribute "
                "LEFT JOIN pg_collation AS collation_data "
                "ON collation_data.oid = attribute.attcollation "
                "WHERE attribute.attrelid = 'public.entity_alias'::regclass "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            )
        )
    }
    expected_profiles = {
        ("id", "uuid", True, "<none>"),
        ("entity_id", "uuid", True, "<none>"),
        ("alias", "text", True, "default"),
        ("normalized_alias", "text", True, "C"),
        ("normalization_version", "smallint", True, "<none>"),
        ("alias_type", "character varying(32)", True, "C"),
        ("catalog_name", "character varying(128)", False, "C"),
        ("language", "character varying(35)", False, "C"),
    }
    if (
        profiles != expected_profiles
        or _constraint_names(connection, "entity_alias") != _ALIAS_CONSTRAINTS
    ):
        _fail()
    if _index_names(connection, "entity_alias") != {
        "pk_entity_alias",
        "uq_entity_alias_normalized_entity",
        "uq_entity_alias_id_entity_id",
    }:
        _fail()
    if _constraint_definitions(connection, "entity_alias") != _ALIAS_CONSTRAINT_DEFINITIONS:
        _fail()


def _assert_evidence_contract(connection: Connection) -> None:
    if _table_columns(connection, "entity_alias_evidence") != _EVIDENCE_COLUMNS:
        _fail()
    profiles = {
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT attribute.attname, "
                "format_type(attribute.atttypid, attribute.atttypmod), "
                "attribute.attnotnull, COALESCE(collation_data.collname, '<none>') "
                "FROM pg_attribute AS attribute "
                "LEFT JOIN pg_collation AS collation_data "
                "ON collation_data.oid = attribute.attcollation "
                "WHERE attribute.attrelid = 'public.entity_alias_evidence'::regclass "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            )
        )
    }
    if (
        profiles
        != {
            ("alias_id", "uuid", True, "<none>"),
            ("entity_id", "uuid", True, "<none>"),
            ("source_record_id", "uuid", True, "<none>"),
        }
        or _constraint_names(connection, "entity_alias_evidence") != _EVIDENCE_CONSTRAINTS
    ):
        _fail()
    if _index_names(connection, "entity_alias_evidence") != {"pk_entity_alias_evidence"}:
        _fail()
    if (
        _constraint_definitions(connection, "entity_alias_evidence")
        != _EVIDENCE_CONSTRAINT_DEFINITIONS
    ):
        _fail()


def _assert_no_identity_access(connection: Connection, identity: MigrationIdentity) -> None:
    if _catalog_acl_rows(connection, _IDENTITY_TABLES) or _column_acl_rows(
        connection, _IDENTITY_TABLES
    ):
        _fail()
    effective_table_access = connection.execute(
        sa.text(
            "SELECT count(*) FROM unnest(CAST(:roles AS text[])) AS role_name "
            "CROSS JOIN unnest(CAST(:tables AS text[])) AS table_name "
            "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
            "WHERE has_table_privilege(role_name, format('public.%I', table_name), privilege_name)"
        ),
        {
            "roles": [identity.runtime_role],
            "tables": list(_IDENTITY_TABLES),
            "privileges": list(_ALL_TABLE_PRIVILEGES),
        },
    ).scalar_one()
    effective_column_access = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
            "CROSS JOIN unnest(CAST(:roles AS text[])) AS role_name "
            "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
            "WHERE namespace.nspname = 'public' "
            "AND table_data.relname = ANY(CAST(:tables AS text[])) "
            "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
            "AND has_column_privilege(role_name, table_data.oid, attribute.attname, privilege_name)"
        ),
        {
            "roles": [identity.runtime_role],
            "tables": list(_IDENTITY_TABLES),
            "privileges": list(_ALL_COLUMN_PRIVILEGES),
        },
    ).scalar_one()
    if effective_table_access != 0 or effective_column_access != 0:
        _fail()


def _assert_identity_empty(connection: Connection) -> None:
    for table in _IDENTITY_TABLES:
        if connection.execute(sa.text(f"SELECT count(*) FROM public.{table}")).scalar_one() != 0:
            _fail()


def _assert_final_contract(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_table_catalogue(connection, (*_PHASE_1A_TABLES, *_IDENTITY_TABLES))
    _assert_owners(connection, identity, (*_PHASE_1A_TABLES, *_IDENTITY_TABLES))
    if _schema_digest(connection, (*_PHASE_1A_TABLES, *_IDENTITY_TABLES)) != _FINAL_SCHEMA_SHA256:
        _fail()
    expected_phase1a_columns = {
        **_PHASE_1A_COLUMNS,
        "entity": (*_PHASE_1A_COLUMNS["entity"], "slug"),
    }
    _assert_table_columns(connection, expected_phase1a_columns)
    _assert_constraint_names(
        connection,
        {
            **_PHASE_1A_CONSTRAINTS,
            "entity": {
                *_PHASE_1A_CONSTRAINTS["entity"],
                "ck_entity_slug_format",
                "uq_entity_slug",
            },
        },
    )
    _assert_index_names(
        connection,
        {
            **_PHASE_1A_INDEXES,
            "entity": {"pk_entity", "uq_entity_slug"},
        },
    )
    phase1a_runtime_role = _assert_phase1a_acl(connection, identity)
    _assert_runtime_role_is_safe(connection, phase1a_runtime_role)
    _assert_source_record_candidate_key(connection)
    _assert_phase1a_function_contract(connection, identity, phase1a_runtime_role)
    _assert_no_public_sequences(connection)
    _assert_database_schema_capabilities(connection, identity, phase1a_runtime_role)
    _assert_extension_contract(connection)
    _assert_no_trigram(connection)
    _assert_entity_rows(connection, with_slugs=True)
    _assert_entity_slug_contract(connection)
    _assert_alias_contract(connection)
    _assert_evidence_contract(connection)
    _assert_no_identity_access(connection, identity)
    _assert_identity_empty(connection)


def _assert_upgrade_prestate(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_phase1a_contract(connection, identity)
    _assert_entity_rows(connection, with_slugs=False)


def _assert_downgrade_prestate(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_final_contract(connection, identity)
    _assert_identity_empty(connection)


def _backfill_slugs(connection: Connection) -> None:
    values: list[str] = []
    parameters: dict[str, object] = {}
    for index, (entity_id, entity_type, canonical_name, slug) in enumerate(_ENTITY_ROWS):
        values.append(
            f"(CAST(:id_{index} AS uuid), :entity_type_{index}, "
            f":canonical_name_{index}, :slug_{index})"
        )
        parameters.update(
            {
                f"id_{index}": entity_id,
                f"entity_type_{index}": entity_type,
                f"canonical_name_{index}": canonical_name,
                f"slug_{index}": slug,
            }
        )
    updated = tuple(
        connection.execute(
            sa.text(
                "UPDATE public.entity AS entity "
                "SET slug = mapping.slug "
                "FROM (VALUES "
                + ", ".join(values)
                + ") AS mapping(id, entity_type, canonical_name, slug) "
                "WHERE entity.id = mapping.id "
                "AND entity.entity_type = mapping.entity_type "
                "AND entity.canonical_name = mapping.canonical_name "
                "AND entity.slug IS NULL "
                "RETURNING entity.id"
            ),
            parameters,
        ).scalars()
    )
    if len(updated) != len(_ENTITY_ROWS) or set(updated) != set(_ENTITY_IDS):
        _fail()


def _revoke_identity_access(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    for table in _IDENTITY_TABLES:
        quoted_table = preparer.quote(table)
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM PUBLIC"
        )
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM {quoted_role}"
        )


def upgrade() -> None:
    """Add stable slugs plus empty, provenance-preserving alias storage."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _run_preconditions(
        connection,
        identity,
        tables=("entity", "source_record"),
        lock_mode="SHARE ROW EXCLUSIVE",
        expected_revision=down_revision,
        verify=_assert_upgrade_prestate,
    )

    op.add_column("entity", sa.Column("slug", sa.Text(collation="C"), nullable=True))
    _backfill_slugs(connection)
    _assert_entity_rows(connection, with_slugs=True)
    op.create_check_constraint(
        "ck_entity_slug_format",
        "entity",
        "char_length(slug) BETWEEN 1 AND 100 AND (slug COLLATE \"C\") ~ '^[a-z0-9]+(-[a-z0-9]+)*$'",
    )
    op.create_unique_constraint("uq_entity_slug", "entity", ["slug"])
    op.alter_column(
        "entity",
        "slug",
        existing_type=sa.Text(collation="C"),
        nullable=False,
    )

    op.create_table(
        "entity_alias",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("alias", sa.Text(), nullable=False),
        sa.Column("normalized_alias", sa.Text(collation="C"), nullable=False),
        sa.Column("normalization_version", sa.SmallInteger(), nullable=False),
        sa.Column("alias_type", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("catalog_name", sa.String(length=128, collation="C"), nullable=True),
        sa.Column("language", sa.String(length=35, collation="C"), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_entity_alias"),
        sa.ForeignKeyConstraint(
            ["entity_id"],
            ["entity.id"],
            name="fk_entity_alias_entity",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "normalized_alias",
            "entity_id",
            name="uq_entity_alias_normalized_entity",
        ),
        sa.UniqueConstraint("id", "entity_id", name="uq_entity_alias_id_entity_id"),
        sa.CheckConstraint(
            "char_length(alias) BETWEEN 1 AND 255 "
            "AND alias = btrim(alias, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)) "
            "AND (alias COLLATE \"C\") !~ '[[:cntrl:]]'",
            name="ck_entity_alias_alias",
        ),
        sa.CheckConstraint(
            "char_length(normalized_alias) BETWEEN 1 AND 255 "
            "AND normalized_alias = btrim(normalized_alias, ' ') "
            "AND strpos(normalized_alias, '  ') = 0 "
            "AND (normalized_alias COLLATE \"C\") !~ '[[:cntrl:]]'",
            name="ck_entity_alias_normalized_alias",
        ),
        sa.CheckConstraint(
            "normalization_version = 1",
            name="ck_entity_alias_normalization_version",
        ),
        sa.CheckConstraint(
            "char_length(alias_type) BETWEEN 1 AND 32 "
            "AND (alias_type COLLATE \"C\") ~ '^[a-z][a-z0-9_]{0,31}$'",
            name="ck_entity_alias_type",
        ),
        sa.CheckConstraint(
            "catalog_name IS NULL OR (char_length(catalog_name) BETWEEN 1 AND 128 "
            "AND (catalog_name COLLATE \"C\") ~ '^[a-z0-9][a-z0-9_.-]{0,127}$')",
            name="ck_entity_alias_catalog_name",
        ),
        sa.CheckConstraint(
            "language IS NULL OR (char_length(language) BETWEEN 2 AND 35 "
            "AND (language COLLATE \"C\") ~ '^[a-z]{2,8}(-[a-z0-9]{1,8})*$')",
            name="ck_entity_alias_language",
        ),
    )
    op.create_table(
        "entity_alias_evidence",
        sa.Column("alias_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("alias_id", "source_record_id", name="pk_entity_alias_evidence"),
        sa.ForeignKeyConstraint(
            ["alias_id", "entity_id"],
            ["entity_alias.id", "entity_alias.entity_id"],
            name="fk_entity_alias_evidence_alias_entity",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["source_record_id", "entity_id"],
            ["source_record.id", "source_record.canonical_entity_id"],
            name="fk_entity_alias_evidence_source_record_entity",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
    )
    _revoke_identity_access(connection, identity)
    _assert_final_contract(connection, identity)


def downgrade() -> None:
    """Remove the empty public-identity substrate only after exact validation."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _run_preconditions(
        connection,
        identity,
        tables=(
            "entity_alias_evidence",
            "entity_alias",
            "entity",
            "source_record",
        ),
        lock_mode="ACCESS EXCLUSIVE",
        expected_revision=revision,
        verify=_assert_downgrade_prestate,
    )

    op.drop_constraint(
        "fk_entity_alias_evidence_source_record_entity",
        "entity_alias_evidence",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_entity_alias_evidence_alias_entity",
        "entity_alias_evidence",
        type_="foreignkey",
    )
    op.drop_table("entity_alias_evidence")
    op.drop_constraint("fk_entity_alias_entity", "entity_alias", type_="foreignkey")
    op.drop_table("entity_alias")
    op.drop_constraint("uq_entity_slug", "entity", type_="unique")
    op.drop_constraint("ck_entity_slug_format", "entity", type_="check")
    op.alter_column(
        "entity",
        "slug",
        existing_type=sa.Text(collation="C"),
        nullable=True,
    )
    op.drop_column("entity", "slug")

    _assert_phase1a_contract(connection, identity)
    _assert_entity_rows(connection, with_slugs=False)
