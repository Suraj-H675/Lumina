"""Guarded real-PostgreSQL smoke coverage for the catalogue read adapter."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterator
from datetime import UTC, datetime
from uuid import UUID

import pytest
import pytest_asyncio
from lumina.catalog.application.read import CatalogOperatorReadService, CatalogReadService
from lumina.catalog.domain.identity import ALIAS_NORMALIZATION_VERSION, normalize_alias
from lumina.catalog.domain.read import (
    CatalogEntityNotFound,
    CatalogEntityType,
    CatalogReadValidationRejected,
)
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

_ENTITY_ROWS = (
    (UUID("26f4b667-ecd9-524d-8121-29508723715a"), "star", "HD 209458", "hd-209458"),
    (UUID("bbfe8678-81ca-5e70-ac95-c597d7655540"), "star", "Kepler-186", "kepler-186"),
    (UUID("bfd42670-3013-598e-8eb5-5a1c084dd1a0"), "star", "Kepler-452", "kepler-452"),
    (UUID("c593bd18-c4bc-5551-8a41-09f1b501f981"), "star", "51 Pegasi", "51-pegasi"),
    (UUID("403d0e71-8d81-5c52-abad-c4666c1b5cd6"), "star", "K2-18", "k2-18"),
)

_FICTIONAL_ENTITY_ROWS = tuple(
    (
        UUID(f"97000000-0000-4000-8000-{index:012d}"),
        "galaxy",
        f"Phase 1B2 fixture galaxy {index}",
        f"fixture-navigation-{index:02d}",
    )
    for index in range(1, 8)
)


def _migration_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _fixture_operation(
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], None],
) -> None:
    engine = create_engine(_migration_url(settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            operation(connection)
    finally:
        engine.dispose()


def _fixture_ids(rows: tuple[tuple[UUID, str, str, str], ...]) -> dict[str, object]:
    return {f"id_{index}": row[0] for index, row in enumerate(rows)}


@pytest.fixture
def fictional_browse_entities(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Insert and remove only deterministic, transaction-scoped browse fixtures."""
    rows = _FICTIONAL_ENTITY_ROWS
    ids = _fixture_ids(rows)
    placeholders = ", ".join(f":id_{index}" for index in range(len(rows)))

    def prepare(connection: Connection) -> None:
        connection.execute(text(f"DELETE FROM public.entity WHERE id IN ({placeholders})"), ids)
        for entity_id, entity_type, canonical_name, slug in rows:
            connection.execute(
                text(
                    "INSERT INTO public.entity "
                    "(id, entity_type, canonical_name, slug, "
                    "normalized_canonical_name, canonical_name_normalization_version) "
                    "VALUES (:id, :entity_type, :canonical_name, :slug, "
                    ":normalized_canonical_name, :normalization_version)"
                ),
                {
                    "id": entity_id,
                    "entity_type": entity_type,
                    "canonical_name": canonical_name,
                    "slug": slug,
                    "normalized_canonical_name": normalize_alias(
                        canonical_name, version=ALIAS_NORMALIZATION_VERSION
                    ),
                    "normalization_version": ALIAS_NORMALIZATION_VERSION,
                },
            )

    def cleanup(connection: Connection) -> None:
        connection.execute(text(f"DELETE FROM public.entity WHERE id IN ({placeholders})"), ids)

    _fixture_operation(integration_settings, prepare)
    try:
        yield
    finally:
        _fixture_operation(integration_settings, cleanup)


@pytest_asyncio.fixture
async def catalog_read_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    """Use the least-privilege test runtime without mutating the guarded test database."""
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_unknown_entity_is_a_read_only_absence(
    catalog_read_runtime: DatabaseRuntime,
) -> None:
    repository = PostgreSqlCatalogReadRepository(catalog_read_runtime.session_factory)

    result = await repository.get_entity_detail(
        entity_id=UUID("00000000-0000-4000-8000-000000000404")
    )

    assert result is None


@pytest.mark.asyncio
async def test_all_seeded_public_slugs_resolve_without_measurement_or_source_rows(
    catalog_read_runtime: DatabaseRuntime,
) -> None:
    """Slug navigation is independent of the optional measurement/source graph."""
    repository = PostgreSqlCatalogReadRepository(catalog_read_runtime.session_factory)
    service = CatalogReadService(repository)

    for entity_id, entity_type, canonical_name, slug in _ENTITY_ROWS:
        summary = await service.get_entity_by_slug(slug)

        assert summary.id == entity_id
        assert summary.slug == slug
        assert summary.entity_type is CatalogEntityType(entity_type)
        assert summary.canonical_name == canonical_name


@pytest.mark.asyncio
async def test_valid_unknown_public_slug_is_a_typed_absence(
    catalog_read_runtime: DatabaseRuntime,
) -> None:
    service = CatalogReadService(
        PostgreSqlCatalogReadRepository(catalog_read_runtime.session_factory)
    )

    with pytest.raises(CatalogEntityNotFound):
        await service.get_entity_by_slug("fixture-valid-but-absent")


@pytest.mark.asyncio
async def test_fictional_entities_browse_in_deterministic_keyset_pages(
    catalog_read_runtime: DatabaseRuntime,
    fictional_browse_entities: None,
) -> None:
    service = CatalogReadService(
        PostgreSqlCatalogReadRepository(catalog_read_runtime.session_factory)
    )
    expected_unfiltered = sorted(
        [row[3] for row in _ENTITY_ROWS] + [row[3] for row in _FICTIONAL_ENTITY_ROWS]
    )

    observed: list[str] = []
    cursor: str | None = None
    while True:
        page = await service.list_entities(cursor=cursor, limit=3)
        observed.extend(item.slug for item in page.items)
        if not page.has_more:
            assert page.next_cursor is None
            break
        assert page.next_cursor is not None
        cursor = page.next_cursor

    assert observed == expected_unfiltered


@pytest.mark.asyncio
async def test_fictional_entities_support_singular_filter_limits_and_empty_final_pages(
    catalog_read_runtime: DatabaseRuntime,
    fictional_browse_entities: None,
) -> None:
    service = CatalogReadService(
        PostgreSqlCatalogReadRepository(catalog_read_runtime.session_factory)
    )
    expected = sorted(row[3] for row in _FICTIONAL_ENTITY_ROWS)

    first = await service.list_entities(entity_type="galaxy", limit=2)
    assert [item.slug for item in first.items] == expected[:2]
    assert first.has_more is True
    assert first.next_cursor is not None

    second = await service.list_entities(entity_type="galaxy", cursor=first.next_cursor, limit=2)
    assert [item.slug for item in second.items] == expected[2:4]
    assert second.has_more is True
    assert second.next_cursor is not None

    third = await service.list_entities(entity_type="galaxy", cursor=second.next_cursor, limit=10)
    assert [item.slug for item in third.items] == expected[4:]
    assert third.has_more is False
    assert third.next_cursor is None

    empty = await service.list_entities(entity_type="planet", limit=1)
    assert empty.items == ()
    assert empty.has_more is False
    assert empty.next_cursor is None
    assert empty.limit == 1


@pytest.mark.asyncio
async def test_browse_cursor_filter_scope_is_independent_and_fails_closed(
    catalog_read_runtime: DatabaseRuntime,
    fictional_browse_entities: None,
) -> None:
    service = CatalogReadService(
        PostgreSqlCatalogReadRepository(catalog_read_runtime.session_factory)
    )
    first = await service.list_entities(entity_type="galaxy", limit=1)
    assert first.next_cursor is not None

    with pytest.raises(CatalogReadValidationRejected):
        await service.list_entities(entity_type="planet", cursor=first.next_cursor, limit=1)


@pytest.mark.asyncio
async def test_real_driver_maps_uuid_and_runs_nullable_first_page_cursor(
    integration_settings: IntegrationTestSettings,
) -> None:
    """Exercise asyncpg's UUID subclass and typed null cursor binds with fictional rows."""
    entity_id = UUID("00000000-0000-4000-8000-00000000a401")
    migration_url = make_url(integration_settings.test_database_sync_url.get_secret_value()).set(
        drivername="postgresql+asyncpg"
    )
    migration_engine = create_async_engine(migration_url, hide_parameters=True)
    try:
        async with migration_engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM public.entity WHERE id = :id"),
                {"id": entity_id},
            )
            canonical_name = "Fictional Empty Read Star"
            await connection.execute(
                text(
                    "INSERT INTO public.entity "
                    "(id, entity_type, canonical_name, slug, created_at, "
                    "normalized_canonical_name, canonical_name_normalization_version) "
                    "VALUES (:id, 'star', :canonical_name, 'fictional-empty-read-star', "
                    ":created_at, :normalized_canonical_name, :normalization_version)"
                ),
                {
                    "id": entity_id,
                    "canonical_name": canonical_name,
                    "created_at": datetime(2026, 8, 13, tzinfo=UTC),
                    "normalized_canonical_name": normalize_alias(
                        canonical_name, version=ALIAS_NORMALIZATION_VERSION
                    ),
                    "normalization_version": ALIAS_NORMALIZATION_VERSION,
                },
            )
        runtime = create_database_runtime(integration_settings.test_database_url)
        try:
            repository = PostgreSqlCatalogReadRepository(runtime.session_factory)
            service = CatalogReadService(repository)
            operator_service = CatalogOperatorReadService(repository)
            detail = await service.get_entity_detail(entity_id)
            measurements = await service.list_entity_measurements(entity_id)
            history = await service.list_entity_selection_history(entity_id)
            conflicts = await operator_service.list_ingestion_conflicts()

            assert detail.id == entity_id
            assert detail.quantities == ()
            assert measurements.items == ()
            assert history.items == ()
            assert conflicts.limit == 50
        finally:
            await runtime.engine.dispose()
    finally:
        async with migration_engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM public.entity WHERE id = :id"),
                {"id": entity_id},
            )
        await migration_engine.dispose()
