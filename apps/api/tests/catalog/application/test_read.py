"""Focused application-boundary tests for catalogue reads."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from lumina.catalog.application.read import CatalogReadService
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogEntityNotFound,
    CatalogMeasurement,
    CompactDataset,
    CompactProvider,
    CompactSource,
    MeasurementCursor,
    MeasurementSlice,
    Quantity,
    SelectionHistoryCursor,
    SelectionHistorySlice,
    SelectionState,
    SourceProvenance,
    Unit,
)

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789abd")
_TIMESTAMP = datetime(2026, 8, 12, 12, tzinfo=UTC)


class _Repository:
    def __init__(self, measurement_result: MeasurementSlice | None) -> None:
        self.measurement_result = measurement_result

    async def get_entity_detail(self, *, entity_id: UUID) -> None:
        del entity_id
        return None

    async def list_entity_measurements(
        self,
        *,
        entity_id: UUID,
        cursor: MeasurementCursor | None,
        limit: int,
    ) -> MeasurementSlice | None:
        del entity_id, cursor, limit
        return self.measurement_result

    async def list_entity_selection_history(
        self,
        *,
        entity_id: UUID,
        cursor: SelectionHistoryCursor | None,
        limit: int,
    ) -> SelectionHistorySlice | None:
        del entity_id, cursor, limit
        return None

    async def get_source_provenance(self, *, source_record_id: UUID) -> SourceProvenance | None:
        del source_record_id
        return None


def _measurement() -> CatalogMeasurement:
    return CatalogMeasurement(
        id=_MEASUREMENT_ID,
        quantity=Quantity(code="fixture.mass", name="Fixture mass"),
        value=Decimal("1000000000000000000000000000000.2300"),
        unit=Unit(code="fixture.kg", symbol="kg", name="kilogram"),
        original_value="1000000000000000000000000000000.2300",
        original_unit="kg",
        selection_state=SelectionState.NEVER_SELECTED,
        source=CompactSource(
            source_record_id=UUID("12345678-1234-4234-9234-123456789abf"),
            provider=CompactProvider(code="fixture.provider", name="Fixture Provider"),
            dataset=CompactDataset(
                code="fixture.dataset",
                name="Fixture Dataset",
                release_version="fixture-v1",
            ),
        ),
        created_at=_TIMESTAMP,
    )


@pytest.mark.asyncio
async def test_measurement_page_keeps_decimal_as_decimal_and_returns_default_bound() -> None:
    service = CatalogReadService(_Repository(MeasurementSlice(items=(_measurement(),))))

    page = await service.list_entity_measurements(_ENTITY_ID)

    assert page.limit == 20
    assert page.has_more is False
    assert str(page.items[0].value) == "1000000000000000000000000000000.2300"


@pytest.mark.asyncio
async def test_repository_projection_validation_failure_is_inconsistent_not_request_error() -> None:
    class _MalformedRepository(_Repository):
        async def list_entity_measurements(
            self,
            *,
            entity_id: UUID,
            cursor: MeasurementCursor | None,
            limit: int,
        ) -> MeasurementSlice | None:
            del entity_id, cursor, limit
            return object()  # type: ignore[return-value]

    service = CatalogReadService(_MalformedRepository(None))

    with pytest.raises(CatalogDataInconsistent):
        await service.list_entity_measurements(_ENTITY_ID)


@pytest.mark.asyncio
async def test_missing_entity_uses_typed_absence() -> None:
    service = CatalogReadService(_Repository(None))

    with pytest.raises(CatalogEntityNotFound):
        await service.list_entity_measurements(_ENTITY_ID)
