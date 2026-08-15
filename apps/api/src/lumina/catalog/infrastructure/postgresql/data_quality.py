"""Read the immutable source-fact closure used by reviewed catalogue quality gates.

This adapter intentionally has no opinion about choosing a preferred value.  It exposes the
persisted provenance and vocabulary facts for one explicitly bounded reviewed slice, so the
application layer can apply its deterministic review policy without a second database schema.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum, auto
from typing import TypeVar, cast
from uuid import UUID

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
from sqlalchemy.sql.elements import TextClause

from lumina.catalog.application.data_quality import (
    SliceCompatibilityPair,
    SliceConflict,
    SliceDatabaseState,
    SliceDataset,
    SliceEntity,
    SliceMeasurement,
    SliceProvider,
    SliceQuantity,
    SliceSourceRecord,
    SliceUnit,
)
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogReadOperationFailure,
    CatalogReadUnavailable,
    CatalogReadValidationRejected,
)
from lumina.catalog.domain.reviewed_slice import ReviewedSlice

_SET_REPEATABLE_READ_SQL = text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
_SET_READ_ONLY_SQL = text("SET TRANSACTION READ ONLY")
_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_OPERATION_WAIT_TIMEOUT = "5000ms"
_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_CONNECTION_SQLSTATE_CLASS = "08"
_PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)

_PROVIDER_SQL = text(
    "SELECT provider.id AS provider_id, provider.code AS provider_code, "
    "provider.name AS provider_name, provider.documentation_url, provider.terms_url, "
    "provider.attribution_text "
    "FROM public.provider AS provider WHERE provider.code = :provider_code"
)
_DATASET_SQL = text(
    "SELECT dataset.id AS dataset_id, dataset.provider_id, dataset.code AS dataset_code, "
    "dataset.name AS dataset_name, dataset.release_version, dataset.source_url, "
    "dataset.licence, dataset.citation "
    "FROM public.dataset AS dataset "
    "JOIN public.provider AS provider ON provider.id = dataset.provider_id "
    "WHERE provider.code = :provider_code AND dataset.code = :dataset_code "
    "AND dataset.release_version = :dataset_release_version"
)
_ENTITY_SQL = text(
    "SELECT entity.id AS entity_id, entity.entity_type, entity.canonical_name, "
    "(SELECT count(*) FROM public.entity AS name_match "
    "WHERE name_match.canonical_name = entity.canonical_name) AS canonical_name_count "
    "FROM public.entity AS entity "
    "WHERE entity.id = ANY(CAST(:entity_ids AS uuid[])) "
    "ORDER BY entity.id ASC"
)
_QUANTITY_SQL = text(
    "SELECT quantity.id AS quantity_id, quantity.code AS quantity_code, "
    "quantity.name AS quantity_name "
    "FROM public.quantity AS quantity "
    "WHERE quantity.id = ANY(CAST(:quantity_ids AS uuid[])) "
    "ORDER BY quantity.id ASC"
)
_UNIT_SQL = text(
    "SELECT unit.id AS unit_id, unit.code AS unit_code, unit.symbol AS unit_symbol, "
    "unit.name AS unit_name FROM public.unit AS unit WHERE unit.id = :unit_id"
)
_PAIR_SQL = text(
    "SELECT pair.quantity_id, pair.unit_id FROM public.quantity_unit AS pair "
    "WHERE pair.quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
    "ORDER BY pair.quantity_id ASC, pair.unit_id ASC"
)
_SOURCE_RECORD_SQL = text(
    "WITH target AS ("
    "SELECT provider.id AS provider_id, dataset.id AS dataset_id "
    "FROM public.provider AS provider "
    "JOIN public.dataset AS dataset ON dataset.provider_id = provider.id "
    "WHERE provider.code = :provider_code AND dataset.code = :dataset_code "
    "AND dataset.release_version = :dataset_release_version"
    "), requested_sources AS ("
    "SELECT requested.entity_id, requested.provider_record_id "
    "FROM unnest(CAST(:entity_ids AS uuid[]), CAST(:provider_record_ids AS text[])) "
    "AS requested(entity_id, provider_record_id)"
    ") "
    "SELECT source_record.id AS source_record_id, source_record.provider_id, "
    "source_record.dataset_id, source_record.provider_record_id, source_record.provider_version, "
    "source_record.canonical_entity_id AS entity_id, source_record.source_url, "
    "source_record.fetched_at, source_record.adapter_id, source_record.adapter_version, "
    "source_record.parser_version, source_record.normalized_content_sha256 "
    "FROM target "
    "JOIN public.source_record AS source_record "
    "ON source_record.provider_id = target.provider_id "
    "AND source_record.dataset_id = target.dataset_id "
    "JOIN requested_sources ON requested_sources.entity_id = source_record.canonical_entity_id "
    "AND requested_sources.provider_record_id = source_record.provider_record_id "
    "WHERE source_record.provider_version = :provider_version "
    "ORDER BY source_record.id ASC"
)
_MEASUREMENT_SQL = text(
    "WITH target AS ("
    "SELECT provider.id AS provider_id, dataset.id AS dataset_id "
    "FROM public.provider AS provider "
    "JOIN public.dataset AS dataset ON dataset.provider_id = provider.id "
    "WHERE provider.code = :provider_code AND dataset.code = :dataset_code "
    "AND dataset.release_version = :dataset_release_version"
    "), requested_sources AS ("
    "SELECT requested.entity_id, requested.provider_record_id "
    "FROM unnest(CAST(:entity_ids AS uuid[]), CAST(:provider_record_ids AS text[])) "
    "AS requested(entity_id, provider_record_id)"
    ") "
    "SELECT measurement.id AS measurement_id, measurement.entity_id, "
    "measurement.source_record_id, measurement.quantity_id, measurement.unit_id, "
    "measurement.value_numeric, measurement.created_at, measurement.source_fact_key, "
    "measurement.original_value, measurement.original_unit "
    "FROM target "
    "CROSS JOIN public.measurement AS measurement "
    "JOIN public.source_record AS source_record "
    "ON source_record.id = measurement.source_record_id "
    "JOIN requested_sources ON requested_sources.entity_id = source_record.canonical_entity_id "
    "AND requested_sources.provider_record_id = source_record.provider_record_id "
    "WHERE source_record.provider_id = target.provider_id "
    "AND source_record.dataset_id = target.dataset_id "
    "AND source_record.provider_version = :provider_version "
    "ORDER BY measurement.id ASC"
)
_CONFLICT_SQL = text(
    "WITH target AS ("
    "SELECT provider.id AS provider_id, dataset.id AS dataset_id "
    "FROM public.provider AS provider "
    "JOIN public.dataset AS dataset ON dataset.provider_id = provider.id "
    "WHERE provider.code = :provider_code AND dataset.code = :dataset_code "
    "AND dataset.release_version = :dataset_release_version"
    "), requested_sources AS ("
    "SELECT requested.entity_id, requested.provider_record_id "
    "FROM unnest(CAST(:entity_ids AS uuid[]), CAST(:provider_record_ids AS text[])) "
    "AS requested(entity_id, provider_record_id)"
    "), scoped_sources AS ("
    "SELECT source_record.id FROM target "
    "JOIN public.source_record AS source_record "
    "ON source_record.provider_id = target.provider_id "
    "AND source_record.dataset_id = target.dataset_id "
    "JOIN requested_sources ON requested_sources.entity_id = source_record.canonical_entity_id "
    "AND requested_sources.provider_record_id = source_record.provider_record_id "
    "WHERE source_record.provider_version = :provider_version"
    "), scoped_measurements AS ("
    "SELECT measurement.id FROM target "
    "CROSS JOIN public.measurement AS measurement "
    "JOIN public.source_record AS source_record "
    "ON source_record.id = measurement.source_record_id "
    "JOIN requested_sources ON requested_sources.entity_id = source_record.canonical_entity_id "
    "AND requested_sources.provider_record_id = source_record.provider_record_id "
    "WHERE source_record.provider_id = target.provider_id "
    "AND source_record.dataset_id = target.dataset_id "
    "AND source_record.provider_version = :provider_version "
    ") "
    "SELECT conflict.fingerprint, conflict.category, conflict.provider_id, conflict.dataset_id, "
    "conflict.source_record_id, conflict.measurement_id, conflict.source_fact_key, "
    "conflict.status, conflict.created_at, conflict.resolved_at "
    "FROM public.ingestion_conflict AS conflict "
    "WHERE conflict.provider_id = (SELECT provider_id FROM target) "
    "OR conflict.dataset_id = (SELECT dataset_id FROM target) "
    "OR conflict.source_record_id IN (SELECT id FROM scoped_sources) "
    "OR conflict.measurement_id IN (SELECT id FROM scoped_measurements) "
    "ORDER BY conflict.fingerprint ASC"
)


@dataclass(frozen=True, slots=True)
class _SliceScope:
    provider_code: str
    dataset_code: str
    dataset_release_version: str
    provider_version: str
    entity_ids: tuple[UUID, ...]
    provider_record_ids: tuple[str, ...]
    quantity_ids: tuple[UUID, ...]
    source_fact_keys: tuple[str, ...]
    unit_id: UUID
    pairs: tuple[SliceCompatibilityPair, ...]

    @property
    def parameters(self) -> dict[str, object]:
        return {
            "provider_code": self.provider_code,
            "dataset_code": self.dataset_code,
            "dataset_release_version": self.dataset_release_version,
            "provider_version": self.provider_version,
            "entity_ids": list(self.entity_ids),
            "provider_record_ids": list(self.provider_record_ids),
            "quantity_ids": list(self.quantity_ids),
            "source_fact_keys": list(self.source_fact_keys),
            "unit_id": self.unit_id,
            "pair_quantity_ids": [pair.quantity_id for pair in self.pairs],
            "pair_unit_ids": [pair.unit_id for pair in self.pairs],
        }


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


Result = TypeVar("Result")


class PostgreSqlCatalogDataQualityRepository:
    """Load one bounded reviewed-slice closure without making value-selection decisions."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def load_slice_state(self, slice: ReviewedSlice) -> SliceDatabaseState:
        """Return a coherent source-fact state snapshot for one structurally valid slice."""
        scope = _scope_from_slice(slice)

        async def operation(connection: AsyncConnection) -> SliceDatabaseState:
            parameters = scope.parameters
            provider_rows = await _rows(connection, _PROVIDER_SQL, parameters)
            dataset_rows = await _rows(connection, _DATASET_SQL, parameters)
            entity_rows = await _rows(connection, _ENTITY_SQL, parameters)
            quantity_rows = await _rows(connection, _QUANTITY_SQL, parameters)
            unit_rows = await _rows(connection, _UNIT_SQL, parameters)
            pair_rows = await _rows(connection, _PAIR_SQL, parameters)
            source_rows = await _rows(connection, _SOURCE_RECORD_SQL, parameters)
            measurement_rows = await _rows(connection, _MEASUREMENT_SQL, parameters)
            conflict_rows = await _rows(connection, _CONFLICT_SQL, parameters)
            state = SliceDatabaseState(
                provider=_at_most_one(provider_rows, _provider),
                dataset=_at_most_one(dataset_rows, _dataset),
                entities=_distinct_ordered(entity_rows, _entity, key=lambda item: item.id),
                quantities=_distinct_ordered(quantity_rows, _quantity, key=lambda item: item.id),
                unit=_at_most_one(unit_rows, _unit),
                pairs=_distinct_ordered(
                    pair_rows,
                    _pair,
                    key=lambda item: (item.quantity_id, item.unit_id),
                ),
                source_records=_distinct_ordered(
                    source_rows,
                    _source_record,
                    key=lambda item: item.id,
                ),
                measurements=_distinct_ordered(
                    measurement_rows,
                    _measurement,
                    key=lambda item: item.id,
                ),
                conflicts=_distinct_ordered(
                    conflict_rows,
                    _conflict,
                    key=lambda item: item.fingerprint,
                ),
            )
            _assert_preflight_closure(state, scope)
            return state

        return await self._read_snapshot(operation)

    async def _read_snapshot(
        self,
        operation: Callable[[AsyncConnection], Awaitable[Result]],
    ) -> Result:
        """Run one source-fact read in a bounded immutable snapshot and release it safely."""
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
            await connection.execute(_SET_REPEATABLE_READ_SQL)
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
        except (KeyError, TypeError, ValueError):
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


async def _rows(
    connection: AsyncConnection,
    statement: TextClause,
    parameters: dict[str, object],
) -> list[RowMapping]:
    return cast(
        list[RowMapping],
        (await connection.execute(statement, parameters)).mappings().all(),
    )


async def _rollback_close_or_invalidate(session: AsyncSession) -> None:
    """Rollback and quarantine a session whose cleanup cannot be confirmed."""
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


def _scope_from_slice(slice: ReviewedSlice) -> _SliceScope:
    provider_code = _text_attribute(_attribute(slice, "provider"), "code")
    dataset_code = _text_attribute(_attribute(slice, "dataset"), "code")
    dataset_release_version = _text_attribute(
        _attribute(slice, "dataset"),
        "release_version",
    )
    provider_version = _text_attribute(slice, "provider_version")
    entity_ids, provider_record_ids = _entities(_attribute(slice, "entities"))
    quantity_ids, source_fact_keys = _quantities(_attribute(slice, "quantities"))
    unit_id = _identifier(_attribute(slice, "unit"))
    pairs = _pairs(_attribute(slice, "compatibility_pairs"), unit_id=unit_id)
    return _SliceScope(
        provider_code=provider_code,
        dataset_code=dataset_code,
        dataset_release_version=dataset_release_version,
        provider_version=provider_version,
        entity_ids=entity_ids,
        provider_record_ids=provider_record_ids,
        quantity_ids=quantity_ids,
        source_fact_keys=source_fact_keys,
        unit_id=unit_id,
        pairs=pairs,
    )


def _attribute(value: object, name: str) -> object:
    try:
        result = getattr(value, name)
    except (AttributeError, TypeError):
        raise CatalogReadValidationRejected() from None
    return result


def _identifier(value: object) -> UUID:
    identifier = _attribute(value, "id")
    if type(identifier) is not UUID:
        raise CatalogReadValidationRejected()
    return identifier


def _entities(values: object) -> tuple[tuple[UUID, ...], tuple[str, ...]]:
    if type(values) is not tuple or not values:
        raise CatalogReadValidationRejected()
    identifiers = tuple(_identifier(value) for value in values)
    provider_record_ids = tuple(_text_attribute(value, "provider_record_id") for value in values)
    if len(identifiers) != len(set(identifiers)) or len(provider_record_ids) != len(
        set(provider_record_ids)
    ):
        raise CatalogReadValidationRejected()
    return identifiers, provider_record_ids


def _quantities(values: object) -> tuple[tuple[UUID, ...], tuple[str, ...]]:
    if type(values) is not tuple or not values:
        raise CatalogReadValidationRejected()
    identifiers = tuple(_identifier(value) for value in values)
    source_fact_keys = tuple(_text_attribute(value, "source_fact_key") for value in values)
    if len(identifiers) != len(set(identifiers)) or len(source_fact_keys) != len(
        set(source_fact_keys)
    ):
        raise CatalogReadValidationRejected()
    return identifiers, source_fact_keys


def _pairs(values: object, *, unit_id: UUID) -> tuple[SliceCompatibilityPair, ...]:
    if type(values) is not tuple or not values:
        raise CatalogReadValidationRejected()
    pairs = tuple(
        SliceCompatibilityPair(
            quantity_id=_uuid_attribute(value, "quantity_id"),
            unit_id=_uuid_attribute(value, "unit_id"),
        )
        for value in values
    )
    if any(pair.unit_id != unit_id for pair in pairs) or len(pairs) != len(set(pairs)):
        raise CatalogReadValidationRejected()
    return pairs


def _uuid_attribute(value: object, name: str) -> UUID:
    candidate = _attribute(value, name)
    if type(candidate) is not UUID:
        raise CatalogReadValidationRejected()
    return candidate


def _text_attribute(value: object, name: str) -> str:
    candidate = _attribute(value, name)
    if type(candidate) is not str or not candidate:
        raise CatalogReadValidationRejected()
    return candidate


def _at_most_one[Value](
    rows: list[RowMapping],
    mapper: Callable[[RowMapping], Value],
) -> Value | None:
    if not rows:
        return None
    if len(rows) != 1:
        raise CatalogDataInconsistent()
    return mapper(rows[0])


def _distinct_ordered[Value, Key](
    rows: list[RowMapping],
    mapper: Callable[[RowMapping], Value],
    *,
    key: Callable[[Value], Key],
) -> tuple[Value, ...]:
    values = tuple(mapper(row) for row in rows)
    keys = tuple(key(value) for value in values)
    if keys != tuple(sorted(keys, key=str)) or len(keys) != len(set(keys)):
        raise CatalogDataInconsistent()
    return values


def _provider(row: RowMapping) -> SliceProvider:
    return SliceProvider(
        id=_required_uuid(row, "provider_id"),
        code=_required(row, "provider_code", str),
        name=_required(row, "provider_name", str),
        documentation_url=_required(row, "documentation_url", str),
        terms_url=_required(row, "terms_url", str),
        attribution_text=_required(row, "attribution_text", str),
    )


def _dataset(row: RowMapping) -> SliceDataset:
    return SliceDataset(
        id=_required_uuid(row, "dataset_id"),
        provider_id=_required_uuid(row, "provider_id"),
        code=_required(row, "dataset_code", str),
        name=_required(row, "dataset_name", str),
        release_version=_required(row, "release_version", str),
        source_url=_required(row, "source_url", str),
        licence=_required(row, "licence", str),
        citation=_required(row, "citation", str),
    )


def _entity(row: RowMapping) -> SliceEntity:
    if _required(row, "canonical_name_count", int) != 1:
        raise CatalogDataInconsistent()
    return SliceEntity(
        id=_required_uuid(row, "entity_id"),
        entity_type=_required(row, "entity_type", str),
        canonical_name=_required(row, "canonical_name", str),
    )


def _quantity(row: RowMapping) -> SliceQuantity:
    return SliceQuantity(
        id=_required_uuid(row, "quantity_id"),
        code=_required(row, "quantity_code", str),
        name=_required(row, "quantity_name", str),
    )


def _unit(row: RowMapping) -> SliceUnit:
    return SliceUnit(
        id=_required_uuid(row, "unit_id"),
        code=_required(row, "unit_code", str),
        symbol=_required(row, "unit_symbol", str),
        name=_required(row, "unit_name", str),
    )


def _pair(row: RowMapping) -> SliceCompatibilityPair:
    return SliceCompatibilityPair(
        quantity_id=_required_uuid(row, "quantity_id"),
        unit_id=_required_uuid(row, "unit_id"),
    )


def _source_record(row: RowMapping) -> SliceSourceRecord:
    return SliceSourceRecord(
        id=_required_uuid(row, "source_record_id"),
        provider_id=_required_uuid(row, "provider_id"),
        dataset_id=_required_uuid(row, "dataset_id"),
        provider_record_id=_required(row, "provider_record_id", str),
        provider_version=_required(row, "provider_version", str),
        entity_id=_required_uuid(row, "entity_id"),
        source_url=_optional(row, "source_url", str),
        fetched_at=_required(row, "fetched_at", datetime),
        adapter_id=_required(row, "adapter_id", str),
        adapter_version=_required(row, "adapter_version", str),
        parser_version=_required(row, "parser_version", str),
        normalized_content_sha256=_required(row, "normalized_content_sha256", str),
    )


def _measurement(row: RowMapping) -> SliceMeasurement:
    return SliceMeasurement(
        id=_required_uuid(row, "measurement_id"),
        entity_id=_required_uuid(row, "entity_id"),
        source_record_id=_required_uuid(row, "source_record_id"),
        quantity_id=_required_uuid(row, "quantity_id"),
        unit_id=_required_uuid(row, "unit_id"),
        value_numeric=_required(row, "value_numeric", Decimal),
        created_at=_required(row, "created_at", datetime),
        source_fact_key=_required(row, "source_fact_key", str),
        original_value=_required(row, "original_value", str),
        original_unit=_required(row, "original_unit", str),
    )


def _conflict(row: RowMapping) -> SliceConflict:
    return SliceConflict(
        fingerprint=_required(row, "fingerprint", str),
        category=_required(row, "category", str),
        provider_id=_optional_uuid(row, "provider_id"),
        dataset_id=_optional_uuid(row, "dataset_id"),
        source_record_id=_optional_uuid(row, "source_record_id"),
        measurement_id=_optional_uuid(row, "measurement_id"),
        source_fact_key=_optional(row, "source_fact_key", str),
        status=_required(row, "status", str),
        created_at=_required(row, "created_at", datetime),
        resolved_at=_optional(row, "resolved_at", datetime),
    )


def _required[Value](row: RowMapping, name: str, expected: type[Value]) -> Value:
    value = row.get(name)
    if type(value) is not expected:
        raise CatalogDataInconsistent()
    return value


def _required_uuid(row: RowMapping, name: str) -> UUID:
    value = row.get(name)
    if not isinstance(value, UUID):
        raise CatalogDataInconsistent()
    return value


def _optional[Value](row: RowMapping, name: str, expected: type[Value]) -> Value | None:
    value = row.get(name)
    if value is None:
        return None
    if type(value) is not expected:
        raise CatalogDataInconsistent()
    return value


def _optional_uuid(row: RowMapping, name: str) -> UUID | None:
    value = row.get(name)
    if value is None:
        return None
    if not isinstance(value, UUID):
        raise CatalogDataInconsistent()
    return value


def _assert_preflight_closure(state: SliceDatabaseState, scope: _SliceScope) -> None:
    if state.provider is not None and state.provider.code != scope.provider_code:
        raise CatalogDataInconsistent()
    if state.dataset is not None and (
        state.dataset.code != scope.dataset_code
        or state.dataset.release_version != scope.dataset_release_version
        or state.provider is None
        or state.dataset.provider_id != state.provider.id
    ):
        raise CatalogDataInconsistent()
    entity_ids = {item.id for item in state.entities}
    quantity_ids = {item.id for item in state.quantities}
    pair_ids = {(item.quantity_id, item.unit_id) for item in state.pairs}
    source_records = {item.id: item for item in state.source_records}
    measurements = {item.id: item for item in state.measurements}
    expected_entity_by_provider_record = dict(
        zip(scope.provider_record_ids, scope.entity_ids, strict=True)
    )
    expected_fact_by_quantity = dict(zip(scope.quantity_ids, scope.source_fact_keys, strict=True))
    if not entity_ids.issubset(set(scope.entity_ids)) or not quantity_ids.issubset(
        set(scope.quantity_ids)
    ):
        raise CatalogDataInconsistent()
    if state.unit is not None and state.unit.id != scope.unit_id:
        raise CatalogDataInconsistent()
    if not pair_ids.issubset({(item.quantity_id, item.unit_id) for item in scope.pairs}):
        raise CatalogDataInconsistent()

    for source_record in state.source_records:
        if (
            state.provider is None
            or state.dataset is None
            or source_record.provider_id != state.provider.id
            or source_record.dataset_id != state.dataset.id
            or source_record.entity_id not in entity_ids
            or source_record.provider_version != scope.provider_version
            or source_record.provider_record_id not in scope.provider_record_ids
            or expected_entity_by_provider_record.get(source_record.provider_record_id)
            != source_record.entity_id
        ):
            raise CatalogDataInconsistent()
    for measurement in state.measurements:
        linked_source_record = source_records.get(measurement.source_record_id)
        if (
            linked_source_record is None
            or measurement.entity_id != linked_source_record.entity_id
            or measurement.entity_id not in entity_ids
            or measurement.quantity_id not in quantity_ids
            or measurement.unit_id != scope.unit_id
            or (measurement.quantity_id, measurement.unit_id) not in pair_ids
            or measurement.source_fact_key not in scope.source_fact_keys
            or expected_fact_by_quantity.get(measurement.quantity_id) != measurement.source_fact_key
        ):
            raise CatalogDataInconsistent()
    for conflict in state.conflicts:
        anchors = (
            state.provider is not None and conflict.provider_id == state.provider.id,
            state.dataset is not None and conflict.dataset_id == state.dataset.id,
            conflict.source_record_id in source_records,
            conflict.measurement_id in measurements,
        )
        if sum(anchors) != 1:
            raise CatalogDataInconsistent()
