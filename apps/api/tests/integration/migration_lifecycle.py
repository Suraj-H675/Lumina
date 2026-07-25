"""Guarded, secret-safe connection establishment for integration migrations."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager

import pytest
from sqlalchemy import URL, Connection, create_engine
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.pool import NullPool

from .database_safety import require_local_test_database


@contextmanager
def open_migration_connection(url: URL) -> Iterator[Connection]:
    """Open one Psycopg connection, sanitizing failures before any migration runs."""
    engine = create_engine(url, poolclass=NullPool)
    try:
        try:
            connection = engine.connect()
        except (InterfaceError, OperationalError):
            raise pytest.fail.Exception(
                "Integration migration operation failed.", pytrace=False
            ) from None
        try:
            yield connection
        finally:
            connection.close()
    finally:
        engine.dispose()


def run_migration_operation[Result](
    url: URL,
    operation: Callable[[Connection], Result],
) -> Result:
    """Guard a migration target, then execute outside the connection-failure boundary."""
    require_local_test_database(url)
    with open_migration_connection(url) as connection:
        return operation(connection)
