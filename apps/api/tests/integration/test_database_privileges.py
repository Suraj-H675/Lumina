"""Actual PostgreSQL ownership and least-privilege assertions."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import InterfaceError, OperationalError, ProgrammingError
from sqlalchemy.pool import NullPool


def _run_privilege_operation[Result](operation: Callable[[], Result]) -> Result:
    """Sanitize only connection failures, leaving privilege assertions debuggable."""
    try:
        return operation()
    except (InterfaceError, OperationalError):
        raise pytest.fail.Exception(
            "Integration privilege operation failed.", pytrace=False
        ) from None


def _query(url: URL, statement: str) -> list[object]:
    engine = create_engine(url, poolclass=NullPool)
    try:

        def query() -> list[object]:
            with engine.connect() as connection:
                return list(connection.execute(text(statement)).scalars())

        return _run_privilege_operation(query)
    finally:
        engine.dispose()


def _database_url(url: URL, database: str) -> URL:
    return url.set(database=database)


def _assert_runtime_denied(url: URL, statement: str) -> None:
    engine = create_engine(url, poolclass=NullPool)
    try:

        def execute() -> None:
            with engine.begin() as connection:
                connection.execute(text(statement))

        try:
            _run_privilege_operation(execute)
        except ProgrammingError:
            return
    finally:
        engine.dispose()
    pytest.fail("Runtime role unexpectedly received a prohibited database privilege.")


def _test_runtime_sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_url.get_secret_value()).set(
        drivername="postgresql+psycopg"
    )


def test_database_owners_roles_and_public_privileges(
    integration_settings: IntegrationTestSettings, postgres_admin_sync_url: URL
) -> None:
    owners = _query(
        postgres_admin_sync_url,
        "SELECT pg_get_userbyid(datdba) FROM pg_database "
        "WHERE datname IN ('lumina', 'lumina_test') ORDER BY datname",
    )
    role_flags = _query(
        postgres_admin_sync_url,
        "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls FROM pg_roles "
        "WHERE rolname IN ('lumina_app', 'lumina_migrate', "
        "'lumina_test_app', 'lumina_test_migrate') "
        "ORDER BY rolname",
    )
    public_database_privileges = _query(
        postgres_admin_sync_url,
        "SELECT EXISTS ("
        "SELECT 1 FROM pg_database AS database, "
        "aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) AS privilege "
        "WHERE database.datname IN ('lumina', 'lumina_test') AND privilege.grantee = 0 "
        "AND privilege.privilege_type IN ('CONNECT', 'TEMPORARY'))",
    )
    public_schema_privileges = [
        _query(
            _database_url(postgres_admin_sync_url, database),
            "SELECT EXISTS ("
            "SELECT 1 FROM pg_namespace AS namespace, "
            "aclexplode(COALESCE(namespace.nspacl, "
            "acldefault('n', namespace.nspowner))) AS privilege "
            "WHERE namespace.nspname = 'public' AND privilege.grantee = 0 "
            "AND privilege.privilege_type = 'CREATE')",
        )[0]
        for database in ("lumina", "lumina_test")
    ]

    assert owners == ["lumina_admin", "lumina_admin"]
    assert role_flags == [False, False, False, False]
    assert public_database_privileges == [False]
    assert public_schema_privileges == [False, False]
    assert _query(
        postgres_admin_sync_url,
        "SELECT has_database_privilege('lumina_migrate', 'lumina', 'CONNECT')",
    ) == [True]
    assert _query(
        _database_url(postgres_admin_sync_url, "lumina"),
        "SELECT has_schema_privilege('lumina_migrate', 'public', 'CREATE')",
    ) == [True]


def test_runtime_roles_cannot_create_or_modify_database_objects(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime_url = _test_runtime_sync_url(integration_settings)

    for statement in (
        "CREATE SCHEMA lumina_runtime_denied",
        "CREATE TABLE public.lumina_runtime_denied (id integer)",
        "ALTER TABLE public.job ADD COLUMN runtime_denied integer",
        "DROP TABLE public.job",
        "CREATE TEMPORARY TABLE lumina_runtime_denied (id integer)",
        "DELETE FROM public.job",
        "TRUNCATE TABLE public.job",
        "UPDATE public.job SET priority = priority",
        "UPDATE public.job SET payload = payload",
        "UPDATE public.job SET max_attempts = max_attempts",
        "DELETE FROM public.entity WHERE false",
        "DELETE FROM public.quantity WHERE false",
        "DELETE FROM public.unit WHERE false",
        "DELETE FROM public.quantity_unit WHERE false",
        "INSERT INTO public.job "
        "(id, job_type, status, priority, payload, max_attempts) "
        "VALUES ('00000000-0000-4000-8000-000000000001', "
        "'system.noop', 'queued', 0, '{}'::jsonb, 5)",
    ):
        _assert_runtime_denied(runtime_url, statement)

    assert _query(runtime_url, "SELECT 1") == [1]
    assert _query(
        runtime_url,
        "SELECT pg_get_userbyid(relowner) = current_user "
        "FROM pg_class WHERE oid = 'public.job'::regclass",
    ) == [False]
    assert _query(
        runtime_url,
        "SELECT count(*) FROM public.entity WHERE id IN ("
        "'26f4b667-ecd9-524d-8121-29508723715a', "
        "'bbfe8678-81ca-5e70-ac95-c597d7655540', "
        "'bfd42670-3013-598e-8eb5-5a1c084dd1a0', "
        "'c593bd18-c4bc-5551-8a41-09f1b501f981', "
        "'403d0e71-8d81-5c52-abad-c4666c1b5cd6')",
    ) == [5]


def test_privilege_connection_failure_is_sanitized(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    password = "PRIVILEGE-SECRET-SENTINEL"
    username = "privilege-user-sentinel"
    hostname = "privilege-host-sentinel"
    database = "privilege-database-sentinel"
    port = 6543
    failing_url = URL.create(
        "postgresql+psycopg",
        username=username,
        password=password,
        host=hostname,
        port=port,
        database=database,
        query={"connect_timeout": "1"},
    )

    with pytest.raises(pytest.fail.Exception) as failure:
        _query(failing_url, "SELECT 1")
    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )

    assert (
        serialized
        == "Integration privilege operation failed.Integration privilege operation failed."
    )
    for secret_or_connection_detail in (password, username, hostname, str(port), database):
        assert secret_or_connection_detail not in serialized
    assert failure.value.__cause__ is None
    assert failure.value.__suppress_context__
