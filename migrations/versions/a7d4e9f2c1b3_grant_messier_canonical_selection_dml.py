"""Grant the minimum runtime privileges for reviewed Messier selection writes."""

from __future__ import annotations

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "a7d4e9f2c1b3"
down_revision = "9c7e4a1d2f6b"
branch_labels = None
depends_on = None

_TABLE = "canonical_measurement"
_INSERT_COLUMNS = (
    "id",
    "entity_id",
    "quantity_id",
    "measurement_id",
    "selection_rule",
    "selection_version",
    "explanation",
)
_UPDATE_COLUMNS = ("superseded_at",)
_ALL_COLUMNS = (*_INSERT_COLUMNS, "selected_at", "superseded_at")
_SAFE_ERROR = "Messier canonical-selection ACL migration precondition failed."


def _fail() -> None:
    raise RuntimeError(_SAFE_ERROR)


def _identity() -> MigrationIdentity:
    configured = context.get_context().config.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _assert_actor(connection: Connection) -> MigrationIdentity:
    identity = _identity()
    current, session = connection.execute(sa.text("SELECT current_user, session_user")).one()
    if (
        current != identity.migration_role
        or session != identity.migration_role
        or current == identity.runtime_role
    ):
        _fail()
    return identity


def _assert_revision(connection: Connection, expected: str) -> None:
    if (
        connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
        != expected
    ):
        _fail()


def _assert_base_acl(connection: Connection, identity: MigrationIdentity) -> None:
    if not connection.execute(
        sa.text("SELECT has_table_privilege(:role, 'public.canonical_measurement', 'SELECT')"),
        {"role": identity.runtime_role},
    ).scalar_one():
        _fail()
    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        if connection.execute(
            sa.text(
                "SELECT has_table_privilege(:role, 'public.canonical_measurement', :privilege)"
            ),
            {"role": identity.runtime_role, "privilege": privilege},
        ).scalar_one():
            _fail()
    for column in (*_INSERT_COLUMNS, *_UPDATE_COLUMNS, "selected_at"):
        if connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, "
                "'public.canonical_measurement', :column, :privilege)"
            ),
            {"role": identity.runtime_role, "column": column, "privilege": "INSERT"},
        ).scalar_one():
            _fail()
        if connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, "
                "'public.canonical_measurement', :column, :privilege)"
            ),
            {"role": identity.runtime_role, "column": column, "privilege": "UPDATE"},
        ).scalar_one():
            _fail()


def _assert_new_acl(connection: Connection, identity: MigrationIdentity) -> None:
    if not connection.execute(
        sa.text("SELECT has_table_privilege(:role, 'public.canonical_measurement', 'SELECT')"),
        {"role": identity.runtime_role},
    ).scalar_one():
        _fail()
    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        if connection.execute(
            sa.text(
                "SELECT has_table_privilege(:role, 'public.canonical_measurement', :privilege)"
            ),
            {"role": identity.runtime_role, "privilege": privilege},
        ).scalar_one():
            _fail()
    for column in _INSERT_COLUMNS:
        if not connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, "
                "'public.canonical_measurement', :column, 'INSERT')"
            ),
            {"role": identity.runtime_role, "column": column},
        ).scalar_one():
            _fail()
    for column in _ALL_COLUMNS:
        if (
            column not in _INSERT_COLUMNS
            and connection.execute(
                sa.text(
                    "SELECT has_column_privilege(:role, "
                    "'public.canonical_measurement', :column, 'INSERT')"
                ),
                {"role": identity.runtime_role, "column": column},
            ).scalar_one()
        ):
            _fail()
    for column in _ALL_COLUMNS:
        if column in _UPDATE_COLUMNS:
            continue
        if connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, "
                "'public.canonical_measurement', :column, 'UPDATE')"
            ),
            {"role": identity.runtime_role, "column": column},
        ).scalar_one():
            _fail()
    if not connection.execute(
        sa.text(
            "SELECT has_column_privilege(:role, "
            "'public.canonical_measurement', 'superseded_at', 'UPDATE')"
        ),
        {"role": identity.runtime_role},
    ).scalar_one():
        _fail()


def upgrade() -> None:
    if context.is_offline_mode():
        _fail()
    connection = op.get_bind()
    identity = _assert_actor(connection)
    _assert_revision(connection, down_revision)
    connection.execute(
        sa.text("LOCK TABLE public.canonical_measurement IN SHARE ROW EXCLUSIVE MODE")
    )
    _assert_base_acl(connection, identity)
    preparer = connection.dialect.identifier_preparer
    role = preparer.quote(identity.runtime_role)
    columns = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    connection.exec_driver_sql(
        f"GRANT INSERT ({columns}) ON TABLE public.{preparer.quote(_TABLE)} TO {role}"
    )
    connection.exec_driver_sql(
        f"GRANT UPDATE ({preparer.quote(_UPDATE_COLUMNS[0])}) "
        f"ON TABLE public.{preparer.quote(_TABLE)} TO {role}"
    )
    _assert_new_acl(connection, identity)


def downgrade() -> None:
    if context.is_offline_mode():
        _fail()
    connection = op.get_bind()
    identity = _assert_actor(connection)
    _assert_revision(connection, revision)
    connection.execute(
        sa.text("LOCK TABLE public.canonical_measurement IN SHARE ROW EXCLUSIVE MODE")
    )
    _assert_new_acl(connection, identity)
    preparer = connection.dialect.identifier_preparer
    role = preparer.quote(identity.runtime_role)
    columns = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    connection.exec_driver_sql(
        f"REVOKE INSERT ({columns}) ON TABLE public.{preparer.quote(_TABLE)} FROM {role}"
    )
    connection.exec_driver_sql(
        f"REVOKE UPDATE ({preparer.quote(_UPDATE_COLUMNS[0])}) "
        f"ON TABLE public.{preparer.quote(_TABLE)} FROM {role}"
    )
    _assert_base_acl(connection, identity)
