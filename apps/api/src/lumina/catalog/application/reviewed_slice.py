"""Application orchestration for the one offline reviewed catalogue slice."""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from time import perf_counter
from typing import Protocol, TypeVar, cast

from lumina.catalog.domain.ingestion import (
    CatalogIngestionOutcome,
    CatalogIngestionStatus,
    IngestReviewedDatasetCommand,
)
from lumina.catalog.domain.reviewed_slice import (
    ReviewedArtifact,
    ReviewedCompatibilityPair,
    ReviewedDataset,
    ReviewedEntity,
    ReviewedExpectedCounts,
    ReviewedProvider,
    ReviewedQuantity,
    ReviewedSlicePolicyRejected,
    ReviewedUnit,
    load_reviewed_slice,
)
from lumina.provenance.domain.manifests import DataManifest, SourceManifest

_LOGGER = logging.getLogger("lumina.catalog.reviewed_slice")


class ReviewedSliceContract(Protocol):
    """Structural contract shared by closed reviewed data products."""

    source_manifest_path: str
    data_manifest_path: str
    source_manifest: SourceManifest
    data_manifest: DataManifest
    provider: ReviewedProvider
    dataset: ReviewedDataset
    slice_id: str
    provider_version: str
    artifact: ReviewedArtifact
    entities: tuple[ReviewedEntity, ...]
    quantities: tuple[ReviewedQuantity, ...]
    unit: ReviewedUnit
    compatibility_pairs: tuple[ReviewedCompatibilityPair, ...]
    expected: ReviewedExpectedCounts


SliceContractT = TypeVar("SliceContractT")


class ReviewedSliceIngestionPort(Protocol):
    """Persist one already normalized reviewed source record."""

    async def ingest(self, command: IngestReviewedDatasetCommand) -> CatalogIngestionOutcome:
        """Return the immutable-ingestion aggregate outcome."""
        ...


@dataclass(frozen=True, slots=True)
class ReviewedSliceIngestionResult:
    """Redacted aggregate outcome for one complete reviewed-slice operator run."""

    slice_id: str
    status: str
    source_record_count: int
    measurement_count: int
    inserted_source_record_count: int
    replayed_source_record_count: int
    inserted_measurement_count: int
    existing_measurement_count: int


class ReviewedSliceIngestionService[SliceContractT]:
    """Preflight all records, then delegate each immutable source record transactionally."""

    def __init__(
        self,
        command_builder: Callable[[SliceContractT], tuple[IngestReviewedDatasetCommand, ...]],
        ingestion_service: ReviewedSliceIngestionPort | None = None,
        slice_loader: Callable[[str], SliceContractT] | None = None,
    ) -> None:
        self._command_builder = command_builder
        self._ingestion_service = ingestion_service
        self._slice_loader = (
            cast(Callable[[str], SliceContractT], load_reviewed_slice)
            if slice_loader is None
            else slice_loader
        )

    async def validate(self, slice_id: str) -> ReviewedSliceIngestionResult:
        """Validate local reviewed resources only, without constructing a database runtime."""
        started = perf_counter()
        slice_contract = self._slice_loader(slice_id)
        contract = cast(ReviewedSliceContract, slice_contract)
        _LOGGER.info(
            "catalog.reviewed_slice.validation_started",
            extra={
                "slice_event": "catalog.reviewed_slice.validation_started",
                "slice_id": contract.slice_id,
                "status": "started",
            },
        )
        commands = self._command_builder(slice_contract)
        result = self._validated_result(contract, commands)
        _LOGGER.info(
            "catalog.reviewed_slice.validation_completed",
            extra={
                "slice_event": "catalog.reviewed_slice.validation_completed",
                "slice_id": result.slice_id,
                "status": result.status,
                "source_record_count": result.source_record_count,
                "measurement_count": result.measurement_count,
                "duration_ms": _elapsed_milliseconds(started),
            },
        )
        return result

    async def ingest(self, slice_id: str) -> ReviewedSliceIngestionResult:
        """Ingest five preflighted commands in reviewed source-ID order."""
        started = perf_counter()
        if self._ingestion_service is None:
            raise ReviewedSlicePolicyRejected()
        slice_contract = self._slice_loader(slice_id)
        contract = cast(ReviewedSliceContract, slice_contract)
        commands = self._command_builder(slice_contract)
        result = self._validated_result(contract, commands)
        inserted = 0
        replayed = 0
        inserted_measurements = 0
        existing_measurements = 0
        for command in commands:
            outcome = await self._ingestion_service.ingest(command)
            self._require_clean_slice_outcome(outcome)
            inserted_measurements += outcome.inserted_measurement_count
            existing_measurements += outcome.existing_measurement_count
            if outcome.status is CatalogIngestionStatus.INSERTED:
                inserted += 1
            else:
                replayed += 1
        ingestion_result = ReviewedSliceIngestionResult(
            slice_id=result.slice_id,
            status="ingested",
            source_record_count=result.source_record_count,
            measurement_count=result.measurement_count,
            inserted_source_record_count=inserted,
            replayed_source_record_count=replayed,
            inserted_measurement_count=inserted_measurements,
            existing_measurement_count=existing_measurements,
        )
        _LOGGER.info(
            "catalog.reviewed_slice.ingestion_completed",
            extra={
                "slice_event": "catalog.reviewed_slice.ingestion_completed",
                "slice_id": ingestion_result.slice_id,
                "status": ingestion_result.status,
                "inserted_source_record_count": inserted,
                "replayed_source_record_count": replayed,
                "inserted_measurement_count": inserted_measurements,
                "existing_measurement_count": existing_measurements,
                "conflict_count": 0,
                "unresolved_source_record_count": 0,
                "duration_ms": _elapsed_milliseconds(started),
            },
        )
        return ingestion_result

    @staticmethod
    def _validated_result(
        slice_contract: ReviewedSliceContract,
        commands: tuple[IngestReviewedDatasetCommand, ...],
    ) -> ReviewedSliceIngestionResult:
        expected_entities = {
            entity.provider_record_id: entity.id for entity in slice_contract.entities
        }
        expected_source_ids = tuple(expected_entities)
        expected_fact_keys = {quantity.source_fact_key for quantity in slice_contract.quantities}
        if (
            len(commands) != slice_contract.expected.source_records
            or tuple(command.source_record.provider_record_id for command in commands)
            != expected_source_ids
            or sum(len(command.source_record.measurements) for command in commands)
            != slice_contract.expected.measurements
        ):
            raise ReviewedSlicePolicyRejected()
        for command in commands:
            record = command.source_record
            if (
                record.provider_version != slice_contract.provider_version
                or record.canonical_entity_id != expected_entities[record.provider_record_id]
                or len(record.measurements) != len(expected_fact_keys)
                or {measurement.source_fact_key for measurement in record.measurements}
                != expected_fact_keys
            ):
                raise ReviewedSlicePolicyRejected()
        return ReviewedSliceIngestionResult(
            slice_id=slice_contract.slice_id,
            status="validated",
            source_record_count=slice_contract.expected.source_records,
            measurement_count=slice_contract.expected.measurements,
            inserted_source_record_count=0,
            replayed_source_record_count=0,
            inserted_measurement_count=0,
            existing_measurement_count=0,
        )

    @staticmethod
    def _require_clean_slice_outcome(outcome: CatalogIngestionOutcome) -> None:
        if (
            outcome.status not in {CatalogIngestionStatus.INSERTED, CatalogIngestionStatus.REPLAYED}
            or outcome.conflicts
            or outcome.competing_measurement_count != 0
            or outcome.scientific_disagreement_count != 0
        ):
            raise ReviewedSlicePolicyRejected()


def _elapsed_milliseconds(started: float) -> int:
    return max(0, int((perf_counter() - started) * 1000))


__all__ = [
    "ReviewedSliceContract",
    "ReviewedSliceIngestionResult",
    "ReviewedSliceIngestionPort",
    "ReviewedSliceIngestionService",
]
