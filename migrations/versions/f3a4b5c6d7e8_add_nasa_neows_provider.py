"""Provision the disabled Phase 4B NASA NeoWs provider and its bounded payload limits."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "f3a4b5c6d7e8"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None

_PROVIDER_CODE: Final = "nasa-neows"
_CACHE_LIMIT: Final = 524_288
_RAW_LIMIT: Final = 1_048_576
_OLD_LIMIT: Final = 65_536
_SAFE_ERROR: Final = "NASA NeoWs provider migration precondition failed."


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


def _assert_revision(connection: Connection, expected: str) -> None:
    if (
        connection.execute(
            sa.text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none()
        != expected
    ):
        _fail()


def _assert_runtime_tables(connection: Connection) -> None:
    rows = connection.execute(
        sa.text(
            "SELECT to_regclass('public.provider_runtime_state'), "
            "to_regclass('public.provider_cache_entry'), "
            "to_regclass('public.provider_quarantine_entry')"
        )
    ).one()
    if any(value is None for value in rows):
        _fail()


def _assert_neows_rows_absent(connection: Connection) -> None:
    for table in (
        "provider_runtime_state",
        "provider_cache_entry",
        "provider_quarantine_entry",
    ):
        if (
            connection.execute(
                sa.text(f"SELECT 1 FROM public.{table} WHERE provider_code = :provider_code"),
                {"provider_code": _PROVIDER_CODE},
            ).scalar_one_or_none()
            is not None
        ):
            _fail()


def _constraint_definition(connection: Connection, name: str) -> str:
    definition = connection.execute(
        sa.text(
            "SELECT pg_get_constraintdef(oid, true) FROM pg_constraint "
            "WHERE connamespace = 'public'::regnamespace AND conname = :name"
        ),
        {"name": name},
    ).scalar_one_or_none()
    if not isinstance(definition, str):
        _fail()
    return definition


def _assert_old_limits(connection: Connection) -> None:
    cache_definition = _constraint_definition(connection, "ck_provider_cache_payload")
    quarantine_definition = _constraint_definition(connection, "ck_provider_quarantine_body_size")
    if str(_OLD_LIMIT) not in cache_definition or str(_OLD_LIMIT) not in quarantine_definition:
        _fail()


def _assert_new_limits(connection: Connection) -> None:
    cache_definition = _constraint_definition(connection, "ck_provider_cache_payload")
    quarantine_definition = _constraint_definition(connection, "ck_provider_quarantine_body_size")
    if str(_CACHE_LIMIT) not in cache_definition or str(_RAW_LIMIT) not in quarantine_definition:
        _fail()


def _replace_limits(connection: Connection, *, cache_limit: int, raw_limit: int) -> None:
    connection.exec_driver_sql(
        "ALTER TABLE public.provider_cache_entry DROP CONSTRAINT ck_provider_cache_payload"
    )
    connection.exec_driver_sql(
        "ALTER TABLE public.provider_cache_entry "
        "ADD CONSTRAINT ck_provider_cache_payload CHECK "
        f"(jsonb_typeof(normalized_payload) = 'object' AND "
        f"octet_length(normalized_payload::text) <= {cache_limit})"
    )
    connection.exec_driver_sql(
        "ALTER TABLE public.provider_quarantine_entry "
        "DROP CONSTRAINT ck_provider_quarantine_body_size"
    )
    connection.exec_driver_sql(
        "ALTER TABLE public.provider_quarantine_entry "
        "ADD CONSTRAINT ck_provider_quarantine_body_size CHECK "
        f"(raw_body IS NULL OR octet_length(raw_body) <= {raw_limit})"
    )


def upgrade() -> None:
    """Add exactly the disabled NeoWs row and widen only approved provider storage limits."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_runtime_tables(connection)
    _assert_neows_rows_absent(connection)
    _assert_old_limits(connection)
    _replace_limits(connection, cache_limit=_CACHE_LIMIT, raw_limit=_RAW_LIMIT)
    connection.execute(
        sa.text(
            "INSERT INTO public.provider_runtime_state "
            "(provider_code, enabled, circuit_state) "
            "VALUES (:provider_code, false, 'closed')"
        ),
        {"provider_code": _PROVIDER_CODE},
    )
    row = connection.execute(
        sa.text(
            "SELECT enabled, circuit_state, consecutive_failures, next_sync_at, "
            "next_probe_at, last_attempt_at, last_success_at, last_failure_at, "
            "last_failure_code, last_http_status, last_sync_duration_ms, "
            "active_sync_lease_token, active_sync_lease_expires_at "
            "FROM public.provider_runtime_state WHERE provider_code = :provider_code"
        ),
        {"provider_code": _PROVIDER_CODE},
    ).one_or_none()
    expected = (False, "closed", 0, None, None, None, None, None, None, None, None, None, None)
    if row is None or tuple(row) != expected:
        _fail()
    _assert_new_limits(connection)


def downgrade() -> None:
    """Remove NeoWs and restore old limits only while no larger evidence has been stored."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_runtime_tables(connection)
    _assert_new_limits(connection)
    cache = connection.execute(
        sa.text("SELECT 1 FROM public.provider_cache_entry WHERE provider_code = :provider_code"),
        {"provider_code": _PROVIDER_CODE},
    ).scalar_one_or_none()
    quarantine = connection.execute(
        sa.text(
            "SELECT 1 FROM public.provider_quarantine_entry WHERE provider_code = :provider_code"
        ),
        {"provider_code": _PROVIDER_CODE},
    ).scalar_one_or_none()
    row = connection.execute(
        sa.text(
            "SELECT enabled, circuit_state FROM public.provider_runtime_state "
            "WHERE provider_code = :provider_code"
        ),
        {"provider_code": _PROVIDER_CODE},
    ).one_or_none()
    if cache is not None or quarantine is not None or row != (False, "closed"):
        _fail()
    if (
        connection.execute(
            sa.text(
                "SELECT 1 FROM public.provider_cache_entry "
                "WHERE octet_length(normalized_payload::text) > :limit LIMIT 1"
            ),
            {"limit": _OLD_LIMIT},
        ).scalar_one_or_none()
        is not None
        or connection.execute(
            sa.text(
                "SELECT 1 FROM public.provider_quarantine_entry "
                "WHERE raw_body IS NOT NULL AND octet_length(raw_body) > :limit LIMIT 1"
            ),
            {"limit": _OLD_LIMIT},
        ).scalar_one_or_none()
        is not None
    ):
        _fail()
    _replace_limits(connection, cache_limit=_OLD_LIMIT, raw_limit=_OLD_LIMIT)
    connection.execute(
        sa.text("DELETE FROM public.provider_runtime_state WHERE provider_code = :provider_code"),
        {"provider_code": _PROVIDER_CODE},
    )
    _assert_old_limits(connection)
