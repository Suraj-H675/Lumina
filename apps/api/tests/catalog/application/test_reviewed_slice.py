"""Reviewed slice application orchestration tests."""

from __future__ import annotations

from uuid import UUID

import pytest
from lumina.catalog.application.reviewed_slice import ReviewedSliceIngestionService
from lumina.catalog.domain.ingestion import (
    CatalogIngestionOutcome,
    CatalogIngestionStatus,
    IngestionRecordState,
    IngestReviewedDatasetCommand,
)
from lumina.catalog.domain.reviewed_slice import REVIEWED_SLICE_ID, ReviewedSlicePolicyRejected
from lumina.catalog.infrastructure.gaia_dr3 import build_reviewed_gaia_commands


def _outcome(status: CatalogIngestionStatus) -> CatalogIngestionOutcome:
    return CatalogIngestionOutcome(
        status=status,
        provider_state=(
            IngestionRecordState.INSERTED
            if status is CatalogIngestionStatus.INSERTED
            else IngestionRecordState.EXISTING
        ),
        dataset_state=(
            IngestionRecordState.INSERTED
            if status is CatalogIngestionStatus.INSERTED
            else IngestionRecordState.EXISTING
        ),
        source_record_state=(
            IngestionRecordState.INSERTED
            if status is CatalogIngestionStatus.INSERTED
            else IngestionRecordState.EXISTING
        ),
        source_record_id=UUID("12345678-1234-4234-9234-123456789abc"),
        inserted_measurement_count=3 if status is CatalogIngestionStatus.INSERTED else 0,
        existing_measurement_count=0 if status is CatalogIngestionStatus.INSERTED else 3,
        competing_measurement_count=0,
        scientific_disagreement_count=0,
        canonical_review_required=False,
        conflicts=(),
    )


class _RecordingIngestionService:
    def __init__(self, outcomes: list[CatalogIngestionOutcome]) -> None:
        self.outcomes = outcomes
        self.commands: list[IngestReviewedDatasetCommand] = []

    async def ingest(self, command: IngestReviewedDatasetCommand) -> CatalogIngestionOutcome:
        self.commands.append(command)
        return self.outcomes.pop(0)


@pytest.mark.asyncio
async def test_validate_only_preflights_all_commands_without_a_database_service() -> None:
    result = await ReviewedSliceIngestionService(build_reviewed_gaia_commands).validate(
        REVIEWED_SLICE_ID
    )

    assert result.status == "validated"
    assert result.source_record_count == 5
    assert result.measurement_count == 15


@pytest.mark.asyncio
async def test_ingestion_processes_preflighted_records_in_source_id_order() -> None:
    recording = _RecordingIngestionService([_outcome(CatalogIngestionStatus.INSERTED)] * 5)
    service = ReviewedSliceIngestionService(build_reviewed_gaia_commands, recording)

    result = await service.ingest(REVIEWED_SLICE_ID)

    assert result.status == "ingested"
    assert result.inserted_source_record_count == 5
    assert [item.source_record.provider_record_id for item in recording.commands] == [
        "1779546757669063552",
        "2079000330051813504",
        "2079597124345617280",
        "2835207319109249920",
        "3910747531814692736",
    ]


@pytest.mark.asyncio
async def test_unexpected_clean_slice_outcome_fails_closed() -> None:
    rejected = _outcome(CatalogIngestionStatus.INSERTED).model_copy(
        update={"competing_measurement_count": 1}
    )
    recording = _RecordingIngestionService([rejected])
    service = ReviewedSliceIngestionService(build_reviewed_gaia_commands, recording)

    with pytest.raises(ReviewedSlicePolicyRejected):
        await service.ingest(REVIEWED_SLICE_ID)
