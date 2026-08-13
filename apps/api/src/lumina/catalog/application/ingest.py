"""Application service for one reviewed normalized catalogue source record."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Protocol
from uuid import UUID, uuid4

from lumina.catalog.domain.ingestion import (
    CatalogDatabaseOperationFailure,
    CatalogIngestionError,
    CatalogIngestionOutcome,
    CatalogIngestionValidationRejected,
    IngestReviewedDatasetCommand,
    PreparedCatalogIngestion,
    is_catalog_ingestion_error,
    validate_catalog_ingestion_outcome,
    validate_ingestion_command,
)

_LOGGER = logging.getLogger("lumina.catalog.ingestion")


class CatalogIngestionStore(Protocol):
    """The one transactional persistence capability introduced by Phase 1A3."""

    async def ingest(self, prepared: PreparedCatalogIngestion) -> CatalogIngestionOutcome:
        """Reconcile and persist one already validated source record atomically."""
        ...


class CatalogIngestionService:
    """Allocate surrogate UUIDv4 values and delegate one reviewed ingestion transaction."""

    def __init__(
        self,
        store: CatalogIngestionStore,
        *,
        uuid_factory: Callable[[], UUID] = uuid4,
    ) -> None:
        self._store = store
        self._uuid_factory = uuid_factory

    async def ingest(self, command: IngestReviewedDatasetCommand) -> CatalogIngestionOutcome:
        """Persist one strict command, emitting only fixed aggregate observability events."""
        try:
            prepared = self._prepare(command)
        except CatalogIngestionError as error:
            self._log_failure(error)
            raise

        try:
            outcome = await self._store.ingest(prepared)
        except CatalogIngestionError as error:
            if not is_catalog_ingestion_error(error):
                safe_error = CatalogDatabaseOperationFailure()
                self._log_failure(safe_error)
                raise safe_error from None
            self._log_failure(error)
            raise
        except Exception:
            safe_error = CatalogDatabaseOperationFailure()
            self._log_failure(safe_error)
            raise safe_error from None

        try:
            outcome = validate_catalog_ingestion_outcome(outcome)
        except CatalogIngestionError:
            safe_error = CatalogDatabaseOperationFailure()
            self._log_failure(safe_error)
            raise safe_error from None
        self._log_outcome(outcome)
        return outcome

    def _prepare(self, command: IngestReviewedDatasetCommand) -> PreparedCatalogIngestion:
        try:
            command = validate_ingestion_command(command)
            identifiers = tuple(
                self._uuid_factory() for _ in range(3 + len(command.source_record.measurements))
            )
            return PreparedCatalogIngestion(
                command=command,
                provider_id=identifiers[0],
                dataset_id=identifiers[1],
                source_record_id=identifiers[2],
                measurement_ids=identifiers[3:],
            )
        except Exception:
            raise CatalogIngestionValidationRejected() from None

    @staticmethod
    def _log_outcome(outcome: CatalogIngestionOutcome) -> None:
        event = f"catalog.ingestion.{outcome.status.value}"
        _LOGGER.info(
            event,
            extra={
                "ingestion_event": event,
                "outcome": outcome.status.value,
                "inserted_measurement_count": outcome.inserted_measurement_count,
                "existing_measurement_count": outcome.existing_measurement_count,
                "competing_measurement_count": outcome.competing_measurement_count,
                "scientific_disagreement_count": outcome.scientific_disagreement_count,
            },
        )

    @staticmethod
    def _log_failure(error: CatalogIngestionError) -> None:
        _LOGGER.warning(
            "catalog.ingestion.failed",
            extra={
                "ingestion_event": "catalog.ingestion.failed",
                "error_category": error.code,
            },
        )
