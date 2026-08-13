"""Small high-risk contracts for bounded catalogue PostgreSQL reads."""

from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from sqlalchemy import RowMapping
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker


class _Result:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[RowMapping]:
        return cast(list[RowMapping], self._rows)


class _Connection:
    def __init__(self) -> None:
        self.statements: list[str] = []

    async def execute(
        self,
        statement: object,
        _parameters: dict[str, object] | None = None,
    ) -> _Result:
        self.statements.append(str(statement))
        return _Result([])


class _Session:
    def __init__(self, connection: _Connection) -> None:
        self._connection = connection
        self._in_transaction = False
        self.closed = False

    async def begin(self) -> None:
        self._in_transaction = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self._connection)

    def in_transaction(self) -> bool:
        return self._in_transaction

    async def rollback(self) -> None:
        self._in_transaction = False

    async def close(self) -> None:
        self.closed = True

    async def invalidate(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_entity_read_is_one_read_only_transaction_with_local_timeouts() -> None:
    connection = _Connection()
    session = _Session(connection)
    repository = PostgreSqlCatalogReadRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    result = await repository.get_entity_detail(
        entity_id=UUID("12345678-1234-4234-9234-123456789abc")
    )

    assert result is None
    assert session.closed is True
    assert any(
        "SET TRANSACTION ISOLATION LEVEL READ COMMITTED" in sql for sql in connection.statements
    )
    assert any("SET TRANSACTION READ ONLY" in sql for sql in connection.statements)
    assert any(
        "statement_timeout" in sql and "lock_timeout" in sql for sql in connection.statements
    )
    assert sum("FROM public.entity AS entity" in sql for sql in connection.statements) == 1
