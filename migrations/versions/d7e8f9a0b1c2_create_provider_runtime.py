"""Create the durable Phase 4A provider operational state tables."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "d7e8f9a0b1c2"
down_revision = "c9f6a2b3d4e5"
branch_labels = None
depends_on = None

_TABLES: Final = (
    "provider_runtime_state",
    "provider_cache_entry",
    "provider_quarantine_entry",
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
_RUNTIME_TABLE_PRIVILEGES: Final = {
    "provider_runtime_state": frozenset({"SELECT", "UPDATE"}),
    "provider_cache_entry": frozenset({"SELECT", "INSERT", "UPDATE"}),
    "provider_quarantine_entry": frozenset({"SELECT", "INSERT", "UPDATE"}),
}
_SAFE_ERROR: Final = "Provider runtime ACL migration precondition failed."
_PROVIDER_CODE: Final = "nasa-exoplanet-archive"
_ALL_COLUMN_PRIVILEGES: Final = ("SELECT", "INSERT", "UPDATE")


type _AclSnapshot = tuple[frozenset[tuple[object, ...]], frozenset[tuple[object, ...]]]


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
    if (
        connection.execute(
            sa.text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none()
        != expected
    ):
        _fail()


def _assert_no_tables(connection: Connection) -> None:
    existing = set(
        connection.execute(
            sa.text(
                "SELECT table_data.relname FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[]))"
            ),
            {"tables": list(_TABLES)},
        ).scalars()
    )
    if existing:
        _fail()


def _assert_ownership(connection: Connection, identity: MigrationIdentity) -> None:
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
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND grantee.rolname = :role"
            ),
            {"role": role, "tables": list(_TABLES)},
        )
    )
    columns = frozenset(
        tuple(row)
        for row in connection.execute(
            sa.text(
                "SELECT namespace.nspname, table_data.relname, attribute.attname, "
                "grantor.rolname, grantee.rolname, privilege.privilege_type, "
                "privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' "
                "AND table_data.relname = ANY(CAST(:tables AS text[])) "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                "AND grantee.rolname = :role"
            ),
            {"role": role, "tables": list(_TABLES)},
        )
    )
    return table, columns


def _expected_acl(identity: MigrationIdentity) -> _AclSnapshot:
    return (
        frozenset(
            {
                (
                    "public",
                    table,
                    None,
                    identity.migration_role,
                    identity.runtime_role,
                    privilege,
                    False,
                )
                for table, privileges in _RUNTIME_TABLE_PRIVILEGES.items()
                for privilege in privileges
            }
        ),
        frozenset(),
    )


def _other_relevant_grants(connection: Connection, identity: MigrationIdentity) -> int:
    table_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
            "LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
            "WHERE namespace.nspname = 'public' "
            "AND table_data.relname = ANY(CAST(:tables AS text[])) "
            "AND (grantee.rolname IS NULL OR grantee.rolname NOT IN (:migration, :runtime))"
        ),
        {
            "tables": list(_TABLES),
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
            "WHERE namespace.nspname = 'public' "
            "AND table_data.relname = ANY(CAST(:tables AS text[])) "
            "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
            "AND (grantee.rolname IS NULL OR grantee.rolname NOT IN (:migration, :runtime))"
        ),
        {
            "tables": list(_TABLES),
            "migration": identity.migration_role,
            "runtime": identity.runtime_role,
        },
    ).scalar_one()
    return int(table_count) + int(column_count)


def _effective_runtime_acl(
    connection: Connection, role: str
) -> frozenset[tuple[str | None, str, str]]:
    table: set[tuple[str | None, str, str]] = set()
    columns: set[tuple[str | None, str, str]] = set()
    for table_name in _TABLES:
        table.update(
            (None, table_name, str(privilege))
            for privilege, granted in connection.execute(
                sa.text(
                    "SELECT privilege_name, "
                    "has_table_privilege(:role, "
                    "format('public.%I', CAST(:table AS text)), privilege_name) "
                    "FROM unnest(CAST(:privileges AS text[])) AS privilege_name"
                ),
                {
                    "role": role,
                    "table": table_name,
                    "privileges": list(_ALL_TABLE_PRIVILEGES),
                },
            )
            if bool(granted)
        )
        columns.update(
            (str(attribute), table_name, str(privilege))
            for attribute, privilege, granted in connection.execute(
                sa.text(
                    "SELECT attribute.attname, privilege_name, "
                    "has_column_privilege(:role, format('public.%I', CAST(:table AS text)), "
                    "attribute.attname, privilege_name) "
                    "FROM pg_attribute AS attribute "
                    "CROSS JOIN unnest(CAST(:privileges AS text[])) AS privilege_name "
                    "WHERE attribute.attrelid = "
                    "format('public.%I', CAST(:table AS text))::regclass "
                    "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
                ),
                {
                    "role": role,
                    "table": table_name,
                    "privileges": list(_ALL_COLUMN_PRIVILEGES),
                },
            )
            if bool(granted)
        )
    return frozenset(table | columns)


def _expected_effective_acl(
    connection: Connection,
) -> frozenset[tuple[str | None, str, str]]:
    expected: set[tuple[str | None, str, str]] = set()
    for table_name, privileges in _RUNTIME_TABLE_PRIVILEGES.items():
        expected.update((None, table_name, privilege) for privilege in privileges)
        columns = connection.execute(
            sa.text(
                "SELECT attribute.attname FROM pg_attribute AS attribute "
                "WHERE attribute.attrelid = format('public.%I', CAST(:table AS text))::regclass "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            ),
            {"table": table_name},
        ).scalars()
        expected.update(
            (str(column), table_name, privilege)
            for column in columns
            for privilege in privileges & set(_ALL_COLUMN_PRIVILEGES)
        )
    return frozenset(expected)


def _assert_runtime_acl(connection: Connection, identity: MigrationIdentity) -> None:
    if (
        _direct_acl(connection, identity.runtime_role) != _expected_acl(identity)
        or _other_relevant_grants(connection, identity) != 0
        or _effective_runtime_acl(connection, identity.runtime_role)
        != _expected_effective_acl(connection)
    ):
        _fail()


def _assert_public_acl(connection: Connection) -> None:
    for table in _TABLES:
        for privilege in _ALL_TABLE_PRIVILEGES:
            if connection.execute(
                sa.text(
                    "SELECT has_table_privilege('public', "
                    "format('public.%I', CAST(:table AS text)), :privilege)"
                ),
                {"table": table, "privilege": privilege},
            ).scalar_one():
                _fail()


def _grant_runtime(connection: Connection, role: str) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    for table, privileges in _RUNTIME_TABLE_PRIVILEGES.items():
        quoted_table = preparer.quote(table)
        connection.exec_driver_sql(
            f"GRANT {', '.join(sorted(privileges))} ON TABLE public.{quoted_table} TO {quoted_role}"
        )


def _revoke_runtime(connection: Connection, role: str) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    for table in _TABLES:
        quoted_table = preparer.quote(table)
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM {quoted_role}"
        )


def upgrade() -> None:
    """Create operational tables and grant only the runtime DML they require."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_no_tables(connection)

    op.create_table(
        "provider_runtime_state",
        sa.Column("provider_code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "circuit_state",
            sa.String(length=16, collation="C"),
            nullable=False,
            server_default="closed",
        ),
        sa.Column("consecutive_failures", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("next_sync_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("next_probe_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_attempt_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_success_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_failure_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_failure_code", sa.String(length=128, collation="C"), nullable=True),
        sa.Column("last_http_status", sa.SmallInteger(), nullable=True),
        sa.Column("last_sync_duration_ms", sa.Integer(), nullable=True),
        sa.Column("active_sync_lease_token", sa.String(length=128, collation="C"), nullable=True),
        sa.Column(
            "active_sync_lease_expires_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column("sync_cycles_started", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("sync_successes", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("sync_upstream_failures", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("http_requests", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("http_retries", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("schema_failures", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("quarantines", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("stale_fallbacks", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("circuit_openings", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("disabled_skips", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("circuit_open_skips", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("concurrent_lease_skips", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("provider_code", name="pk_provider_runtime_state"),
        sa.CheckConstraint(
            "provider_code ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_runtime_state_code",
        ),
        sa.CheckConstraint(
            "circuit_state IN ('closed', 'open', 'half_open')",
            name="ck_provider_runtime_state_circuit",
        ),
        sa.CheckConstraint(
            "consecutive_failures >= 0 AND consecutive_failures <= 32767",
            name="ck_provider_runtime_state_failures",
        ),
        sa.CheckConstraint(
            "last_failure_code IS NULL OR last_failure_code ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_runtime_state_failure_code",
        ),
        sa.CheckConstraint(
            "last_http_status IS NULL OR last_http_status BETWEEN 100 AND 599",
            name="ck_provider_runtime_state_http_status",
        ),
        sa.CheckConstraint(
            "last_sync_duration_ms IS NULL OR last_sync_duration_ms >= 0",
            name="ck_provider_runtime_state_duration",
        ),
        sa.CheckConstraint(
            "(active_sync_lease_token IS NULL) = (active_sync_lease_expires_at IS NULL)",
            name="ck_provider_runtime_state_lease_pair",
        ),
        sa.CheckConstraint(
            "sync_cycles_started >= 0 AND sync_successes >= 0 "
            "AND sync_upstream_failures >= 0 AND http_requests >= 0 "
            "AND http_retries >= 0 AND schema_failures >= 0 AND quarantines >= 0 "
            "AND stale_fallbacks >= 0 AND circuit_openings >= 0 "
            "AND disabled_skips >= 0 AND circuit_open_skips >= 0 "
            "AND concurrent_lease_skips >= 0",
            name="ck_provider_runtime_state_counters",
        ),
    )
    op.create_table(
        "provider_cache_entry",
        sa.Column("provider_code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("cache_key", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("normalized_payload", postgresql.JSONB(), nullable=False),
        sa.Column(
            "normalized_schema_version",
            sa.String(length=128, collation="C"),
            nullable=False,
        ),
        sa.Column("raw_sha256", sa.String(length=64, collation="C"), nullable=False),
        sa.Column("fetched_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("fresh_until", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("stale_until", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint(
            "provider_code",
            "cache_key",
            name="pk_provider_cache_entry",
        ),
        sa.CheckConstraint(
            "provider_code ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_cache_provider_code",
        ),
        sa.CheckConstraint(
            "cache_key ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_cache_key",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(normalized_payload) = 'object' "
            "AND octet_length(normalized_payload::text) <= 65536",
            name="ck_provider_cache_payload",
        ),
        sa.CheckConstraint(
            "raw_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_provider_cache_sha256",
        ),
        sa.CheckConstraint(
            "fetched_at <= fresh_until AND fresh_until <= stale_until",
            name="ck_provider_cache_freshness_order",
        ),
    )
    op.create_table(
        "provider_quarantine_entry",
        sa.Column("provider_code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("cache_key", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("failure_code", sa.String(length=128, collation="C"), nullable=False),
        sa.Column("observed_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("raw_complete", sa.Boolean(), nullable=False),
        sa.Column("observed_bytes", sa.Integer(), nullable=False),
        sa.Column("raw_sha256", sa.String(length=64, collation="C"), nullable=True),
        sa.Column("raw_body", postgresql.BYTEA(), nullable=True),
        sa.Column("http_status", sa.SmallInteger(), nullable=True),
        sa.PrimaryKeyConstraint(
            "provider_code",
            "cache_key",
            name="pk_provider_quarantine_entry",
        ),
        sa.CheckConstraint(
            "provider_code ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_quarantine_provider_code",
        ),
        sa.CheckConstraint(
            "cache_key ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_quarantine_key",
        ),
        sa.CheckConstraint(
            "failure_code ~ '^[a-z][a-z0-9_.-]{0,127}$'",
            name="ck_provider_quarantine_failure_code",
        ),
        sa.CheckConstraint(
            "observed_bytes >= 0",
            name="ck_provider_quarantine_observed_bytes",
        ),
        sa.CheckConstraint(
            "raw_body IS NULL OR octet_length(raw_body) <= 65536",
            name="ck_provider_quarantine_body_size",
        ),
        sa.CheckConstraint(
            "(raw_complete AND raw_sha256 IS NOT NULL AND raw_body IS NOT NULL) "
            "OR (NOT raw_complete AND raw_sha256 IS NULL AND raw_body IS NULL)",
            name="ck_provider_quarantine_completeness",
        ),
        sa.CheckConstraint(
            "raw_sha256 IS NULL OR raw_sha256 ~ '^[0-9a-f]{64}$'",
            name="ck_provider_quarantine_sha256",
        ),
        sa.CheckConstraint(
            "http_status IS NULL OR http_status BETWEEN 100 AND 599",
            name="ck_provider_quarantine_http_status",
        ),
    )

    connection.execute(
        sa.text(
            "INSERT INTO public.provider_runtime_state "
            "(provider_code, enabled, circuit_state) "
            "VALUES (:provider_code, false, 'closed')"
        ),
        {"provider_code": _PROVIDER_CODE},
    )
    for table in _TABLES:
        quoted_table = connection.dialect.identifier_preparer.quote(table)
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted_table} FROM PUBLIC"
        )
    _grant_runtime(connection, identity.runtime_role)
    _assert_ownership(connection, identity)
    _assert_runtime_acl(connection, identity)
    _assert_public_acl(connection)


def downgrade() -> None:
    """Drop only the operational tables after verifying their guarded ACL contract."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_ownership(connection, identity)
    _assert_runtime_acl(connection, identity)
    _assert_public_acl(connection)
    _revoke_runtime(connection, identity.runtime_role)
    op.drop_table("provider_quarantine_entry")
    op.drop_table("provider_cache_entry")
    op.drop_table("provider_runtime_state")
