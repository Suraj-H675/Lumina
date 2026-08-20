"""Bounded PostgreSQL read adapters for the provenance-first catalogue.

The public and operator query surfaces deliberately use explicit, named-column SQL rather
than ORM models.  Every method is read-only and maps database state through the catalogue
domain boundary; no raw SQLAlchemy row escapes this module.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime
from decimal import Decimal
from enum import Enum, auto
from typing import TypeVar, cast
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import RowMapping, text
from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
    SQLAlchemyError,
)
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from lumina.catalog.domain.ingestion import IngestionConflictCategory, IngestionConflictStatus
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogEntityType,
    CatalogMeasurement,
    CatalogReadOperationFailure,
    CatalogReadUnavailable,
    CatalogReadValidationRejected,
    CatalogSelection,
    CompactDataset,
    CompactProvider,
    CompactSource,
    ConflictAnchor,
    ConflictCursor,
    ConflictSlice,
    CurrentCanonicalSelection,
    DatasetProvenance,
    EntityBrowseCursor,
    EntityBrowseSlice,
    EntityDetail,
    EntityQuantity,
    HistoricalSelection,
    IngestionConflictDetail,
    IngestionConflictItem,
    MeasurementCursor,
    MeasurementSlice,
    ProviderProvenance,
    PublicEntitySummary,
    Quantity,
    SelectedMeasurement,
    SelectionHistoryCursor,
    SelectionHistoryItem,
    SelectionHistorySlice,
    SelectionState,
    SourceProvenance,
    SourceRecordProvenance,
    Unit,
    validate_ingestion_conflict_evidence,
    validate_public_entity_slug,
)

_SET_READ_COMMITTED_SQL = text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
_SET_READ_ONLY_SQL = text("SET TRANSACTION READ ONLY")
_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)

# This entity-anchored CTE returns one row for an existing entity with no measurements.  A
# quantity is absent when no immutable measurement exists; a missing active selection is null.
_ENTITY_DETAIL_SQL = text(
    "WITH target_entity AS ("
    "SELECT entity.id, entity.entity_type, entity.canonical_name "
    "FROM public.entity AS entity WHERE entity.id = :entity_id"
    "), quantity_counts AS ("
    "SELECT measurement.entity_id, measurement.quantity_id, quantity.code AS quantity_code, "
    "quantity.name AS quantity_name, count(*) AS measurement_count "
    "FROM public.measurement AS measurement "
    "JOIN public.quantity AS quantity ON quantity.id = measurement.quantity_id "
    "WHERE measurement.entity_id = :entity_id "
    "GROUP BY measurement.entity_id, measurement.quantity_id, quantity.code, quantity.name"
    "), active_selections AS ("
    "SELECT canonical.entity_id, canonical.quantity_id, canonical.measurement_id, "
    "canonical.selection_rule, canonical.selection_version, canonical.explanation, "
    "canonical.selected_at "
    "FROM public.canonical_measurement AS canonical "
    "WHERE canonical.entity_id = :entity_id AND canonical.superseded_at IS NULL"
    ") "
    "SELECT target_entity.id AS entity_id, target_entity.entity_type, "
    "target_entity.canonical_name, quantity_counts.quantity_id, quantity_counts.quantity_code, "
    "quantity_counts.quantity_name, quantity_counts.measurement_count, "
    "active_selections.measurement_id AS selected_measurement_id, "
    "active_selections.selection_rule, active_selections.selection_version, "
    "active_selections.explanation, active_selections.selected_at, "
    "measurement.value_numeric AS selected_value_numeric, "
    "measurement.original_value AS selected_original_value, "
    "measurement.original_unit AS selected_original_unit, unit.code AS selected_unit_code, "
    "unit.symbol AS selected_unit_symbol, unit.name AS selected_unit_name, "
    "source_record.id AS source_record_id, provider.code AS provider_code, "
    "provider.name AS provider_name, dataset.code AS dataset_code, "
    "dataset.name AS dataset_name, dataset.release_version AS dataset_release_version "
    "FROM target_entity "
    "LEFT JOIN quantity_counts ON quantity_counts.entity_id = target_entity.id "
    "LEFT JOIN active_selections ON active_selections.entity_id = target_entity.id "
    "AND active_selections.quantity_id = quantity_counts.quantity_id "
    "LEFT JOIN public.measurement AS measurement "
    "ON measurement.id = active_selections.measurement_id "
    "AND measurement.entity_id = active_selections.entity_id "
    "AND measurement.quantity_id = active_selections.quantity_id "
    "LEFT JOIN public.unit AS unit ON unit.id = measurement.unit_id "
    "LEFT JOIN public.source_record AS source_record "
    "ON source_record.id = measurement.source_record_id "
    "LEFT JOIN public.dataset AS dataset ON dataset.id = source_record.dataset_id "
    "LEFT JOIN public.provider AS provider ON provider.id = source_record.provider_id "
    'ORDER BY quantity_counts.quantity_code COLLATE "C" ASC NULLS LAST'
)

_ENTITY_SUMMARY_BY_SLUG_SQL = text(
    "SELECT\n"
    "    entity.id AS entity_id,\n"
    "    entity.slug,\n"
    "    entity.entity_type,\n"
    "    entity.canonical_name\n"
    "FROM public.entity AS entity\n"
    "WHERE entity.slug = CAST(:slug AS text)"
)

_ENTITY_BROWSE_SQL = text(
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

_FILTERED_ENTITY_BROWSE_SQL = text(
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

# The target CTE carries entity existence even for an empty page.  ``limit + 1`` is supplied by
# the adapter, so page construction never needs a second row query.
_MEASUREMENT_PAGE_SQL = text(
    "WITH target_entity AS (SELECT entity.id FROM public.entity AS entity "
    "WHERE entity.id = :entity_id), page_rows AS ("
    "SELECT measurement.id AS measurement_id, quantity.code AS quantity_code, "
    "quantity.name AS quantity_name, measurement.value_numeric, unit.code AS unit_code, "
    "unit.symbol AS unit_symbol, unit.name AS unit_name, measurement.original_value, "
    "measurement.original_unit, measurement.created_at, source_record.id AS source_record_id, "
    "provider.code AS provider_code, provider.name AS provider_name, "
    "dataset.code AS dataset_code, dataset.name AS dataset_name, "
    "dataset.release_version AS dataset_release_version, "
    "CASE WHEN EXISTS (SELECT 1 FROM public.canonical_measurement AS active "
    "WHERE active.measurement_id = measurement.id "
    "AND active.entity_id = measurement.entity_id "
    "AND active.quantity_id = measurement.quantity_id "
    "AND active.superseded_at IS NULL) THEN 'current' "
    "WHEN EXISTS (SELECT 1 FROM public.canonical_measurement AS historical "
    "WHERE historical.measurement_id = measurement.id "
    "AND historical.entity_id = measurement.entity_id "
    "AND historical.quantity_id = measurement.quantity_id "
    "AND historical.superseded_at IS NOT NULL) THEN 'historical' "
    "ELSE 'never_selected' END AS selection_state "
    "FROM target_entity "
    "JOIN public.measurement AS measurement ON measurement.entity_id = target_entity.id "
    "JOIN public.quantity AS quantity ON quantity.id = measurement.quantity_id "
    "JOIN public.unit AS unit ON unit.id = measurement.unit_id "
    "JOIN public.source_record AS source_record ON source_record.id = measurement.source_record_id "
    "JOIN public.dataset AS dataset ON dataset.id = source_record.dataset_id "
    "JOIN public.provider AS provider ON provider.id = source_record.provider_id "
    "WHERE (CAST(:after_quantity_code AS text) IS NULL OR "
    'quantity.code COLLATE "C" > CAST(:after_quantity_code AS text) COLLATE "C" OR '
    '(quantity.code COLLATE "C" = CAST(:after_quantity_code AS text) COLLATE "C" '
    "AND (measurement.created_at > CAST(:after_created_at AS timestamptz) OR "
    "(measurement.created_at = CAST(:after_created_at AS timestamptz) "
    "AND measurement.id > CAST(:after_measurement_id AS uuid))))) "
    'ORDER BY quantity.code COLLATE "C" ASC, measurement.created_at ASC, measurement.id ASC '
    "LIMIT :fetch_limit"
    ") SELECT target_entity.id AS entity_id, page_rows.* FROM target_entity "
    "LEFT JOIN page_rows ON TRUE "
    'ORDER BY page_rows.quantity_code COLLATE "C" ASC NULLS LAST, '
    "page_rows.created_at ASC NULLS LAST, page_rows.measurement_id ASC NULLS LAST"
)

_SELECTION_HISTORY_SQL = text(
    "WITH target_entity AS (SELECT entity.id FROM public.entity AS entity "
    "WHERE entity.id = :entity_id), page_rows AS ("
    "SELECT canonical.id AS canonical_measurement_id, quantity.code AS quantity_code, "
    "quantity.name AS quantity_name, measurement.id AS measurement_id, measurement.value_numeric, "
    "unit.code AS unit_code, unit.symbol AS unit_symbol, unit.name AS unit_name, "
    "canonical.selection_rule, canonical.selection_version, canonical.explanation, "
    "canonical.selected_at, canonical.superseded_at, source_record.id AS source_record_id, "
    "provider.code AS provider_code, provider.name AS provider_name, dataset.code AS dataset_code, "
    "dataset.name AS dataset_name, dataset.release_version AS dataset_release_version "
    "FROM target_entity "
    "JOIN public.canonical_measurement AS canonical ON canonical.entity_id = target_entity.id "
    "JOIN public.measurement AS measurement ON measurement.id = canonical.measurement_id "
    "AND measurement.entity_id = canonical.entity_id "
    "AND measurement.quantity_id = canonical.quantity_id "
    "JOIN public.quantity AS quantity ON quantity.id = canonical.quantity_id "
    "JOIN public.unit AS unit ON unit.id = measurement.unit_id "
    "JOIN public.source_record AS source_record ON source_record.id = measurement.source_record_id "
    "JOIN public.dataset AS dataset ON dataset.id = source_record.dataset_id "
    "JOIN public.provider AS provider ON provider.id = source_record.provider_id "
    "WHERE (CAST(:after_selected_at AS timestamptz) IS NULL "
    "OR canonical.selected_at < CAST(:after_selected_at AS timestamptz) "
    "OR (canonical.selected_at = CAST(:after_selected_at AS timestamptz) "
    "AND canonical.id < CAST(:after_canonical_measurement_id AS uuid))) "
    "ORDER BY canonical.selected_at DESC, canonical.id DESC LIMIT :fetch_limit"
    ") SELECT target_entity.id AS entity_id, page_rows.* FROM target_entity "
    "LEFT JOIN page_rows ON TRUE "
    "ORDER BY page_rows.selected_at DESC NULLS LAST, "
    "page_rows.canonical_measurement_id DESC NULLS LAST"
)

_SOURCE_PROVENANCE_SQL = text(
    "SELECT source_record.id AS source_record_id, provider.code AS provider_code, "
    "provider.name AS provider_name, provider.documentation_url, provider.terms_url, "
    "provider.attribution_text, dataset.code AS dataset_code, dataset.name AS dataset_name, "
    "dataset.release_version AS dataset_release_version, dataset.source_url AS dataset_source_url, "
    "dataset.licence, dataset.citation, source_record.provider_record_id, "
    "source_record.provider_version, source_record.source_url AS record_source_url, "
    "source_record.fetched_at "
    "FROM public.source_record AS source_record "
    "JOIN public.provider AS provider ON provider.id = source_record.provider_id "
    "JOIN public.dataset AS dataset ON dataset.id = source_record.dataset_id "
    "WHERE source_record.id = :source_record_id "
    "AND source_record.canonical_entity_id IS NOT NULL "
    "AND EXISTS (SELECT 1 FROM public.measurement AS measurement "
    "WHERE measurement.source_record_id = source_record.id)"
)

_CONFLICT_LIST_SQL = text(
    "SELECT conflict.fingerprint, conflict.category, conflict.provider_id, conflict.dataset_id, "
    "conflict.source_record_id, conflict.measurement_id, conflict.source_fact_key, "
    "conflict.status, "
    "conflict.created_at, conflict.resolved_at "
    "FROM public.ingestion_conflict AS conflict "
    "WHERE conflict.status = :status "
    "AND (CAST(:category AS text) IS NULL OR conflict.category = CAST(:category AS text)) "
    "AND (CAST(:after_category AS text) IS NULL "
    'OR conflict.category COLLATE "C" > CAST(:after_category AS text) COLLATE "C" '
    'OR (conflict.category COLLATE "C" = CAST(:after_category AS text) COLLATE "C" '
    "AND (conflict.created_at > CAST(:after_created_at AS timestamptz) OR "
    "(conflict.created_at = CAST(:after_created_at AS timestamptz) "
    "AND conflict.fingerprint > CAST(:after_fingerprint AS text))))) "
    'ORDER BY conflict.category COLLATE "C" ASC, conflict.created_at ASC, conflict.fingerprint ASC '
    "LIMIT :fetch_limit"
)

_CONFLICT_DETAIL_SQL = text(
    "SELECT conflict.fingerprint, conflict.category, conflict.provider_id, conflict.dataset_id, "
    "conflict.source_record_id, conflict.measurement_id, conflict.source_fact_key, "
    "conflict.status, "
    "conflict.created_at, conflict.resolved_at, conflict.incoming_evidence "
    "FROM public.ingestion_conflict AS conflict WHERE conflict.fingerprint = :fingerprint"
)

_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_CONNECTION_SQLSTATE_CLASS = "08"
_PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)
_OPERATION_WAIT_TIMEOUT = "5000ms"

Result = TypeVar("Result")


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


class PostgreSqlCatalogReadRepository:
    """Execute the eight bounded catalogue read queries in fresh read-only transactions."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def get_entity_detail(self, *, entity_id: UUID) -> EntityDetail | None:
        """Return one entity and its current selections without per-quantity reads."""
        _require_uuid(entity_id)

        async def operation(connection: AsyncConnection) -> EntityDetail | None:
            rows = (
                (await connection.execute(_ENTITY_DETAIL_SQL, {"entity_id": entity_id}))
                .mappings()
                .all()
            )
            return _entity_detail(rows)

        return await self._read(operation)

    async def get_entity_summary_by_slug(self, *, slug: str) -> PublicEntitySummary | None:
        """Resolve one exact canonical public slug without aliases or normalization."""
        canonical_slug = validate_public_entity_slug(slug)

        async def operation(connection: AsyncConnection) -> PublicEntitySummary | None:
            rows = (
                (
                    await connection.execute(
                        _ENTITY_SUMMARY_BY_SLUG_SQL,
                        {"slug": canonical_slug},
                    )
                )
                .mappings()
                .all()
            )
            if not rows:
                return None
            if len(rows) != 1:
                raise CatalogDataInconsistent()
            return _public_entity_summary(rows[0])

        return await self._read(operation)

    async def list_entity_summaries(
        self,
        *,
        entity_type: CatalogEntityType | None,
        cursor: EntityBrowseCursor | None,
        limit: int,
    ) -> EntityBrowseSlice:
        """Return one slug-keyset page using exactly one filtered or unfiltered query."""
        if entity_type is not None and type(entity_type) is not CatalogEntityType:
            raise CatalogReadValidationRejected()
        _require_limit(limit)
        if cursor is not None:
            if type(cursor) is not EntityBrowseCursor or cursor.entity_type is not entity_type:
                raise CatalogReadValidationRejected()
            after_slug: str | None = cursor.slug
        else:
            after_slug = None

        async def operation(connection: AsyncConnection) -> EntityBrowseSlice:
            if entity_type is None:
                statement = _ENTITY_BROWSE_SQL
                parameters: dict[str, object] = {
                    "after_slug": after_slug,
                    "fetch_limit": limit + 1,
                }
            else:
                statement = _FILTERED_ENTITY_BROWSE_SQL
                parameters = {
                    "entity_type": entity_type.value,
                    "after_slug": after_slug,
                    "fetch_limit": limit + 1,
                }
            rows = (await connection.execute(statement, parameters)).mappings().all()
            if len(rows) > limit + 1:
                raise CatalogDataInconsistent()
            return EntityBrowseSlice(items=tuple(_public_entity_summary(row) for row in rows))

        return await self._read(operation)

    async def list_entity_measurements(
        self,
        *,
        entity_id: UUID,
        cursor: MeasurementCursor | None,
        limit: int,
    ) -> MeasurementSlice | None:
        """Return at most ``limit + 1`` deterministic immutable measurement alternatives."""
        _require_uuid(entity_id)
        _require_limit(limit)
        if cursor is not None:
            if type(cursor) is not MeasurementCursor or cursor.entity_id != entity_id:
                raise CatalogReadValidationRejected()
            after_quantity_code: str | None = cursor.quantity_code
            after_created_at: datetime | None = cursor.created_at
            after_measurement_id: UUID | None = cursor.measurement_id
        else:
            after_quantity_code = None
            after_created_at = None
            after_measurement_id = None

        async def operation(connection: AsyncConnection) -> MeasurementSlice | None:
            rows = (
                (
                    await connection.execute(
                        _MEASUREMENT_PAGE_SQL,
                        {
                            "entity_id": entity_id,
                            "after_quantity_code": after_quantity_code,
                            "after_created_at": after_created_at,
                            "after_measurement_id": after_measurement_id,
                            "fetch_limit": limit + 1,
                        },
                    )
                )
                .mappings()
                .all()
            )
            return _measurement_slice(rows, limit=limit)

        return await self._read(operation)

    async def list_entity_selection_history(
        self,
        *,
        entity_id: UUID,
        cursor: SelectionHistoryCursor | None,
        limit: int,
    ) -> SelectionHistorySlice | None:
        """Return at most ``limit + 1`` historical/current canonical-selection records."""
        _require_uuid(entity_id)
        _require_limit(limit)
        if cursor is not None:
            if type(cursor) is not SelectionHistoryCursor or cursor.entity_id != entity_id:
                raise CatalogReadValidationRejected()
            after_selected_at: datetime | None = cursor.selected_at
            after_canonical_measurement_id: UUID | None = cursor.canonical_measurement_id
        else:
            after_selected_at = None
            after_canonical_measurement_id = None

        async def operation(connection: AsyncConnection) -> SelectionHistorySlice | None:
            rows = (
                (
                    await connection.execute(
                        _SELECTION_HISTORY_SQL,
                        {
                            "entity_id": entity_id,
                            "after_selected_at": after_selected_at,
                            "after_canonical_measurement_id": after_canonical_measurement_id,
                            "fetch_limit": limit + 1,
                        },
                    )
                )
                .mappings()
                .all()
            )
            return _selection_history_slice(rows, limit=limit)

        return await self._read(operation)

    async def get_source_provenance(self, *, source_record_id: UUID) -> SourceProvenance | None:
        """Return provenance only for a resolved record with an immutable measurement."""
        _require_uuid(source_record_id)

        async def operation(connection: AsyncConnection) -> SourceProvenance | None:
            rows = (
                (
                    await connection.execute(
                        _SOURCE_PROVENANCE_SQL,
                        {"source_record_id": source_record_id},
                    )
                )
                .mappings()
                .all()
            )
            if not rows:
                return None
            if len(rows) != 1:
                raise CatalogDataInconsistent()
            return _source_provenance(rows[0])

        return await self._read(operation)

    async def list_ingestion_conflicts(
        self,
        *,
        status: IngestionConflictStatus,
        category: IngestionConflictCategory | None,
        cursor: ConflictCursor | None,
        limit: int,
    ) -> ConflictSlice:
        """Return operator conflict summaries without selecting evidence."""
        if type(status) is not IngestionConflictStatus or (
            category is not None and type(category) is not IngestionConflictCategory
        ):
            raise CatalogReadValidationRejected()
        _require_limit(limit)
        if cursor is not None:
            if (
                type(cursor) is not ConflictCursor
                or cursor.status is not status
                or cursor.category is not category
            ):
                raise CatalogReadValidationRejected()
            after_category: str | None = cursor.last_category.value
            after_created_at: datetime | None = cursor.created_at
            after_fingerprint: str | None = cursor.fingerprint
        else:
            after_category = None
            after_created_at = None
            after_fingerprint = None

        async def operation(connection: AsyncConnection) -> ConflictSlice:
            rows = (
                (
                    await connection.execute(
                        _CONFLICT_LIST_SQL,
                        {
                            "status": status.value,
                            "category": category.value if category is not None else None,
                            "after_category": after_category,
                            "after_created_at": after_created_at,
                            "after_fingerprint": after_fingerprint,
                            "fetch_limit": limit + 1,
                        },
                    )
                )
                .mappings()
                .all()
            )
            if len(rows) > limit + 1:
                raise CatalogDataInconsistent()
            return ConflictSlice(items=tuple(_conflict_item(row) for row in rows))

        return await self._read(operation)

    async def get_ingestion_conflict(self, *, fingerprint: str) -> IngestionConflictDetail | None:
        """Return one operator conflict and its strictly validated evidence document."""
        if type(fingerprint) is not str:
            raise CatalogReadValidationRejected()

        async def operation(connection: AsyncConnection) -> IngestionConflictDetail | None:
            rows = (
                (await connection.execute(_CONFLICT_DETAIL_SQL, {"fingerprint": fingerprint}))
                .mappings()
                .all()
            )
            if not rows:
                return None
            if len(rows) != 1:
                raise CatalogDataInconsistent()
            item = _conflict_item(rows[0])
            evidence = validate_ingestion_conflict_evidence(
                _required(rows[0], "incoming_evidence", dict),
                category=item.category,
                anchor=item.anchor,
                fingerprint=item.fingerprint,
            )
            return IngestionConflictDetail(
                fingerprint=item.fingerprint,
                category=item.category,
                anchor=item.anchor,
                status=item.status,
                created_at=item.created_at,
                resolved_at=item.resolved_at,
                evidence=evidence,
            )

        return await self._read(operation)

    async def _read(self, operation: Callable[[AsyncConnection], Awaitable[Result]]) -> Result:
        """Run one read operation and release/invalidate the checkout on every exit."""
        session: AsyncSession | None = None
        phase = _DatabasePhase.CONNECTION
        known_failure: CatalogDataInconsistent | CatalogReadValidationRejected | None = None
        safe_failure: type[RuntimeError] | None = None
        completed = False
        result: Result | None = None
        try:
            session = self._session_factory()
            await session.begin()
            connection = await session.connection()
            phase = _DatabasePhase.OPERATION
            await connection.execute(_SET_READ_COMMITTED_SQL)
            await connection.execute(_SET_READ_ONLY_SQL)
            await connection.execute(_TIMEOUT_SQL, {"timeout": _OPERATION_WAIT_TIMEOUT})
            result = await operation(connection)
            completed = True
            phase = _DatabasePhase.EXIT
        except _PROCESS_CONTROL_ERRORS:
            if session is not None:
                await _rollback_close_or_invalidate(session)
            raise
        except (CatalogDataInconsistent, CatalogReadValidationRejected) as error:
            known_failure = error
        except OSError:
            safe_failure = CatalogReadUnavailable
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(error, phase)
        except (KeyError, TypeError, ValueError, ValidationError):
            known_failure = CatalogDataInconsistent()
        except Exception:
            safe_failure = CatalogReadOperationFailure

        try:
            if session is not None:
                await _rollback_close_or_invalidate(session)
        except _PROCESS_CONTROL_ERRORS:
            raise
        except BaseException:
            safe_failure = CatalogReadOperationFailure

        if known_failure is not None:
            raise known_failure from None
        if safe_failure is not None:
            raise safe_failure() from None
        if not completed:
            raise CatalogReadOperationFailure() from None
        return cast(Result, result)


async def _rollback_close_or_invalidate(session: AsyncSession) -> None:
    """Rollback the read transaction and quarantine a checkout whose cleanup is uncertain."""
    rollback_failed = False
    interruption: BaseException | None = None
    try:
        if session.in_transaction():
            await session.rollback()
    except _PROCESS_CONTROL_ERRORS as error:
        rollback_failed = True
        interruption = error
    except BaseException:
        rollback_failed = True

    # A checkout whose rollback failed must be invalidated before close can return it to the pool.
    if rollback_failed:
        try:
            await session.invalidate()
        except _PROCESS_CONTROL_ERRORS as error:
            interruption = interruption or error
        except BaseException:
            pass

    close_failed = False
    try:
        await session.close()
    except _PROCESS_CONTROL_ERRORS as error:
        close_failed = True
        interruption = interruption or error
    except BaseException:
        close_failed = True
    if close_failed and not rollback_failed:
        try:
            await session.invalidate()
        except _PROCESS_CONTROL_ERRORS as error:
            interruption = interruption or error
        except BaseException:
            pass
    if close_failed:
        try:
            await session.close()
        except _PROCESS_CONTROL_ERRORS as error:
            interruption = interruption or error
        except BaseException:
            pass
    if interruption is not None:
        raise interruption


def _classify_database_failure(
    error: SQLAlchemyError,
    phase: _DatabasePhase,
) -> type[RuntimeError]:
    sqlstate = _database_sqlstate(error) if isinstance(error, DBAPIError) else None
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated
        or (sqlstate is not None and sqlstate.startswith(_CONNECTION_SQLSTATE_CLASS))
        or sqlstate in {_LOCK_TIMEOUT_SQLSTATE, _QUERY_CANCELLED_SQLSTATE}
    ):
        return CatalogReadUnavailable
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return CatalogReadUnavailable
    if isinstance(error, IntegrityError):
        return CatalogDataInconsistent
    if isinstance(error, ProgrammingError):
        return CatalogReadOperationFailure
    return CatalogReadOperationFailure


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None


def _require_uuid(value: object) -> UUID:
    if type(value) is not UUID:
        raise CatalogReadValidationRejected()
    return value


def _require_limit(value: object) -> int:
    if type(value) is not int or not 1 <= value <= 100:
        raise CatalogReadValidationRejected()
    return value


def _required[Value](row: RowMapping, name: str, expected: type[Value]) -> Value:
    value = row.get(name)
    if type(value) is not expected:
        raise CatalogDataInconsistent()
    return value


def _required_uuid(row: RowMapping, name: str) -> UUID:
    value = row.get(name)
    # asyncpg exposes PostgreSQL UUID values through a UUID-compatible subclass.  Accept the
    # driver's genuine UUID object while still rejecting text or any coercible surrogate.
    if not isinstance(value, UUID):
        raise CatalogDataInconsistent()
    return value


def _required_decimal(row: RowMapping, name: str) -> Decimal:
    return _required(row, name, Decimal)


def _required_datetime(row: RowMapping, name: str) -> datetime:
    return _required(row, name, datetime)


def _required_int(row: RowMapping, name: str) -> int:
    value = row.get(name)
    if type(value) is not int:
        raise CatalogDataInconsistent()
    return value


def _optional_datetime(row: RowMapping, name: str) -> datetime | None:
    value = row.get(name)
    if value is None:
        return None
    if type(value) is not datetime:
        raise CatalogDataInconsistent()
    return value


def _all_null(row: RowMapping, names: Sequence[str]) -> bool:
    return all(row.get(name) is None for name in names)


def _compact_source(row: RowMapping, *, prefix: str = "") -> CompactSource:
    return CompactSource(
        source_record_id=_required_uuid(row, f"{prefix}source_record_id"),
        provider=CompactProvider(
            code=_required(row, f"{prefix}provider_code", str),
            name=_required(row, f"{prefix}provider_name", str),
        ),
        dataset=CompactDataset(
            code=_required(row, f"{prefix}dataset_code", str),
            name=_required(row, f"{prefix}dataset_name", str),
            release_version=_required(row, f"{prefix}dataset_release_version", str),
        ),
    )


def _unit(row: RowMapping, *, prefix: str = "") -> Unit:
    return Unit(
        code=_required(row, f"{prefix}unit_code", str),
        symbol=_required(row, f"{prefix}unit_symbol", str),
        name=_required(row, f"{prefix}unit_name", str),
    )


def _quantity(row: RowMapping) -> Quantity:
    return Quantity(
        code=_required(row, "quantity_code", str),
        name=_required(row, "quantity_name", str),
    )


def _entity_detail(rows: Sequence[RowMapping]) -> EntityDetail | None:
    if not rows:
        return None
    first = rows[0]
    entity_id = _required_uuid(first, "entity_id")
    entity_type = CatalogEntityType(_required(first, "entity_type", str))
    canonical_name = _required(first, "canonical_name", str)
    quantities: list[EntityQuantity] = []
    seen_quantities: set[str] = set()
    for row in rows:
        if (
            _required_uuid(row, "entity_id") != entity_id
            or CatalogEntityType(_required(row, "entity_type", str)) is not entity_type
            or _required(row, "canonical_name", str) != canonical_name
        ):
            raise CatalogDataInconsistent()
        if row.get("quantity_id") is None:
            if len(rows) != 1 or not _all_null(
                row,
                (
                    "quantity_code",
                    "quantity_name",
                    "measurement_count",
                    "selected_measurement_id",
                    "selection_rule",
                    "selection_version",
                    "explanation",
                    "selected_at",
                    "selected_value_numeric",
                    "selected_original_value",
                    "selected_original_unit",
                    "selected_unit_code",
                    "selected_unit_symbol",
                    "selected_unit_name",
                    "source_record_id",
                    "provider_code",
                    "provider_name",
                    "dataset_code",
                    "dataset_name",
                    "dataset_release_version",
                ),
            ):
                raise CatalogDataInconsistent()
            continue
        _required_uuid(row, "quantity_id")
        quantity = _quantity(row)
        if quantity.code in seen_quantities:
            raise CatalogDataInconsistent()
        seen_quantities.add(quantity.code)
        if row.get("selected_measurement_id") is None:
            if not _all_null(
                row,
                (
                    "selection_rule",
                    "selection_version",
                    "explanation",
                    "selected_at",
                    "selected_value_numeric",
                    "selected_original_value",
                    "selected_original_unit",
                    "selected_unit_code",
                    "selected_unit_symbol",
                    "selected_unit_name",
                    "source_record_id",
                    "provider_code",
                    "provider_name",
                    "dataset_code",
                    "dataset_name",
                    "dataset_release_version",
                ),
            ):
                raise CatalogDataInconsistent()
            selection: CurrentCanonicalSelection | None = None
        else:
            selection = CurrentCanonicalSelection(
                measurement=SelectedMeasurement(
                    id=_required_uuid(row, "selected_measurement_id"),
                    value=_required_decimal(row, "selected_value_numeric"),
                    unit=_unit(row, prefix="selected_"),
                    original_value=_required(row, "selected_original_value", str),
                    original_unit=_required(row, "selected_original_unit", str),
                    source=_compact_source(row),
                ),
                selection=CatalogSelection(
                    rule=_required(row, "selection_rule", str),
                    version=_required(row, "selection_version", str),
                    explanation=_required(row, "explanation", str),
                    selected_at=_required_datetime(row, "selected_at"),
                ),
            )
        quantities.append(
            EntityQuantity(
                quantity=quantity,
                measurement_count=_required_int(row, "measurement_count"),
                current_selection=selection,
            )
        )
    return EntityDetail(
        id=entity_id,
        entity_type=entity_type,
        canonical_name=canonical_name,
        quantities=tuple(quantities),
    )


def _public_entity_summary(row: RowMapping) -> PublicEntitySummary:
    """Map exactly the four columns selected by the public navigation read queries."""
    return PublicEntitySummary(
        id=_required_uuid(row, "entity_id"),
        slug=_required(row, "slug", str),
        entity_type=CatalogEntityType(_required(row, "entity_type", str)),
        canonical_name=_required(row, "canonical_name", str),
    )


def _measurement_slice(rows: Sequence[RowMapping], *, limit: int) -> MeasurementSlice | None:
    if not rows:
        return None
    entity_id = _required_uuid(rows[0], "entity_id")
    items: list[CatalogMeasurement] = []
    for row in rows:
        if _required_uuid(row, "entity_id") != entity_id:
            raise CatalogDataInconsistent()
        if row.get("measurement_id") is None:
            if len(rows) != 1 or not _all_null(
                row,
                (
                    "quantity_code",
                    "quantity_name",
                    "value_numeric",
                    "unit_code",
                    "unit_symbol",
                    "unit_name",
                    "original_value",
                    "original_unit",
                    "created_at",
                    "source_record_id",
                    "provider_code",
                    "provider_name",
                    "dataset_code",
                    "dataset_name",
                    "dataset_release_version",
                    "selection_state",
                ),
            ):
                raise CatalogDataInconsistent()
            continue
        items.append(
            CatalogMeasurement(
                id=_required_uuid(row, "measurement_id"),
                quantity=_quantity(row),
                value=_required_decimal(row, "value_numeric"),
                unit=_unit(row),
                original_value=_required(row, "original_value", str),
                original_unit=_required(row, "original_unit", str),
                selection_state=SelectionState(_required(row, "selection_state", str)),
                source=_compact_source(row),
                created_at=_required_datetime(row, "created_at"),
            )
        )
    if len(items) > limit + 1:
        raise CatalogDataInconsistent()
    return MeasurementSlice(items=tuple(items))


def _selection_history_slice(
    rows: Sequence[RowMapping],
    *,
    limit: int,
) -> SelectionHistorySlice | None:
    if not rows:
        return None
    entity_id = _required_uuid(rows[0], "entity_id")
    items: list[SelectionHistoryItem] = []
    for row in rows:
        if _required_uuid(row, "entity_id") != entity_id:
            raise CatalogDataInconsistent()
        if row.get("canonical_measurement_id") is None:
            if len(rows) != 1 or not _all_null(
                row,
                (
                    "quantity_code",
                    "quantity_name",
                    "measurement_id",
                    "value_numeric",
                    "unit_code",
                    "unit_symbol",
                    "unit_name",
                    "selection_rule",
                    "selection_version",
                    "explanation",
                    "selected_at",
                    "superseded_at",
                    "source_record_id",
                    "provider_code",
                    "provider_name",
                    "dataset_code",
                    "dataset_name",
                    "dataset_release_version",
                ),
            ):
                raise CatalogDataInconsistent()
            continue
        items.append(
            SelectionHistoryItem(
                canonical_measurement_id=_required_uuid(row, "canonical_measurement_id"),
                quantity=_quantity(row),
                measurement_id=_required_uuid(row, "measurement_id"),
                value=_required_decimal(row, "value_numeric"),
                unit=_unit(row),
                source=_compact_source(row),
                selection=HistoricalSelection(
                    rule=_required(row, "selection_rule", str),
                    version=_required(row, "selection_version", str),
                    explanation=_required(row, "explanation", str),
                    selected_at=_required_datetime(row, "selected_at"),
                    superseded_at=_optional_datetime(row, "superseded_at"),
                ),
            )
        )
    if len(items) > limit + 1:
        raise CatalogDataInconsistent()
    return SelectionHistorySlice(items=tuple(items))


def _source_provenance(row: RowMapping) -> SourceProvenance:
    return SourceProvenance(
        source_record_id=_required_uuid(row, "source_record_id"),
        provider=ProviderProvenance(
            code=_required(row, "provider_code", str),
            name=_required(row, "provider_name", str),
            documentation_url=_required(row, "documentation_url", str),
            terms_url=_required(row, "terms_url", str),
            attribution_text=_required(row, "attribution_text", str),
        ),
        dataset=DatasetProvenance(
            code=_required(row, "dataset_code", str),
            name=_required(row, "dataset_name", str),
            release_version=_required(row, "dataset_release_version", str),
            source_url=_required(row, "dataset_source_url", str),
            licence=_required(row, "licence", str),
            citation=_required(row, "citation", str),
        ),
        record=SourceRecordProvenance(
            provider_record_id=_required(row, "provider_record_id", str),
            provider_version=_required(row, "provider_version", str),
            source_url=_optional_text(row, "record_source_url"),
            fetched_at=_required_datetime(row, "fetched_at"),
        ),
    )


def _optional_text(row: RowMapping, name: str) -> str | None:
    value = row.get(name)
    if value is None:
        return None
    if type(value) is not str:
        raise CatalogDataInconsistent()
    return value


def _conflict_item(row: RowMapping) -> IngestionConflictItem:
    category = IngestionConflictCategory(_required(row, "category", str))
    return IngestionConflictItem(
        fingerprint=_required(row, "fingerprint", str),
        category=category,
        anchor=ConflictAnchor(
            provider_id=_optional_uuid(row, "provider_id"),
            dataset_id=_optional_uuid(row, "dataset_id"),
            source_record_id=_optional_uuid(row, "source_record_id"),
            measurement_id=_optional_uuid(row, "measurement_id"),
            source_fact_key=_optional_text(row, "source_fact_key"),
        ),
        status=IngestionConflictStatus(_required(row, "status", str)),
        created_at=_required_datetime(row, "created_at"),
        resolved_at=_optional_datetime(row, "resolved_at"),
    )


def _optional_uuid(row: RowMapping, name: str) -> UUID | None:
    value = row.get(name)
    if value is None:
        return None
    if not isinstance(value, UUID):
        raise CatalogDataInconsistent()
    return value
