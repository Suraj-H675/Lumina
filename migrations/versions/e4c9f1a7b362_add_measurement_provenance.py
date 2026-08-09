"""Create Phase 1A2 quantity, unit, and measurement provenance storage.

Revision ID: e4c9f1a7b362
Revises: d502b5935120
Create Date: 2026-08-09
"""

from __future__ import annotations

from hashlib import sha256
from typing import NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "e4c9f1a7b362"
down_revision = "d502b5935120"
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
_TABLES = (
    *_PHASE_1A1_TABLES,
    *_PHASE_1A2_TABLES,
)
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
_STABLE_TOKEN_PATTERN = "^[A-Za-z0-9._-]{1,128}$"
_SAFE_ERROR = "Catalog measurement migration precondition failed."
_PHASE_1A1_SCHEMA_SHA256 = "140be2aee82830e9e0c236e104b69cadaf41145806d0578ef20ef30fddd9bb1b"
_PHASE_1A1_WITH_SOURCE_KEY_SCHEMA_SHA256 = (
    "7e8281cc30d4715fdbace4793ffd2eacd6b6d135701a0dce2f91a7819719f023"
)

_EXPECTED_COLUMNS = {
    ("canonical_measurement", 1, "id", "uuid", True, "<none>", "<none>"),
    ("canonical_measurement", 2, "entity_id", "uuid", True, "<none>", "<none>"),
    ("canonical_measurement", 3, "quantity_id", "uuid", True, "<none>", "<none>"),
    ("canonical_measurement", 4, "measurement_id", "uuid", True, "<none>", "<none>"),
    (
        "canonical_measurement",
        5,
        "selection_rule",
        "character varying(128)",
        True,
        "<none>",
        "C",
    ),
    (
        "canonical_measurement",
        6,
        "selection_version",
        "character varying(128)",
        True,
        "<none>",
        "C",
    ),
    ("canonical_measurement", 7, "explanation", "text", True, "<none>", "default"),
    (
        "canonical_measurement",
        8,
        "selected_at",
        "timestamp with time zone",
        True,
        "CURRENT_TIMESTAMP",
        "<none>",
    ),
    (
        "canonical_measurement",
        9,
        "superseded_at",
        "timestamp with time zone",
        False,
        "<none>",
        "<none>",
    ),
    ("measurement", 1, "id", "uuid", True, "<none>", "<none>"),
    ("measurement", 2, "entity_id", "uuid", True, "<none>", "<none>"),
    ("measurement", 3, "source_record_id", "uuid", True, "<none>", "<none>"),
    ("measurement", 4, "quantity_id", "uuid", True, "<none>", "<none>"),
    ("measurement", 5, "unit_id", "uuid", True, "<none>", "<none>"),
    ("measurement", 6, "value_numeric", "numeric", True, "<none>", "<none>"),
    (
        "measurement",
        7,
        "created_at",
        "timestamp with time zone",
        True,
        "CURRENT_TIMESTAMP",
        "<none>",
    ),
    ("quantity", 1, "id", "uuid", True, "<none>", "<none>"),
    ("quantity", 2, "code", "character varying(128)", True, "<none>", "C"),
    ("quantity", 3, "name", "text", True, "<none>", "default"),
    ("quantity_unit", 1, "quantity_id", "uuid", True, "<none>", "<none>"),
    ("quantity_unit", 2, "unit_id", "uuid", True, "<none>", "<none>"),
    ("unit", 1, "id", "uuid", True, "<none>", "<none>"),
    ("unit", 2, "code", "character varying(128)", True, "<none>", "C"),
    ("unit", 3, "symbol", "text", True, "<none>", "default"),
    ("unit", 4, "name", "text", True, "<none>", "default"),
}

_EXPECTED_CONSTRAINTS = {
    (
        "canonical_measurement",
        "ck_canonical_measurement_explanation_nonempty",
        "c",
        "CHECK (explanation = btrim(explanation) AND length(explanation) > 0)",
        False,
        False,
    ),
    (
        "canonical_measurement",
        "ck_canonical_measurement_selection_rule_identifier",
        "c",
        "CHECK (selection_rule::text ~ '^[A-Za-z0-9._-]{1,128}$'::text)",
        False,
        False,
    ),
    (
        "canonical_measurement",
        "ck_canonical_measurement_selection_version_identifier",
        "c",
        "CHECK (selection_version::text ~ '^[A-Za-z0-9._-]{1,128}$'::text)",
        False,
        False,
    ),
    (
        "canonical_measurement",
        "ck_canonical_measurement_superseded_at_order",
        "c",
        "CHECK (superseded_at IS NULL OR superseded_at >= selected_at)",
        False,
        False,
    ),
    (
        "canonical_measurement",
        "fk_canonical_measurement_measurement_entity_quantity",
        "f",
        "FOREIGN KEY (measurement_id, entity_id, quantity_id) "
        "REFERENCES measurement(id, entity_id, quantity_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT",
        False,
        False,
    ),
    (
        "canonical_measurement",
        "pk_canonical_measurement",
        "p",
        "PRIMARY KEY (id)",
        False,
        False,
    ),
    (
        "measurement",
        "ck_measurement_value_numeric_finite",
        "c",
        "CHECK (value_numeric <> ALL "
        "(ARRAY['NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric]))",
        False,
        False,
    ),
    (
        "measurement",
        "fk_measurement_quantity_unit",
        "f",
        "FOREIGN KEY (quantity_id, unit_id) "
        "REFERENCES quantity_unit(quantity_id, unit_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT",
        False,
        False,
    ),
    (
        "measurement",
        "fk_measurement_source_record_entity",
        "f",
        "FOREIGN KEY (source_record_id, entity_id) "
        "REFERENCES source_record(id, canonical_entity_id) "
        "ON UPDATE RESTRICT ON DELETE RESTRICT",
        False,
        False,
    ),
    ("measurement", "pk_measurement", "p", "PRIMARY KEY (id)", False, False),
    (
        "measurement",
        "uq_measurement_id_entity_id_quantity_id",
        "u",
        "UNIQUE (id, entity_id, quantity_id)",
        False,
        False,
    ),
    (
        "quantity",
        "ck_quantity_code_identifier",
        "c",
        "CHECK (code::text ~ '^[A-Za-z0-9._-]{1,128}$'::text)",
        False,
        False,
    ),
    (
        "quantity",
        "ck_quantity_name_nonempty",
        "c",
        "CHECK (name = btrim(name) AND length(name) > 0)",
        False,
        False,
    ),
    ("quantity", "pk_quantity", "p", "PRIMARY KEY (id)", False, False),
    ("quantity", "uq_quantity_code", "u", "UNIQUE (code)", False, False),
    (
        "quantity_unit",
        "fk_quantity_unit_quantity",
        "f",
        "FOREIGN KEY (quantity_id) REFERENCES quantity(id) ON UPDATE RESTRICT ON DELETE RESTRICT",
        False,
        False,
    ),
    (
        "quantity_unit",
        "fk_quantity_unit_unit",
        "f",
        "FOREIGN KEY (unit_id) REFERENCES unit(id) ON UPDATE RESTRICT ON DELETE RESTRICT",
        False,
        False,
    ),
    (
        "quantity_unit",
        "pk_quantity_unit",
        "p",
        "PRIMARY KEY (quantity_id, unit_id)",
        False,
        False,
    ),
    (
        "unit",
        "ck_unit_code_identifier",
        "c",
        "CHECK (code::text ~ '^[A-Za-z0-9._-]{1,128}$'::text)",
        False,
        False,
    ),
    (
        "unit",
        "ck_unit_name_nonempty",
        "c",
        "CHECK (name = btrim(name) AND length(name) > 0)",
        False,
        False,
    ),
    (
        "unit",
        "ck_unit_symbol_nonempty",
        "c",
        "CHECK (symbol = btrim(symbol) AND length(symbol) > 0)",
        False,
        False,
    ),
    ("unit", "pk_unit", "p", "PRIMARY KEY (id)", False, False),
    ("unit", "uq_unit_code", "u", "UNIQUE (code)", False, False),
}

_EXPECTED_INDEXES = {
    (
        "canonical_measurement",
        "ix_canonical_measurement_measurement_id_entity_id_quantity_id",
        False,
        False,
        "CREATE INDEX ix_canonical_measurement_measurement_id_entity_id_quantity_id "
        "ON public.canonical_measurement USING btree (measurement_id, entity_id, quantity_id)",
        "<none>",
    ),
    (
        "canonical_measurement",
        "pk_canonical_measurement",
        True,
        True,
        "CREATE UNIQUE INDEX pk_canonical_measurement "
        "ON public.canonical_measurement USING btree (id)",
        "<none>",
    ),
    (
        "canonical_measurement",
        "uq_canonical_measurement_active_entity_id_quantity_id",
        True,
        False,
        "CREATE UNIQUE INDEX uq_canonical_measurement_active_entity_id_quantity_id "
        "ON public.canonical_measurement USING btree (entity_id, quantity_id) "
        "WHERE (superseded_at IS NULL)",
        "(superseded_at IS NULL)",
    ),
    (
        "measurement",
        "ix_measurement_quantity_id_unit_id",
        False,
        False,
        "CREATE INDEX ix_measurement_quantity_id_unit_id "
        "ON public.measurement USING btree (quantity_id, unit_id)",
        "<none>",
    ),
    (
        "measurement",
        "ix_measurement_source_record_id_entity_id",
        False,
        False,
        "CREATE INDEX ix_measurement_source_record_id_entity_id "
        "ON public.measurement USING btree (source_record_id, entity_id)",
        "<none>",
    ),
    (
        "measurement",
        "pk_measurement",
        True,
        True,
        "CREATE UNIQUE INDEX pk_measurement ON public.measurement USING btree (id)",
        "<none>",
    ),
    (
        "measurement",
        "uq_measurement_id_entity_id_quantity_id",
        True,
        False,
        "CREATE UNIQUE INDEX uq_measurement_id_entity_id_quantity_id "
        "ON public.measurement USING btree (id, entity_id, quantity_id)",
        "<none>",
    ),
    (
        "quantity",
        "pk_quantity",
        True,
        True,
        "CREATE UNIQUE INDEX pk_quantity ON public.quantity USING btree (id)",
        "<none>",
    ),
    (
        "quantity",
        "uq_quantity_code",
        True,
        False,
        "CREATE UNIQUE INDEX uq_quantity_code ON public.quantity USING btree (code)",
        "<none>",
    ),
    (
        "quantity_unit",
        "pk_quantity_unit",
        True,
        True,
        "CREATE UNIQUE INDEX pk_quantity_unit "
        "ON public.quantity_unit USING btree (quantity_id, unit_id)",
        "<none>",
    ),
    (
        "unit",
        "pk_unit",
        True,
        True,
        "CREATE UNIQUE INDEX pk_unit ON public.unit USING btree (id)",
        "<none>",
    ),
    (
        "unit",
        "uq_unit_code",
        True,
        False,
        "CREATE UNIQUE INDEX uq_unit_code ON public.unit USING btree (code)",
        "<none>",
    ),
}


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
    expected = {*_PUBLIC_TABLES, *catalog_tables}
    if actual != expected:
        _fail()


def _assert_source_record_entity_unique(connection: Connection, *, present: bool) -> None:
    definition = connection.execute(
        sa.text(
            "SELECT pg_get_constraintdef(constraint_data.oid, true) "
            "FROM pg_constraint AS constraint_data "
            "WHERE constraint_data.conrelid = 'public.source_record'::regclass "
            "AND constraint_data.conname = :constraint_name "
            "AND constraint_data.contype = 'u'"
        ),
        {"constraint_name": _SOURCE_RECORD_ENTITY_UNIQUE},
    ).scalar_one_or_none()
    expected = "UNIQUE (id, canonical_entity_id)" if present else None
    if definition != expected:
        _fail()


def _assert_phase1a1_schema(connection: Connection, *, with_source_key: bool) -> None:
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
            {"tables": list(_PHASE_1A1_TABLES)},
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
            {"tables": list(_PHASE_1A1_TABLES)},
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
            {"tables": list(_PHASE_1A1_TABLES)},
        )
    )
    digest = sha256(repr((columns, constraints, indexes)).encode()).hexdigest()
    expected = (
        _PHASE_1A1_WITH_SOURCE_KEY_SCHEMA_SHA256 if with_source_key else _PHASE_1A1_SCHEMA_SHA256
    )
    if digest != expected:
        _fail()


def _assert_phase1a2_schema(connection: Connection) -> None:
    columns = {
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
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            ),
            {"tables": list(_PHASE_1A2_TABLES)},
        )
    }
    constraints = {
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
                "AND constraint_data.contype IN ('p', 'u', 'c', 'f')"
            ),
            {"tables": list(_PHASE_1A2_TABLES)},
        )
    }
    indexes = {
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
                "AND table_data.relname = ANY(CAST(:tables AS text[]))"
            ),
            {"tables": list(_PHASE_1A2_TABLES)},
        )
    }
    if (
        columns != _EXPECTED_COLUMNS
        or constraints != _EXPECTED_CONSTRAINTS
        or indexes != _EXPECTED_INDEXES
    ):
        _fail()


def _assert_catalog_acl(
    connection: Connection,
    identity: MigrationIdentity,
    tables: tuple[str, ...],
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

    non_owner_table_acl = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "CROSS JOIN LATERAL aclexplode("
            "COALESCE(table_data.relacl, acldefault('r', table_data.relowner))"
            ") AS privilege "
            "WHERE namespace.nspname = 'public' "
            "AND table_data.relname = ANY(CAST(:tables AS text[])) "
            "AND privilege.grantee <> table_data.relowner"
        ),
        {"tables": list(tables)},
    ).scalar_one()
    non_owner_column_acl = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
            "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
            "WHERE namespace.nspname = 'public' "
            "AND table_data.relname = ANY(CAST(:tables AS text[])) "
            "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
            "AND privilege.grantee <> table_data.relowner"
        ),
        {"tables": list(tables)},
    ).scalar_one()
    if non_owner_table_acl != 0 or non_owner_column_acl != 0:
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
            "tables": list(tables),
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
            "tables": list(tables),
            "privileges": list(_ALL_COLUMN_PRIVILEGES),
            "role": identity.runtime_role,
        },
    ).scalar_one()
    if effective_table_acl != 0 or effective_column_acl != 0:
        _fail()


def _revoke_non_owner_access(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    for table in _PHASE_1A2_TABLES:
        quoted_table = preparer.quote(table)
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM PUBLIC"
        )
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM {quoted_role}"
        )


def upgrade() -> None:
    """Add explicit unit compatibility and source-backed numeric measurements."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_table_catalogue(connection, _PHASE_1A1_TABLES)
    _assert_catalog_acl(connection, identity, _PHASE_1A1_TABLES)
    _assert_source_record_entity_unique(connection, present=False)
    _assert_phase1a1_schema(connection, with_source_key=False)

    op.create_unique_constraint(
        _SOURCE_RECORD_ENTITY_UNIQUE,
        "source_record",
        ["id", "canonical_entity_id"],
    )
    op.create_table(
        "quantity",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_quantity"),
        sa.UniqueConstraint("code", name="uq_quantity_code"),
        sa.CheckConstraint(f"code ~ '{_STABLE_TOKEN_PATTERN}'", name="ck_quantity_code_identifier"),
        sa.CheckConstraint(
            "name = btrim(name) AND length(name) > 0", name="ck_quantity_name_nonempty"
        ),
    )
    op.create_table(
        "unit",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("symbol", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_unit"),
        sa.UniqueConstraint("code", name="uq_unit_code"),
        sa.CheckConstraint(f"code ~ '{_STABLE_TOKEN_PATTERN}'", name="ck_unit_code_identifier"),
        sa.CheckConstraint(
            "symbol = btrim(symbol) AND length(symbol) > 0", name="ck_unit_symbol_nonempty"
        ),
        sa.CheckConstraint("name = btrim(name) AND length(name) > 0", name="ck_unit_name_nonempty"),
    )
    op.create_table(
        "quantity_unit",
        sa.Column("quantity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("quantity_id", "unit_id", name="pk_quantity_unit"),
        sa.ForeignKeyConstraint(
            ["quantity_id"],
            ["quantity.id"],
            name="fk_quantity_unit_quantity",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["unit_id"],
            ["unit.id"],
            name="fk_quantity_unit_unit",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
    )
    op.create_table(
        "measurement",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_record_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("value_numeric", sa.Numeric(), nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_measurement"),
        sa.UniqueConstraint(
            "id",
            "entity_id",
            "quantity_id",
            name="uq_measurement_id_entity_id_quantity_id",
        ),
        sa.ForeignKeyConstraint(
            ["source_record_id", "entity_id"],
            ["source_record.id", "source_record.canonical_entity_id"],
            name="fk_measurement_source_record_entity",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["quantity_id", "unit_id"],
            ["quantity_unit.quantity_id", "quantity_unit.unit_id"],
            name="fk_measurement_quantity_unit",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.CheckConstraint(
            "value_numeric NOT IN ('NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric)",
            name="ck_measurement_value_numeric_finite",
        ),
    )
    op.create_index(
        "ix_measurement_source_record_id_entity_id",
        "measurement",
        ["source_record_id", "entity_id"],
        unique=False,
    )
    op.create_index(
        "ix_measurement_quantity_id_unit_id",
        "measurement",
        ["quantity_id", "unit_id"],
        unique=False,
    )
    op.create_table(
        "canonical_measurement",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("measurement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "selection_rule",
            sa.String(length=128, collation="C"),
            nullable=False,
        ),
        sa.Column(
            "selection_version",
            sa.String(length=128, collation="C"),
            nullable=False,
        ),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column(
            "selected_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("superseded_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_canonical_measurement"),
        sa.ForeignKeyConstraint(
            ["measurement_id", "entity_id", "quantity_id"],
            ["measurement.id", "measurement.entity_id", "measurement.quantity_id"],
            name="fk_canonical_measurement_measurement_entity_quantity",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.CheckConstraint(
            f"selection_rule ~ '{_STABLE_TOKEN_PATTERN}'",
            name="ck_canonical_measurement_selection_rule_identifier",
        ),
        sa.CheckConstraint(
            f"selection_version ~ '{_STABLE_TOKEN_PATTERN}'",
            name="ck_canonical_measurement_selection_version_identifier",
        ),
        sa.CheckConstraint(
            "explanation = btrim(explanation) AND length(explanation) > 0",
            name="ck_canonical_measurement_explanation_nonempty",
        ),
        sa.CheckConstraint(
            "superseded_at IS NULL OR superseded_at >= selected_at",
            name="ck_canonical_measurement_superseded_at_order",
        ),
    )
    op.create_index(
        "ix_canonical_measurement_measurement_id_entity_id_quantity_id",
        "canonical_measurement",
        ["measurement_id", "entity_id", "quantity_id"],
        unique=False,
    )
    op.create_index(
        "uq_canonical_measurement_active_entity_id_quantity_id",
        "canonical_measurement",
        ["entity_id", "quantity_id"],
        unique=True,
        postgresql_where=sa.text("superseded_at IS NULL"),
    )

    _revoke_non_owner_access(connection, identity)
    _assert_table_catalogue(connection, _TABLES)
    _assert_source_record_entity_unique(connection, present=True)
    _assert_phase1a1_schema(connection, with_source_key=True)
    _assert_phase1a2_schema(connection)
    _assert_catalog_acl(connection, identity, _TABLES)


def downgrade() -> None:
    """Remove exactly the Phase 1A2 measurement additions after validation."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    _assert_revision(connection, revision)
    _assert_table_catalogue(connection, _TABLES)
    _assert_source_record_entity_unique(connection, present=True)
    _assert_phase1a1_schema(connection, with_source_key=True)
    _assert_phase1a2_schema(connection)
    _assert_catalog_acl(connection, identity, _TABLES)

    op.drop_index(
        "uq_canonical_measurement_active_entity_id_quantity_id", table_name="canonical_measurement"
    )
    op.drop_index(
        "ix_canonical_measurement_measurement_id_entity_id_quantity_id",
        table_name="canonical_measurement",
    )
    op.drop_table("canonical_measurement")
    op.drop_index("ix_measurement_quantity_id_unit_id", table_name="measurement")
    op.drop_index("ix_measurement_source_record_id_entity_id", table_name="measurement")
    op.drop_table("measurement")
    op.drop_table("quantity_unit")
    op.drop_table("unit")
    op.drop_table("quantity")
    op.drop_constraint(_SOURCE_RECORD_ENTITY_UNIQUE, "source_record", type_="unique")

    _assert_table_catalogue(connection, _PHASE_1A1_TABLES)
    _assert_source_record_entity_unique(connection, present=False)
    _assert_phase1a1_schema(connection, with_source_key=False)
    _assert_catalog_acl(connection, identity, _PHASE_1A1_TABLES)
