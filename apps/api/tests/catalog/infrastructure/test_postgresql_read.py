"""Small high-risk contracts for bounded catalogue PostgreSQL reads."""

from __future__ import annotations

from typing import cast
from uuid import UUID

import pytest
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogEntityType,
    EntityBrowseCursor,
)
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
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.statements: list[tuple[str, dict[str, object] | None]] = []
        self._rows = [] if rows is None else rows

    async def execute(
        self,
        statement: object,
        parameters: dict[str, object] | None = None,
    ) -> _Result:
        self.statements.append((str(statement), parameters))
        return _Result(self._rows)


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
        "SET TRANSACTION ISOLATION LEVEL READ COMMITTED" in sql for sql, _ in connection.statements
    )
    assert any("SET TRANSACTION READ ONLY" in sql for sql, _ in connection.statements)
    assert any(
        "statement_timeout" in sql and "lock_timeout" in sql for sql, _ in connection.statements
    )
    assert sum("FROM public.entity AS entity" in sql for sql, _ in connection.statements) == 1


@pytest.mark.asyncio
async def test_slug_lookup_uses_one_fixed_parameterized_catalogue_query() -> None:
    entity_id = UUID("12345678-1234-4234-9234-123456789abc")
    connection = _Connection(
        [
            {
                "entity_id": entity_id,
                "slug": "hd-209458",
                "entity_type": "star",
                "canonical_name": "HD 209458",
            }
        ]
    )
    session = _Session(connection)
    repository = PostgreSqlCatalogReadRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    summary = await repository.get_entity_summary_by_slug(slug="hd-209458")

    assert summary is not None
    assert summary.id == entity_id
    queries = [(sql, parameters) for sql, parameters in connection.statements if "SELECT\n" in sql]
    assert len(queries) == 1
    sql, parameters = queries[0]
    assert sql == (
        "SELECT\n"
        "    entity.id AS entity_id,\n"
        "    entity.slug,\n"
        "    entity.entity_type,\n"
        "    entity.canonical_name\n"
        "FROM public.entity AS entity\n"
        "WHERE entity.slug = CAST(:slug AS text)"
    )
    assert parameters == {"slug": "hd-209458"}
    assert all(
        forbidden not in sql
        for forbidden in ("JOIN", "COUNT", "FOR UPDATE", "INSERT", "UPDATE", "DELETE")
    )


@pytest.mark.asyncio
async def test_invalid_stored_navigation_projection_is_catalogue_data_inconsistent() -> None:
    connection = _Connection(
        [
            {
                "entity_id": UUID("12345678-1234-4234-9234-123456789abc"),
                "slug": "HD-209458",
                "entity_type": "star",
                "canonical_name": "HD 209458",
            }
        ]
    )
    repository = PostgreSqlCatalogReadRepository(
        cast(async_sessionmaker[AsyncSession], lambda: _Session(connection))
    )

    with pytest.raises(CatalogDataInconsistent):
        await repository.get_entity_summary_by_slug(slug="hd-209458")


@pytest.mark.asyncio
async def test_unfiltered_entity_browse_uses_the_slug_keyset_query_and_limit_plus_one() -> None:
    connection = _Connection()
    session = _Session(connection)
    repository = PostgreSqlCatalogReadRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    result = await repository.list_entity_summaries(
        entity_type=None,
        cursor=None,
        limit=20,
    )

    assert result.items == ()
    queries = [(sql, parameters) for sql, parameters in connection.statements if "SELECT\n" in sql]
    assert len(queries) == 1
    sql, parameters = queries[0]
    assert sql == (
        "SELECT\n"
        "    entity.id AS entity_id,\n"
        "    entity.slug,\n"
        "    entity.entity_type,\n"
        "    entity.canonical_name\n"
        "FROM public.entity AS entity\n"
        "WHERE (\n"
        "    CAST(:after_slug AS text) IS NULL\n"
        '    OR entity.slug COLLATE "C" >\n'
        '       CAST(:after_slug AS text) COLLATE "C"\n'
        ")\n"
        'ORDER BY entity.slug COLLATE "C" ASC\n'
        "LIMIT :fetch_limit"
    )
    assert parameters == {"after_slug": None, "fetch_limit": 21}


@pytest.mark.asyncio
async def test_filtered_entity_browse_uses_only_the_explicit_filter_and_bound_cursor() -> None:
    connection = _Connection()
    session = _Session(connection)
    repository = PostgreSqlCatalogReadRepository(
        cast(async_sessionmaker[AsyncSession], lambda: session)
    )

    await repository.list_entity_summaries(
        entity_type=CatalogEntityType.STAR,
        cursor=EntityBrowseCursor(entity_type=CatalogEntityType.STAR, slug="hd-209458"),
        limit=2,
    )

    queries = [(sql, parameters) for sql, parameters in connection.statements if "SELECT\n" in sql]
    assert len(queries) == 1
    sql, parameters = queries[0]
    assert sql == (
        "SELECT\n"
        "    entity.id AS entity_id,\n"
        "    entity.slug,\n"
        "    entity.entity_type,\n"
        "    entity.canonical_name\n"
        "FROM public.entity AS entity\n"
        "WHERE entity.entity_type = CAST(:entity_type AS text)\n"
        "  AND (\n"
        "      CAST(:after_slug AS text) IS NULL\n"
        '      OR entity.slug COLLATE "C" >\n'
        '         CAST(:after_slug AS text) COLLATE "C"\n'
        "  )\n"
        'ORDER BY entity.slug COLLATE "C" ASC\n'
        "LIMIT :fetch_limit"
    )
    assert parameters == {
        "entity_type": "star",
        "after_slug": "hd-209458",
        "fetch_limit": 3,
    }
    assert all(
        forbidden not in sql
        for forbidden in ("JOIN", "COUNT", "FOR UPDATE", "INSERT", "UPDATE", "DELETE")
    )
