"""Application orchestration for the reviewed offline Messier source slice."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final

from lumina.catalog.application.ingest import CatalogIngestionService
from lumina.catalog.domain.ingestion import CatalogIngestionStatus, IngestReviewedDatasetCommand
from lumina.catalog.infrastructure.simbad_messier import (
    ARTIFACT_SHA256,
    build_reviewed_simbad_commands,
)

MESSIER_SLICE_ID: Final = "simbad-messier-j2000-v1"


@dataclass(frozen=True, slots=True)
class MessierIngestionResult:
    slice_id: str
    status: str
    source_record_count: int
    measurement_count: int
    inserted_source_record_count: int
    replayed_source_record_count: int
    inserted_measurement_count: int
    existing_measurement_count: int


class MessierReviewedIngestionService:
    """Preflight the exact 110-row adapter, then reuse generic ingestion per source record."""

    def __init__(self, ingestion_service: CatalogIngestionService | None = None) -> None:
        self._ingestion_service = ingestion_service

    @staticmethod
    def _commands() -> tuple[IngestReviewedDatasetCommand, ...]:
        commands = build_reviewed_simbad_commands()
        if len(commands) != 110 or sum(len(c.source_record.measurements) for c in commands) != 220:
            raise ValueError("The reviewed Messier slice cardinality is invalid.")
        if len({c.source_record.provider_record_id for c in commands}) != 110:
            raise ValueError("The reviewed Messier source identities are not unique.")
        return commands

    async def validate(self) -> MessierIngestionResult:
        commands = self._commands()
        return MessierIngestionResult(
            slice_id=MESSIER_SLICE_ID,
            status="validated",
            source_record_count=len(commands),
            measurement_count=sum(len(c.source_record.measurements) for c in commands),
            inserted_source_record_count=0,
            replayed_source_record_count=0,
            inserted_measurement_count=0,
            existing_measurement_count=0,
        )

    async def ingest(self) -> MessierIngestionResult:
        if self._ingestion_service is None:
            raise ValueError("Messier ingestion requires a database service.")
        commands = self._commands()
        inserted = replayed = inserted_measurements = existing_measurements = 0
        for command in commands:
            outcome = await self._ingestion_service.ingest(command)
            if (
                outcome.status
                not in {CatalogIngestionStatus.INSERTED, CatalogIngestionStatus.REPLAYED}
                or outcome.conflicts
            ):
                raise ValueError("The reviewed Messier ingestion did not complete cleanly.")
            inserted_measurements += outcome.inserted_measurement_count
            existing_measurements += outcome.existing_measurement_count
            if outcome.status is CatalogIngestionStatus.INSERTED:
                inserted += 1
            else:
                replayed += 1
        return MessierIngestionResult(
            slice_id=MESSIER_SLICE_ID,
            status="ingested",
            source_record_count=len(commands),
            measurement_count=sum(len(c.source_record.measurements) for c in commands),
            inserted_source_record_count=inserted,
            replayed_source_record_count=replayed,
            inserted_measurement_count=inserted_measurements,
            existing_measurement_count=existing_measurements,
        )


__all__ = [
    "ARTIFACT_SHA256",
    "MESSIER_SLICE_ID",
    "MessierIngestionResult",
    "MessierReviewedIngestionService",
]
