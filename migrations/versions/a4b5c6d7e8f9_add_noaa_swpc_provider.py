"""Provision the disabled Phase 4B NOAA SWPC provider."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "a4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None

_PROVIDER_CODE: Final = "noaa-swpc"
_SAFE_ERROR: Final = "NOAA SWPC provider migration precondition failed."


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
    actual = connection.execute(
        sa.text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()
    if actual != expected:
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


def _assert_provider_rows_absent(connection: Connection) -> None:
    for table in (
        "provider_runtime_state",
        "provider_cache_entry",
        "provider_quarantine_entry",
    ):
        row = connection.execute(
            sa.text(f"SELECT 1 FROM public.{table} WHERE provider_code = :provider_code"),
            {"provider_code": _PROVIDER_CODE},
        ).scalar_one_or_none()
        if row is not None:
            _fail()


def _assert_disabled_runtime_row(connection: Connection) -> None:
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
    expected = (
        False,
        "closed",
        0,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    )
    if row is None or tuple(row) != expected:
        _fail()


def upgrade() -> None:
    """Add exactly one disabled NOAA SWPC runtime row."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_runtime_tables(connection)
    _assert_provider_rows_absent(connection)
    connection.execute(
        sa.text(
            "INSERT INTO public.provider_runtime_state "
            "(provider_code, enabled, circuit_state) "
            "VALUES (:provider_code, false, 'closed')"
        ),
        {"provider_code": _PROVIDER_CODE},
    )
    _assert_disabled_runtime_row(connection)


def downgrade() -> None:
    """Remove NOAA SWPC only while its disabled initial state remains untouched."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_runtime_tables(connection)
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
    if cache is not None or quarantine is not None:
        _fail()
    _assert_disabled_runtime_row(connection)
    connection.execute(
        sa.text("DELETE FROM public.provider_runtime_state WHERE provider_code = :provider_code"),
        {"provider_code": _PROVIDER_CODE},
    )
    _assert_provider_rows_absent(connection)
