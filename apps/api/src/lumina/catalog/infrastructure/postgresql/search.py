"""Fixed PostgreSQL adapters for explainable catalogue search."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar, cast
from uuid import UUID

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogEntityType,
    CatalogReadOperationFailure,
    CatalogReadUnavailable,
    PublicEntitySummary,
)
from lumina.catalog.domain.search import (
    ALIAS_FUZZY_THRESHOLD,
    CANONICAL_NAME_FUZZY_THRESHOLD,
    SearchMatchReason,
    SearchQuery,
    SearchResult,
    SearchSlice,
    escape_prefix,
)

_Result = TypeVar("_Result")
_PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)
_SET_READ_COMMITTED_SQL = text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
_SET_READ_ONLY_SQL = text("SET TRANSACTION READ ONLY")
_TIMEOUT_SQL = text(
    "SELECT set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)


def _canonical_sql(*, fuzzy: bool) -> str:
    fuzzy_branch = (
        "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, 6, "
        "similarity(e.normalized_canonical_name, :query)::real, NULL::text, NULL::uuid "
        "FROM public.entity e WHERE e.normalized_canonical_name % :query "
        f"AND similarity(e.normalized_canonical_name, :query)::real >= "
        f"{CANONICAL_NAME_FUZZY_THRESHOLD} "
        "AND CAST(:query AS text) !~ '^[0-9]+$' AND char_length(CAST(:query AS text)) >= 3 "
        "AND e.canonical_name_normalization_version = 1 "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text))"
        if fuzzy
        else ""
    )
    return (
        "WITH candidates AS ("
        "SELECT e.id AS entity_id, e.slug, e.entity_type, e.canonical_name, "
        "1 AS tier, NULL::real AS sim, NULL::text AS ma, NULL::uuid AS maid "
        "FROM public.entity e WHERE e.slug = :query "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
        "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, 2, NULL, NULL, NULL "
        "FROM public.entity e WHERE e.normalized_canonical_name = :query "
        "AND e.canonical_name_normalization_version = 1 "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
        "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, 4, NULL, NULL, NULL "
        "FROM public.entity e WHERE e.normalized_canonical_name LIKE :prefix ESCAPE chr(92) "
        "AND e.canonical_name_normalization_version = 1 "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
        + fuzzy_branch
        + "), ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY entity_id "
        "ORDER BY tier ASC, sim DESC NULLS LAST) rn FROM candidates) "
        "SELECT entity_id, slug, entity_type, canonical_name, tier, sim, ma, maid FROM ranked "
        'WHERE rn = 1 ORDER BY tier ASC, sim DESC NULLS LAST, slug COLLATE "C" ASC, '
        "entity_id ASC LIMIT :fetch_limit"
    )


def _alias_sql(*, fuzzy: bool) -> str:
    fuzzy_branch = (
        "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, ea.alias, ea.id, 7, "
        "similarity(ea.normalized_alias, :query)::real "
        "FROM public.entity e JOIN public.entity_alias ea ON ea.entity_id = e.id "
        "WHERE ea.normalization_version = 1 AND ea.normalized_alias % :query "
        f"AND similarity(ea.normalized_alias, :query)::real >= {ALIAS_FUZZY_THRESHOLD} "
        "AND CAST(:query AS text) !~ '^[0-9]+$' AND char_length(CAST(:query AS text)) >= 3 "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text))"
        if fuzzy
        else ""
    )
    return (
        "WITH ac AS ("
        "SELECT e.id AS entity_id, e.slug, e.entity_type, e.canonical_name, ea.alias AS ma, "
        "ea.id AS maid, 3 AS tier, NULL::real AS sim "
        "FROM public.entity e JOIN public.entity_alias ea ON ea.entity_id = e.id "
        "WHERE ea.normalization_version = 1 AND ea.normalized_alias = :query "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
        "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, ea.alias, ea.id, 5, NULL "
        "FROM public.entity e JOIN public.entity_alias ea ON ea.entity_id = e.id "
        "WHERE ea.normalization_version = 1 AND ea.normalized_alias LIKE :prefix ESCAPE chr(92) "
        "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
        + fuzzy_branch
        + "), deduped AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY tier ASC, "
        'sim DESC NULLS LAST, ma COLLATE "C" ASC, maid ASC) arn FROM ac) '
        "SELECT entity_id, slug, entity_type, canonical_name, tier, sim, ma, maid FROM deduped "
        'WHERE arn = 1 ORDER BY tier ASC, sim DESC NULLS LAST, slug COLLATE "C" ASC, '
        "entity_id ASC LIMIT :fetch_limit"
    )


_FUZZY_CANONICAL_SEARCH_SQL = text(_canonical_sql(fuzzy=True))
_NON_FUZZY_CANONICAL_SEARCH_SQL = text(_canonical_sql(fuzzy=False))
_FUZZY_ALIAS_SEARCH_SQL = text(_alias_sql(fuzzy=True))
_NON_FUZZY_ALIAS_SEARCH_SQL = text(_alias_sql(fuzzy=False))
_SUGGEST_SEARCH_SQL = text(
    "WITH candidates AS ("
    "SELECT e.id AS entity_id, e.slug, e.entity_type, e.canonical_name, NULL::text AS ma, "
    "1 AS tier FROM public.entity e WHERE e.slug = :query "
    "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
    "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, NULL::text, 2 "
    "FROM public.entity e "
    "WHERE e.normalized_canonical_name = :query AND e.canonical_name_normalization_version = 1 "
    "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
    "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, ea.alias, 3 "
    "FROM public.entity e "
    "JOIN public.entity_alias ea ON ea.entity_id = e.id WHERE ea.normalization_version = 1 "
    "AND ea.normalized_alias = :query "
    "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
    "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, NULL::text, 4 "
    "FROM public.entity e "
    "WHERE e.normalized_canonical_name LIKE :prefix ESCAPE chr(92) "
    "AND e.canonical_name_normalization_version = 1 "
    "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
    "UNION ALL SELECT e.id, e.slug, e.entity_type, e.canonical_name, ea.alias, 5 "
    "FROM public.entity e "
    "JOIN public.entity_alias ea ON ea.entity_id = e.id WHERE ea.normalization_version = 1 "
    "AND ea.normalized_alias LIKE :prefix ESCAPE chr(92) "
    "AND (CAST(:etype AS text) IS NULL OR e.entity_type = CAST(:etype AS text)) "
    "), ranked AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY tier ASC) rn "
    "FROM candidates) SELECT entity_id, slug, entity_type, canonical_name, tier, ma FROM ranked "
    'WHERE rn = 1 ORDER BY tier ASC, slug COLLATE "C" ASC, entity_id ASC LIMIT :fetch_limit'
)
_SET_NAME_THRESHOLD_SQL = text(
    "SELECT set_config('pg_trgm.similarity_threshold', :threshold, true)"
)
_TIER_REASONS = {
    1: SearchMatchReason.EXACT_SLUG,
    2: SearchMatchReason.EXACT_CANONICAL_NAME,
    3: SearchMatchReason.EXACT_ALIAS,
    4: SearchMatchReason.CANONICAL_NAME_PREFIX,
    5: SearchMatchReason.ALIAS_PREFIX,
    6: SearchMatchReason.CANONICAL_NAME_FUZZY,
    7: SearchMatchReason.ALIAS_FUZZY,
}
_OPERATION_WAIT_TIMEOUT = "5s"


class PostgreSqlCatalogSearchRepository:
    """Execute transaction-local fixed SQL with no planner or provider ranking."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def search(self, *, query: SearchQuery) -> SearchSlice:
        parameters = self._parameters(query)

        async def operation(connection: AsyncConnection) -> SearchSlice:
            if query.fuzzy_eligible:
                await connection.execute(
                    _SET_NAME_THRESHOLD_SQL,
                    {"threshold": str(CANONICAL_NAME_FUZZY_THRESHOLD)},
                )
            canonical_statement = (
                _FUZZY_CANONICAL_SEARCH_SQL
                if query.fuzzy_eligible
                else _NON_FUZZY_CANONICAL_SEARCH_SQL
            )
            canonical = await connection.execute(canonical_statement, parameters)
            if query.fuzzy_eligible:
                await connection.execute(
                    _SET_NAME_THRESHOLD_SQL,
                    {"threshold": str(ALIAS_FUZZY_THRESHOLD)},
                )
            alias_statement = (
                _FUZZY_ALIAS_SEARCH_SQL if query.fuzzy_eligible else _NON_FUZZY_ALIAS_SEARCH_SQL
            )
            aliases = await connection.execute(alias_statement, parameters)
            merged = _merge([list(canonical.mappings().all()), list(aliases.mappings().all())])
            return SearchSlice(items=merged.items[: query.limit])

        return await self._read(operation)

    async def suggest(self, *, query: SearchQuery) -> SearchSlice:
        parameters = self._parameters(query)

        async def operation(connection: AsyncConnection) -> SearchSlice:
            rows = (await connection.execute(_SUGGEST_SEARCH_SQL, parameters)).mappings().all()
            summaries: list[tuple[int, PublicEntitySummary, str | None]] = []
            for row in rows:
                summary = PublicEntitySummary(
                    id=row["entity_id"],
                    slug=row["slug"],
                    entity_type=CatalogEntityType(row["entity_type"]),
                    canonical_name=row["canonical_name"],
                )
                summaries.append((int(row["tier"]), summary, row["ma"]))
            return SearchSlice(
                items=tuple(
                    SearchResult(
                        entity=summary,
                        match_reason=_TIER_REASONS[tier],
                        matched_alias=matched_alias,
                        ranking_similarity=None,
                    )
                    for tier, summary, matched_alias in sorted(
                        summaries,
                        key=lambda item: (
                            item[0],
                            item[1].slug,
                            str(item[1].id),
                        ),
                    )
                )
            )

        return await self._read(operation)

    @staticmethod
    def _parameters(query: SearchQuery) -> dict[str, object]:
        return {
            "query": query.normalized,
            "prefix": escape_prefix(query.normalized),
            "etype": query.entity_type,
            "fetch_limit": query.limit,
        }

    async def _read(self, operation: Callable[[AsyncConnection], Awaitable[_Result]]) -> _Result:
        session: AsyncSession | None = None
        try:
            session = self._session_factory()
            await session.begin()
            connection = await session.connection()
            await connection.execute(_SET_READ_COMMITTED_SQL)
            await connection.execute(_SET_READ_ONLY_SQL)
            await connection.execute(_TIMEOUT_SQL, {"timeout": _OPERATION_WAIT_TIMEOUT})
            result = await operation(connection)
            return result
        except _PROCESS_CONTROL_ERRORS:
            raise
        except OSError:
            raise CatalogReadUnavailable() from None
        except SQLAlchemyError:
            raise CatalogReadOperationFailure() from None
        except (KeyError, TypeError, ValueError):
            raise CatalogDataInconsistent() from None
        finally:
            if session is not None:
                try:
                    if session.in_transaction():
                        await session.rollback()
                except _PROCESS_CONTROL_ERRORS:
                    raise
                except BaseException:
                    try:
                        await session.invalidate()
                    except _PROCESS_CONTROL_ERRORS:
                        raise
                    except BaseException:
                        pass
                await session.close()


def _merge(result_sets: list[list[RowMapping]]) -> SearchSlice:
    """Deduplicate candidates per entity, retaining the best contracted rank."""
    candidates: dict[object, tuple[int, float, RowMapping]] = {}
    for rows in result_sets:
        for row in rows:
            identifier = row["entity_id"]
            candidate = (int(row["tier"]), 0.0 if row["sim"] is None else float(row["sim"]), row)
            previous = candidates.get(identifier)
            if previous is None or (candidate[0], -candidate[1]) < (
                previous[0],
                -previous[1],
            ):
                candidates[identifier] = candidate
    results: list[tuple[int, float, SearchResult]] = []
    for identifier_value, (_tier, similarity, row) in candidates.items():
        reason = _TIER_REASONS[int(row["tier"])]
        identifier = cast(UUID, identifier_value)
        summary = PublicEntitySummary(
            id=identifier,
            slug=row["slug"],
            entity_type=CatalogEntityType(row["entity_type"]),
            canonical_name=row["canonical_name"],
        )
        results.append(
            (
                _TIER_REASONS_INV[reason],
                similarity,
                SearchResult(
                    entity=summary,
                    match_reason=reason,
                    matched_alias=None
                    if reason
                    in {
                        SearchMatchReason.EXACT_SLUG,
                        SearchMatchReason.EXACT_CANONICAL_NAME,
                        SearchMatchReason.CANONICAL_NAME_PREFIX,
                        SearchMatchReason.CANONICAL_NAME_FUZZY,
                    }
                    else str(row["ma"]),
                    ranking_similarity=similarity if similarity > 0.0 else None,
                ),
            )
        )
    results.sort(key=lambda item: (item[0], -item[1], item[2].entity.slug, str(item[2].entity.id)))
    return SearchSlice(items=tuple(item[2] for item in results))


_TIER_REASONS_INV = {reason: tier for tier, reason in _TIER_REASONS.items()}
