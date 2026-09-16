"""Expose bounded provider capacity and outage conditions during remote solves."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "f1b2c3d4e5f6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None

_REMOTE: Final = "identification_remote_solve"
_TRANSITION: Final = "identification_remote_transition"
_REMOTE_LIFECYCLE: Final = "ck_identification_remote_solve_lifecycle_shape"
_TRANSITION_REASON: Final = "ck_identification_remote_transition_reason"
_SAFE_ERROR: Final = "Identification provider-condition migration precondition failed."
_REMOTE_INSERT_COLUMNS: Final = (
    "submission_id",
    "provider",
    "state",
    "next_poll_at",
    "deadline_at",
)
_REMOTE_UPDATE_COLUMNS: Final = (
    "state",
    "external_submission_id",
    "external_job_id",
    "next_poll_at",
    "last_polled_at",
    "upload_attempted_at",
    "terminal_at",
    "safe_reason",
    "active_lease_token",
    "active_lease_expires_at",
    "updated_at",
)
_TRANSITION_INSERT_COLUMNS: Final = (
    "event_id",
    "submission_id",
    "from_state",
    "to_state",
    "reason",
    "recorded_at",
)
_POLLABLE: Final = "'submitting', 'waiting_for_solver', 'solving', 'fetching_results'"
_TERMINAL: Final = "'succeeded', 'unsolved', 'failed', 'expired', 'deleted'"


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


def _assert_tables(connection: Connection) -> None:
    for table in (_REMOTE, _TRANSITION):
        if (
            connection.execute(
                sa.text("SELECT to_regclass(:name)"), {"name": f"public.{table}"}
            ).scalar_one_or_none()
            is None
        ):
            _fail()


def _assert_owner(connection: Connection, identity: MigrationIdentity, table: str) -> None:
    owner = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(rel.relowner) FROM pg_class AS rel "
            "JOIN pg_namespace AS ns ON ns.oid = rel.relnamespace "
            "WHERE ns.nspname = 'public' AND rel.relname = :table AND rel.relkind = 'r'"
        ),
        {"table": table},
    ).scalar_one_or_none()
    if owner != identity.migration_role:
        _fail()


def _columns(connection: Connection, table: str) -> tuple[str, ...]:
    return tuple(
        str(value)
        for value in connection.execute(
            sa.text(
                "SELECT attname FROM pg_attribute WHERE attrelid = CAST(:table AS regclass) "
                "AND attnum > 0 AND NOT attisdropped ORDER BY attnum"
            ),
            {"table": f"public.{table}"},
        ).scalars()
    )


def _assert_runtime_acl(connection: Connection, identity: MigrationIdentity) -> None:
    expected = {
        _REMOTE: {
            (None, "SELECT"),
            *((column, "SELECT") for column in _columns(connection, _REMOTE)),
            *((column, "INSERT") for column in _REMOTE_INSERT_COLUMNS),
            *((column, "UPDATE") for column in _REMOTE_UPDATE_COLUMNS),
        },
        _TRANSITION: {
            (None, "SELECT"),
            *((column, "SELECT") for column in _columns(connection, _TRANSITION)),
            *((column, "INSERT") for column in _TRANSITION_INSERT_COLUMNS),
        },
    }
    for table, expected_acl in expected.items():
        actual: set[tuple[str | None, str]] = set()
        for privilege in (
            "SELECT",
            "INSERT",
            "UPDATE",
            "DELETE",
            "TRUNCATE",
            "REFERENCES",
            "TRIGGER",
        ):
            if connection.execute(
                sa.text("SELECT has_table_privilege(:role, :table, :privilege)"),
                {"role": identity.runtime_role, "table": f"public.{table}", "privilege": privilege},
            ).scalar_one():
                actual.add((None, privilege))
        for column in _columns(connection, table):
            for privilege in ("SELECT", "INSERT", "UPDATE", "REFERENCES"):
                if connection.execute(
                    sa.text("SELECT has_column_privilege(:role, :table, :column, :privilege)"),
                    {
                        "role": identity.runtime_role,
                        "table": f"public.{table}",
                        "column": column,
                        "privilege": privilege,
                    },
                ).scalar_one():
                    actual.add((column, privilege))
        if actual != expected_acl:
            _fail()


def _constraint_definition(connection: Connection, table: str, name: str) -> str:
    value = connection.execute(
        sa.text(
            "SELECT pg_get_constraintdef(oid, true) FROM pg_constraint "
            "WHERE conrelid = CAST(:table AS regclass) AND conname = :name"
        ),
        {"table": f"public.{table}", "name": name},
    ).scalar_one_or_none()
    if not isinstance(value, str):
        _fail()
    return value


def _assert_constraint_mode(connection: Connection, *, upgraded: bool) -> None:
    lifecycle = _constraint_definition(connection, _REMOTE, _REMOTE_LIFECYCLE)
    transition = _constraint_definition(connection, _TRANSITION, _TRANSITION_REASON)
    if upgraded:
        if "provider_busy" not in lifecycle or "provider_unavailable" not in lifecycle:
            _fail()
        if "provider_busy" not in transition or "provider_unavailable" in transition:
            _fail()
    elif (
        "provider_busy" in lifecycle
        or "provider_unavailable" in lifecycle
        or "provider_busy" in transition
        or "provider_unavailable" in transition
    ):
        _fail()


def _assert_no_new_evidence(connection: Connection) -> None:
    remote_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM public.identification_remote_solve "
            "WHERE safe_reason IN ('provider_busy', 'provider_unavailable')"
        )
    ).scalar_one()
    transition_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM public.identification_remote_transition "
            "WHERE reason IN ('provider_busy', 'provider_unavailable')"
        )
    ).scalar_one()
    if remote_count != 0 or transition_count != 0:
        _fail()


def _create_upgraded_constraints() -> None:
    op.create_check_constraint(
        _REMOTE_LIFECYCLE,
        _REMOTE,
        f"((state IN ({_POLLABLE}) AND next_poll_at IS NOT NULL AND terminal_at IS NULL "
        "AND (safe_reason IS NULL OR safe_reason IN ('provider_busy', 'provider_unavailable'))) "
        f"OR (state IN ({_TERMINAL}) AND next_poll_at IS NULL AND terminal_at IS NOT NULL "
        "AND safe_reason IS NOT NULL))",
    )
    op.create_check_constraint(
        _TRANSITION_REASON,
        _TRANSITION,
        "(to_state = 'submitting' AND reason = 'remote_processing_consented') OR "
        "(to_state = 'waiting_for_solver' AND reason = 'remote_upload_accepted') OR "
        "(to_state = 'solving' AND reason = 'remote_job_resolved') OR "
        "(to_state = 'fetching_results' AND reason = 'remote_job_succeeded') OR "
        "(to_state = 'succeeded' AND reason = 'results_stored') OR "
        "(to_state = 'unsolved' AND reason = 'no_astrometric_solution') OR "
        "(to_state = 'expired' AND reason = 'solver_timeout') OR "
        "(to_state = 'deleted' AND reason = 'local_deleted') OR "
        "(to_state = 'failed' AND reason IN ('provider_busy', 'provider_rejected', "
        "'provider_protocol_error', 'remote_submission_outcome_unknown', "
        "'local_input_unavailable'))",
    )


def _create_legacy_constraints() -> None:
    op.create_check_constraint(
        _REMOTE_LIFECYCLE,
        _REMOTE,
        f"((state IN ({_POLLABLE}) AND next_poll_at IS NOT NULL AND terminal_at IS NULL "
        f"AND safe_reason IS NULL) OR (state IN ({_TERMINAL}) AND next_poll_at IS NULL "
        "AND terminal_at IS NOT NULL AND safe_reason IS NOT NULL))",
    )
    op.create_check_constraint(
        _TRANSITION_REASON,
        _TRANSITION,
        "(to_state = 'submitting' AND reason = 'remote_processing_consented') OR "
        "(to_state = 'waiting_for_solver' AND reason = 'remote_upload_accepted') OR "
        "(to_state = 'solving' AND reason = 'remote_job_resolved') OR "
        "(to_state = 'fetching_results' AND reason = 'remote_job_succeeded') OR "
        "(to_state = 'succeeded' AND reason = 'results_stored') OR "
        "(to_state = 'unsolved' AND reason = 'no_astrometric_solution') OR "
        "(to_state = 'expired' AND reason = 'solver_timeout') OR "
        "(to_state = 'deleted' AND reason = 'local_deleted') OR "
        "(to_state = 'failed' AND reason IN ('provider_rejected', 'provider_protocol_error', "
        "'remote_submission_outcome_unknown', 'local_input_unavailable'))",
    )


def upgrade() -> None:
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_tables(connection)
    for table in (_REMOTE, _TRANSITION):
        _assert_owner(connection, identity, table)
    _assert_runtime_acl(connection, identity)
    _assert_constraint_mode(connection, upgraded=False)
    _assert_no_new_evidence(connection)

    op.drop_constraint(_REMOTE_LIFECYCLE, _REMOTE, type_="check")
    op.drop_constraint(_TRANSITION_REASON, _TRANSITION, type_="check")
    _create_upgraded_constraints()

    _assert_constraint_mode(connection, upgraded=True)
    _assert_runtime_acl(connection, identity)


def downgrade() -> None:
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_tables(connection)
    for table in (_REMOTE, _TRANSITION):
        _assert_owner(connection, identity, table)
    _assert_runtime_acl(connection, identity)
    _assert_constraint_mode(connection, upgraded=True)
    _assert_no_new_evidence(connection)

    op.drop_constraint(_REMOTE_LIFECYCLE, _REMOTE, type_="check")
    op.drop_constraint(_TRANSITION_REASON, _TRANSITION, type_="check")
    _create_legacy_constraints()

    _assert_constraint_mode(connection, upgraded=False)
    _assert_runtime_acl(connection, identity)
