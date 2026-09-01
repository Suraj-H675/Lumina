"""Move canonical-selection writes from the runtime role to a local operator role."""

from __future__ import annotations

from typing import Final, NoReturn

import sqlalchemy as sa
from alembic import context, op
from lumina.shared.infrastructure.database.migration_identity import MigrationIdentity
from sqlalchemy.engine import Connection

revision = "c9f6a2b3d4e5"
down_revision = "b8e5f1a2c3d4"
branch_labels = None
depends_on = None

_SAFE_ERROR: Final = "Catalogue operator ACL migration precondition failed."
_TABLE: Final = "canonical_measurement"
_SELECT_TABLES: Final = (
    "canonical_measurement",
    "dataset",
    "entity",
    "measurement",
    "provider",
    "quantity",
    "source_record",
)
_INSERT_COLUMNS: Final = (
    "id",
    "entity_id",
    "quantity_id",
    "measurement_id",
    "selection_rule",
    "selection_version",
    "explanation",
)
_UPDATE_COLUMNS: Final = ("superseded_at",)
_ALL_COLUMNS: Final = (
    "id",
    "entity_id",
    "quantity_id",
    "measurement_id",
    "selection_rule",
    "selection_version",
    "explanation",
    "selected_at",
    "superseded_at",
)
_OPERATOR_BY_RUNTIME: Final = {
    "lumina_app": "lumina_catalog_operator",
    "lumina_test_app": "lumina_test_catalog_operator",
}


def _fail() -> NoReturn:
    raise RuntimeError(_SAFE_ERROR) from None


def _connection() -> Connection:
    if context.is_offline_mode():
        _fail()
    return op.get_bind()


def _identity() -> MigrationIdentity:
    configured = context.get_context().config.attributes.get("migration_identity")
    if not isinstance(configured, MigrationIdentity):
        _fail()
    return configured


def _operator_role(identity: MigrationIdentity) -> str:
    try:
        return _OPERATOR_BY_RUNTIME[identity.runtime_role]
    except KeyError:
        _fail()


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
        connection.execute(
            sa.text("SELECT version_num FROM public.alembic_version")
        ).scalar_one_or_none()
        != expected
    ):
        _fail()


def _assert_role(connection: Connection, role: str) -> None:
    state = connection.execute(
        sa.text(
            "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, "
            "rolbypassrls, rolinherit FROM pg_roles WHERE rolname = :role"
        ),
        {"role": role},
    ).one_or_none()
    if state != (True, False, False, False, False, False, False):
        _fail()
    if (
        connection.execute(
            sa.text(
                "SELECT count(*) FROM pg_auth_members AS membership "
                "JOIN pg_roles AS role ON role.oid = membership.roleid "
                "JOIN pg_roles AS member ON member.oid = membership.member "
                "WHERE role.rolname = :role OR member.rolname = :role"
            ),
            {"role": role},
        ).scalar_one()
        != 0
    ):
        _fail()
    if connection.execute(
        sa.text("SELECT has_database_privilege(:role, current_database(), 'TEMPORARY')"),
        {"role": role},
    ).scalar_one():
        _fail()
    if (
        not connection.execute(
            sa.text("SELECT has_schema_privilege(:role, 'public', 'USAGE')"), {"role": role}
        ).scalar_one()
        or connection.execute(
            sa.text("SELECT has_schema_privilege(:role, 'public', 'CREATE')"), {"role": role}
        ).scalar_one()
    ):
        _fail()


def _assert_no_owner(connection: Connection, role: str) -> None:
    if (
        connection.execute(
            sa.text(
                "SELECT count(*) FROM pg_class AS relation "
                "JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace "
                "JOIN pg_roles AS owner ON owner.oid = relation.relowner "
                "WHERE namespace.nspname = 'public' AND owner.rolname = :role"
            ),
            {"role": role},
        ).scalar_one()
        != 0
    ):
        _fail()


def _assert_public_read_only(connection: Connection) -> None:
    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        if connection.execute(
            sa.text(
                "SELECT has_table_privilege('public', 'public.canonical_measurement', :privilege)"
            ),
            {"privilege": privilege},
        ).scalar_one():
            _fail()


def _assert_no_grant_options(connection: Connection, role: str) -> None:
    table_options = connection.execute(
        sa.text(
            "SELECT count(*) FROM information_schema.role_table_grants "
            "WHERE grantee = :role AND is_grantable = 'YES'"
        ),
        {"role": role},
    ).scalar_one()
    column_options = connection.execute(
        sa.text(
            "SELECT count(*) FROM information_schema.column_privileges "
            "WHERE grantee = :role AND is_grantable = 'YES'"
        ),
        {"role": role},
    ).scalar_one()
    if table_options != 0 or column_options != 0:
        _fail()


def _assert_runtime_base_acl(connection: Connection, identity: MigrationIdentity) -> None:
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
    for column in _ALL_COLUMNS:
        for privilege in ("INSERT", "UPDATE"):
            if connection.execute(
                sa.text(
                    "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                    ":column, :privilege)"
                ),
                {"role": identity.runtime_role, "column": column, "privilege": privilege},
            ).scalar_one():
                _fail()


def _assert_runtime_selection_acl(connection: Connection, identity: MigrationIdentity) -> None:
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
                "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                ":column, 'INSERT')"
            ),
            {"role": identity.runtime_role, "column": column},
        ).scalar_one():
            _fail()
    for column in _ALL_COLUMNS:
        if (
            column not in _INSERT_COLUMNS
            and connection.execute(
                sa.text(
                    "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                    ":column, 'INSERT')"
                ),
                {"role": identity.runtime_role, "column": column},
            ).scalar_one()
        ):
            _fail()
    for column in _ALL_COLUMNS:
        expected = column in _UPDATE_COLUMNS
        actual = connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                ":column, 'UPDATE')"
            ),
            {"role": identity.runtime_role, "column": column},
        ).scalar_one()
        if actual != expected:
            _fail()


def _assert_operator_absent(connection: Connection, role: str) -> None:
    for table in _SELECT_TABLES:
        for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"):
            if connection.execute(
                sa.text("SELECT has_table_privilege(:role, :table_name, :privilege)"),
                {"role": role, "table_name": f"public.{table}", "privilege": privilege},
            ).scalar_one():
                _fail()
    for column in _ALL_COLUMNS:
        for privilege in ("INSERT", "UPDATE"):
            if connection.execute(
                sa.text(
                    "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                    ":column, :privilege)"
                ),
                {"role": role, "column": column, "privilege": privilege},
            ).scalar_one():
                _fail()
    _assert_no_grant_options(connection, role)


def _assert_operator_acl(connection: Connection, role: str) -> None:
    for table in _SELECT_TABLES:
        if not connection.execute(
            sa.text("SELECT has_table_privilege(:role, :table_name, 'SELECT')"),
            {"role": role, "table_name": f"public.{table}"},
        ).scalar_one():
            _fail()
    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
        if connection.execute(
            sa.text(
                "SELECT has_table_privilege(:role, 'public.canonical_measurement', :privilege)"
            ),
            {"role": role, "privilege": privilege},
        ).scalar_one():
            _fail()
    for column in _INSERT_COLUMNS:
        if not connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                ":column, 'INSERT')"
            ),
            {"role": role, "column": column},
        ).scalar_one():
            _fail()
    for column in _ALL_COLUMNS:
        if (
            column not in _INSERT_COLUMNS
            and connection.execute(
                sa.text(
                    "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                    ":column, 'INSERT')"
                ),
                {"role": role, "column": column},
            ).scalar_one()
        ):
            _fail()
    for column in _ALL_COLUMNS:
        expected = column in _UPDATE_COLUMNS
        actual = connection.execute(
            sa.text(
                "SELECT has_column_privilege(:role, 'public.canonical_measurement', "
                ":column, 'UPDATE')"
            ),
            {"role": role, "column": column},
        ).scalar_one()
        if actual != expected:
            _fail()
    _assert_no_grant_options(connection, role)


def _assert_pre_upgrade(connection: Connection, identity: MigrationIdentity, role: str) -> None:
    _assert_runtime_selection_acl(connection, identity)
    _assert_role(connection, role)
    _assert_no_owner(connection, role)
    _assert_public_read_only(connection)
    for table in _SELECT_TABLES:
        if connection.execute(
            sa.text("SELECT has_table_privilege(:role, :table_name, 'SELECT')"),
            {"role": role, "table_name": f"public.{table}"},
        ).scalar_one():
            _fail()


def _assert_no_v2_dependencies(connection: Connection) -> None:
    count = connection.execute(
        sa.text(
            "SELECT count(*) FROM public.canonical_measurement AS canonical "
            "WHERE canonical.selection_rule = 'simbad_messier_j2000_catalogue_anchor' "
            "AND canonical.selection_version = 'v2'"
        )
    ).scalar_one()
    dataset_count = connection.execute(
        sa.text(
            "SELECT count(*) FROM public.dataset AS dataset "
            "JOIN public.provider AS provider ON provider.id = dataset.provider_id "
            "WHERE provider.code = 'cds-simbad' AND dataset.code = 'messier-j2000' "
            "AND dataset.release_version = 'v2'"
        )
    ).scalar_one()
    if count != 0 or dataset_count != 0:
        _fail()


def _grant_operator(connection: Connection, role: str) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    tables = ", ".join(f"public.{preparer.quote(table)}" for table in _SELECT_TABLES)
    connection.exec_driver_sql(f"GRANT SELECT ON TABLE {tables} TO {quoted_role}")
    columns = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    connection.exec_driver_sql(
        f"GRANT INSERT ({columns}) ON TABLE public.{preparer.quote(_TABLE)} TO {quoted_role}"
    )
    connection.exec_driver_sql(
        f"GRANT UPDATE ({preparer.quote(_UPDATE_COLUMNS[0])}) "
        f"ON TABLE public.{preparer.quote(_TABLE)} TO {quoted_role}"
    )


def _revoke_operator(connection: Connection, role: str) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(role)
    tables = ", ".join(f"public.{preparer.quote(table)}" for table in _SELECT_TABLES)
    connection.exec_driver_sql(f"REVOKE SELECT ON TABLE {tables} FROM {quoted_role}")
    columns = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    connection.exec_driver_sql(
        f"REVOKE INSERT ({columns}) ON TABLE public.{preparer.quote(_TABLE)} FROM {quoted_role}"
    )
    connection.exec_driver_sql(
        f"REVOKE UPDATE ({preparer.quote(_UPDATE_COLUMNS[0])}) "
        f"ON TABLE public.{preparer.quote(_TABLE)} FROM {quoted_role}"
    )


def _restore_runtime_columns(connection: Connection, identity: MigrationIdentity) -> None:
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    columns = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    connection.exec_driver_sql(
        f"GRANT INSERT ({columns}) ON TABLE public.{preparer.quote(_TABLE)} TO {quoted_role}"
    )
    connection.exec_driver_sql(
        f"GRANT UPDATE ({preparer.quote(_UPDATE_COLUMNS[0])}) "
        f"ON TABLE public.{preparer.quote(_TABLE)} TO {quoted_role}"
    )


def upgrade() -> None:
    connection = _connection()
    identity = _assert_actor(connection)
    _assert_revision(connection, down_revision)
    role = _operator_role(identity)
    connection.execute(
        sa.text("LOCK TABLE public.canonical_measurement IN SHARE ROW EXCLUSIVE MODE")
    )
    _assert_pre_upgrade(connection, identity, role)
    preparer = connection.dialect.identifier_preparer
    quoted_role = preparer.quote(identity.runtime_role)
    columns = ", ".join(preparer.quote(column) for column in _INSERT_COLUMNS)
    connection.exec_driver_sql(
        f"REVOKE INSERT ({columns}) ON TABLE public.{preparer.quote(_TABLE)} FROM {quoted_role}"
    )
    connection.exec_driver_sql(
        f"REVOKE UPDATE ({preparer.quote(_UPDATE_COLUMNS[0])}) "
        f"ON TABLE public.{preparer.quote(_TABLE)} FROM {quoted_role}"
    )
    _grant_operator(connection, role)
    _assert_runtime_base_acl(connection, identity)
    _assert_operator_acl(connection, role)
    _assert_public_read_only(connection)


def downgrade() -> None:
    connection = _connection()
    identity = _assert_actor(connection)
    _assert_revision(connection, revision)
    role = _operator_role(identity)
    connection.execute(
        sa.text("LOCK TABLE public.canonical_measurement IN SHARE ROW EXCLUSIVE MODE")
    )
    _assert_operator_acl(connection, role)
    _assert_runtime_base_acl(connection, identity)
    _assert_no_v2_dependencies(connection)
    _revoke_operator(connection, role)
    _restore_runtime_columns(connection, identity)
    _assert_runtime_selection_acl(connection, identity)
    _assert_operator_absent(connection, role)
    _assert_public_read_only(connection)
