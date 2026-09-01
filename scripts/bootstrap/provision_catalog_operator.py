#!/usr/bin/env python3
"""Provision the local reviewed-catalogue operator roles without touching catalogue data."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Final

import psycopg
from psycopg import sql

_HEX_SECRET = re.compile(r"[0-9A-Fa-f]{64}", re.ASCII)
_ROLE_STATE_SQL = """
SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication,
       rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname = %s
"""
_ROLE_MEMBERSHIP_SQL = """
SELECT count(*)
FROM pg_auth_members AS membership
JOIN pg_roles AS role ON role.oid = membership.roleid
JOIN pg_roles AS member ON member.oid = membership.member
WHERE role.rolname = %s OR member.rolname = %s
"""
_ROLE_TABLE_PRIVILEGES_SQL = """
SELECT count(*)
FROM information_schema.role_table_grants
WHERE grantee = %s AND table_schema = 'public'
"""
_ROLE_COLUMN_PRIVILEGES_SQL = """
SELECT count(*)
FROM information_schema.column_privileges
WHERE grantee = %s AND table_schema = 'public'
"""
_ROLE_SPECS: Final = (
    ("lumina_catalog_operator", "POSTGRES_CATALOG_OPERATOR_PASSWORD", "lumina"),
    (
        "lumina_test_catalog_operator",
        "POSTGRES_TEST_CATALOG_OPERATOR_PASSWORD",
        "lumina_test",
    ),
)


class ProvisioningError(RuntimeError):
    """The exact local operator role contract could not be established."""


def _read_environment(path: Path) -> dict[str, str]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise ProvisioningError("The local environment file could not be read.") from error
    values: dict[str, str] = {}
    for line in lines:
        if not line or line.lstrip().startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name in values:
            raise ProvisioningError("The local environment contains a duplicate key.")
        values[name] = value
    return values


def _secret(values: dict[str, str], name: str) -> str:
    value = values.get(name, "")
    if _HEX_SECRET.fullmatch(value) is None:
        raise ProvisioningError("The local operator credential format is invalid.")
    return value


def _port(values: dict[str, str]) -> int:
    try:
        port = int(values.get("POSTGRES_HOST_PORT", ""), 10)
    except ValueError as error:
        raise ProvisioningError("The local PostgreSQL port is invalid.") from error
    if not 1 <= port <= 65535:
        raise ProvisioningError("The local PostgreSQL port is invalid.")
    return port


def _connect_admin(values: dict[str, str], database: str) -> psycopg.Connection:
    try:
        return psycopg.connect(
            host="127.0.0.1",
            port=_port(values),
            user="lumina_admin",
            password=values.get("POSTGRES_PASSWORD", ""),
            dbname=database,
        )
    except psycopg.Error as error:
        raise ProvisioningError("The local PostgreSQL administrator connection failed.") from error


def _ensure_role(connection: psycopg.Connection, role: str, password: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(_ROLE_STATE_SQL, (role,))
        state = cursor.fetchone()
        if state is None:
            cursor.execute(
                sql.SQL(
                    "CREATE ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
                    "NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD {}"
                ).format(sql.Identifier(role), sql.Literal(password))
            )
        elif tuple(state) != (True, False, False, False, False, False, False):
            raise ProvisioningError("An existing catalogue operator role has unsafe attributes.")
        cursor.execute(_ROLE_MEMBERSHIP_SQL, (role, role))
        if cursor.fetchone()[0] != 0:
            raise ProvisioningError("An existing catalogue operator role has an unsafe membership.")


def _ensure_database_access(connection: psycopg.Connection, role: str, database: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            sql.SQL("GRANT CONNECT ON DATABASE {} TO {}").format(
                sql.Identifier(database), sql.Identifier(role)
            )
        )
        cursor.execute(
            sql.SQL("REVOKE TEMPORARY ON DATABASE {} FROM {}").format(
                sql.Identifier(database), sql.Identifier(role)
            )
        )
    connection.commit()

    with connection.cursor() as cursor:
        cursor.execute(
            sql.SQL("SELECT has_schema_privilege({}, 'public', 'CREATE')").format(sql.Literal(role))
        )
        if cursor.fetchone()[0]:
            raise ProvisioningError("The catalogue operator role can create in public schema.")
        cursor.execute(
            sql.SQL("SELECT has_schema_privilege({}, 'public', 'USAGE')").format(sql.Literal(role))
        )
        if not cursor.fetchone()[0]:
            cursor.execute(
                sql.SQL("GRANT USAGE ON SCHEMA public TO {}").format(sql.Identifier(role))
            )
        cursor.execute(_ROLE_TABLE_PRIVILEGES_SQL, (role,))
        if cursor.fetchone()[0] != 0:
            raise ProvisioningError("The catalogue operator role already has table privileges.")
        cursor.execute(_ROLE_COLUMN_PRIVILEGES_SQL, (role,))
        if cursor.fetchone()[0] != 0:
            raise ProvisioningError("The catalogue operator role already has column privileges.")
    connection.commit()


def _verify_password(values: dict[str, str], role: str, password: str, database: str) -> None:
    try:
        with psycopg.connect(
            host="127.0.0.1",
            port=_port(values),
            user=role,
            password=password,
            dbname=database,
        ):
            pass
    except psycopg.Error as error:
        raise ProvisioningError(
            "The existing catalogue operator credential was rejected."
        ) from error


def provision(repository_root: Path) -> None:
    """Create or verify both fixed operator roles and their database-level access."""
    values = _read_environment(repository_root / ".env")
    for role, password_name, database in _ROLE_SPECS:
        password = _secret(values, password_name)
        with _connect_admin(values, "postgres") as admin:
            _ensure_role(admin, role, password)
        with _connect_admin(values, database) as database_connection:
            _ensure_database_access(database_connection, role, database)
        _verify_password(values, role, password, database)


def main() -> int:
    try:
        provision(Path(__file__).resolve().parents[2])
    except (OSError, ProvisioningError):
        print("error: catalogue operator provisioning failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
