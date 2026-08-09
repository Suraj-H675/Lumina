"""Create the Phase 1A1 catalog identity and provenance substrate.

Revision ID: d502b5935120
Revises: 0002_grant_job_runtime_dml
Create Date: 2026-08-09
"""

from __future__ import annotations

from typing import NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "d502b5935120"
down_revision = "0002_grant_job_runtime_dml"
branch_labels = None
depends_on = None

_TABLES = ("provider", "entity", "dataset", "source_record")
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
_SAFE_ERROR = "Catalog ACL migration precondition failed."


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


def _assert_catalog_acl(connection: Connection, identity: MigrationIdentity) -> None:
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
            {"tables": list(_TABLES)},
        )
    )
    if owners != {(table, identity.migration_role) for table in _TABLES}:
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
        {"tables": list(_TABLES)},
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
        {"tables": list(_TABLES)},
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
            "tables": list(_TABLES),
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
            "tables": list(_TABLES),
            "privileges": list(_ALL_COLUMN_PRIVILEGES),
            "role": identity.runtime_role,
        },
    ).scalar_one()
    if effective_table_acl != 0 or effective_column_acl != 0:
        _fail()


def _revoke_non_owner_access(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    for table in _TABLES:
        quoted_table = preparer.quote(table)
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM PUBLIC"
        )
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM {quoted_role}"
        )


def upgrade() -> None:
    """Create only the FK-closed Phase 1A1 identity and provenance tables."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)

    op.create_table(
        "provider",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("documentation_url", sa.Text(), nullable=False),
        sa.Column("terms_url", sa.Text(), nullable=False),
        sa.Column("attribution_text", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_provider"),
        sa.UniqueConstraint("code", name="uq_provider_code"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9._-]{1,128}$'", name="ck_provider_code_identifier"),
        sa.CheckConstraint(
            "name = btrim(name) AND length(name) > 0", name="ck_provider_name_nonempty"
        ),
        sa.CheckConstraint(
            "documentation_url = btrim(documentation_url) AND length(documentation_url) > 0",
            name="ck_provider_documentation_url_nonempty",
        ),
        sa.CheckConstraint(
            "terms_url = btrim(terms_url) AND length(terms_url) > 0",
            name="ck_provider_terms_url_nonempty",
        ),
        sa.CheckConstraint(
            "attribution_text = btrim(attribution_text) AND length(attribution_text) > 0",
            name="ck_provider_attribution_text_nonempty",
        ),
    )
    op.create_table(
        "entity",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_type", sa.String(length=32), nullable=False),
        sa.Column("canonical_name", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_entity"),
        sa.CheckConstraint(
            "entity_type IN ("
            "'star', 'planet', 'dwarf_planet', 'moon', 'asteroid', 'comet', "
            "'exoplanet', 'galaxy', 'nebula', 'cluster', 'black_hole', "
            "'compact_object', 'system', 'constellation', 'mission', 'spacecraft', "
            "'launch_vehicle', 'observatory', 'person', 'concept', 'event'"
            ")",
            name="ck_entity_type",
        ),
        sa.CheckConstraint(
            "canonical_name = btrim(canonical_name) AND length(canonical_name) > 0",
            name="ck_entity_canonical_name_nonempty",
        ),
    )
    op.create_table(
        "dataset",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("release_version", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=False),
        sa.Column("licence", sa.Text(), nullable=False),
        sa.Column("citation", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_dataset"),
        sa.ForeignKeyConstraint(
            ["provider_id"],
            ["provider.id"],
            name="fk_dataset_provider",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.UniqueConstraint(
            "provider_id",
            "code",
            "release_version",
            name="uq_dataset_provider_code_release_version",
        ),
        sa.UniqueConstraint("id", "provider_id", name="uq_dataset_id_provider_id"),
        sa.CheckConstraint("code ~ '^[A-Za-z0-9._-]{1,128}$'", name="ck_dataset_code_identifier"),
        sa.CheckConstraint(
            "name = btrim(name) AND length(name) > 0", name="ck_dataset_name_nonempty"
        ),
        sa.CheckConstraint(
            "release_version ~ '^[A-Za-z0-9._-]{1,128}$'",
            name="ck_dataset_release_version_identifier",
        ),
        sa.CheckConstraint(
            "source_url = btrim(source_url) AND length(source_url) > 0",
            name="ck_dataset_source_url_nonempty",
        ),
        sa.CheckConstraint(
            "licence = btrim(licence) AND length(licence) > 0",
            name="ck_dataset_licence_nonempty",
        ),
        sa.CheckConstraint(
            "citation = btrim(citation) AND length(citation) > 0",
            name="ck_dataset_citation_nonempty",
        ),
    )
    op.create_table(
        "source_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dataset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider_record_id", sa.Text(collation="C"), nullable=False),
        sa.Column("provider_version", sa.Text(collation="C"), nullable=False),
        sa.Column("canonical_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("fetched_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_source_record"),
        sa.ForeignKeyConstraint(
            ["dataset_id", "provider_id"],
            ["dataset.id", "dataset.provider_id"],
            name="fk_source_record_dataset_provider",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["canonical_entity_id"],
            ["entity.id"],
            name="fk_source_record_canonical_entity",
            ondelete="RESTRICT",
            onupdate="RESTRICT",
        ),
        sa.UniqueConstraint(
            "dataset_id",
            "provider_id",
            "provider_record_id",
            "provider_version",
            name="uq_source_record_dataset_provider_record_version",
        ),
        sa.CheckConstraint(
            "length(provider_record_id) > 0",
            name="ck_source_record_provider_record_id_nonempty",
        ),
        sa.CheckConstraint(
            "length(provider_version) > 0",
            name="ck_source_record_provider_version_nonempty",
        ),
        sa.CheckConstraint(
            "source_url IS NULL OR (source_url = btrim(source_url) AND length(source_url) > 0)",
            name="ck_source_record_source_url_nonempty",
        ),
    )
    op.create_index(
        "ix_source_record_canonical_entity_id",
        "source_record",
        ["canonical_entity_id"],
        unique=False,
    )

    _revoke_non_owner_access(connection, identity)
    _assert_catalog_acl(connection, identity)


def downgrade() -> None:
    """Remove only the four Phase 1A1 tables after verifying their ACL boundary."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    _assert_catalog_acl(connection, identity)

    op.drop_index("ix_source_record_canonical_entity_id", table_name="source_record")
    op.drop_table("source_record")
    op.drop_table("dataset")
    op.drop_table("entity")
    op.drop_table("provider")
