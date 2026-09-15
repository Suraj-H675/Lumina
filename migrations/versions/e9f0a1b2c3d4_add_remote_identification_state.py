"""Add durable lease-fenced remote identification state."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Connection

revision = "e9f0a1b2c3d4"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None

_SUBMISSION: Final = "identification_submission"
_REMOTE: Final = "identification_remote_solve"
_TRANSITION: Final = "identification_remote_transition"
_REMOTE_STATES: Final = (
    "submitting",
    "waiting_for_solver",
    "solving",
    "fetching_results",
    "succeeded",
    "unsolved",
    "failed",
    "expired",
    "deleted",
)
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
_SAFE_ERROR: Final = "Remote identification migration precondition failed."


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
            "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, "
            "rolbypassrls, rolinherit FROM pg_roles WHERE rolname = :role"
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


def _assert_revision(connection: Connection, expected: str) -> None:
    actual = connection.execute(
        sa.text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()
    if actual != expected:
        _fail()


def _assert_tables(connection: Connection, *, remote_present: bool) -> None:
    expected = (_REMOTE, _TRANSITION) if remote_present else ()
    actual = tuple(
        name
        for name in (_REMOTE, _TRANSITION)
        if connection.execute(
            sa.text("SELECT to_regclass(:name)"),
            {"name": f"public.{name}"},
        ).scalar_one_or_none()
        is not None
    )
    if actual != expected:
        _fail()


def _assert_existing_submission_shape(connection: Connection) -> None:
    invalid = connection.execute(
        sa.text(
            "SELECT count(*) FROM public.identification_submission "
            "WHERE solver_type <> 'fake' OR consent_remote_processing IS DISTINCT FROM false"
        )
    ).scalar_one()
    if invalid != 0:
        _fail()


def _constraint_names(connection: Connection) -> frozenset[str]:
    return frozenset(
        str(value)
        for value in connection.execute(
            sa.text(
                "SELECT conname FROM pg_constraint "
                "WHERE conrelid = 'public.identification_submission'::regclass"
            )
        ).scalars()
    )


def _assert_parent_constraints(connection: Connection, *, upgraded: bool) -> None:
    names = _constraint_names(connection)
    required = {"ck_identification_submission_solver_type"}
    if upgraded:
        required.update(
            {
                "ck_identification_submission_solver_consent_pair",
                "uq_identification_submission_id_solver_consent",
            }
        )
        forbidden = {"ck_identification_submission_no_remote_consent"}
    else:
        required.add("ck_identification_submission_no_remote_consent")
        forbidden = {
            "ck_identification_submission_solver_consent_pair",
            "uq_identification_submission_id_solver_consent",
        }
    if not required.issubset(names) or names.intersection(forbidden):
        _fail()


def _assert_owner(connection: Connection, identity: MigrationIdentity, table: str) -> None:
    owner = connection.execute(
        sa.text(
            "SELECT pg_get_userbyid(table_data.relowner) FROM pg_class AS table_data "
            "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
            "WHERE namespace.nspname = 'public' AND table_data.relname = :table "
            "AND table_data.relkind = 'r'"
        ),
        {"table": table},
    ).scalar_one_or_none()
    if owner != identity.migration_role:
        _fail()


def _grant_runtime(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    role = preparer.quote(identity.runtime_role)
    remote_insert = ", ".join(preparer.quote(column) for column in _REMOTE_INSERT_COLUMNS)
    remote_update = ", ".join(preparer.quote(column) for column in _REMOTE_UPDATE_COLUMNS)
    transition_insert = ", ".join(preparer.quote(column) for column in _TRANSITION_INSERT_COLUMNS)
    for table in (_REMOTE, _TRANSITION):
        quoted = preparer.quote(table)
        connection.exec_driver_sql(f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted} FROM PUBLIC")
        connection.exec_driver_sql(f"REVOKE ALL PRIVILEGES ON TABLE public.{quoted} FROM {role}")
        connection.exec_driver_sql(f"GRANT SELECT ON TABLE public.{quoted} TO {role}")
    connection.exec_driver_sql(
        f"GRANT INSERT ({remote_insert}) ON TABLE public.{preparer.quote(_REMOTE)} TO {role}"
    )
    connection.exec_driver_sql(
        f"GRANT UPDATE ({remote_update}) ON TABLE public.{preparer.quote(_REMOTE)} TO {role}"
    )
    quoted_transition = preparer.quote(_TRANSITION)
    connection.exec_driver_sql(
        f"GRANT INSERT ({transition_insert}) ON TABLE public.{quoted_transition} TO {role}"
    )


def _assert_runtime_acl(connection: Connection, identity: MigrationIdentity) -> None:
    expected = {
        _REMOTE: {
            (None, "SELECT"),
            *((column, "SELECT") for column in _table_columns(connection, _REMOTE)),
            *((column, "INSERT") for column in _REMOTE_INSERT_COLUMNS),
            *((column, "UPDATE") for column in _REMOTE_UPDATE_COLUMNS),
        },
        _TRANSITION: {
            (None, "SELECT"),
            *((column, "SELECT") for column in _table_columns(connection, _TRANSITION)),
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
            granted = connection.execute(
                sa.text("SELECT has_table_privilege(:role, :table, :privilege)"),
                {
                    "role": identity.runtime_role,
                    "table": f"public.{table}",
                    "privilege": privilege,
                },
            ).scalar_one()
            if granted:
                actual.add((None, privilege))
        for column in _table_columns(connection, table):
            for privilege in ("SELECT", "INSERT", "UPDATE", "REFERENCES"):
                granted = connection.execute(
                    sa.text("SELECT has_column_privilege(:role, :table, :column, :privilege)"),
                    {
                        "role": identity.runtime_role,
                        "table": f"public.{table}",
                        "column": column,
                        "privilege": privilege,
                    },
                ).scalar_one()
                if granted:
                    actual.add((column, privilege))
        if actual != expected_acl:
            _fail()


def _table_columns(connection: Connection, table: str) -> tuple[str, ...]:
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


def _revoke_runtime(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    role = preparer.quote(identity.runtime_role)
    for table in (_TRANSITION, _REMOTE):
        connection.exec_driver_sql(
            f"REVOKE ALL PRIVILEGES ON TABLE public.{preparer.quote(table)} FROM {role}"
        )


def upgrade() -> None:
    """Permit consented Nova submissions and create fenced durable remote state."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, down_revision)
    _assert_tables(connection, remote_present=False)
    _assert_parent_constraints(connection, upgraded=False)
    _assert_existing_submission_shape(connection)

    op.drop_constraint(
        "ck_identification_submission_solver_type",
        _SUBMISSION,
        type_="check",
    )
    op.drop_constraint(
        "ck_identification_submission_no_remote_consent",
        _SUBMISSION,
        type_="check",
    )
    op.create_check_constraint(
        "ck_identification_submission_solver_type",
        _SUBMISSION,
        "solver_type IN ('fake', 'nova')",
    )
    op.create_check_constraint(
        "ck_identification_submission_solver_consent_pair",
        _SUBMISSION,
        "(solver_type = 'fake' AND consent_remote_processing = false) OR "
        "(solver_type = 'nova' AND consent_remote_processing = true)",
    )
    op.create_unique_constraint(
        "uq_identification_submission_id_solver_consent",
        _SUBMISSION,
        ["id", "solver_type", "consent_remote_processing"],
    )

    op.create_table(
        _REMOTE,
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "solver_type",
            sa.String(length=32, collation="C"),
            nullable=False,
            server_default="nova",
        ),
        sa.Column(
            "consent_remote_processing",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("provider", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("state", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("external_submission_id", sa.BigInteger(), nullable=True),
        sa.Column("external_job_id", sa.BigInteger(), nullable=True),
        sa.Column("next_poll_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("deadline_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("last_polled_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("upload_attempted_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("terminal_at", postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("safe_reason", sa.String(length=64, collation="C"), nullable=True),
        sa.Column("active_lease_token", sa.String(length=64, collation="C"), nullable=True),
        sa.Column(
            "active_lease_expires_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("submission_id", name="pk_identification_remote_solve"),
        sa.ForeignKeyConstraint(
            ["submission_id", "solver_type", "consent_remote_processing"],
            [
                "public.identification_submission.id",
                "public.identification_submission.solver_type",
                "public.identification_submission.consent_remote_processing",
            ],
            name="fk_identification_remote_solve_consented_submission",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "solver_type = 'nova' AND consent_remote_processing = true",
            name="ck_identification_remote_solve_parent_mode",
        ),
        sa.UniqueConstraint(
            "external_submission_id",
            name="uq_identification_remote_solve_external_submission_id",
        ),
        sa.UniqueConstraint(
            "external_job_id",
            name="uq_identification_remote_solve_external_job_id",
        ),
        sa.CheckConstraint("provider = 'nova'", name="ck_identification_remote_solve_provider"),
        sa.CheckConstraint(
            "state IN (" + ", ".join(f"'{state}'" for state in _REMOTE_STATES) + ")",
            name="ck_identification_remote_solve_state",
        ),
        sa.CheckConstraint(
            "external_submission_id IS NULL OR external_submission_id > 0",
            name="ck_identification_remote_solve_submission_id_positive",
        ),
        sa.CheckConstraint(
            "external_job_id IS NULL OR external_job_id > 0",
            name="ck_identification_remote_solve_job_id_positive",
        ),
        sa.CheckConstraint(
            "deadline_at > created_at AND updated_at >= created_at",
            name="ck_identification_remote_solve_time_order",
        ),
        sa.CheckConstraint(
            "next_poll_at IS NULL OR next_poll_at >= created_at",
            name="ck_identification_remote_solve_next_poll_order",
        ),
        sa.CheckConstraint(
            "last_polled_at IS NULL OR last_polled_at >= created_at",
            name="ck_identification_remote_solve_last_poll_order",
        ),
        sa.CheckConstraint(
            "upload_attempted_at IS NULL OR upload_attempted_at >= created_at",
            name="ck_identification_remote_solve_upload_attempt_order",
        ),
        sa.CheckConstraint(
            "terminal_at IS NULL OR terminal_at >= created_at",
            name="ck_identification_remote_solve_terminal_order",
        ),
        sa.CheckConstraint(
            "(active_lease_token IS NULL) = (active_lease_expires_at IS NULL)",
            name="ck_identification_remote_solve_lease_pair",
        ),
        sa.CheckConstraint(
            "active_lease_token IS NULL OR active_lease_token ~ '^[0-9a-f]{64}$'",
            name="ck_identification_remote_solve_lease_token",
        ),
        sa.CheckConstraint(
            "safe_reason IS NULL OR safe_reason ~ '^[a-z][a-z0-9_.-]{0,63}$'",
            name="ck_identification_remote_solve_safe_reason",
        ),
        sa.CheckConstraint(
            "((state IN ('submitting', 'waiting_for_solver', 'solving', 'fetching_results') "
            "AND next_poll_at IS NOT NULL AND terminal_at IS NULL AND safe_reason IS NULL) "
            "OR (state IN ('succeeded', 'unsolved', 'failed', 'expired', 'deleted') "
            "AND next_poll_at IS NULL AND terminal_at IS NOT NULL AND safe_reason IS NOT NULL))",
            name="ck_identification_remote_solve_lifecycle_shape",
        ),
        sa.CheckConstraint(
            "((state = 'submitting' AND external_submission_id IS NULL "
            "AND external_job_id IS NULL) OR "
            "(state = 'waiting_for_solver' AND external_submission_id IS NOT NULL "
            "AND external_job_id IS NULL AND upload_attempted_at IS NOT NULL) OR "
            "(state IN ('solving', 'fetching_results', 'succeeded', 'unsolved') "
            "AND external_submission_id IS NOT NULL AND external_job_id IS NOT NULL) OR "
            "(state IN ('failed', 'expired', 'deleted')))",
            name="ck_identification_remote_solve_external_id_shape",
        ),
    )
    op.create_index(
        "ix_identification_remote_solve_due",
        _REMOTE,
        ["next_poll_at", "submission_id"],
        unique=False,
        postgresql_where=sa.text("next_poll_at IS NOT NULL AND terminal_at IS NULL"),
    )

    op.create_table(
        _TRANSITION,
        sa.Column("event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_state", sa.String(length=32, collation="C"), nullable=True),
        sa.Column("to_state", sa.String(length=32, collation="C"), nullable=False),
        sa.Column("reason", sa.String(length=64, collation="C"), nullable=False),
        sa.Column("recorded_at", postgresql.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("event_id", name="pk_identification_remote_transition"),
        sa.ForeignKeyConstraint(
            ["submission_id"],
            ["public.identification_remote_solve.submission_id"],
            name="fk_identification_remote_transition_solve",
            onupdate="RESTRICT",
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "from_state IS NULL OR from_state IN ("
            + ", ".join(f"'{state}'" for state in _REMOTE_STATES)
            + ")",
            name="ck_identification_remote_transition_from_state",
        ),
        sa.CheckConstraint(
            "to_state IN (" + ", ".join(f"'{state}'" for state in _REMOTE_STATES) + ")",
            name="ck_identification_remote_transition_to_state",
        ),
        sa.CheckConstraint(
            "(from_state IS NULL AND to_state = 'submitting') OR "
            "(from_state IS NOT NULL AND from_state <> to_state)",
            name="ck_identification_remote_transition_shape",
        ),
        sa.CheckConstraint(
            "(to_state = 'submitting' AND reason = 'remote_processing_consented') OR "
            "(to_state = 'waiting_for_solver' AND reason = 'remote_upload_accepted') OR "
            "(to_state = 'solving' AND reason = 'remote_job_resolved') OR "
            "(to_state = 'fetching_results' AND reason = 'remote_job_succeeded') OR "
            "(to_state = 'succeeded' AND reason = 'results_stored') OR "
            "(to_state = 'unsolved' AND reason = 'no_astrometric_solution') OR "
            "(to_state = 'expired' AND reason = 'solver_timeout') OR "
            "(to_state = 'deleted' AND reason = 'local_deleted') OR "
            "(to_state = 'failed' AND reason IN ('provider_rejected', "
            "'provider_protocol_error', 'remote_submission_outcome_unknown', "
            "'local_input_unavailable'))",
            name="ck_identification_remote_transition_reason",
        ),
    )
    op.create_index(
        "ix_identification_remote_transition_submission_time",
        _TRANSITION,
        ["submission_id", "recorded_at", "event_id"],
        unique=False,
    )

    _grant_runtime(connection, identity)
    _assert_parent_constraints(connection, upgraded=True)
    _assert_tables(connection, remote_present=True)
    for table in (_REMOTE, _TRANSITION):
        _assert_owner(connection, identity, table)
    _assert_runtime_acl(connection, identity)


def downgrade() -> None:
    """Remove remote state only when no remote or consented submission evidence exists."""
    connection = _connection()
    identity = _identity()
    _assert_actor(connection, identity)
    _assert_revision(connection, revision)
    _assert_parent_constraints(connection, upgraded=True)
    _assert_tables(connection, remote_present=True)
    for table in (_REMOTE, _TRANSITION):
        _assert_owner(connection, identity, table)
    _assert_runtime_acl(connection, identity)
    if connection.execute(sa.text(f"SELECT count(*) FROM public.{_TRANSITION}")).scalar_one() != 0:
        _fail()
    if connection.execute(sa.text(f"SELECT count(*) FROM public.{_REMOTE}")).scalar_one() != 0:
        _fail()
    _assert_existing_submission_shape(connection)

    _revoke_runtime(connection, identity)
    op.drop_index("ix_identification_remote_transition_submission_time", table_name=_TRANSITION)
    op.drop_table(_TRANSITION)
    op.drop_index("ix_identification_remote_solve_due", table_name=_REMOTE)
    op.drop_table(_REMOTE)

    op.drop_constraint(
        "uq_identification_submission_id_solver_consent",
        _SUBMISSION,
        type_="unique",
    )
    op.drop_constraint(
        "ck_identification_submission_solver_consent_pair",
        _SUBMISSION,
        type_="check",
    )
    op.drop_constraint(
        "ck_identification_submission_solver_type",
        _SUBMISSION,
        type_="check",
    )
    op.create_check_constraint(
        "ck_identification_submission_solver_type",
        _SUBMISSION,
        "solver_type = 'fake'",
    )
    op.create_check_constraint(
        "ck_identification_submission_no_remote_consent",
        _SUBMISSION,
        "consent_remote_processing = false",
    )
    _assert_parent_constraints(connection, upgraded=False)
