"""Grant the runtime role least-privilege job DML.

Revision ID: 0002_grant_job_runtime_dml
Revises: 0001_create_job
Create Date: 2026-07-26
"""

from __future__ import annotations

from typing import NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "0002_grant_job_runtime_dml"
down_revision = "0001_create_job"
branch_labels = None
depends_on = None

_INSERT_COLUMNS = (
    "id",
    "job_type",
    "idempotency_key",
    "priority",
    "payload",
    "max_attempts",
)
_UPDATE_COLUMNS = (
    "status",
    "result",
    "progress",
    "attempts",
    "available_at",
    "claimed_by",
    "claimed_at",
    "heartbeat_at",
    "completed_at",
    "error_code",
    "error_message",
)
_TABLE_PRIVILEGES = frozenset({"SELECT"})
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
_SAFE_ERROR = "Runtime ACL migration precondition failed."

type _AclEntry = tuple[str, str, str | None, str, str, str, bool]
type _EffectiveAclEntry = tuple[str | None, str]


class _AclSnapshot:
    __slots__ = ("columns", "table")

    def __init__(
        self,
        table: frozenset[_AclEntry],
        columns: frozenset[_AclEntry],
    ) -> None:
        self.table = table
        self.columns = columns

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, _AclSnapshot)
            and self.table == other.table
            and self.columns == other.columns
        )


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
    current_user, session_user, table_owner = connection.execute(
        sa.text(
            "SELECT current_user, session_user, "
            "pg_get_userbyid(table_data.relowner) "
            "FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "WHERE namespace.nspname = 'public' AND table_data.relname = 'job'"
        )
    ).one_or_none() or (None, None, None)
    if (
        current_user != identity.migration_role
        or session_user != identity.migration_role
        or table_owner != identity.migration_role
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


def _direct_acl(connection: Connection, role: str) -> _AclSnapshot:
    table = frozenset(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT namespace.nspname, table_data.relname, NULL::text, "
                "grantor.rolname, grantee.rolname, privilege.privilege_type, "
                "privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' AND table_data.relname = 'job' "
                "AND grantee.rolname = :role"
            ),
            {"role": role},
        )
    )
    columns = frozenset(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT namespace.nspname, table_data.relname, attribute.attname, "
                "grantor.rolname, grantee.rolname, "
                "privilege.privilege_type, privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' AND table_data.relname = 'job' "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "AND grantee.rolname = :role"
            ),
            {"role": role},
        )
    )
    return _AclSnapshot(table=table, columns=columns)


def _expected_acl(identity: MigrationIdentity) -> _AclSnapshot:
    return _AclSnapshot(
        table=frozenset(
            {
                (
                    "public",
                    "job",
                    None,
                    identity.migration_role,
                    identity.runtime_role,
                    privilege,
                    False,
                )
                for privilege in _TABLE_PRIVILEGES
            }
        ),
        columns=frozenset(
            {
                (
                    "public",
                    "job",
                    column,
                    identity.migration_role,
                    identity.runtime_role,
                    "INSERT",
                    False,
                )
                for column in _INSERT_COLUMNS
            }
            | {
                (
                    "public",
                    "job",
                    column,
                    identity.migration_role,
                    identity.runtime_role,
                    "UPDATE",
                    False,
                )
                for column in _UPDATE_COLUMNS
            }
        ),
    )


def _other_relevant_grants(
    connection: Connection,
    identity: MigrationIdentity,
) -> int:
    table_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
            "LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
            "WHERE namespace.nspname = 'public' AND table_data.relname = 'job' "
            "AND (grantee.rolname IS NULL OR grantee.rolname NOT IN (:migration, :runtime))"
        ),
        {
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
            "WHERE namespace.nspname = 'public' AND table_data.relname = 'job' "
            "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
            "AND (grantee.rolname IS NULL OR grantee.rolname NOT IN (:migration, :runtime))"
        ),
        {"migration": identity.migration_role, "runtime": identity.runtime_role},
    ).scalar_one()
    return int(table_count) + int(column_count)


def _effective_runtime_acl(
    connection: Connection,
    role: str,
) -> frozenset[_EffectiveAclEntry]:
    table = {
        (None, str(privilege))
        for privilege, granted in connection.execute(
            sa.text(
                "SELECT privilege_name, "
                "has_table_privilege(:role, 'public.job', privilege_name) "
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
                "has_column_privilege(:role, 'public.job', "
                "attribute.attname, privilege_name) "
                "FROM pg_attribute AS attribute "
                "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
                "WHERE attribute.attrelid = 'public.job'::regclass "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            ),
            {"role": role, "privileges": list(_ALL_COLUMN_PRIVILEGES)},
        )
        if bool(granted)
    }
    return frozenset(table | columns)


def _expected_effective_acl(connection: Connection) -> frozenset[_EffectiveAclEntry]:
    job_columns = {
        str(column)
        for column in connection.execute(
            sa.text(
                "SELECT attribute.attname FROM pg_attribute AS attribute "
                "WHERE attribute.attrelid = 'public.job'::regclass "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            )
        ).scalars()
    }
    return frozenset(
        {(None, "SELECT")}
        | {(column, "SELECT") for column in job_columns}
        | {(column, "INSERT") for column in _INSERT_COLUMNS}
        | {(column, "UPDATE") for column in _UPDATE_COLUMNS}
    )


def _quoted_grant_sql(
    connection: Connection,
    role: str,
    verb: str,
    columns: tuple[str, ...],
) -> str:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    quoted_columns = ", ".join(preparer.quote(column) for column in columns)
    return f"{verb} ({quoted_columns}) ON TABLE public.job TO {quoted_role}"


def _quoted_revoke_sql(
    connection: Connection,
    role: str,
    verb: str,
    columns: tuple[str, ...],
) -> str:
    return _quoted_grant_sql(connection, role, f"REVOKE {verb}", columns).replace(
        " TO ", " FROM ", 1
    )


def upgrade() -> None:
    """Grant only the DML needed by enqueue and approved future lifecycle operations."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    if (
        _direct_acl(connection, identity.runtime_role) != _AclSnapshot(frozenset(), frozenset())
        or _other_relevant_grants(connection, identity) != 0
        or bool(_effective_runtime_acl(connection, identity.runtime_role))
    ):
        _fail()

    quoted_role = connection.dialect.identifier_preparer.quote(identity.runtime_role)
    connection.exec_driver_sql(f"GRANT SELECT ON TABLE public.job TO {quoted_role}")
    connection.exec_driver_sql(
        _quoted_grant_sql(connection, identity.runtime_role, "GRANT INSERT", _INSERT_COLUMNS)
    )
    connection.exec_driver_sql(
        _quoted_grant_sql(connection, identity.runtime_role, "GRANT UPDATE", _UPDATE_COLUMNS)
    )
    if (
        _direct_acl(connection, identity.runtime_role) != _expected_acl(identity)
        or _other_relevant_grants(connection, identity) != 0
        or _effective_runtime_acl(connection, identity.runtime_role)
        != _expected_effective_acl(connection)
    ):
        _fail()


def downgrade() -> None:
    """Revoke the exact ACL only from the role that received revision 0002."""
    if context.is_offline_mode():
        _fail()
    connection = _connection()
    identity = _identity()
    _role_is_safe(connection, identity)
    if (
        _direct_acl(connection, identity.runtime_role) != _expected_acl(identity)
        or _other_relevant_grants(connection, identity) != 0
        or _effective_runtime_acl(connection, identity.runtime_role)
        != _expected_effective_acl(connection)
    ):
        _fail()

    quoted_role = connection.dialect.identifier_preparer.quote(identity.runtime_role)
    connection.exec_driver_sql(f"REVOKE SELECT ON TABLE public.job FROM {quoted_role}")
    connection.exec_driver_sql(
        _quoted_revoke_sql(connection, identity.runtime_role, "INSERT", _INSERT_COLUMNS)
    )
    connection.exec_driver_sql(
        _quoted_revoke_sql(connection, identity.runtime_role, "UPDATE", _UPDATE_COLUMNS)
    )
    if (
        _direct_acl(connection, identity.runtime_role) != _AclSnapshot(frozenset(), frozenset())
        or _other_relevant_grants(connection, identity) != 0
        or bool(_effective_runtime_acl(connection, identity.runtime_role))
    ):
        _fail()
