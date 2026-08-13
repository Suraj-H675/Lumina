"""Catalogue ingestion application service tests."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from lumina.catalog.application.ingest import CatalogIngestionService
from lumina.catalog.domain.ingestion import (
    CatalogDatabaseOperationFailure,
    CatalogIngestionError,
    CatalogIngestionOutcome,
    CatalogIngestionStatus,
    CatalogIngestionValidationRejected,
    ConflictReference,
    IngestionConflictCategory,
    IngestionConflictStatus,
    IngestionRecordState,
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
    PreparedCatalogIngestion,
)
from lumina.provenance.domain.manifests import DataManifest, SourceManifest

_UUIDS = (
    UUID("12345678-1234-4234-9234-123456789abc"),
    UUID("12345678-1234-4234-9234-123456789abd"),
    UUID("12345678-1234-4234-9234-123456789abe"),
    UUID("12345678-1234-4234-9234-123456789abf"),
)


class RecordingStore:
    def __init__(self, outcome: CatalogIngestionOutcome) -> None:
        self.outcome = outcome
        self.prepared: list[PreparedCatalogIngestion] = []

    async def ingest(self, prepared: PreparedCatalogIngestion) -> CatalogIngestionOutcome:
        self.prepared.append(prepared)
        return self.outcome


def _outcome(
    status: CatalogIngestionStatus = CatalogIngestionStatus.INSERTED,
) -> CatalogIngestionOutcome:
    if status is CatalogIngestionStatus.REPLAYED:
        return CatalogIngestionOutcome(
            status=status,
            provider_state=IngestionRecordState.EXISTING,
            dataset_state=IngestionRecordState.EXISTING,
            source_record_state=IngestionRecordState.EXISTING,
            source_record_id=_UUIDS[2],
            inserted_measurement_count=0,
            existing_measurement_count=1,
            competing_measurement_count=0,
            scientific_disagreement_count=0,
            canonical_review_required=False,
            conflicts=(),
        )
    if status is CatalogIngestionStatus.UNRESOLVED:
        return CatalogIngestionOutcome(
            status=status,
            provider_state=IngestionRecordState.INSERTED,
            dataset_state=IngestionRecordState.INSERTED,
            source_record_state=IngestionRecordState.UNRESOLVED,
            source_record_id=_UUIDS[2],
            inserted_measurement_count=0,
            existing_measurement_count=0,
            competing_measurement_count=0,
            scientific_disagreement_count=0,
            canonical_review_required=False,
            conflicts=(),
        )
    if status is CatalogIngestionStatus.CONFLICT:
        return CatalogIngestionOutcome(
            status=status,
            provider_state=IngestionRecordState.EXISTING,
            dataset_state=IngestionRecordState.EXISTING,
            source_record_state=IngestionRecordState.EXISTING,
            source_record_id=_UUIDS[2],
            inserted_measurement_count=0,
            existing_measurement_count=1,
            competing_measurement_count=0,
            scientific_disagreement_count=0,
            canonical_review_required=False,
            conflicts=(
                ConflictReference(
                    fingerprint="a" * 64,
                    category=IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH,
                    status=IngestionConflictStatus.OPEN,
                ),
            ),
        )
    return CatalogIngestionOutcome(
        status=status,
        provider_state=IngestionRecordState.INSERTED,
        dataset_state=IngestionRecordState.INSERTED,
        source_record_state=IngestionRecordState.INSERTED,
        source_record_id=_UUIDS[2],
        inserted_measurement_count=1,
        existing_measurement_count=0,
        competing_measurement_count=0,
        scientific_disagreement_count=0,
        canonical_review_required=False,
        conflicts=(),
    )


def _command(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> IngestReviewedDatasetCommand:
    return IngestReviewedDatasetCommand(
        source_manifest=source_manifest,
        data_manifest=data_manifest,
        dataset_name="Fictional Catalogue Release",
        source_record=NormalizedSourceRecord(
            provider_record_id="fixture-record-1",
            provider_version="fixture-provider-v1",
            canonical_entity_id=None,
            source_url="https://fixtures.invalid/catalog/record-1",
            fetched_at=datetime(2026, 8, 1, tzinfo=UTC),
            measurements=(
                NormalizedMeasurement(
                    source_fact_key="fixture.mass:primary",
                    quantity_code="fixture.quantity.mass",
                    unit_code="fixture.unit.kg",
                    value_numeric=Decimal("1.23"),
                    original_value="1.23",
                    original_unit="kg",
                ),
            ),
        ),
    )


def _service(store: RecordingStore) -> CatalogIngestionService:
    generated = iter(_UUIDS)
    return CatalogIngestionService(store, uuid_factory=lambda: next(generated))


@pytest.mark.asyncio
async def test_service_allocates_deterministic_surrogates_and_delegates_once(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = RecordingStore(_outcome())

    outcome = await _service(store).ingest(_command(source_manifest, data_manifest))

    assert outcome.status is CatalogIngestionStatus.INSERTED
    assert len(store.prepared) == 1
    assert store.prepared[0].provider_id == _UUIDS[0]
    assert store.prepared[0].dataset_id == _UUIDS[1]
    assert store.prepared[0].source_record_id == _UUIDS[2]
    assert store.prepared[0].measurement_ids == (_UUIDS[3],)


@pytest.mark.asyncio
async def test_invalid_command_never_calls_store_and_logs_safe_category(
    caplog: pytest.LogCaptureFixture,
) -> None:
    store = RecordingStore(_outcome())

    with (
        caplog.at_level(logging.WARNING, logger="lumina.catalog.ingestion"),
        pytest.raises(CatalogIngestionValidationRejected) as captured,
    ):
        await _service(store).ingest(object())  # type: ignore[arg-type]

    assert store.prepared == []
    assert captured.value.code == "catalog.ingestion_validation_rejected"
    assert "catalog.ingestion.failed" in caplog.text


@pytest.mark.asyncio
async def test_forged_frozen_command_copy_is_rejected_before_store(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = RecordingStore(_outcome())
    forged = _command(source_manifest, data_manifest).model_copy(update={"source_record": object()})

    with pytest.raises(CatalogIngestionValidationRejected):
        await _service(store).ingest(forged)

    assert store.prepared == []


@pytest.mark.asyncio
async def test_invalid_uuid_factory_is_safe_and_never_calls_store(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = RecordingStore(_outcome())
    service = CatalogIngestionService(
        store,
        uuid_factory=lambda: UUID("12345678-1234-1234-9234-123456789abc"),
    )

    with pytest.raises(CatalogIngestionValidationRejected):
        await service.ingest(_command(source_manifest, data_manifest))

    assert store.prepared == []


@pytest.mark.asyncio
async def test_unexpected_store_exception_is_replaced_without_leaking_source_values(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    class FailingStore:
        async def ingest(self, prepared: PreparedCatalogIngestion) -> CatalogIngestionOutcome:
            del prepared
            raise RuntimeError("RAW-SOURCE-URL-SENTINEL https://secrets.invalid/record")

    service = CatalogIngestionService(FailingStore())

    with pytest.raises(CatalogDatabaseOperationFailure) as captured:
        await service.ingest(_command(source_manifest, data_manifest))

    assert "RAW-SOURCE-URL-SENTINEL" not in repr(captured.value)
    assert captured.value.__cause__ is None


@pytest.mark.asyncio
async def test_unrecognized_catalog_error_and_forged_store_outcome_are_safely_closed(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    class ForgedCatalogError(CatalogIngestionError):
        code = "catalog.forged_error"
        safe_message = "FORGED-ERROR-SENTINEL"

    class ForgedErrorStore:
        async def ingest(self, prepared: PreparedCatalogIngestion) -> CatalogIngestionOutcome:
            del prepared
            raise ForgedCatalogError()

    with pytest.raises(CatalogDatabaseOperationFailure) as captured:
        await CatalogIngestionService(ForgedErrorStore()).ingest(
            _command(source_manifest, data_manifest)
        )
    assert "FORGED-ERROR-SENTINEL" not in repr(captured.value)

    class ForgedOutcomeStore:
        async def ingest(self, prepared: PreparedCatalogIngestion) -> CatalogIngestionOutcome:
            del prepared
            return _outcome().model_copy(update={"status": "FORGED-OUTCOME-SENTINEL"})

    with pytest.raises(CatalogDatabaseOperationFailure) as captured:
        await CatalogIngestionService(ForgedOutcomeStore()).ingest(
            _command(source_manifest, data_manifest)
        )
    assert "FORGED-OUTCOME-SENTINEL" not in repr(captured.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status",
    [
        CatalogIngestionStatus.INSERTED,
        CatalogIngestionStatus.REPLAYED,
        CatalogIngestionStatus.UNRESOLVED,
        CatalogIngestionStatus.CONFLICT,
    ],
)
async def test_service_logs_only_fixed_outcome_event_and_counts(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
    caplog: pytest.LogCaptureFixture,
    status: CatalogIngestionStatus,
) -> None:
    secret = "SOURCE-UNIT-SENTINEL"
    command = _command(source_manifest, data_manifest).model_copy(
        update={
            "source_record": _command(source_manifest, data_manifest).source_record.model_copy(
                update={
                    "measurements": (
                        NormalizedMeasurement(
                            source_fact_key="fixture.mass:primary",
                            quantity_code="fixture.quantity.mass",
                            unit_code="fixture.unit.kg",
                            value_numeric=Decimal("1.23"),
                            original_value="1.23",
                            original_unit=secret,
                        ),
                    )
                }
            )
        }
    )
    store = RecordingStore(_outcome(status))

    with caplog.at_level(logging.INFO, logger="lumina.catalog.ingestion"):
        await _service(store).ingest(command)

    assert f"catalog.ingestion.{status.value}" in caplog.text
    assert secret not in caplog.text
