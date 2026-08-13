"""Transactional PostgreSQL persistence for reviewed catalogue source facts.

The adapter deliberately uses explicit SQL rather than ORM mappings.  Catalogue provenance is
immutable: this store can create it, replay it, record a conflict, or perform the one guarded
``NULL -> reviewed entity`` source-record resolution transition.  It never selects or mutates a
canonical measurement.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from collections.abc import Coroutine
from dataclasses import dataclass
from decimal import Decimal
from enum import Enum, auto
from typing import Any, Final
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

from lumina.catalog.domain.ingestion import (
    CatalogDatabaseOperationFailure,
    CatalogDatabaseProgrammingFailure,
    CatalogDatabaseStateFailure,
    CatalogIngestionContention,
    CatalogIngestionError,
    CatalogIngestionOutcome,
    CatalogIngestionOutcomeUnknown,
    CatalogIngestionStatus,
    CatalogIngestionValidationRejected,
    CatalogStorageUnavailable,
    CatalogUnknownEntity,
    CatalogUnknownVocabulary,
    ConflictReference,
    IngestionConflictCategory,
    IngestionConflictStatus,
    IngestionRecordState,
    NormalizedMeasurement,
    PreparedCatalogIngestion,
    conflict_fingerprint_bytes,
    normalized_source_content_sha256,
)

_LOCK_TIMEOUT_SQLSTATE: Final = "55P03"
_QUERY_CANCELLED_SQLSTATE: Final = "57014"
_STATE_SQLSTATE_CLASSES: Final = frozenset({"23"})
_PROGRAMMING_SQLSTATE_CLASSES: Final = frozenset({"0A", "2F", "3F", "42"})
_CONNECTION_SQLSTATE_CLASS: Final = "08"
_PROCESS_CONTROL_ERRORS: Final = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)
_MAX_CONFLICT_EVIDENCE_BYTES: Final = 8_192
_OPERATION_WAIT_TIMEOUT: Final = "5000ms"

_SET_READ_COMMITTED_SQL = text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED")
_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_ENTITY_SQL = text("SELECT id FROM public.entity WHERE id = :entity_id")
_VOCABULARY_SQL = text(
    "SELECT quantity.id AS quantity_id, unit.id AS unit_id "
    "FROM public.quantity AS quantity "
    "JOIN public.unit AS unit ON unit.code = :unit_code "
    "JOIN public.quantity_unit AS quantity_unit "
    "ON quantity_unit.quantity_id = quantity.id "
    "AND quantity_unit.unit_id = unit.id "
    "WHERE quantity.code = :quantity_code"
)
_PROVIDER_INSERT_SQL = text(
    "INSERT INTO public.provider "
    "(id, code, name, documentation_url, terms_url, attribution_text) "
    "VALUES (:id, :code, :name, :documentation_url, :terms_url, :attribution_text) "
    "ON CONFLICT (code) DO NOTHING "
    "RETURNING id, code, name, documentation_url, terms_url, attribution_text"
)
_PROVIDER_SELECT_SQL = text(
    "SELECT id, code, name, documentation_url, terms_url, attribution_text "
    "FROM public.provider WHERE code = :code"
)
_DATASET_INSERT_SQL = text(
    "INSERT INTO public.dataset "
    "(id, provider_id, code, name, release_version, source_url, licence, citation) "
    "VALUES (:id, :provider_id, :code, :name, :release_version, :source_url, :licence, :citation) "
    "ON CONFLICT (provider_id, code, release_version) DO NOTHING "
    "RETURNING id, provider_id, code, name, release_version, source_url, licence, citation"
)
_DATASET_SELECT_SQL = text(
    "SELECT id, provider_id, code, name, release_version, source_url, licence, citation "
    "FROM public.dataset "
    "WHERE provider_id = :provider_id AND code = :code AND release_version = :release_version"
)
_SOURCE_RECORD_INSERT_SQL = text(
    "INSERT INTO public.source_record "
    "(id, provider_id, dataset_id, provider_record_id, provider_version, canonical_entity_id, "
    "source_url, fetched_at, adapter_id, adapter_version, parser_version, "
    "normalized_content_sha256) "
    "VALUES (:id, :provider_id, :dataset_id, :provider_record_id, :provider_version, "
    ":canonical_entity_id, :source_url, :fetched_at, :adapter_id, :adapter_version, "
    ":parser_version, :normalized_content_sha256) "
    "ON CONFLICT (dataset_id, provider_id, provider_record_id, provider_version) DO NOTHING "
    "RETURNING id, provider_id, dataset_id, provider_record_id, provider_version, "
    "canonical_entity_id, "
    "source_url, adapter_id, adapter_version, parser_version, normalized_content_sha256"
)
_SOURCE_RECORD_LOCK_SQL = text(
    "SELECT id, provider_id, dataset_id, provider_record_id, provider_version, "
    "canonical_entity_id, "
    "source_url, adapter_id, adapter_version, parser_version, normalized_content_sha256 "
    "FROM public.source_record "
    "WHERE dataset_id = :dataset_id AND provider_id = :provider_id "
    "AND provider_record_id = :provider_record_id AND provider_version = :provider_version "
    "FOR UPDATE"
)
_SOURCE_RECORD_RESOLVE_SQL = text(
    "UPDATE public.source_record SET canonical_entity_id = :canonical_entity_id "
    "WHERE id = :id AND canonical_entity_id IS NULL "
    "RETURNING id, canonical_entity_id"
)
_MEASUREMENT_SET_SQL = text(
    "SELECT measurement.id, measurement.source_fact_key, measurement.quantity_id, "
    "measurement.unit_id, "
    "measurement.value_numeric, measurement.original_value, measurement.original_unit, "
    "quantity.code AS quantity_code, unit.code AS unit_code "
    "FROM public.measurement AS measurement "
    "JOIN public.quantity AS quantity ON quantity.id = measurement.quantity_id "
    "JOIN public.unit AS unit ON unit.id = measurement.unit_id "
    "WHERE measurement.source_record_id = :source_record_id "
    "ORDER BY measurement.source_fact_key"
)
_MEASUREMENT_INSERT_SQL = text(
    "INSERT INTO public.measurement "
    "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, source_fact_key, "
    "original_value, original_unit) "
    "VALUES (:id, :entity_id, :source_record_id, :quantity_id, :unit_id, :value_numeric, "
    ":source_fact_key, :original_value, :original_unit) "
    "ON CONFLICT (source_record_id, source_fact_key) DO NOTHING "
    "RETURNING id"
)
_MEASUREMENT_BY_FACT_SQL = text(
    "SELECT id, quantity_id, unit_id, value_numeric, original_value, original_unit "
    "FROM public.measurement "
    "WHERE source_record_id = :source_record_id AND source_fact_key = :source_fact_key"
)
_COMPETITION_SQL = text(
    "SELECT "
    "count(*) FILTER (WHERE competitor.unit_id IS DISTINCT FROM :unit_id "
    "OR competitor.value_numeric IS DISTINCT FROM :value_numeric) AS competing_count, "
    "count(*) FILTER (WHERE competitor.unit_id = :unit_id "
    "AND competitor.value_numeric <> :value_numeric) AS disagreement_count, "
    "EXISTS ("
    "SELECT 1 FROM public.canonical_measurement AS canonical "
    "JOIN public.measurement AS selected ON selected.id = canonical.measurement_id "
    "WHERE canonical.entity_id = :entity_id "
    "AND canonical.quantity_id = :quantity_id "
    "AND canonical.superseded_at IS NULL "
    "AND (selected.unit_id IS DISTINCT FROM :unit_id "
    "OR selected.value_numeric IS DISTINCT FROM :value_numeric)"
    ") AS canonical_review_required "
    "FROM public.measurement AS competitor "
    "WHERE competitor.entity_id = :entity_id "
    "AND competitor.quantity_id = :quantity_id "
    "AND competitor.source_record_id <> :source_record_id"
)
_CONFLICT_INSERT_SQL = text(
    "INSERT INTO public.ingestion_conflict "
    "(fingerprint, category, provider_id, dataset_id, source_record_id, measurement_id, "
    "source_fact_key, incoming_evidence) "
    "VALUES (:fingerprint, :category, :provider_id, :dataset_id, :source_record_id, "
    ":measurement_id, :source_fact_key, CAST(:incoming_evidence AS jsonb)) "
    "ON CONFLICT (fingerprint) DO NOTHING "
    "RETURNING fingerprint, category, provider_id, dataset_id, source_record_id, measurement_id, "
    "source_fact_key, status, "
    "incoming_evidence = CAST(:incoming_evidence AS jsonb) AS evidence_equal"
)
_CONFLICT_SELECT_SQL = text(
    "SELECT fingerprint, category, provider_id, dataset_id, source_record_id, measurement_id, "
    "source_fact_key, status, "
    "incoming_evidence = CAST(:incoming_evidence AS jsonb) AS evidence_equal "
    "FROM public.ingestion_conflict WHERE fingerprint = :fingerprint"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()


@dataclass(frozen=True, slots=True)
class _ResolvedMeasurement:
    identifier: UUID
    measurement: NormalizedMeasurement
    quantity_id: UUID
    unit_id: UUID


@dataclass(frozen=True, slots=True)
class _ProviderReconciliation:
    identifier: UUID
    state: IngestionRecordState


@dataclass(frozen=True, slots=True)
class _DatasetReconciliation:
    identifier: UUID
    state: IngestionRecordState


@dataclass(frozen=True, slots=True)
class _SourceRecordReconciliation:
    identifier: UUID
    canonical_entity_id: UUID | None
    state: IngestionRecordState
    inserted: bool
    checksum_matches: bool
    normalized_content_sha256: str


@dataclass(frozen=True, slots=True)
class _DeferredResult[Result]:
    """Result of an operation that must settle despite process-control cancellation."""

    value: Result | None = None
    error: BaseException | None = None


class PostgreSqlCatalogIngestionStore:
    """Reconcile one prepared catalogue record in one bounded PostgreSQL transaction."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def ingest(self, prepared: PreparedCatalogIngestion) -> CatalogIngestionOutcome:
        """Persist, replay, resolve, or conflict one immutable reviewed source record."""
        if type(prepared) is not PreparedCatalogIngestion:
            raise CatalogIngestionValidationRejected()

        session: AsyncSession | None = None
        phase = _DatabasePhase.CONNECTION
        timeout_installed = False
        outcome: CatalogIngestionOutcome | None = None
        interruption: BaseException | None = None
        known_failure: CatalogIngestionError | None = None
        safe_failure: type[CatalogIngestionError] | None = None
        try:
            session = self._session_factory()
            await session.begin()
            connection = await session.connection()
            phase = _DatabasePhase.OPERATION
            await connection.execute(_SET_READ_COMMITTED_SQL)
            await self._install_timeouts(connection)
            timeout_installed = True
            outcome = await self._ingest_with_connection(connection, prepared)
        except _PROCESS_CONTROL_ERRORS as error:
            interruption = error
        except CatalogIngestionError as error:
            known_failure = error
        except OSError:
            safe_failure = (
                CatalogStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else CatalogDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                phase,
                timeout_installed=timeout_installed,
            )
        except Exception:
            safe_failure = CatalogDatabaseOperationFailure

        if interruption is not None or known_failure is not None or safe_failure is not None:
            cleanup_confirmed = session is None or await self._cleanup_before_mutation(session)
            if not cleanup_confirmed:
                raise CatalogDatabaseOperationFailure()
            if interruption is not None:
                raise interruption
            if known_failure is not None:
                raise known_failure
            if safe_failure is not None:
                raise safe_failure()
            raise CatalogDatabaseOperationFailure()

        if session is None or outcome is None:
            raise CatalogDatabaseOperationFailure()
        commit = await _run_deferring_process_control(session.commit())
        if commit.error is None:
            if not await self._close_after_confirmed_commit(session):
                raise CatalogDatabaseOperationFailure() from None
            return outcome

        await self._discard_failed_session(session)
        raise CatalogIngestionOutcomeUnknown() from None

    @staticmethod
    async def _install_timeouts(connection: AsyncConnection) -> None:
        await connection.execute(_TIMEOUT_SQL, {"timeout": _OPERATION_WAIT_TIMEOUT})

    async def _ingest_with_connection(
        self,
        connection: AsyncConnection,
        prepared: PreparedCatalogIngestion,
    ) -> CatalogIngestionOutcome:
        command = prepared.command
        resolved_entity_id = await self._resolve_entity(
            connection, command.source_record.canonical_entity_id
        )
        resolved_measurements = await self._resolve_measurements(connection, prepared)

        provider = await self._reconcile_provider(connection, prepared)
        if isinstance(provider, CatalogIngestionOutcome):
            return provider
        dataset = await self._reconcile_dataset(connection, prepared, provider.identifier)
        if isinstance(dataset, CatalogIngestionOutcome):
            return dataset

        source = await self._reconcile_source_record(
            connection,
            prepared,
            provider_id=provider.identifier,
            dataset_id=dataset.identifier,
        )
        if isinstance(source, CatalogIngestionOutcome):
            return source

        if source.canonical_entity_id is None:
            return _outcome(
                status=CatalogIngestionStatus.UNRESOLVED,
                provider_state=provider.state,
                dataset_state=dataset.state,
                source_record_state=IngestionRecordState.UNRESOLVED,
                source_record_id=source.identifier,
            )

        if not source.inserted and source.state is IngestionRecordState.EXISTING:
            persisted = await self._measurement_set(connection, source.identifier)
            conflicts = await self._measurement_set_conflicts(
                connection,
                source_record_id=source.identifier,
                persisted=persisted,
                incoming=resolved_measurements,
            )
            if conflicts:
                return _outcome(
                    status=CatalogIngestionStatus.CONFLICT,
                    provider_state=provider.state,
                    dataset_state=dataset.state,
                    source_record_state=IngestionRecordState.EXISTING,
                    source_record_id=source.identifier,
                    existing_measurement_count=len(persisted),
                    conflicts=conflicts,
                )
            if not source.checksum_matches:
                conflict = await self._persist_conflict(
                    connection,
                    category=IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH,
                    source_record_id=source.identifier,
                    anchor={"source_record_id": source.identifier},
                    existing={"normalized_content_sha256": source.normalized_content_sha256},
                    incoming={
                        "normalized_content_sha256": normalized_source_content_sha256(command)
                    },
                )
                return _conflict_outcome(conflict, source_record_id=source.identifier)
            return _outcome(
                status=CatalogIngestionStatus.REPLAYED,
                provider_state=provider.state,
                dataset_state=dataset.state,
                source_record_state=IngestionRecordState.EXISTING,
                source_record_id=source.identifier,
                existing_measurement_count=len(persisted),
            )

        if resolved_entity_id is None or source.canonical_entity_id != resolved_entity_id:
            raise CatalogDatabaseStateFailure()
        inserted_ids = await self._insert_measurements(
            connection,
            source_record_id=source.identifier,
            entity_id=resolved_entity_id,
            measurements=resolved_measurements,
        )
        if len(inserted_ids) != len(resolved_measurements):
            raise CatalogDatabaseStateFailure()
        competing, disagreements, canonical_review = await self._inspect_new_measurements(
            connection,
            source_record_id=source.identifier,
            entity_id=resolved_entity_id,
            measurements=resolved_measurements,
        )
        return _outcome(
            status=CatalogIngestionStatus.INSERTED,
            provider_state=provider.state,
            dataset_state=dataset.state,
            source_record_state=source.state,
            source_record_id=source.identifier,
            inserted_measurement_count=len(inserted_ids),
            competing_measurement_count=competing,
            scientific_disagreement_count=disagreements,
            canonical_review_required=canonical_review,
        )

    async def _resolve_entity(
        self,
        connection: AsyncConnection,
        entity_id: UUID | None,
    ) -> UUID | None:
        if entity_id is None:
            return None
        resolved = (
            await connection.execute(_ENTITY_SQL, {"entity_id": entity_id})
        ).scalar_one_or_none()
        if resolved != entity_id:
            raise CatalogUnknownEntity()
        return entity_id

    async def _resolve_measurements(
        self,
        connection: AsyncConnection,
        prepared: PreparedCatalogIngestion,
    ) -> tuple[_ResolvedMeasurement, ...]:
        resolved: list[_ResolvedMeasurement] = []
        for identifier, measurement in zip(
            prepared.measurement_ids,
            prepared.command.source_record.measurements,
            strict=True,
        ):
            row = (
                (
                    await connection.execute(
                        _VOCABULARY_SQL,
                        {
                            "quantity_code": measurement.quantity_code,
                            "unit_code": measurement.unit_code,
                        },
                    )
                )
                .mappings()
                .one_or_none()
            )
            if row is None:
                raise CatalogUnknownVocabulary()
            quantity_id = row.get("quantity_id")
            unit_id = row.get("unit_id")
            if not isinstance(quantity_id, UUID) or not isinstance(unit_id, UUID):
                raise CatalogDatabaseStateFailure()
            resolved.append(
                _ResolvedMeasurement(
                    identifier=identifier,
                    measurement=measurement,
                    quantity_id=quantity_id,
                    unit_id=unit_id,
                )
            )
        return tuple(resolved)

    async def _reconcile_provider(
        self,
        connection: AsyncConnection,
        prepared: PreparedCatalogIngestion,
    ) -> _ProviderReconciliation | CatalogIngestionOutcome:
        manifest = prepared.command.source_manifest
        incoming = _provider_metadata(manifest)
        inserted = (
            (
                await connection.execute(
                    _PROVIDER_INSERT_SQL,
                    {"id": prepared.provider_id, "code": manifest.source_id, **incoming},
                )
            )
            .mappings()
            .one_or_none()
        )
        if inserted is not None:
            identifier = _required_uuid(inserted, "id")
            return _ProviderReconciliation(identifier, IngestionRecordState.INSERTED)

        existing = (
            (await connection.execute(_PROVIDER_SELECT_SQL, {"code": manifest.source_id}))
            .mappings()
            .one_or_none()
        )
        if existing is None:
            raise CatalogDatabaseStateFailure()
        identifier = _required_uuid(existing, "id")
        if _provider_metadata_row(existing) != incoming:
            conflict = await self._persist_conflict(
                connection,
                category=IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
                provider_id=identifier,
                anchor={"provider_id": identifier, "provider_code": manifest.source_id},
                existing=_provider_metadata_row(existing),
                incoming=incoming,
            )
            return _conflict_outcome(conflict)
        return _ProviderReconciliation(identifier, IngestionRecordState.EXISTING)

    async def _reconcile_dataset(
        self,
        connection: AsyncConnection,
        prepared: PreparedCatalogIngestion,
        provider_id: UUID,
    ) -> _DatasetReconciliation | CatalogIngestionOutcome:
        command = prepared.command
        manifest = command.data_manifest
        incoming = _dataset_metadata(command.dataset_name, manifest)
        inserted = (
            (
                await connection.execute(
                    _DATASET_INSERT_SQL,
                    {
                        "id": prepared.dataset_id,
                        "provider_id": provider_id,
                        "code": manifest.dataset_id,
                        "release_version": manifest.release_version,
                        **incoming,
                    },
                )
            )
            .mappings()
            .one_or_none()
        )
        if inserted is not None:
            identifier = _required_uuid(inserted, "id")
            return _DatasetReconciliation(identifier, IngestionRecordState.INSERTED)

        existing = (
            (
                await connection.execute(
                    _DATASET_SELECT_SQL,
                    {
                        "provider_id": provider_id,
                        "code": manifest.dataset_id,
                        "release_version": manifest.release_version,
                    },
                )
            )
            .mappings()
            .one_or_none()
        )
        if existing is None:
            raise CatalogDatabaseStateFailure()
        identifier = _required_uuid(existing, "id")
        if _dataset_metadata_row(existing) != incoming:
            conflict = await self._persist_conflict(
                connection,
                category=IngestionConflictCategory.DATASET_METADATA_MISMATCH,
                dataset_id=identifier,
                anchor={
                    "dataset_id": identifier,
                    "dataset_code": manifest.dataset_id,
                    "release_version": manifest.release_version,
                },
                existing=_dataset_metadata_row(existing),
                incoming=incoming,
            )
            return _conflict_outcome(conflict)
        return _DatasetReconciliation(identifier, IngestionRecordState.EXISTING)

    async def _reconcile_source_record(
        self,
        connection: AsyncConnection,
        prepared: PreparedCatalogIngestion,
        *,
        provider_id: UUID,
        dataset_id: UUID,
    ) -> _SourceRecordReconciliation | CatalogIngestionOutcome:
        command = prepared.command
        record = command.source_record
        checksum = normalized_source_content_sha256(command)
        source_parameters = {
            "id": prepared.source_record_id,
            "provider_id": provider_id,
            "dataset_id": dataset_id,
            "provider_record_id": record.provider_record_id,
            "provider_version": record.provider_version,
            "canonical_entity_id": record.canonical_entity_id,
            "source_url": record.source_url,
            "fetched_at": record.fetched_at,
            "adapter_id": command.source_manifest.adapter_id,
            "adapter_version": command.source_manifest.adapter_version,
            "parser_version": command.data_manifest.parser_version,
            "normalized_content_sha256": checksum,
        }
        inserted = (
            (await connection.execute(_SOURCE_RECORD_INSERT_SQL, source_parameters))
            .mappings()
            .one_or_none()
        )
        if inserted is not None:
            identifier = _required_uuid(inserted, "id")
            canonical_entity_id = _optional_uuid(inserted, "canonical_entity_id")
            state = (
                IngestionRecordState.UNRESOLVED
                if canonical_entity_id is None
                else IngestionRecordState.INSERTED
            )
            return _SourceRecordReconciliation(
                identifier,
                canonical_entity_id,
                state,
                inserted=True,
                checksum_matches=True,
                normalized_content_sha256=checksum,
            )

        existing = (
            (
                await connection.execute(
                    _SOURCE_RECORD_LOCK_SQL,
                    {
                        "dataset_id": dataset_id,
                        "provider_id": provider_id,
                        "provider_record_id": record.provider_record_id,
                        "provider_version": record.provider_version,
                    },
                )
            )
            .mappings()
            .one_or_none()
        )
        if existing is None:
            raise CatalogDatabaseStateFailure()
        identifier = _required_uuid(existing, "id")

        if _source_metadata_row(existing) != _source_metadata(command):
            conflict = await self._persist_conflict(
                connection,
                category=IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH,
                source_record_id=identifier,
                anchor={"source_record_id": identifier},
                existing=_source_metadata_row(existing),
                incoming=_source_metadata(command),
            )
            return _conflict_outcome(conflict, source_record_id=identifier)

        existing_entity_id = _optional_uuid(existing, "canonical_entity_id")
        incoming_entity_id = record.canonical_entity_id
        if existing_entity_id is not None and incoming_entity_id != existing_entity_id:
            conflict = await self._persist_conflict(
                connection,
                category=IngestionConflictCategory.SOURCE_RECORD_ENTITY_MISMATCH,
                source_record_id=identifier,
                anchor={"source_record_id": identifier},
                existing={"canonical_entity_id": existing_entity_id},
                incoming={"canonical_entity_id": incoming_entity_id},
            )
            return _conflict_outcome(conflict, source_record_id=identifier)

        if existing_entity_id is None:
            persisted = await self._measurement_set(connection, identifier)
            if persisted:
                raise CatalogDatabaseStateFailure()
            existing_checksum = _required_text(existing, "normalized_content_sha256")
            if existing_checksum != checksum:
                conflict = await self._persist_conflict(
                    connection,
                    category=IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH,
                    source_record_id=identifier,
                    anchor={"source_record_id": identifier},
                    existing={"normalized_content_sha256": existing_checksum},
                    incoming={"normalized_content_sha256": checksum},
                )
                return _conflict_outcome(conflict, source_record_id=identifier)
            if incoming_entity_id is None:
                return _SourceRecordReconciliation(
                    identifier,
                    None,
                    IngestionRecordState.UNRESOLVED,
                    inserted=False,
                    checksum_matches=True,
                    normalized_content_sha256=checksum,
                )

            resolved = (
                (
                    await connection.execute(
                        _SOURCE_RECORD_RESOLVE_SQL,
                        {"id": identifier, "canonical_entity_id": incoming_entity_id},
                    )
                )
                .mappings()
                .one_or_none()
            )
            if (
                resolved is None
                or _optional_uuid(resolved, "canonical_entity_id") != incoming_entity_id
            ):
                raise CatalogDatabaseStateFailure()
            return _SourceRecordReconciliation(
                identifier,
                incoming_entity_id,
                IngestionRecordState.RESOLVED,
                inserted=True,
                checksum_matches=True,
                normalized_content_sha256=checksum,
            )

        return _SourceRecordReconciliation(
            identifier,
            existing_entity_id,
            IngestionRecordState.EXISTING,
            inserted=False,
            checksum_matches=_required_text(existing, "normalized_content_sha256") == checksum,
            normalized_content_sha256=_required_text(existing, "normalized_content_sha256"),
        )

    async def _measurement_set(
        self,
        connection: AsyncConnection,
        source_record_id: UUID,
    ) -> tuple[RowMapping, ...]:
        return tuple(
            (await connection.execute(_MEASUREMENT_SET_SQL, {"source_record_id": source_record_id}))
            .mappings()
            .all()
        )

    async def _measurement_set_conflicts(
        self,
        connection: AsyncConnection,
        *,
        source_record_id: UUID,
        persisted: tuple[RowMapping, ...],
        incoming: tuple[_ResolvedMeasurement, ...],
    ) -> tuple[ConflictReference, ...]:
        incoming_by_key = {item.measurement.source_fact_key: item for item in incoming}
        persisted_by_key: dict[str, RowMapping] = {}
        for row in persisted:
            key = _required_text(row, "source_fact_key")
            if key in persisted_by_key:
                raise CatalogDatabaseStateFailure()
            persisted_by_key[key] = row
        if tuple(sorted(persisted_by_key)) != tuple(sorted(incoming_by_key)):
            conflict = await self._persist_conflict(
                connection,
                category=IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH,
                source_record_id=source_record_id,
                anchor={"source_record_id": source_record_id},
                existing={"source_fact_keys": tuple(sorted(persisted_by_key))},
                incoming={"source_fact_keys": tuple(sorted(incoming_by_key))},
            )
            return (conflict,)

        conflicts: list[ConflictReference] = []
        for key in sorted(incoming_by_key):
            persisted_row = persisted_by_key[key]
            incoming_fact = incoming_by_key[key]
            if _measurement_matches(persisted_row, incoming_fact):
                continue
            measurement_id = _required_uuid(persisted_row, "id")
            conflicts.append(
                await self._persist_conflict(
                    connection,
                    category=IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH,
                    measurement_id=measurement_id,
                    source_fact_key=key,
                    anchor={"measurement_id": measurement_id, "source_fact_key": key},
                    existing=_measurement_evidence_row(persisted_row),
                    incoming=_measurement_evidence(incoming_fact),
                )
            )
        return tuple(conflicts)

    async def _insert_measurements(
        self,
        connection: AsyncConnection,
        *,
        source_record_id: UUID,
        entity_id: UUID,
        measurements: tuple[_ResolvedMeasurement, ...],
    ) -> tuple[UUID, ...]:
        inserted: list[UUID] = []
        for resolved in measurements:
            measurement = resolved.measurement
            row = (
                (
                    await connection.execute(
                        _MEASUREMENT_INSERT_SQL,
                        {
                            "id": resolved.identifier,
                            "entity_id": entity_id,
                            "source_record_id": source_record_id,
                            "quantity_id": resolved.quantity_id,
                            "unit_id": resolved.unit_id,
                            "value_numeric": measurement.value_numeric,
                            "source_fact_key": measurement.source_fact_key,
                            "original_value": measurement.original_value,
                            "original_unit": measurement.original_unit,
                        },
                    )
                )
                .mappings()
                .one_or_none()
            )
            if row is None:
                existing = (
                    (
                        await connection.execute(
                            _MEASUREMENT_BY_FACT_SQL,
                            {
                                "source_record_id": source_record_id,
                                "source_fact_key": measurement.source_fact_key,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if existing is None or not _measurement_row_matches_insert(existing, resolved):
                    raise CatalogDatabaseStateFailure()
                continue
            inserted.append(_required_uuid(row, "id"))
        return tuple(inserted)

    async def _inspect_new_measurements(
        self,
        connection: AsyncConnection,
        *,
        source_record_id: UUID,
        entity_id: UUID,
        measurements: tuple[_ResolvedMeasurement, ...],
    ) -> tuple[int, int, bool]:
        competing = 0
        disagreements = 0
        canonical_review_required = False
        for resolved in measurements:
            row = (
                (
                    await connection.execute(
                        _COMPETITION_SQL,
                        {
                            "source_record_id": source_record_id,
                            "entity_id": entity_id,
                            "quantity_id": resolved.quantity_id,
                            "unit_id": resolved.unit_id,
                            "value_numeric": resolved.measurement.value_numeric,
                        },
                    )
                )
                .mappings()
                .one()
            )
            current_competing = row.get("competing_count")
            current_disagreements = row.get("disagreement_count")
            current_review = row.get("canonical_review_required")
            if (
                isinstance(current_competing, bool)
                or not isinstance(current_competing, int)
                or current_competing < 0
                or isinstance(current_disagreements, bool)
                or not isinstance(current_disagreements, int)
                or current_disagreements < 0
                or not isinstance(current_review, bool)
            ):
                raise CatalogDatabaseStateFailure()
            competing += current_competing
            disagreements += current_disagreements
            canonical_review_required = canonical_review_required or current_review
        return competing, disagreements, canonical_review_required

    async def _persist_conflict(
        self,
        connection: AsyncConnection,
        *,
        category: IngestionConflictCategory,
        anchor: dict[str, object],
        existing: dict[str, object],
        incoming: dict[str, object],
        provider_id: UUID | None = None,
        dataset_id: UUID | None = None,
        source_record_id: UUID | None = None,
        measurement_id: UUID | None = None,
        source_fact_key: str | None = None,
    ) -> ConflictReference:
        canonical_bytes = conflict_fingerprint_bytes(
            category,
            anchor=anchor,
            existing=existing,
            incoming=incoming,
        )
        fingerprint = hashlib.sha256(canonical_bytes).hexdigest()
        evidence = _stored_evidence(
            canonical_bytes, anchor=anchor, existing=existing, incoming=incoming
        )
        serialized_evidence = _json_bytes(evidence).decode("utf-8")
        parameters = {
            "fingerprint": fingerprint,
            "category": category.value,
            "provider_id": provider_id,
            "dataset_id": dataset_id,
            "source_record_id": source_record_id,
            "measurement_id": measurement_id,
            "source_fact_key": source_fact_key,
            "incoming_evidence": serialized_evidence,
        }
        inserted = (
            (await connection.execute(_CONFLICT_INSERT_SQL, parameters)).mappings().one_or_none()
        )
        row = inserted
        if row is None:
            row = (
                (
                    await connection.execute(
                        _CONFLICT_SELECT_SQL,
                        {
                            "fingerprint": fingerprint,
                            "incoming_evidence": serialized_evidence,
                        },
                    )
                )
                .mappings()
                .one_or_none()
            )
        if row is None or not _conflict_row_matches(
            row,
            fingerprint=fingerprint,
            category=category,
            provider_id=provider_id,
            dataset_id=dataset_id,
            source_record_id=source_record_id,
            measurement_id=measurement_id,
            source_fact_key=source_fact_key,
            evidence=evidence,
        ):
            raise CatalogDatabaseStateFailure()
        try:
            status = IngestionConflictStatus(_required_text(row, "status"))
        except ValueError:
            raise CatalogDatabaseStateFailure() from None
        return ConflictReference(fingerprint=fingerprint, category=category, status=status)

    @staticmethod
    async def _rollback_and_close(session: AsyncSession) -> bool:
        try:
            if session.in_transaction():
                rollback = await _run_deferring_process_control(session.rollback())
                if rollback.error is not None:
                    return await PostgreSqlCatalogIngestionStore._discard_failed_session(session)
            closed = await _run_deferring_process_control(session.close())
            if closed.error is None:
                return True
        except BaseException:
            pass
        return await PostgreSqlCatalogIngestionStore._discard_failed_session(session)

    @staticmethod
    async def _cleanup_before_mutation(session: AsyncSession) -> bool:
        return await PostgreSqlCatalogIngestionStore._rollback_and_close(session)

    @staticmethod
    async def _discard_failed_session(session: AsyncSession) -> bool:
        invalidated = await _run_deferring_process_control(session.invalidate())
        if invalidated.error is not None:
            closed = await _run_deferring_process_control(session.close())
            return closed.error is None
        closed = await _run_deferring_process_control(session.close())
        return closed.error is None

    @staticmethod
    async def _close_after_confirmed_commit(session: AsyncSession) -> bool:
        closed = await _run_deferring_process_control(session.close())
        if closed.error is None:
            return True
        return await PostgreSqlCatalogIngestionStore._discard_failed_session(session)


def _provider_metadata(manifest: Any) -> dict[str, object]:
    return {
        "name": manifest.source_name,
        "documentation_url": manifest.official_documentation_url,
        "terms_url": manifest.terms_or_licence_url,
        "attribution_text": manifest.attribution_text,
    }


def _provider_metadata_row(row: RowMapping) -> dict[str, object]:
    return {
        "name": _required_text(row, "name"),
        "documentation_url": _required_text(row, "documentation_url"),
        "terms_url": _required_text(row, "terms_url"),
        "attribution_text": _required_text(row, "attribution_text"),
    }


def _dataset_metadata(dataset_name: str, manifest: Any) -> dict[str, object]:
    return {
        "name": dataset_name,
        "source_url": manifest.official_url,
        "licence": manifest.terms_or_licence,
        "citation": manifest.citation,
    }


def _dataset_metadata_row(row: RowMapping) -> dict[str, object]:
    return {
        "name": _required_text(row, "name"),
        "source_url": _required_text(row, "source_url"),
        "licence": _required_text(row, "licence"),
        "citation": _required_text(row, "citation"),
    }


def _source_metadata(command: Any) -> dict[str, object]:
    return {
        "source_url": command.source_record.source_url,
        "adapter_id": command.source_manifest.adapter_id,
        "adapter_version": command.source_manifest.adapter_version,
        "parser_version": command.data_manifest.parser_version,
    }


def _source_metadata_row(row: RowMapping) -> dict[str, object]:
    return {
        "source_url": _optional_text(row, "source_url"),
        "adapter_id": _required_text(row, "adapter_id"),
        "adapter_version": _required_text(row, "adapter_version"),
        "parser_version": _required_text(row, "parser_version"),
    }


def _measurement_matches(row: RowMapping, incoming: _ResolvedMeasurement) -> bool:
    measurement = incoming.measurement
    value = row.get("value_numeric")
    return (
        _required_uuid(row, "quantity_id") == incoming.quantity_id
        and _required_uuid(row, "unit_id") == incoming.unit_id
        and isinstance(value, Decimal)
        and value == measurement.value_numeric
        and _required_text(row, "original_value") == measurement.original_value
        and _required_text(row, "original_unit") == measurement.original_unit
        and _required_text(row, "quantity_code") == measurement.quantity_code
        and _required_text(row, "unit_code") == measurement.unit_code
    )


def _measurement_sets_match(
    persisted: tuple[RowMapping, ...],
    incoming: tuple[_ResolvedMeasurement, ...],
) -> bool:
    """Compare the complete immutable fact set before accepting a replay or commit recovery."""
    persisted_by_key: dict[str, RowMapping] = {}
    for row in persisted:
        key = _required_text(row, "source_fact_key")
        if key in persisted_by_key:
            raise CatalogDatabaseStateFailure()
        persisted_by_key[key] = row
    incoming_by_key = {item.measurement.source_fact_key: item for item in incoming}
    if tuple(sorted(persisted_by_key)) != tuple(sorted(incoming_by_key)):
        return False
    return all(
        _measurement_matches(persisted_by_key[key], incoming_by_key[key])
        for key in sorted(incoming_by_key)
    )


def _measurement_row_matches_insert(row: RowMapping, incoming: _ResolvedMeasurement) -> bool:
    value = row.get("value_numeric")
    measurement = incoming.measurement
    return (
        _required_uuid(row, "quantity_id") == incoming.quantity_id
        and _required_uuid(row, "unit_id") == incoming.unit_id
        and isinstance(value, Decimal)
        and value == measurement.value_numeric
        and _required_text(row, "original_value") == measurement.original_value
        and _required_text(row, "original_unit") == measurement.original_unit
    )


def _measurement_evidence_row(row: RowMapping) -> dict[str, object]:
    value = row.get("value_numeric")
    if not isinstance(value, Decimal):
        raise CatalogDatabaseStateFailure()
    return {
        "quantity_code": _required_text(row, "quantity_code"),
        "unit_code": _required_text(row, "unit_code"),
        "value_numeric": str(value),
        "original_value": _required_text(row, "original_value"),
        "original_unit": _required_text(row, "original_unit"),
    }


def _measurement_evidence(incoming: _ResolvedMeasurement) -> dict[str, object]:
    measurement = incoming.measurement
    return {
        "quantity_code": measurement.quantity_code,
        "unit_code": measurement.unit_code,
        "value_numeric": str(measurement.value_numeric),
        "original_value": measurement.original_value,
        "original_unit": measurement.original_unit,
    }


def _stored_evidence(
    canonical_bytes: bytes,
    *,
    anchor: dict[str, object],
    existing: dict[str, object],
    incoming: dict[str, object],
) -> dict[str, object]:
    """Preserve allowlisted evidence while guaranteeing the database's 8 KiB evidence bound."""
    decoded = json.loads(canonical_bytes)
    if type(decoded) is not dict:
        raise CatalogDatabaseStateFailure()
    if len(_postgres_jsonb_text_bytes(decoded)) <= _MAX_CONFLICT_EVIDENCE_BYTES:
        return decoded
    # Domain strings can be larger than the deliberately smaller conflict-report storage budget.
    # Keep deterministic, non-secret evidence references without inserting a value the database
    # would reject after a source-integrity conflict has otherwise been accepted.
    reduced = {
        "fingerprint_schema": 1,
        "anchor": _digest_evidence_value(anchor),
        "existing_sha256": hashlib.sha256(_json_bytes(existing)).hexdigest(),
        "incoming_sha256": hashlib.sha256(_json_bytes(incoming)).hexdigest(),
        "evidence_truncated": True,
    }
    if len(_postgres_jsonb_text_bytes(reduced)) > _MAX_CONFLICT_EVIDENCE_BYTES:
        raise CatalogDatabaseStateFailure()
    return reduced


def _digest_evidence_value(value: dict[str, object]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, item in value.items():
        if isinstance(item, UUID):
            result[key] = str(item)
        elif item is None or isinstance(item, str | bool) or type(item) is int:
            result[key] = item
        else:
            result[key] = hashlib.sha256(_json_bytes({"value": item})).hexdigest()
    return result


def _json_bytes(value: object) -> bytes:
    try:
        return json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise CatalogDatabaseStateFailure() from None


def _postgres_jsonb_text_bytes(value: object) -> bytes:
    """Render the JSONB ``::text`` form used by the evidence size constraint."""
    try:
        return json.dumps(
            _postgres_jsonb_text_value(value),
            allow_nan=False,
            ensure_ascii=False,
            separators=(", ", ": "),
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise CatalogDatabaseStateFailure() from None


def _postgres_jsonb_text_value(value: object) -> object:
    """Order JSON object keys exactly as PostgreSQL JSONB renders them."""
    if type(value) is dict:
        values = value
        return {
            key: _postgres_jsonb_text_value(values[key])
            for key in sorted(values, key=_postgres_jsonb_key_sort_key)
        }
    if type(value) is list:
        return [_postgres_jsonb_text_value(item) for item in value]
    return value


def _postgres_jsonb_key_sort_key(key: object) -> tuple[int, bytes]:
    if type(key) is not str:
        raise CatalogDatabaseStateFailure()
    encoded = key.encode("utf-8")
    return (len(encoded), encoded)


def _conflict_row_matches(
    row: RowMapping,
    *,
    fingerprint: str,
    category: IngestionConflictCategory,
    provider_id: UUID | None,
    dataset_id: UUID | None,
    source_record_id: UUID | None,
    measurement_id: UUID | None,
    source_fact_key: str | None,
    evidence: dict[str, object],
) -> bool:
    del evidence
    return (
        _required_text(row, "fingerprint") == fingerprint
        and _required_text(row, "category") == category.value
        and _optional_uuid(row, "provider_id") == provider_id
        and _optional_uuid(row, "dataset_id") == dataset_id
        and _optional_uuid(row, "source_record_id") == source_record_id
        and _optional_uuid(row, "measurement_id") == measurement_id
        and _optional_text(row, "source_fact_key") == source_fact_key
        and row.get("evidence_equal") is True
    )


def _required_uuid(row: RowMapping, key: str) -> UUID:
    value = row.get(key)
    if not isinstance(value, UUID):
        raise CatalogDatabaseStateFailure()
    return value


def _optional_uuid(row: RowMapping, key: str) -> UUID | None:
    value = row.get(key)
    if value is not None and not isinstance(value, UUID):
        raise CatalogDatabaseStateFailure()
    return value


def _required_text(row: RowMapping, key: str) -> str:
    value = row.get(key)
    if not isinstance(value, str):
        raise CatalogDatabaseStateFailure()
    return value


def _optional_text(row: RowMapping, key: str) -> str | None:
    value = row.get(key)
    if value is not None and not isinstance(value, str):
        raise CatalogDatabaseStateFailure()
    return value


def _outcome(
    *,
    status: CatalogIngestionStatus,
    provider_state: IngestionRecordState,
    dataset_state: IngestionRecordState,
    source_record_state: IngestionRecordState,
    source_record_id: UUID | None,
    inserted_measurement_count: int = 0,
    existing_measurement_count: int = 0,
    competing_measurement_count: int = 0,
    scientific_disagreement_count: int = 0,
    canonical_review_required: bool = False,
    conflicts: tuple[ConflictReference, ...] = (),
) -> CatalogIngestionOutcome:
    return CatalogIngestionOutcome(
        status=status,
        provider_state=provider_state,
        dataset_state=dataset_state,
        source_record_state=source_record_state,
        source_record_id=source_record_id,
        inserted_measurement_count=inserted_measurement_count,
        existing_measurement_count=existing_measurement_count,
        competing_measurement_count=competing_measurement_count,
        scientific_disagreement_count=scientific_disagreement_count,
        canonical_review_required=canonical_review_required,
        conflicts=conflicts,
    )


def _conflict_outcome(
    conflict: ConflictReference,
    *,
    provider_state: IngestionRecordState = IngestionRecordState.EXISTING,
    dataset_state: IngestionRecordState = IngestionRecordState.EXISTING,
    source_record_state: IngestionRecordState = IngestionRecordState.EXISTING,
    source_record_id: UUID | None = None,
) -> CatalogIngestionOutcome:
    return _outcome(
        status=CatalogIngestionStatus.CONFLICT,
        provider_state=provider_state,
        dataset_state=dataset_state,
        source_record_state=source_record_state,
        source_record_id=source_record_id,
        conflicts=(conflict,),
    )


async def _run_deferring_process_control[Result](
    operation: Coroutine[Any, Any, Result],
) -> _DeferredResult[Result]:
    """Settle a database lifecycle call before deciding a cancellation-sensitive outcome."""
    task = asyncio.create_task(operation)
    while True:
        try:
            return _DeferredResult(value=await asyncio.shield(task))
        except _PROCESS_CONTROL_ERRORS as interruption:
            if not task.done():
                continue
            if task.cancelled():
                return _DeferredResult(error=interruption)
            try:
                return _DeferredResult(value=task.result())
            except BaseException as error:
                return _DeferredResult(error=error)
        except BaseException as error:
            return _DeferredResult(error=error)


def _classify_database_failure(
    error: SQLAlchemyError,
    phase: _DatabasePhase,
    *,
    timeout_installed: bool,
) -> type[CatalogIngestionError]:
    sqlstate = _database_sqlstate(error) if isinstance(error, DBAPIError) else None
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated
        or (sqlstate is not None and sqlstate.startswith(_CONNECTION_SQLSTATE_CLASS))
    ):
        return CatalogStorageUnavailable
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and _is_installed_timeout(error, sqlstate)
    ):
        return CatalogIngestionContention
    if isinstance(error, IntegrityError):
        return CatalogDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return CatalogDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return CatalogDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return CatalogDatabaseProgrammingFailure
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return CatalogStorageUnavailable
    return CatalogDatabaseOperationFailure


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None


def _is_installed_timeout(error: DBAPIError, sqlstate: str | None) -> bool:
    """Avoid calling a user cancellation or unrelated lock error bounded contention."""
    message = str(error.orig).lower()
    if sqlstate == _LOCK_TIMEOUT_SQLSTATE:
        return "lock timeout" in message
    if sqlstate == _QUERY_CANCELLED_SQLSTATE:
        return "statement timeout" in message
    return False
