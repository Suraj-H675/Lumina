"""Create private temporary identification submission metadata."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "d8e9f0a1b2c3"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None

_TABLE: Final = "identification_submission"
_INSERT_COLUMNS: Final = (
    "id",
    "storage_object_key",
    "original_filename",
    "mime_type",
    "byte_size",
    "width",
    "height",
    "sha256",
    "solver_type",
    "retention_until",
    "consent_remote_processing",
)
_UPDATE_COLUMNS: Final = (
    "job_id",
    "storage_object_key",
    "original_filename",
    "sha256",
    "retention_until",
    "deleted_at",
)
_ALL_TABLE_PRIVILEGES: Final = (
    "SELECT",
    "INSERT",
    "UPDATE",
    "DELETE",
    "TRUNCATE",
    "REFERENCES",
    "TRIGGER",
)
_ALL_COLUMN_PRIVILEGES: Final = ("SELECT", "INSERT", "UPDATE", "REFERENCES")
_SAFE_ERROR: Final = "Identification submission migration precondition failed."


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _connection() -> Connection:
    if context.is_offline_mode():
        _fail()
    return op.get_bind()


def _identity() -> MigrationIdentity:
    configuration = context.get_context().config
    if configuration is None:
        _fail()
    configured = configuration.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_actor(connection: Connection, identity: MigrationIdentity) -> None:
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
            "rolreplication, rolbypassrls, rolinherit "
            "FROM pg_roles WHERE rolname = :role"
        ),
        {"role": identity.runtime_role},
    ).one_or_none()
    if role is None or tuple(role) != (True, False, False, False, False, False, False):
        _fail()
    membership_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_auth_members AS membership "
            "JOIN pg_roles AS role ON role.oid = membership.roleid "
            "JOIN pg_roles AS member ON member.oid = membership.member "
            "WHERE role.rolname = :runtime OR member.rolname = :runtime"
        ),
        {"runtime": identity.runtime_role},
    ).scalar_one()
    if membership_count != 0:
        _fail()
    if connection.execute(
        sa.text("SELECT has_database_privilege(:role, current_database(), 'TEMPORARY')"),
        {"role": identity.runtime_role},
    ).scalar_one():
        _fail()
    if (
        not connection.execute(
            sa.text("SELECT has_schema_privilege(:role, 'public', 'USAGE')"),
            {"role": identity.runtime_role},
        ).scalar_one()
        or connection.execute(
            sa.text("SELECT has_schema_privilege(:role, 'public', 'CREATE')"),
            {"role": identity.runtime_role},
        ).scalar_one()
    ):
        _fail()


def _assert_revision(connection: Connection, expected: str) -> None:
    actual = connection.execute(
        sa.text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()
    if actual != expected:
        _fail()


def _assert_table_absent(connection: Connection) -> None:
    if (
        connection.execute(
            sa.text("SELECT to_regclass('public.identification_submission')")
        ).scalar_one_or_none()
        is not None
    ):
        _fail()


def _assert_owner(connection: Connection, identity: MigrationIdentity) -> None:
    owner = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(table_data.relowner) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "WHERE namespace.nspname = 'public' AND table_data.relname = :table "
            "AND table_data.relkind = 'r'"
        ),
        {"table": _TABLE},
    ).scalar_one_or_none()
    if owner != identity.migration_role:
        _fail()


def _direct_runtime_acl(
    connection: Connection, identity: MigrationIdentity
) -> tuple[frozenset[tuple[object, ...]], frozenset[tuple[object, ...]]]:
    table = frozenset(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT grantor.rolname, grantee.rolname, privilege.privilege_type, "
                "privilege.is_grantable FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' AND table_data.relname = :table "
                "AND grantee.rolname = :role"
            ),
            {"table": _TABLE, "role": identity.runtime_role},
        )
    )
    columns = frozenset(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT attribute.attname, grantor.rolname, grantee.rolname, "
                "privilege.privilege_type, privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' AND table_data.relname = :table "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "AND grantee.rolname = :role"
            ),
            {"table": _TABLE, "role": identity.runtime_role},
        )
    )
    return table, columns


def _expected_direct_acl(
    identity: MigrationIdentity,
) -> tuple[frozenset[tuple[object, ...]], frozenset[tuple[object, ...]]]:
    return (
        frozenset({(identity.migration_role, identity.runtime_role, "SELECT", False)}),
        frozenset(
            {
                (
                    column,
                    identity.migration_role,
                    identity.runtime_role,
                    privilege,
                    False,
                )
                for privilege, columns in (("INSERT", _INSERT_COLUMNS), ("UPDATE", _UPDATE_COLUMNS))
                for column in columns
            }
        ),
    )


def _other_grants(connection: Connection, identity: MigrationIdentity) -> int:
    table_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
            "LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
            "WHERE namespace.nspname = 'public' AND table_data.relname = :table "
            "AND (grantee.rolname IS NULL OR grantee.rolname NOT IN (:migration, :runtime))"
        ),
        {
            "table": _TABLE,
            "migration": identity.migration_role,
            "runtime": identity.runtime_role,
        },
    ).scalar_one()
    column_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
            "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
            "LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
            "WHERE namespace.nspname = 'public' AND table_data.relname = :table "
            "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
            "AND (grantee.rolname IS NULL OR grantee.rolname NOT IN (:migration, :runtime))"
        ),
        {
            "table": _TABLE,
            "migration": identity.migration_role,
            "runtime": identity.runtime_role,
        },
    ).scalar_one()
    return int(table_count) + int(column_count)


def _effective_runtime_acl(connection: Connection, role: str) -> frozenset[tuple[str | None, str]]:
    table = {
        (None, str(privilege))
        for privilege, granted in connection.execute(
            sa.text(
                "SELECT privilege_name, has_table_privilege("
                ":role, 'public.identification_submission', privilege_name) "
                "FROM unnest(CAST(:privileges AS text[])) AS privilege_name"
            ),
            {"role": role, "privileges": list(_ALL_TABLE_PRIVILEGES)},
        )
        if bool(granted)
    }
    columns = {
        (str(column), str(privilege))
        for column, privilege, granted in connection.execute(
            sa.text(
                "SELECT attribute.attname, privilege_name, "
                "has_column_privilege(:role, 'public.identification_submission', "
                "attribute.attname, privilege_name) FROM pg_attribute AS attribute "
                "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
                "WHERE attribute.attrelid = 'public.identification_submission'::regclass "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            ),
            {"role": role, "privileges": list(_ALL_COLUMN_PRIVILEGES)},
        )
        if bool(granted)
    }
    return frozenset(table | columns)


def _expected_effective_acl(connection: Connection) -> frozenset[tuple[str | None, str]]:
    columns = tuple(
        str(value)
        for value in connection.execute(
            sa.text(
                "SELECT attname FROM pg_attribute "
                "WHERE attrelid = 'public.identification_submission'::regclass "
                "AND attnum > 0 AND NOT attisdropped"
            )
        ).scalars()
    )
    return frozenset(
        {(None, "SELECT")}
        | {(column, "SELECT") for column in columns}
        | {(column, "INSERT") for column in _INSERT_COLUMNS}
        | {(column, "UPDATE") for column in _UPDATE_COLUMNS}
    )


def _assert_acl(connection: Connection, identity: MigrationIdentity) -> None:
    if (
        _direct_runtime_acl(connection, identity) != _expected_direct_acl(identity)
        or _other_grants(connection, identity) != 0
        or _effective_runtime_acl(connection, identity.runtime_role)
        != _expected_effective_acl(connection)
    ):
        _fail()
    for privilege in _ALL_TABLE_PRIVILEGES:
        if connection.execute(
            sa.text(
                "SELECT has_table_privilege("
                "'public', 'public.identification_submission', :privilege)"
            ),
            {"privilege": privilege},
        ).scalar_one():
            _fail()


def _grant_runtime(connection: Connection, role: str) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    quoted_insert = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    quoted_update = ", ".join(preparer.quote(column) for column in _UPDATE_COLUMNS)
    connection.exec_driver_sql(
        f"GRANT SELECT ON TABLE public.identification_submission TO {quoted_role}"
    )
    connection.exec_driver_sql(
        f"GRANT INSERT ({quoted_insert}) ON TABLE public.identification_submission TO {quoted_role}"
    )
    connection.exec_driver_sql(
        f"GRANT UPDATE ({quoted_update}) ON TABLE public.identification_submission TO {quoted_role}"
    )


def _revoke_runtime(connection: Connection, role: str) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    connection.exec_driver_sql(
        f"REVOKE ALL PRIVILEGES ON TABLE public.identification_submission FROM {quoted_role}"
    )


def upgrade() -> None:
    """Create private submission metadata with bounded runtime column privileges."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_table_absent(connection)

    op.create_table(
        _TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("storage_object_key", sa.String(length=32, collation="C"), nullable=True),
        sa.Column("original_filename", sa.Text(collation="C"), nullable=True),
        sa.Column("mime_type", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64, collation="C"), nullable=True),
        sa.Column("solver_type", sa.String(length=32, collation="C"), nullable=False),
        sa.Column(
            "consent_remote_processing", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("retention_until", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("deleted_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id", name="pk_identification_submission"),
        sa.UniqueConstraint("job_id", name="uq_identification_submission_job_id"),
        sa.UniqueConstraint(
            "storage_object_key", name="uq_identification_submission_storage_object_key"
        ),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["public.job.id"],
            name="fk_identification_submission_job",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "storage_object_key IS NULL OR storage_object_key ~ '^[0-9a-f]{32}$'",
            name="ck_identification_submission_storage_key",
        ),
        sa.CheckConstraint(
            "original_filename IS NULL OR ("
            "octet_length(convert_to(original_filename, 'UTF8')) BETWEEN 1 AND 255 "
            "AND original_filename = btrim(original_filename) "
            "AND (original_filename COLLATE \"C\") !~ '[[:cntrl:]]')",
            name="ck_identification_submission_filename",
        ),
        sa.CheckConstraint(
            "mime_type IN ('image/jpeg', 'image/png')",
            name="ck_identification_submission_mime_type",
        ),
        sa.CheckConstraint(
            "byte_size BETWEEN 1 AND 104857600",
            name="ck_identification_submission_byte_size",
        ),
        sa.CheckConstraint(
            "width >= 1 AND height >= 1 AND width::bigint * height::bigint <= 100000000",
            name="ck_identification_submission_dimensions",
        ),
        sa.CheckConstraint(
            "sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_identification_submission_sha256",
        ),
        sa.CheckConstraint(
            "solver_type = 'fake'",
            name="ck_identification_submission_solver_type",
        ),
        sa.CheckConstraint(
            "consent_remote_processing = false",
            name="ck_identification_submission_no_remote_consent",
        ),
        sa.CheckConstraint(
            "retention_until > created_at",
            name="ck_identification_submission_retention_order",
        ),
        sa.CheckConstraint(
            "deleted_at IS NULL OR deleted_at >= created_at",
            name="ck_identification_submission_deletion_order",
        ),
        sa.CheckConstraint(
            "(deleted_at IS NULL AND storage_object_key IS NOT NULL "
            "AND original_filename IS NOT NULL AND sha256 IS NOT NULL) OR "
            "(deleted_at IS NOT NULL AND storage_object_key IS NULL "
            "AND original_filename IS NULL AND sha256 IS NULL)",
            name="ck_identification_submission_private_scrub",
        ),
    )
    op.create_index(
        "ix_identification_submission_retention",
        _TABLE,
        ["retention_until", "id"],
        unique=False,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    connection.exec_driver_sql(
        "REVOKE ALL PRIVILEGES ON TABLE public.identification_submission FROM PUBLIC"
    )
    _grant_runtime(connection, identity.runtime_role)
    _assert_owner(connection, identity)
    _assert_acl(connection, identity)


def downgrade() -> None:
    """Remove the Phase 6A table only when it contains no submission history."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_owner(connection, identity)
    _assert_acl(connection, identity)
    if (
        connection.execute(
            sa.text("SELECT count(*) FROM public.identification_submission")
        ).scalar_one()
        != 0
    ):
        _fail()
    _revoke_runtime(connection, identity.runtime_role)
    op.drop_index("ix_identification_submission_retention", table_name=_TABLE)
    op.drop_table(_TABLE)
