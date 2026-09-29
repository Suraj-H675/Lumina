"""Focused contracts for the PostgreSQL catalogue search adapter."""

from __future__ import annotations

from typing import cast

import pytest
from lumina.catalog.domain.read import CatalogReadOperationFailure
from lumina.catalog.domain.search import SearchQuery
from lumina.catalog.infrastructure.postgresql.search import PostgreSqlCatalogSearchRepository
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker


class _Result:
    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, object]]:
        return []


class _Connection:
    def __init__(self, *, fail_on_execution: int | None = None) -> None:
        self.fail_on_execution = fail_on_execution
        self.statements: list[tuple[str, dict[str, object] | None]] = []

    async def execute(
        self,
        statement: object,
        parameters: dict[str, object] | None = None,
    ) -> _Result:
        self.statements.append((str(statement), parameters))
        if self.fail_on_execution == len(self.statements):
            raise OperationalError("hidden SQL", {}, Exception("driver failure"))
        return _Result()


class _Session:
    def __init__(
        self,
        connection: _Connection,
        *,
        close_errors: tuple[BaseException, ...] = (),
    ) -> None:
        self.connection_value = connection
        self.close_errors = list(close_errors)
        self.transaction_active = False
        self.begins = 0
        self.rollbacks = 0
        self.invalidations = 0
        self.closes = 0

    async def begin(self) -> None:
        self.begins += 1
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self.connection_value)

    def in_transaction(self) -> bool:
        return self.transaction_active

    async def rollback(self) -> None:
        self.rollbacks += 1
        self.transaction_active = False

    async def invalidate(self) -> None:
        self.invalidations += 1
        self.transaction_active = False

    async def close(self) -> None:
        self.closes += 1
        if self.close_errors:
            raise self.close_errors.pop(0)


class _Factory:
    def __init__(self, session: _Session) -> None:
        self.session = session

    def __call__(self) -> AsyncSession:
        return cast(AsyncSession, self.session)


def _query() -> SearchQuery:
    return SearchQuery(normalized="m31", entity_type=None, limit=5, fuzzy_eligible=False)


@pytest.mark.asyncio
async def test_suggest_uses_one_read_only_transaction_with_local_timeouts() -> None:
    connection = _Connection()
    session = _Session(connection)
    repository = PostgreSqlCatalogSearchRepository(
        cast(async_sessionmaker[AsyncSession], _Factory(session))
    )

    result = await repository.suggest(query=_query())

    assert result.items == ()
    assert session.begins == 1
    assert session.rollbacks == 1
    assert session.invalidations == 0
    assert session.closes == 1
    statements = [statement for statement, _ in connection.statements]
    assert any("TRANSACTION READ ONLY" in statement for statement in statements)
    assert any(
        "statement_timeout" in statement and "lock_timeout" in statement for statement in statements
    )


@pytest.mark.asyncio
async def test_close_failure_is_quarantined_and_retried_without_losing_result() -> None:
    connection = _Connection()
    session = _Session(connection, close_errors=(RuntimeError("close failed"),))
    repository = PostgreSqlCatalogSearchRepository(
        cast(async_sessionmaker[AsyncSession], _Factory(session))
    )

    result = await repository.suggest(query=_query())

    assert result.items == ()
    assert session.rollbacks == 1
    assert session.invalidations == 1
    assert session.closes == 2


@pytest.mark.asyncio
async def test_sqlalchemy_failure_keeps_search_operation_failure_contract() -> None:
    connection = _Connection(fail_on_execution=4)
    session = _Session(connection)
    repository = PostgreSqlCatalogSearchRepository(
        cast(async_sessionmaker[AsyncSession], _Factory(session))
    )

    with pytest.raises(CatalogReadOperationFailure):
        await repository.suggest(query=_query())

    assert session.rollbacks == 1
    assert session.invalidations == 0
    assert session.closes == 1
