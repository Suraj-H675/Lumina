"""Focused unit tests for the Phase 1A3 PostgreSQL ingestion adapter."""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import cast
from uuid import UUID

import pytest
from lumina.catalog.domain.ingestion import (
    CatalogDatabaseOperationFailure,
    CatalogDatabaseProgrammingFailure,
    CatalogDatabaseStateFailure,
    CatalogIngestionContention,
    CatalogIngestionOutcome,
    CatalogIngestionOutcomeUnknown,
    CatalogIngestionStatus,
    CatalogStorageUnavailable,
    IngestionConflictCategory,
    IngestionRecordState,
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
    PreparedCatalogIngestion,
    conflict_fingerprint_bytes,
    normalized_source_content_sha256,
)
from lumina.catalog.infrastructure.postgresql.ingestion import (
    PostgreSqlCatalogIngestionStore,
    _classify_database_failure,
    _DatabasePhase,
    _measurement_sets_match,
    _postgres_jsonb_text_bytes,
    _ResolvedMeasurement,
    _stored_evidence,
)
from lumina.provenance.domain.manifests import DataManifest, SourceManifest
from sqlalchemy import RowMapping
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")
_PROVIDER_ID = UUID("12345678-1234-4234-9234-123456789abd")
_DATASET_ID = UUID("12345678-1234-4234-9234-123456789abe")
_SOURCE_RECORD_ID = UUID("12345678-1234-4234-9234-123456789abf")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789ac0")
_QUANTITY_ID = UUID("12345678-1234-4234-9234-123456789ac1")
_UNIT_ID = UUID("12345678-1234-4234-9234-123456789ac2")


class _Result:
    def __init__(self, row: dict[str, object] | None = None, scalar: object | None = None) -> None:
        self._row = row
        self._scalar = scalar

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> RowMapping | None:
        return cast(RowMapping | None, self._row)

    def all(self) -> list[RowMapping]:
        return [] if self._row is None else [cast(RowMapping, self._row)]

    def scalar_one(self) -> object:
        return self._scalar


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str, message: str) -> None:
        super().__init__(message)
        self.sqlstate = sqlstate


class _SourceConnection:
    def __init__(self, existing: dict[str, object], *, evidence_equal: bool = True) -> None:
        self.existing = existing
        self.evidence_equal = evidence_equal
        self.statements: list[str] = []

    async def execute(
        self,
        statement: object,
        parameters: dict[str, object] | None = None,
    ) -> _Result:
        sql = str(statement)
        self.statements.append(sql)
        if "INSERT INTO public.source_record" in sql:
            return _Result()
        if "FROM public.source_record" in sql and "FOR UPDATE" in sql:
            return _Result(self.existing)
        if "FROM public.measurement" in sql:
            return _Result()
        if "UPDATE public.source_record" in sql:
            assert parameters is not None
            return _Result(
                {
                    "id": parameters["id"],
                    "canonical_entity_id": parameters["canonical_entity_id"],
                }
            )
        if "INSERT INTO public.ingestion_conflict" in sql:
            assert parameters is not None
            return _Result(
                {
                    "fingerprint": parameters["fingerprint"],
                    "category": parameters["category"],
                    "provider_id": parameters["provider_id"],
                    "dataset_id": parameters["dataset_id"],
                    "source_record_id": parameters["source_record_id"],
                    "measurement_id": parameters["measurement_id"],
                    "source_fact_key": parameters["source_fact_key"],
                    "status": "open",
                    "evidence_equal": self.evidence_equal,
                }
            )
        raise AssertionError(f"Unexpected statement: {sql}")


def _prepared(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> PreparedCatalogIngestion:
    command = IngestReviewedDatasetCommand(
        source_manifest=source_manifest,
        data_manifest=data_manifest,
        dataset_name="Fictional Catalogue Release",
        source_record=NormalizedSourceRecord(
            provider_record_id="fixture-record-1",
            provider_version="fixture-provider-v1",
            canonical_entity_id=_ENTITY_ID,
            source_url="https://fixtures.invalid/catalog/record-1",
            fetched_at=datetime(2026, 8, 1, tzinfo=UTC),
            measurements=(
                NormalizedMeasurement(
                    source_fact_key="fixture.mass:primary",
                    quantity_code="fixture.quantity.mass",
                    unit_code="fixture.unit.kg",
                    value_numeric=Decimal("1.2300"),
                    original_value="1.2300",
                    original_unit="kg source spelling",
                ),
            ),
        ),
    )
    return PreparedCatalogIngestion(
        command=command,
        provider_id=_PROVIDER_ID,
        dataset_id=_DATASET_ID,
        source_record_id=_SOURCE_RECORD_ID,
        measurement_ids=(_MEASUREMENT_ID,),
    )


def _existing_unresolved(prepared: PreparedCatalogIngestion, checksum: str) -> dict[str, object]:
    command = prepared.command
    record = command.source_record
    return {
        "id": _SOURCE_RECORD_ID,
        "provider_id": _PROVIDER_ID,
        "dataset_id": _DATASET_ID,
        "provider_record_id": record.provider_record_id,
        "provider_version": record.provider_version,
        "canonical_entity_id": None,
        "source_url": record.source_url,
        "adapter_id": command.source_manifest.adapter_id,
        "adapter_version": command.source_manifest.adapter_version,
        "parser_version": command.data_manifest.parser_version,
        "normalized_content_sha256": checksum,
    }


@pytest.mark.asyncio
async def test_unresolved_source_requires_the_same_checksum_before_resolution(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    prepared = _prepared(source_manifest, data_manifest)
    connection = _SourceConnection(_existing_unresolved(prepared, "a" * 64))
    store = PostgreSqlCatalogIngestionStore(cast(async_sessionmaker[AsyncSession], object()))

    outcome = await store._reconcile_source_record(  # noqa: SLF001 - focused SQL contract
        cast(AsyncConnection, connection),
        prepared,
        provider_id=_PROVIDER_ID,
        dataset_id=_DATASET_ID,
    )

    assert isinstance(outcome, CatalogIngestionOutcome)
    assert outcome.status is CatalogIngestionStatus.CONFLICT
    assert [reference.category.value for reference in outcome.conflicts] == [
        "source_record_content_mismatch"
    ]
    assert not any("UPDATE public.source_record" in sql for sql in connection.statements)


@pytest.mark.asyncio
async def test_unresolved_source_with_matching_checksum_resolves_once(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    prepared = _prepared(source_manifest, data_manifest)
    connection = _SourceConnection(
        _existing_unresolved(prepared, normalized_source_content_sha256(prepared.command))
    )
    store = PostgreSqlCatalogIngestionStore(cast(async_sessionmaker[AsyncSession], object()))

    outcome = await store._reconcile_source_record(  # noqa: SLF001 - focused SQL contract
        cast(AsyncConnection, connection),
        prepared,
        provider_id=_PROVIDER_ID,
        dataset_id=_DATASET_ID,
    )

    assert not isinstance(outcome, CatalogIngestionOutcome)
    assert outcome.state is IngestionRecordState.RESOLVED
    assert outcome.canonical_entity_id == _ENTITY_ID
    assert sum("UPDATE public.source_record" in sql for sql in connection.statements) == 1


@pytest.mark.asyncio
async def test_conflict_replay_requires_exact_persisted_evidence(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    prepared = _prepared(source_manifest, data_manifest)
    connection = _SourceConnection(
        _existing_unresolved(prepared, "a" * 64),
        evidence_equal=False,
    )
    store = PostgreSqlCatalogIngestionStore(cast(async_sessionmaker[AsyncSession], object()))

    with pytest.raises(CatalogDatabaseStateFailure):
        await store._reconcile_source_record(  # noqa: SLF001 - focused SQL contract
            cast(AsyncConnection, connection),
            prepared,
            provider_id=_PROVIDER_ID,
            dataset_id=_DATASET_ID,
        )


def test_stored_evidence_reduces_before_postgresql_jsonb_text_exceeds_its_bound() -> None:
    anchor: dict[str, object] = {
        "provider_id": _PROVIDER_ID,
        "provider_code": "fixture.catalog-source",
    }
    existing: dict[str, object] = {"name": "x" * 7_957}
    incoming: dict[str, object] = {"name": "Fixture"}
    canonical_bytes = conflict_fingerprint_bytes(
        IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
        anchor=anchor,
        existing=existing,
        incoming=incoming,
    )
    full_evidence = json.loads(canonical_bytes)

    assert len(canonical_bytes) <= 8_192
    assert len(_postgres_jsonb_text_bytes(full_evidence)) > 8_192

    stored = _stored_evidence(
        canonical_bytes,
        anchor=anchor,
        existing=existing,
        incoming=incoming,
    )

    assert stored["evidence_truncated"] is True
    assert stored == _stored_evidence(
        canonical_bytes,
        anchor=anchor,
        existing=existing,
        incoming=incoming,
    )
    assert len(_postgres_jsonb_text_bytes(stored)) <= 8_192


def test_whole_measurement_set_requires_exact_decimal_and_original_text() -> None:
    incoming = _ResolvedMeasurement(
        identifier=_MEASUREMENT_ID,
        measurement=NormalizedMeasurement(
            source_fact_key="fixture.mass:primary",
            quantity_code="fixture.quantity.mass",
            unit_code="fixture.unit.kg",
            value_numeric=Decimal("1.2300"),
            original_value="1.2300",
            original_unit="kg source spelling",
        ),
        quantity_id=_QUANTITY_ID,
        unit_id=_UNIT_ID,
    )
    persisted = cast(
        RowMapping,
        {
            "id": _MEASUREMENT_ID,
            "source_fact_key": "fixture.mass:primary",
            "quantity_id": _QUANTITY_ID,
            "unit_id": _UNIT_ID,
            "quantity_code": "fixture.quantity.mass",
            "unit_code": "fixture.unit.kg",
            "value_numeric": Decimal("1.2300"),
            "original_value": "1.2300",
            "original_unit": "kg source spelling",
        },
    )

    assert _measurement_sets_match((persisted,), (incoming,))
    altered_original = dict(persisted)
    altered_original["original_value"] = "1.230"
    assert not _measurement_sets_match((cast(RowMapping, altered_original),), (incoming,))


@pytest.mark.parametrize(
    ("sqlstate", "message", "timeout_installed", "expected"),
    [
        ("57014", "canceling statement due to statement timeout", True, CatalogStorageUnavailable),
        ("57014", "canceling statement due to user request", True, CatalogStorageUnavailable),
        ("55P03", "canceling statement due to lock timeout", True, CatalogStorageUnavailable),
    ],
)
def test_invalidated_database_errors_take_precedence_over_timeout_classification(
    sqlstate: str,
    message: str,
    timeout_installed: bool,
    expected: type[RuntimeError],
) -> None:
    error = OperationalError(
        "SELECT hidden SQL",
        {"hidden": "parameter"},
        _DriverFailure(sqlstate, message),
        connection_invalidated=True,
    )

    assert (
        _classify_database_failure(
            error,
            _DatabasePhase.OPERATION,
            timeout_installed=timeout_installed,
        )
        is expected
    )


@pytest.mark.parametrize(
    ("message", "timeout_installed", "expected"),
    [
        ("canceling statement due to statement timeout", True, CatalogIngestionContention),
        ("canceling statement due to user request", True, CatalogStorageUnavailable),
        ("canceling statement due to statement timeout", False, CatalogStorageUnavailable),
    ],
)
def test_timeout_classification_requires_the_repository_timeout_evidence(
    message: str,
    timeout_installed: bool,
    expected: type[RuntimeError],
) -> None:
    error = OperationalError(
        "SELECT hidden SQL",
        {"hidden": "parameter"},
        _DriverFailure("57014", message),
        connection_invalidated=False,
    )

    assert (
        _classify_database_failure(
            error,
            _DatabasePhase.CONNECTION,
            timeout_installed=timeout_installed,
        )
        is expected
    )


class _Session:
    def __init__(self, *, commit_error: BaseException | None = None) -> None:
        self.commit_error = commit_error
        self.transaction_active = False
        self.commits = 0
        self.rollbacks = 0
        self.closes = 0
        self.invalidations = 0

    async def begin(self) -> None:
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, _LifecycleConnection())

    async def commit(self) -> None:
        self.commits += 1
        if self.commit_error is not None:
            raise self.commit_error
        self.transaction_active = False

    async def rollback(self) -> None:
        self.rollbacks += 1
        self.transaction_active = False

    async def close(self) -> None:
        self.closes += 1
        self.transaction_active = False

    async def invalidate(self) -> None:
        self.invalidations += 1
        self.transaction_active = False

    def in_transaction(self) -> bool:
        return self.transaction_active


class _LifecycleConnection:
    async def execute(
        self,
        statement: object,
        parameters: dict[str, object] | None = None,
    ) -> _Result:
        del parameters
        if "pg_backend_pid" in str(statement):
            return _Result(scalar=100)
        return _Result()


class _Factory:
    def __init__(self, session: _Session) -> None:
        self.session = session

    def __call__(self) -> _Session:
        return self.session


class _BlockingCommitSession(_Session):
    def __init__(self) -> None:
        super().__init__()
        self.commit_started = asyncio.Event()
        self.commit_release = asyncio.Event()

    async def commit(self) -> None:
        self.commits += 1
        self.commit_started.set()
        await self.commit_release.wait()
        self.transaction_active = False


class _CommitStore(PostgreSqlCatalogIngestionStore):
    async def _ingest_with_connection(
        self,
        connection: AsyncConnection,
        prepared: PreparedCatalogIngestion,
    ) -> CatalogIngestionOutcome:
        del connection, prepared
        return CatalogIngestionOutcome(
            status=CatalogIngestionStatus.UNRESOLVED,
            provider_state=IngestionRecordState.EXISTING,
            dataset_state=IngestionRecordState.EXISTING,
            source_record_state=IngestionRecordState.UNRESOLVED,
            source_record_id=_SOURCE_RECORD_ID,
            inserted_measurement_count=0,
            existing_measurement_count=0,
            competing_measurement_count=0,
            scientific_disagreement_count=0,
            canonical_review_required=False,
            conflicts=(),
        )


@pytest.mark.asyncio
async def test_lost_commit_acknowledgement_is_never_reported_as_a_normal_outcome(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    commit_error = OperationalError(
        "COMMIT hidden SQL",
        {"secret": "hidden parameter"},
        _DriverFailure("08006", "connection failure"),
        connection_invalidated=True,
    )
    session = _Session(commit_error=commit_error)
    store = _CommitStore(cast(async_sessionmaker[AsyncSession], _Factory(session)))

    with pytest.raises(CatalogIngestionOutcomeUnknown) as captured:
        await store.ingest(_prepared(source_manifest, data_manifest))

    assert captured.value.__cause__ is None
    assert captured.value.__context__ is None
    assert session.commits == 1
    assert session.invalidations == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_cancellation_waits_for_inflight_commit_and_releases_the_session(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    session = _BlockingCommitSession()
    store = _CommitStore(cast(async_sessionmaker[AsyncSession], _Factory(session)))
    task = asyncio.create_task(store.ingest(_prepared(source_manifest, data_manifest)))

    await session.commit_started.wait()
    task.cancel()
    session.commit_release.set()
    outcome = await task

    assert outcome.status is CatalogIngestionStatus.UNRESOLVED
    assert session.commits == 1
    assert session.closes == 1
    assert session.invalidations == 0


@pytest.mark.asyncio
async def test_pre_mutation_programming_failure_rolls_back_and_closes(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    class _FailingStore(_CommitStore):
        async def _ingest_with_connection(
            self,
            connection: AsyncConnection,
            prepared: PreparedCatalogIngestion,
        ) -> CatalogIngestionOutcome:
            del connection, prepared
            raise ProgrammingError("hidden SQL", {}, Exception("hidden driver"))

    session = _Session()
    store = _FailingStore(cast(async_sessionmaker[AsyncSession], _Factory(session)))

    with pytest.raises(CatalogDatabaseProgrammingFailure):
        await store.ingest(_prepared(source_manifest, data_manifest))

    assert session.rollbacks == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_unconfirmed_cleanup_replaces_the_original_database_failure(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    class _UnsafeCleanupSession(_Session):
        async def close(self) -> None:
            self.closes += 1
            raise RuntimeError("raw close failure")

    class _FailingStore(_CommitStore):
        async def _ingest_with_connection(
            self,
            connection: AsyncConnection,
            prepared: PreparedCatalogIngestion,
        ) -> CatalogIngestionOutcome:
            del connection, prepared
            raise ProgrammingError("hidden SQL", {}, Exception("hidden driver"))

    session = _UnsafeCleanupSession()
    store = _FailingStore(cast(async_sessionmaker[AsyncSession], _Factory(session)))

    with pytest.raises(CatalogDatabaseOperationFailure) as captured:
        await store.ingest(_prepared(source_manifest, data_manifest))

    assert captured.value.__cause__ is None
    assert captured.value.__context__ is None
    assert session.rollbacks == 1
    assert session.invalidations == 1
    assert session.closes == 2
