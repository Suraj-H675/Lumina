"""Permanent source-slice data-quality and fingerprint contracts."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

import pytest
from lumina.catalog.application.data_quality import (
    ReviewedSliceDataQualityService,
    SliceCompatibilityPair,
    SliceDatabaseState,
    SliceDataset,
    SliceEntity,
    SliceMeasurement,
    SliceProvider,
    SliceQuantity,
    SliceSourceRecord,
    SliceUnit,
)
from lumina.catalog.domain.ingestion import normalized_source_content_sha256
from lumina.catalog.domain.reviewed_slice import (
    REVIEWED_SLICE_ID,
    ReviewedSlicePolicyRejected,
    load_reviewed_slice,
)
from lumina.catalog.infrastructure.gaia_dr3 import build_reviewed_gaia_commands

_PROVIDER_ID = UUID("12345678-1234-4234-9234-123456789abc")
_DATASET_ID = UUID("12345678-1234-4234-9234-123456789abd")


class _Repository:
    def __init__(self, state: SliceDatabaseState) -> None:
        self.state = state
        self.calls = 0

    async def load_slice_state(self, _slice_contract: object) -> SliceDatabaseState:
        self.calls += 1
        return self.state


def _state(*, timestamp: datetime) -> SliceDatabaseState:
    slice_contract = load_reviewed_slice(REVIEWED_SLICE_ID)
    commands = build_reviewed_gaia_commands(slice_contract)
    provider = SliceProvider(
        id=_PROVIDER_ID,
        code=slice_contract.provider.code,
        name=slice_contract.provider.name,
        documentation_url=slice_contract.source_manifest.official_documentation_url,
        terms_url=slice_contract.source_manifest.terms_or_licence_url,
        attribution_text=slice_contract.source_manifest.attribution_text,
    )
    dataset = SliceDataset(
        id=_DATASET_ID,
        provider_id=provider.id,
        code=slice_contract.dataset.code,
        name=slice_contract.dataset.name,
        release_version=slice_contract.dataset.release_version,
        source_url=slice_contract.data_manifest.official_url,
        licence=slice_contract.data_manifest.terms_or_licence,
        citation=slice_contract.data_manifest.citation,
    )
    source_records: list[SliceSourceRecord] = []
    measurements: list[SliceMeasurement] = []
    for index, command in enumerate(commands, start=1):
        source_id = UUID(f"00000000-0000-4000-8000-{index:012d}")
        entity_id = command.source_record.canonical_entity_id
        assert entity_id is not None
        source = SliceSourceRecord(
            id=source_id,
            provider_id=provider.id,
            dataset_id=dataset.id,
            provider_record_id=command.source_record.provider_record_id,
            provider_version=command.source_record.provider_version,
            entity_id=entity_id,
            source_url=command.source_record.source_url,
            fetched_at=command.source_record.fetched_at,
            adapter_id=command.source_manifest.adapter_id,
            adapter_version=command.source_manifest.adapter_version,
            parser_version=command.data_manifest.parser_version,
            normalized_content_sha256=normalized_source_content_sha256(command),
        )
        source_records.append(source)
        for offset, measurement in enumerate(command.source_record.measurements, start=1):
            measurements.append(
                SliceMeasurement(
                    id=UUID(f"00000000-0000-4000-8001-{index * 10 + offset:012d}"),
                    entity_id=source.entity_id,
                    source_record_id=source.id,
                    quantity_id=next(
                        quantity.id
                        for quantity in slice_contract.quantities
                        if quantity.code == measurement.quantity_code
                    ),
                    unit_id=slice_contract.unit.id,
                    value_numeric=measurement.value_numeric,
                    created_at=timestamp,
                    source_fact_key=measurement.source_fact_key,
                    original_value=measurement.original_value,
                    original_unit=measurement.original_unit,
                )
            )
    return SliceDatabaseState(
        provider=provider,
        dataset=dataset,
        entities=tuple(
            SliceEntity(entity.id, entity.entity_type, entity.canonical_name)
            for entity in slice_contract.entities
        ),
        quantities=tuple(
            SliceQuantity(quantity.id, quantity.code, quantity.name)
            for quantity in slice_contract.quantities
        ),
        unit=SliceUnit(
            slice_contract.unit.id,
            slice_contract.unit.code,
            slice_contract.unit.symbol,
            slice_contract.unit.name,
        ),
        pairs=tuple(
            SliceCompatibilityPair(pair.quantity_id, pair.unit_id)
            for pair in slice_contract.compatibility_pairs
        ),
        source_records=tuple(source_records),
        measurements=tuple(measurements),
        conflicts=(),
    )


@pytest.mark.asyncio
async def test_verified_source_fact_state_has_a_deterministic_fingerprint() -> None:
    repository = _Repository(_state(timestamp=datetime(2026, 8, 15, tzinfo=UTC)))

    result = await ReviewedSliceDataQualityService(repository, build_reviewed_gaia_commands).check(
        REVIEWED_SLICE_ID
    )

    assert repository.calls == 1
    assert result.slice_id == REVIEWED_SLICE_ID
    assert result.source_record_count == 5
    assert result.measurement_count == 15
    assert result.unresolved_source_record_count == 0
    assert result.conflict_count == 0
    assert len(result.state_sha256) == 64


@pytest.mark.asyncio
async def test_surrogate_identifiers_and_measurement_creation_times_do_not_change_fingerprint() -> (
    None
):
    first = await ReviewedSliceDataQualityService(
        _Repository(_state(timestamp=datetime(2026, 8, 15, tzinfo=UTC))),
        build_reviewed_gaia_commands,
    ).check(REVIEWED_SLICE_ID)
    second = await ReviewedSliceDataQualityService(
        _Repository(_state(timestamp=datetime(2026, 8, 16, tzinfo=UTC) + timedelta(seconds=7))),
        build_reviewed_gaia_commands,
    ).check(REVIEWED_SLICE_ID)

    assert first.state_sha256 == second.state_sha256


@pytest.mark.asyncio
async def test_changed_original_lexeme_fails_the_source_fact_gate() -> None:
    state = _state(timestamp=datetime(2026, 8, 15, tzinfo=UTC))
    changed = state.measurements[0]
    invalid = SliceDatabaseState(
        provider=state.provider,
        dataset=state.dataset,
        entities=state.entities,
        quantities=state.quantities,
        unit=state.unit,
        pairs=state.pairs,
        source_records=state.source_records,
        measurements=(
            SliceMeasurement(
                id=changed.id,
                entity_id=changed.entity_id,
                source_record_id=changed.source_record_id,
                quantity_id=changed.quantity_id,
                unit_id=changed.unit_id,
                value_numeric=changed.value_numeric,
                created_at=changed.created_at,
                source_fact_key=changed.source_fact_key,
                original_value="999.0",
                original_unit=changed.original_unit,
            ),
            *state.measurements[1:],
        ),
        conflicts=state.conflicts,
    )

    with pytest.raises(ReviewedSlicePolicyRejected):
        await ReviewedSliceDataQualityService(
            _Repository(invalid), build_reviewed_gaia_commands
        ).check(REVIEWED_SLICE_ID)


def test_permanent_service_never_mentions_the_value_selection_relation() -> None:
    source = Path("apps/api/src/lumina/catalog/application/data_quality.py").read_text(
        encoding="utf-8"
    )

    assert "canonical_measurement" not in source
    assert "selection_state" not in source
