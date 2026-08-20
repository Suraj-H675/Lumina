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
    CatalogEntityType,
    CatalogMeasurement,
    CatalogReadValidationRejected,
    CompactDataset,
    CompactProvider,
    CompactSource,
    EntityBrowseCursor,
    EntityBrowseSlice,
    MeasurementCursor,
    MeasurementSlice,
    PublicEntitySummary,
    Quantity,
    SelectionHistoryCursor,
    SelectionHistorySlice,
    SelectionState,
    SourceProvenance,
    Unit,
    decode_entity_browse_cursor,
    encode_entity_browse_cursor,
)

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789abd")
_TIMESTAMP = datetime(2026, 8, 12, 12, tzinfo=UTC)


class _Repository:
    def __init__(self, measurement_result: MeasurementSlice | None) -> None:
        self.measurement_result = measurement_result
        self.summary_result: PublicEntitySummary | None = None
        self.browse_result = EntityBrowseSlice(items=())
        self.slug_calls: list[str] = []
        self.browse_calls: list[
            tuple[CatalogEntityType | None, EntityBrowseCursor | None, int]
        ] = []

    async def get_entity_detail(self, *, entity_id: UUID) -> None:
        del entity_id
        return None

    async def get_entity_summary_by_slug(self, *, slug: str) -> PublicEntitySummary | None:
        self.slug_calls.append(slug)
        return self.summary_result

    async def list_entity_summaries(
        self,
        *,
        entity_type: CatalogEntityType | None,
        cursor: EntityBrowseCursor | None,
        limit: int,
    ) -> EntityBrowseSlice:
        self.browse_calls.append((entity_type, cursor, limit))
        return self.browse_result

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


def _summary(
    slug: str,
    *,
    entity_type: CatalogEntityType = CatalogEntityType.STAR,
) -> PublicEntitySummary:
    return PublicEntitySummary(
        id=UUID(f"12345678-1234-4234-9234-123456789a{len(slug):02d}"),
        slug=slug,
        entity_type=entity_type,
        canonical_name=f"Fixture {slug}",
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


@pytest.mark.asyncio
async def test_valid_slug_delegates_once_and_rebuilds_the_summary() -> None:
    repository = _Repository(None)
    repository.summary_result = _summary("hd-209458")

    result = await CatalogReadService(repository).get_entity_by_slug("hd-209458")

    assert result == repository.summary_result
    assert repository.slug_calls == ["hd-209458"]


@pytest.mark.asyncio
@pytest.mark.parametrize("slug", [None, True, 1, b"hd-209458", "HD-209458"])
async def test_invalid_slug_fails_before_any_repository_call(slug: object) -> None:
    repository = _Repository(None)

    with pytest.raises(CatalogReadValidationRejected):
        await CatalogReadService(repository).get_entity_by_slug(slug)

    assert repository.slug_calls == []
    assert repository.browse_calls == []


@pytest.mark.asyncio
async def test_missing_valid_slug_uses_the_existing_typed_absence() -> None:
    repository = _Repository(None)

    with pytest.raises(CatalogEntityNotFound):
        await CatalogReadService(repository).get_entity_by_slug("missing-object")

    assert repository.slug_calls == ["missing-object"]


@pytest.mark.asyncio
async def test_entity_browse_limits_to_visible_items_and_binds_the_next_cursor_filter() -> None:
    repository = _Repository(None)
    repository.browse_result = EntityBrowseSlice(
        items=(_summary("alpha"), _summary("bravo"), _summary("charlie"))
    )

    page = await CatalogReadService(repository).list_entities(entity_type="star", limit=2)

    assert tuple(item.slug for item in page.items) == ("alpha", "bravo")
    assert page.has_more is True
    assert page.limit == 2
    assert repository.browse_calls == [(CatalogEntityType.STAR, None, 2)]
    assert page.next_cursor is not None
    assert decode_entity_browse_cursor(
        page.next_cursor,
        entity_type=CatalogEntityType.STAR,
    ) == EntityBrowseCursor(entity_type=CatalogEntityType.STAR, slug="bravo")


@pytest.mark.asyncio
async def test_entity_browse_rejects_filter_cursor_mismatch_before_repository_access() -> None:
    repository = _Repository(None)
    cursor = encode_entity_browse_cursor(
        EntityBrowseCursor(entity_type=CatalogEntityType.STAR, slug="alpha")
    )

    with pytest.raises(CatalogReadValidationRejected):
        await CatalogReadService(repository).list_entities(
            entity_type="planet",
            cursor=cursor,
        )

    assert repository.browse_calls == []


@pytest.mark.asyncio
async def test_entity_browse_rejects_invalid_filter_and_limit_before_repository_access() -> None:
    repository = _Repository(None)
    service = CatalogReadService(repository)

    for kwargs in ({"entity_type": "unknown"}, {"limit": 0}, {"limit": True}):
        with pytest.raises(CatalogReadValidationRejected):
            await service.list_entities(**kwargs)

    assert repository.browse_calls == []


@pytest.mark.asyncio
async def test_entity_browse_rejects_unordered_duplicate_or_wrongly_filtered_rows() -> None:
    repository = _Repository(None)
    service = CatalogReadService(repository)

    repository.browse_result = EntityBrowseSlice(items=(_summary("bravo"), _summary("alpha")))
    with pytest.raises(CatalogDataInconsistent):
        await service.list_entities()

    repository.browse_result = EntityBrowseSlice(
        items=(_summary("alpha", entity_type=CatalogEntityType.PLANET),)
    )
    with pytest.raises(CatalogDataInconsistent):
        await service.list_entities(entity_type="star")
