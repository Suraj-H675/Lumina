"""ACL revision identity, exact grants, and fail-closed reversibility."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import pytest
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.migration_identity import (
    MigrationIdentityError,
    validate_migration_identity,
)
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    historical_admin_connection_url,
    historical_migration_identity,
    historical_migration_identity_with_runtime,
    historical_runtime_url,
    historical_sync_url,
    normalize_historical_database_to_b2,
    run_alembic,
    run_migration_operation,
)

_ROLE_B = "lumina_acl_test_b"
_GRANTOR_ROLE = "lumina_acl_grantor"
_COLUMN_ROLE = "lumina_acl_column_role"
_MEMBERSHIP_ROLES = (
    "lumina_acl_member_one",
    "lumina_acl_member_two",
    "lumina_acl_member_three",
)
_INSERT_COLUMNS = {
    "id",
    "job_type",
    "idempotency_key",
    "priority",
    "payload",
    "max_attempts",
}
_UPDATE_COLUMNS = {
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
}

type AclEntry = tuple[str, str, str | None, str, str, str, bool]


@pytest.fixture(autouse=True)
def _historical_job_database(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    """Pin job ACL lifecycle tests to the disposable pre-B3 history database."""
    normalize_historical_database_to_b2(integration_settings)
    yield


def _acl_snapshot(connection: Connection) -> set[AclEntry]:
    return {
        (
            str(row.schema_name),
            str(row.table_name),
            None,
            str(row.grantor),
            str(row.grantee),
            str(row.privilege_type),
            bool(row.is_grantable),
        )
        for row in connection.execute(
            text(
                "SELECT namespace.nspname AS schema_name, "
                "table_data.relname AS table_name, "
                "grantor.rolname AS grantor, "
                "COALESCE(grantee.rolname, 'PUBLIC') AS grantee, "
                "privilege.privilege_type, privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "CROSS JOIN LATERAL aclexplode(table_data.relacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' AND table_data.relname = 'job'"
            )
        )
    } | {
        (
            str(row.schema_name),
            str(row.table_name),
            str(row.attname),
            str(row.grantor),
            str(row.grantee),
            str(row.privilege_type),
            bool(row.is_grantable),
        )
        for row in connection.execute(
            text(
                "SELECT namespace.nspname AS schema_name, "
                "table_data.relname AS table_name, attribute.attname, "
                "grantor.rolname AS grantor, "
                "COALESCE(grantee.rolname, 'PUBLIC') AS grantee, "
                "privilege.privilege_type, privilege.is_grantable "
                "FROM pg_class AS table_data "
                "JOIN pg_namespace AS namespace ON namespace.oid = table_data.relnamespace "
                "JOIN pg_attribute AS attribute ON attribute.attrelid = table_data.oid "
                "CROSS JOIN LATERAL aclexplode(attribute.attacl) AS privilege "
                "JOIN pg_roles AS grantor ON grantor.oid = privilege.grantor "
                "LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee "
                "WHERE namespace.nspname = 'public' AND table_data.relname = 'job' "
                "AND attribute.attnum > 0 AND NOT attribute.attisdropped"
            )
        )
    }


def _runtime_acl(
    snapshot: set[AclEntry],
    role: str,
) -> set[tuple[str, str | None]]:
    return {
        (privilege, column)
        for _, _, column, _, grantee, privilege, _ in snapshot
        if grantee == role
    }


def _expected_runtime_acl() -> set[tuple[str, str | None]]:
    return (
        {("SELECT", None)}
        | {("INSERT", column) for column in _INSERT_COLUMNS}
        | {("UPDATE", column) for column in _UPDATE_COLUMNS}
    )


@contextmanager
def _admin_connection(admin_url: URL) -> Iterator[Connection]:
    engine = create_engine(admin_url, poolclass=NullPool)
    try:
        with engine.begin() as connection:
            yield connection
    finally:
        engine.dispose()


@pytest.fixture
def alternate_runtime_role(postgres_admin_sync_url: URL) -> Iterator[None]:
    with _admin_connection(historical_admin_connection_url(postgres_admin_sync_url)) as connection:
        connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_ROLE_B}")
        connection.exec_driver_sql(
            f"CREATE ROLE {_ROLE_B} LOGIN NOSUPERUSER NOCREATEDB "
            "NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
        )
    try:
        yield
    finally:
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_ROLE_B}")


def _runtime_url_for(settings: IntegrationTestSettings, role: str) -> URL:
    return historical_runtime_url(settings).set(username=role, password="acl-test-secret")


def test_acl_upgrade_downgrade_role_mismatch_and_restore(
    integration_settings: IntegrationTestSettings,
    alternate_runtime_role: None,
) -> None:
    del alternate_runtime_role
    sync_url = historical_sync_url(integration_settings)
    identity_a = historical_migration_identity(integration_settings)
    identity_b = historical_migration_identity_with_runtime(
        integration_settings,
        runtime_url=_runtime_url_for(integration_settings, _ROLE_B),
    )

    def snapshot(connection: Connection) -> set[AclEntry]:
        return _acl_snapshot(connection)

    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity_a, "0001_create_job", downgrade=True),
    )
    baseline = run_migration_operation(sync_url, snapshot)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity_a, "b7f3a2c81d4e", downgrade=False),
    )

    before_refusal = run_migration_operation(sync_url, snapshot)
    assert _runtime_acl(before_refusal, identity_a.runtime_role) == _expected_runtime_acl()

    with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection, identity_b, "0001_create_job", downgrade=True
            ),
        )
    assert run_migration_operation(sync_url, snapshot) == before_refusal

    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity_a, "0001_create_job", downgrade=True),
    )
    after_downgrade = run_migration_operation(sync_url, snapshot)
    assert after_downgrade == baseline
    assert _runtime_acl(after_downgrade, identity_a.runtime_role) == set()

    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity_a, "b7f3a2c81d4e", downgrade=False),
    )
    assert (
        _runtime_acl(run_migration_operation(sync_url, snapshot), identity_a.runtime_role)
        == _expected_runtime_acl()
    )


@pytest.mark.parametrize("role", ["lumina_missing_runtime", "lumina_admin"])
def test_nonexistent_or_superuser_runtime_role_fails_before_acl_changes(
    integration_settings: IntegrationTestSettings,
    role: str,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity_a = historical_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity_a, "0001_create_job", downgrade=True),
    )
    invalid_identity = historical_migration_identity_with_runtime(
        integration_settings,
        runtime_url=_runtime_url_for(integration_settings, role),
    )

    def snapshot(connection: Connection) -> set[AclEntry]:
        return _acl_snapshot(connection)

    before = run_migration_operation(sync_url, snapshot)
    with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection, invalid_identity, "b7f3a2c81d4e", downgrade=False
            ),
        )
    assert run_migration_operation(sync_url, snapshot) == before
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity_a, "b7f3a2c81d4e", downgrade=False),
    )


def test_missing_unsafe_or_migration_runtime_identity_is_rejected_before_alembic(
    integration_settings: IntegrationTestSettings,
) -> None:
    migration_url = historical_sync_url(integration_settings)
    runtime_url = historical_runtime_url(integration_settings)
    invalid_urls = [
        URL.create(
            runtime_url.drivername,
            password=runtime_url.password,
            host=runtime_url.host,
            port=runtime_url.port,
            database=runtime_url.database,
        ),
        runtime_url.set(username="unsafe-role"),
        runtime_url.set(username=migration_url.username),
    ]

    for invalid_url in invalid_urls:
        with pytest.raises(MigrationIdentityError, match="Migration database identity is invalid"):
            validate_migration_identity(migration_url, invalid_url)


@pytest.mark.parametrize(
    "membership_statements",
    [
        ("GRANT lumina_test_app TO lumina_acl_member_one",),
        ("GRANT lumina_acl_member_one TO lumina_test_app",),
        (
            "GRANT lumina_test_app TO lumina_acl_member_one",
            "GRANT lumina_acl_member_one TO lumina_acl_member_two",
        ),
        (
            "GRANT lumina_acl_member_one TO lumina_test_app",
            "GRANT lumina_acl_member_two TO lumina_acl_member_one",
        ),
        ("GRANT lumina_test_app TO lumina_acl_member_one WITH INHERIT FALSE, SET TRUE",),
        ("GRANT lumina_test_app TO lumina_acl_member_one WITH INHERIT TRUE, SET FALSE",),
    ],
)
def test_any_direct_or_transitive_runtime_membership_fails_without_acl_change(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    membership_statements: tuple[str, ...],
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "0001_create_job", downgrade=True),
    )
    try:
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            for role in reversed(_MEMBERSHIP_ROLES):
                connection.exec_driver_sql(f"DROP ROLE IF EXISTS {role}")
            for role in _MEMBERSHIP_ROLES:
                connection.exec_driver_sql(
                    f"CREATE ROLE {role} NOLOGIN NOSUPERUSER NOCREATEDB "
                    "NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
                )
            for statement in membership_statements:
                connection.exec_driver_sql(statement)

        before = run_migration_operation(sync_url, _acl_snapshot)
        with pytest.raises(RuntimeError) as failure:
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, "b7f3a2c81d4e", downgrade=False
                ),
            )
        assert str(failure.value) == "Runtime ACL migration precondition failed."
        assert "lumina_test" not in repr(failure.value)
        assert run_migration_operation(sync_url, _acl_snapshot) == before
    finally:
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            for role in reversed(_MEMBERSHIP_ROLES):
                connection.exec_driver_sql(f"DROP ROLE IF EXISTS {role}")
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
        )


def test_grant_option_refuses_downgrade_without_partial_revocation(
    integration_settings: IntegrationTestSettings,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)

    def add_grant_option(connection: Connection) -> None:
        connection.exec_driver_sql(
            "GRANT SELECT ON TABLE public.job TO lumina_test_app WITH GRANT OPTION"
        )
        connection.commit()

    def remove_grant_option(connection: Connection) -> None:
        connection.exec_driver_sql(
            "REVOKE GRANT OPTION FOR SELECT ON TABLE public.job FROM lumina_test_app"
        )
        connection.commit()

    run_migration_operation(sync_url, add_grant_option)
    before = run_migration_operation(sync_url, _acl_snapshot)
    assert any(
        grantee == identity.runtime_role and privilege == "SELECT" and is_grantable
        for _, _, _, _, grantee, privilege, is_grantable in before
    )

    with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection,
                identity,
                "0001_create_job",
                downgrade=True,
            ),
        )
    assert run_migration_operation(sync_url, _acl_snapshot) == before

    run_migration_operation(sync_url, remove_grant_option)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "0001_create_job", downgrade=True),
    )
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
    )


def test_changed_grantor_refuses_downgrade_without_partial_revocation(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    test_admin_url = historical_admin_connection_url(postgres_admin_sync_url)

    def replace_expected_select(connection: Connection) -> None:
        connection.exec_driver_sql("REVOKE SELECT ON TABLE public.job FROM lumina_test_app")
        connection.exec_driver_sql(
            f"GRANT SELECT ON TABLE public.job TO {_GRANTOR_ROLE} WITH GRANT OPTION"
        )
        connection.commit()

    def restore_expected_select(connection: Connection) -> None:
        connection.exec_driver_sql(
            f"REVOKE SELECT ON TABLE public.job FROM {_GRANTOR_ROLE} CASCADE"
        )
        connection.exec_driver_sql("GRANT SELECT ON TABLE public.job TO lumina_test_app")
        connection.commit()

    with _admin_connection(historical_admin_connection_url(postgres_admin_sync_url)) as connection:
        connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_GRANTOR_ROLE}")
        connection.exec_driver_sql(
            f"CREATE ROLE {_GRANTOR_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB "
            "NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
        )
    with _admin_connection(test_admin_url) as connection:
        connection.exec_driver_sql(f"GRANT USAGE ON SCHEMA public TO {_GRANTOR_ROLE}")
    try:
        run_migration_operation(sync_url, replace_expected_select)
        with _admin_connection(test_admin_url) as connection:
            connection.exec_driver_sql(f"SET ROLE {_GRANTOR_ROLE}")
            connection.exec_driver_sql("GRANT SELECT ON TABLE public.job TO lumina_test_app")
            connection.exec_driver_sql("RESET ROLE")

        before = run_migration_operation(sync_url, _acl_snapshot)
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection,
                    identity,
                    "0001_create_job",
                    downgrade=True,
                ),
            )
        assert run_migration_operation(sync_url, _acl_snapshot) == before
    finally:
        with _admin_connection(test_admin_url) as connection:
            connection.exec_driver_sql(f"SET ROLE {_GRANTOR_ROLE}")
            connection.exec_driver_sql("REVOKE SELECT ON TABLE public.job FROM lumina_test_app")
            connection.exec_driver_sql("RESET ROLE")
        run_migration_operation(sync_url, restore_expected_select)
        with _admin_connection(test_admin_url) as connection:
            connection.exec_driver_sql(f"REVOKE USAGE ON SCHEMA public FROM {_GRANTOR_ROLE}")
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_GRANTOR_ROLE}")

    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "0001_create_job", downgrade=True),
    )
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
    )


@pytest.mark.parametrize(
    ("privilege", "principal"),
    [
        ("SELECT", "PUBLIC"),
        ("REFERENCES", "PUBLIC"),
        ("SELECT", _COLUMN_ROLE),
        ("REFERENCES", _COLUMN_ROLE),
        ("SELECT", "lumina_test_app"),
    ],
)
def test_unexpected_column_acl_refuses_upgrade_without_changes(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    privilege: str,
    principal: str,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "0001_create_job", downgrade=True),
    )
    if principal == _COLUMN_ROLE:
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_COLUMN_ROLE}")
            connection.exec_driver_sql(
                f"CREATE ROLE {_COLUMN_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB "
                "NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
            )

    def grant(connection: Connection) -> None:
        connection.exec_driver_sql(
            f"GRANT {privilege} (payload) ON TABLE public.job TO {principal}"
        )
        connection.commit()

    def revoke(connection: Connection) -> None:
        connection.exec_driver_sql(
            f"REVOKE {privilege} (payload) ON TABLE public.job FROM {principal}"
        )
        connection.commit()

    try:
        run_migration_operation(sync_url, grant)
        before = run_migration_operation(sync_url, _acl_snapshot)
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, "b7f3a2c81d4e", downgrade=False
                ),
            )
        assert run_migration_operation(sync_url, _acl_snapshot) == before
    finally:
        run_migration_operation(sync_url, revoke)
        if principal == _COLUMN_ROLE:
            with _admin_connection(
                historical_admin_connection_url(postgres_admin_sync_url)
            ) as connection:
                connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_COLUMN_ROLE}")
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
        )


@pytest.mark.parametrize(
    ("privilege", "principal"),
    [
        ("SELECT", "PUBLIC"),
        ("REFERENCES", "PUBLIC"),
        ("SELECT", _COLUMN_ROLE),
        ("REFERENCES", _COLUMN_ROLE),
    ],
)
def test_unexpected_column_acl_refuses_downgrade_without_changes(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
    privilege: str,
    principal: str,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    if principal == _COLUMN_ROLE:
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_COLUMN_ROLE}")
            connection.exec_driver_sql(
                f"CREATE ROLE {_COLUMN_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB "
                "NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
            )

    def grant(connection: Connection) -> None:
        connection.exec_driver_sql(
            f"GRANT {privilege} (payload) ON TABLE public.job TO {principal}"
        )
        connection.commit()

    def revoke(connection: Connection) -> None:
        connection.exec_driver_sql(
            f"REVOKE {privilege} (payload) ON TABLE public.job FROM {principal}"
        )
        connection.commit()

    try:
        run_migration_operation(sync_url, grant)
        before = run_migration_operation(sync_url, _acl_snapshot)
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection,
                    identity,
                    "0001_create_job",
                    downgrade=True,
                ),
            )
        assert run_migration_operation(sync_url, _acl_snapshot) == before
    finally:
        run_migration_operation(sync_url, revoke)
        if principal == _COLUMN_ROLE:
            with _admin_connection(
                historical_admin_connection_url(postgres_admin_sync_url)
            ) as connection:
                connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_COLUMN_ROLE}")
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection,
                identity,
                "0001_create_job",
                downgrade=True,
            ),
        )
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
        )


def test_inherited_column_acl_refuses_upgrade_without_changes(
    integration_settings: IntegrationTestSettings,
    postgres_admin_sync_url: URL,
) -> None:
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, "0001_create_job", downgrade=True),
    )
    with _admin_connection(historical_admin_connection_url(postgres_admin_sync_url)) as connection:
        connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_COLUMN_ROLE}")
        connection.exec_driver_sql(
            f"CREATE ROLE {_COLUMN_ROLE} NOLOGIN NOSUPERUSER NOCREATEDB "
            "NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS"
        )

    def grant(connection: Connection) -> None:
        connection.exec_driver_sql(f"GRANT SELECT (payload) ON TABLE public.job TO {_COLUMN_ROLE}")
        connection.commit()

    def revoke(connection: Connection) -> None:
        connection.exec_driver_sql(
            f"REVOKE SELECT (payload) ON TABLE public.job FROM {_COLUMN_ROLE}"
        )
        connection.commit()

    try:
        run_migration_operation(sync_url, grant)
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"GRANT {_COLUMN_ROLE} TO lumina_test_app")
        before = run_migration_operation(sync_url, _acl_snapshot)
        with pytest.raises(RuntimeError, match="Runtime ACL migration precondition failed"):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(
                    connection, identity, "b7f3a2c81d4e", downgrade=False
                ),
            )
        assert run_migration_operation(sync_url, _acl_snapshot) == before
    finally:
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"REVOKE {_COLUMN_ROLE} FROM lumina_test_app")
        run_migration_operation(sync_url, revoke)
        with _admin_connection(
            historical_admin_connection_url(postgres_admin_sync_url)
        ) as connection:
            connection.exec_driver_sql(f"DROP ROLE IF EXISTS {_COLUMN_ROLE}")
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, "b7f3a2c81d4e", downgrade=False),
        )
