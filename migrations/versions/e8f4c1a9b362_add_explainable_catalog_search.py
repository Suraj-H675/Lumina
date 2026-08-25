"""Add explainable catalogue-search storage and deterministic indexes.

Revision ID: e8f4c1a9b362
Revises: b7f3a2c81d4e
Create Date: 2026-08-22

The owner must provision ``pg_trgm 1.6`` in the public schema before this
revision runs.  The migration never creates or drops an extension.
"""

from __future__ import annotations

import unicodedata
from collections.abc import Callable
from typing import NoReturn
from uuid import UUID

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "e8f4c1a9b362"
down_revision = "b7f3a2c81d4e"
branch_labels = None
depends_on = None

_SAFE_ERROR = "Explainable catalogue search migration precondition failed."
_MIGRATION_WAIT_TIMEOUT = "5s"
_UNICODE_VERSION = "15.0.0"
_MAX_NORMALIZED_CODEPOINTS = 255
_PG_TRGM_OWNER_CONTRACT = ("pg_trgm", "1.6", "public", "lumina_admin")
_B2_PUBLIC_TABLES = frozenset(
    {
        "alembic_version",
        "canonical_measurement",
        "dataset",
        "entity",
        "entity_alias",
        "entity_alias_evidence",
        "ingestion_conflict",
        "job",
        "measurement",
        "provider",
        "quantity",
        "quantity_unit",
        "source_record",
        "unit",
    }
)
_ALL_TABLE_PRIVILEGES = (
    "DELETE",
    "INSERT",
    "REFERENCES",
    "SELECT",
    "TRIGGER",
    "TRUNCATE",
    "UPDATE",
)
_EXPECTED_COLUMNS = {
    "entity": (
        "id",
        "entity_type",
        "canonical_name",
        "created_at",
        "slug",
    ),
    "entity_alias": (
        "id",
        "entity_id",
        "alias",
        "normalized_alias",
        "normalization_version",
        "alias_type",
        "catalog_name",
        "language",
    ),
    "entity_alias_evidence": (
        "alias_id",
        "entity_id",
        "source_record_id",
    ),
}
_B2_ENTITY_CONSTRAINTS = frozenset(
    {
        "ck_entity_canonical_name_nonempty",
        "ck_entity_slug_format",
        "ck_entity_type",
        "pk_entity",
        "uq_entity_slug",
    }
)
_B2_ENTITY_INDEXES = frozenset({"pk_entity", "uq_entity_slug"})
_B3_ENTITY_CONSTRAINTS = _B2_ENTITY_CONSTRAINTS | {
    "ck_entity_canonical_name_normalization_version",
    "ck_entity_normalized_canonical_name",
}
_B3_ENTITY_INDEXES = _B2_ENTITY_INDEXES | {
    "ix_entity_normalized_canonical_name_prefix",
    "ix_entity_normalized_canonical_name_trgm",
}
_ALIAS_CONSTRAINT_NAMES = frozenset(
    {
        "ck_entity_alias_alias",
        "ck_entity_alias_catalog_name",
        "ck_entity_alias_language",
        "ck_entity_alias_normalization_version",
        "ck_entity_alias_normalized_alias",
        "ck_entity_alias_type",
        "fk_entity_alias_entity",
        "pk_entity_alias",
        "uq_entity_alias_id_entity_id",
        "uq_entity_alias_normalized_entity",
    }
)
_EVIDENCE_CONSTRAINT_NAMES = frozenset(
    {
        "fk_entity_alias_evidence_alias_entity",
        "fk_entity_alias_evidence_source_record_entity",
        "pk_entity_alias_evidence",
    }
)
_B2_INDEXES = {
    "entity": _B2_ENTITY_INDEXES,
    "entity_alias": frozenset(
        {
            "pk_entity_alias",
            "uq_entity_alias_id_entity_id",
            "uq_entity_alias_normalized_entity",
        }
    ),
    "entity_alias_evidence": frozenset({"pk_entity_alias_evidence"}),
}
_B3_INDEXES = {
    **_B2_INDEXES,
    "entity": _B3_ENTITY_INDEXES,
    "entity_alias": _B2_INDEXES["entity_alias"]
    | {
        "ix_entity_alias_normalized_alias_trgm",
    },
}
_B2_CONSTRAINTS = {
    "entity": _B2_ENTITY_CONSTRAINTS,
    "entity_alias": _ALIAS_CONSTRAINT_NAMES,
    "entity_alias_evidence": _EVIDENCE_CONSTRAINT_NAMES,
}
_EXPECTED_CONSTRAINTS = _B2_CONSTRAINTS
_EXPECTED_INDEXES = _B2_INDEXES
_B3_CONSTRAINTS = {
    **_B2_CONSTRAINTS,
    "entity": _B3_ENTITY_CONSTRAINTS,
}


class _FrozenNormalizerError(ValueError):
    """Raised only when persisted data cannot be reproduced by frozen V1."""


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


def _backfill_and_verify(connection: Connection) -> None:
    rows = list(connection.execute(sa.text("SELECT id, canonical_name FROM public.entity")))
    updates: list[dict[str, object]] = []
    seen: set[UUID] = set()
    for entity_id, canonical_name in rows:
        identifier = entity_id if isinstance(entity_id, UUID) else UUID(str(entity_id))
        if identifier in seen or type(canonical_name) is not str:
            _fail()
        seen.add(identifier)
        updates.append({"id": identifier, "value": _frozen_v1(canonical_name)})
    connection.execute(
        sa.text("UPDATE public.entity SET normalized_canonical_name = :value WHERE id = :id"),
        updates,
    )
    if connection.execute(
        sa.text("SELECT count(*) FROM public.entity WHERE normalized_canonical_name IS NULL")
    ).scalar_one():
        _fail()


def _contains_category_c(value: str) -> bool:
    return any(unicodedata.category(character).startswith("C") for character in value)


def _collapse_unicode_whitespace(value: str) -> str:
    collapsed: list[str] = []
    in_whitespace = False
    for character in value:
        if character.isspace():
            if not in_whitespace:
                collapsed.append(" ")
            in_whitespace = True
        else:
            collapsed.append(character)
            in_whitespace = False
    return "".join(collapsed).strip(" ")


def _frozen_v1(raw: str) -> str:
    """Derive reviewed version-1 normalized text without importing application code."""
    if unicodedata.unidata_version != _UNICODE_VERSION:
        raise _FrozenNormalizerError()
    if not raw or _contains_category_c(raw):
        raise _FrozenNormalizerError()
    normalized = unicodedata.normalize("NFKC", raw).casefold()
    normalized = _collapse_unicode_whitespace(normalized)
    if not normalized or len(normalized) > _MAX_NORMALIZED_CODEPOINTS:
        raise _FrozenNormalizerError()
    if _contains_category_c(normalized):
        raise _FrozenNormalizerError()
    return normalized


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
            "rolreplication, rolbypassrls FROM pg_roles WHERE rolname = :role"
        ),
        {"role": role_name},
    ).one_or_none()
    if flags is None or tuple(flags) != (True, False, False, False, False, False):
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
    _assert_role_has_safe_properties(connection, identity.runtime_role)
    unsafe_capabilities = connection.execute(
        sa.text(
            "SELECT has_database_privilege(:role, current_database(), 'TEMP') "
            "OR has_database_privilege(:role, current_database(), 'CREATE') "
            "OR has_schema_privilege(:role, 'public', 'CREATE')"
        ),
        {"role": identity.runtime_role},
    ).scalar_one()
    if unsafe_capabilities:
        _fail()


def _configure_timeouts(connection: Connection) -> None:
    connection.execute(
        sa.text(
            "SELECT set_config('statement_timeout', :timeout, true), "
            "set_config('lock_timeout', :timeout, true)"
        ),
        {"timeout": _MIGRATION_WAIT_TIMEOUT},
    ).one()


def _assert_revision(connection: Connection, expected: str) -> None:
    if (
        connection.execute(
            sa.text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none()
        != expected
    ):
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
    expected_revision: str,
    verify: Callable[[Connection, MigrationIdentity], None],
) -> None:
    try:
        _assert_role_is_safe(connection, identity)
        _configure_timeouts(connection)
        _lock_tables(connection, ("entity", "entity_alias"), "ACCESS EXCLUSIVE")
        _assert_revision(connection, expected_revision)
        verify(connection, identity)
    except sa.exc.SQLAlchemyError:
        _fail()


def _pg_trgm_state(connection: Connection) -> tuple[object, ...] | None:
    rows = tuple(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT extension.extname, extension.extversion, namespace.nspname, "
                "pg_get_userbyid(extension.extowner) "
                "FROM pg_extension AS extension "
                "JOIN pg_namespace AS namespace ON namespace.oid = extension.extnamespace "
                "WHERE extension.extname = 'pg_trgm'"
            )
        )
    )
    if len(rows) > 1:
        _fail()
    return rows[0] if rows else None


def _require_pg_trgm(connection: Connection) -> None:
    if _pg_trgm_state(connection) != _PG_TRGM_OWNER_CONTRACT:
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
                "COALESCE(table_data.relacl, acldefault('r', table_data.relowner)) "
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


def _effective_table_privileges(
    connection: Connection,
    identity: MigrationIdentity,
    *,
    privileges: tuple[str, ...],
    table: str,
) -> set[str]:
    return {
        str(privilege)
        for privilege in connection.execute(
            sa.text(
                "SELECT privilege_name FROM unnest(CAST(:privileges AS text[])) "
                "AS privileges(privilege_name) "
                "WHERE has_table_privilege("
                "CAST(:role AS text), format('public.%I', CAST(:table AS text)), "
                "privilege_name)"
            ),
            {"privileges": list(privileges), "role": identity.runtime_role, "table": table},
        ).scalars()
    }


def _assert_public_tables(connection: Connection) -> None:
    if _table_names(connection) != _B2_PUBLIC_TABLES:
        _fail()


def _assert_owners(connection: Connection, identity: MigrationIdentity) -> None:
    owners = set(
        connection.execute(
            sa.text(
                "SELECT table_data.relname, pg_get_userbyid(table_data.relowner) "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relkind = 'r'"
            )
        )
    )
    if owners != {(table, identity.migration_role) for table in _B2_PUBLIC_TABLES}:
        _fail()


def _assert_b2_schema_and_acl(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_public_tables(connection)
    if {
        table: _table_columns(connection, table) for table in _EXPECTED_COLUMNS
    } != _EXPECTED_COLUMNS:
        _fail()
    expected_constraints = {table: set(names) for table, names in _EXPECTED_CONSTRAINTS.items()}
    if {table: _constraint_names(connection, table) for table in expected_constraints} != (
        expected_constraints
    ):
        _fail()
    expected_indexes = {table: set(names) for table, names in _EXPECTED_INDEXES.items()}
    if {table: _index_names(connection, table) for table in expected_indexes} != expected_indexes:
        _fail()
    actual_acl = _catalog_acl_rows(connection, ("entity_alias", "entity_alias_evidence"))
    if actual_acl:
        _fail()
    if _effective_table_privileges(
        connection,
        identity,
        privileges=_ALL_TABLE_PRIVILEGES,
        table="entity_alias",
    ):
        _fail()
    if _effective_table_privileges(
        connection,
        identity,
        privileges=_ALL_TABLE_PRIVILEGES,
        table="entity_alias_evidence",
    ):
        _fail()


def _assert_b3_delta(connection: Connection, identity: MigrationIdentity) -> None:
    b3_columns = dict(_EXPECTED_COLUMNS)
    b3_columns["entity"] = (
        *_EXPECTED_COLUMNS["entity"],
        "normalized_canonical_name",
        "canonical_name_normalization_version",
    )
    if {table: _table_columns(connection, table) for table in b3_columns} != b3_columns:
        _fail()
    expected_constraints = {table: set(names) for table, names in _B3_CONSTRAINTS.items()}
    if {table: _constraint_names(connection, table) for table in expected_constraints} != (
        expected_constraints
    ):
        _fail()
    expected_indexes = {table: set(names) for table, names in _B3_INDEXES.items()}
    if {table: _index_names(connection, table) for table in expected_indexes} != expected_indexes:
        _fail()
    actual_acl = _catalog_acl_rows(connection, ("entity_alias", "entity_alias_evidence"))
    expected_acl = tuple(
        (table, identity.migration_role, identity.runtime_role, privilege, False)
        for table, privileges in (("entity_alias", ("SELECT",)), ("entity_alias_evidence", ()))
        for privilege in privileges
    )
    if actual_acl != expected_acl:
        _fail()
    if _effective_table_privileges(
        connection,
        identity,
        privileges=_ALL_TABLE_PRIVILEGES,
        table="entity_alias",
    ) != {"SELECT"}:
        _fail()
    if _effective_table_privileges(
        connection,
        identity,
        privileges=_ALL_TABLE_PRIVILEGES,
        table="entity_alias_evidence",
    ):
        _fail()


def _pg_trgm_absent(connection: Connection) -> None:
    if _pg_trgm_state(connection) is not None:
        _fail()


def _verify_b2_state(connection: Connection, identity: MigrationIdentity) -> None:
    _assert_b2_schema_and_acl(connection, identity)


def _verify_upgraded_state(connection: Connection, identity: MigrationIdentity) -> None:
    _require_pg_trgm(connection)
    _assert_b3_delta(connection, identity)


def upgrade() -> None:
    """Add search columns after exact B2 and owner-provisioned pg_trgm validation."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _run_preconditions(
        connection,
        identity,
        expected_revision="b7f3a2c81d4e",
        verify=_verify_b2_state,
    )
    _require_pg_trgm(connection)
    op.add_column(
        "entity",
        sa.Column(
            "normalized_canonical_name",
            sa.Text(collation="C"),
            nullable=True,
        ),
    )
    op.add_column(
        "entity",
        sa.Column("canonical_name_normalization_version", sa.SmallInteger(), nullable=True),
    )
    _backfill_and_verify(connection)
    connection.execute(sa.text("UPDATE public.entity SET canonical_name_normalization_version = 1"))
    op.create_check_constraint(
        "ck_entity_normalized_canonical_name",
        "entity",
        "char_length(normalized_canonical_name) >= 1 "
        "AND char_length(normalized_canonical_name) <= 255 "
        "AND normalized_canonical_name = btrim(normalized_canonical_name, ' ') "
        "AND strpos(normalized_canonical_name, '  ') = 0 "
        "AND (normalized_canonical_name COLLATE \"C\") !~ '[[:cntrl:]]'",
    )
    op.create_check_constraint(
        "ck_entity_canonical_name_normalization_version",
        "entity",
        "canonical_name_normalization_version = 1",
    )
    op.alter_column("entity", "normalized_canonical_name", nullable=False)
    op.alter_column("entity", "canonical_name_normalization_version", nullable=False)
    op.create_index(
        "ix_entity_normalized_canonical_name_prefix",
        "entity",
        [sa.text('normalized_canonical_name COLLATE "C" text_pattern_ops')],
        unique=False,
    )
    op.create_index(
        "ix_entity_normalized_canonical_name_trgm",
        "entity",
        [sa.text("normalized_canonical_name gin_trgm_ops")],
        unique=False,
        postgresql_using="gin",
    )
    op.create_index(
        "ix_entity_alias_normalized_alias_trgm",
        "entity_alias",
        [sa.text("normalized_alias gin_trgm_ops")],
        unique=False,
        postgresql_using="gin",
    )
    preparer = connection.dialect.identifier_preparer
    connection.exec_driver_sql(
        f"GRANT SELECT ON public.entity_alias TO {preparer.quote(identity.runtime_role)}"
    )
    _verify_upgraded_state(connection, identity)


def downgrade() -> None:
    """Remove B3 storage while preserving the owner-provisioned pg_trgm extension."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _run_preconditions(
        connection,
        identity,
        expected_revision=revision,
        verify=lambda current, current_identity: _verify_upgraded_state(current, current_identity),
    )
    _require_pg_trgm(connection)
    preparer = connection.dialect.identifier_preparer
    connection.exec_driver_sql(
        f"REVOKE SELECT ON public.entity_alias FROM {preparer.quote(identity.runtime_role)}"
    )
    for name in reversed(
        (
            "ix_entity_normalized_canonical_name_prefix",
            "ix_entity_normalized_canonical_name_trgm",
            "ix_entity_alias_normalized_alias_trgm",
        )
    ):
        table = "entity_alias" if name == "ix_entity_alias_normalized_alias_trgm" else "entity"
        op.drop_index(name, table_name=table)
    op.drop_constraint(
        "ck_entity_canonical_name_normalization_version",
        "entity",
        type_="check",
    )
    op.drop_constraint(
        "ck_entity_normalized_canonical_name",
        "entity",
        type_="check",
    )
    op.alter_column("entity", "canonical_name_normalization_version", nullable=True)
    op.alter_column("entity", "normalized_canonical_name", nullable=True)
    rows = list(
        connection.execute(sa.text("SELECT id, normalized_canonical_name FROM public.entity"))
    )
    for entity_id, normalized in rows:
        identifier = entity_id if isinstance(entity_id, UUID) else UUID(str(entity_id))
        try:
            canonical_name = str(
                connection.execute(
                    sa.text("SELECT canonical_name FROM public.entity WHERE id = :id"),
                    {"id": identifier},
                ).scalar_one()
            )
        except (sa.exc.SQLAlchemyError, ValueError):
            _fail()
        if type(normalized) is not str or normalized != _frozen_v1(canonical_name):
            _fail()
    op.drop_column("entity", "canonical_name_normalization_version")
    op.drop_column("entity", "normalized_canonical_name")
    _verify_downgraded_state(connection, identity)


def _verify_downgraded_state(connection: Connection, identity: MigrationIdentity) -> None:
    if _pg_trgm_state(connection) != _PG_TRGM_OWNER_CONTRACT:
        _fail()
    _assert_b2_schema_and_acl(connection, identity)
