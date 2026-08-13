"""Guarded real-PostgreSQL smoke coverage for the catalogue read adapter."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from uuid import UUID

import pytest
import pytest_asyncio
from lumina.catalog.application.read import CatalogOperatorReadService, CatalogReadService
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine


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
            await connection.execute(
                text(
                    "INSERT INTO public.entity (id, entity_type, canonical_name, created_at) "
                    "VALUES (:id, 'star', 'Fictional Empty Read Star', :created_at)"
                ),
                {"id": entity_id, "created_at": datetime(2026, 8, 13, tzinfo=UTC)},
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
