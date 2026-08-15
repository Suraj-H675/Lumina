"""Real PostgreSQL acceptance for the immutable reviewed Gaia source slice.

The first test records the Phase 1A5 empty-selection milestone.  The second deliberately adds
valid later selection history and proves that permanent source-slice verification is unchanged.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
import pytest_asyncio
from lumina.catalog.application.data_quality import ReviewedSliceDataQualityService
from lumina.catalog.application.ingest import CatalogIngestionService
from lumina.catalog.application.read import CatalogReadService
from lumina.catalog.application.reviewed_slice import ReviewedSliceIngestionService
from lumina.catalog.domain.read import SelectionState
from lumina.catalog.domain.reviewed_slice import REVIEWED_SLICE_ID, load_reviewed_slice
from lumina.catalog.infrastructure.gaia_dr3 import build_reviewed_gaia_commands
from lumina.catalog.infrastructure.postgresql.data_quality import (
    PostgreSqlCatalogDataQualityRepository,
)
from lumina.catalog.infrastructure.postgresql.ingestion import PostgreSqlCatalogIngestionStore
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from .migration_lifecycle import (
    integration_migration_identity,
    run_alembic,
    run_migration_operation,
)

_PHASE_1A5_HEAD = "c4b9e2d7a6f1"


def _ensure_reviewed_seed_migration(settings: IntegrationTestSettings) -> None:
    sync_url = make_url(settings.test_database_sync_url.get_secret_value())
    identity = integration_migration_identity(settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(
            connection,
            identity,
            _PHASE_1A5_HEAD,
            downgrade=False,
        ),
    )


def _clean_reviewed_runtime_rows(settings: IntegrationTestSettings) -> None:
    engine = create_engine(settings.test_database_sync_url.get_secret_value(), hide_parameters=True)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "DELETE FROM public.canonical_measurement AS item USING public.measurement AS "
                    "measurement, public.source_record AS source_record, "
                    "public.provider AS provider "
                    "WHERE item.measurement_id = measurement.id "
                    "AND measurement.source_record_id = source_record.id "
                    "AND source_record.provider_id = provider.id AND provider.code = 'esa-gaia'"
                )
            )
            connection.execute(
                text(
                    "DELETE FROM public.ingestion_conflict AS conflict USING "
                    "public.provider AS provider "
                    "WHERE conflict.provider_id = provider.id AND provider.code = 'esa-gaia'"
                )
            )
            connection.execute(
                text(
                    "DELETE FROM public.measurement AS measurement USING "
                    "public.source_record AS source_record, public.provider AS provider "
                    "WHERE measurement.source_record_id = source_record.id "
                    "AND source_record.provider_id = provider.id AND provider.code = 'esa-gaia'"
                )
            )
            connection.execute(
                text(
                    "DELETE FROM public.source_record AS source_record USING "
                    "public.provider AS provider "
                    "WHERE source_record.provider_id = provider.id AND provider.code = 'esa-gaia'"
                )
            )
            connection.execute(
                text(
                    "DELETE FROM public.dataset AS dataset USING public.provider AS provider "
                    "WHERE dataset.provider_id = provider.id AND provider.code = 'esa-gaia'"
                )
            )
            connection.execute(text("DELETE FROM public.provider WHERE code = 'esa-gaia'"))
    finally:
        engine.dispose()


@pytest.fixture(autouse=True)
def reviewed_slice_rows(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    _ensure_reviewed_seed_migration(integration_settings)
    _clean_reviewed_runtime_rows(integration_settings)
    try:
        yield
    finally:
        _clean_reviewed_runtime_rows(integration_settings)


@pytest_asyncio.fixture
async def reviewed_slice_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


async def _ingest_and_replay(runtime: DatabaseRuntime) -> None:
    service = ReviewedSliceIngestionService(
        build_reviewed_gaia_commands,
        CatalogIngestionService(PostgreSqlCatalogIngestionStore(runtime.session_factory)),
    )
    first = await service.ingest(REVIEWED_SLICE_ID)
    second = await service.ingest(REVIEWED_SLICE_ID)
    assert first.inserted_source_record_count == 5
    assert first.replayed_source_record_count == 0
    assert second.inserted_source_record_count == 0
    assert second.replayed_source_record_count == 5


@pytest.mark.asyncio
async def test_initial_ingestion_and_replay_leave_the_phase_1a5_milestone_unselected(
    reviewed_slice_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    await _ingest_and_replay(reviewed_slice_runtime)
    source = load_reviewed_slice(REVIEWED_SLICE_ID)
    read_service = CatalogReadService(
        PostgreSqlCatalogReadRepository(reviewed_slice_runtime.session_factory)
    )
    quality = await ReviewedSliceDataQualityService(
        PostgreSqlCatalogDataQualityRepository(reviewed_slice_runtime.session_factory),
        build_reviewed_gaia_commands,
    ).check(REVIEWED_SLICE_ID)
    engine = create_engine(integration_settings.test_database_sync_url.get_secret_value())
    try:
        with engine.connect() as connection:
            assert (
                connection.execute(
                    text(
                        "SELECT count(*) FROM public.canonical_measurement "
                        "WHERE entity_id = ANY(CAST(:entity_ids AS uuid[])) "
                        "AND quantity_id = ANY(CAST(:quantity_ids AS uuid[]))"
                    ),
                    {
                        "entity_ids": [entity.id for entity in source.entities],
                        "quantity_ids": [quantity.id for quantity in source.quantities],
                    },
                ).scalar()
                == 0
            )
    finally:
        engine.dispose()

    for entity in source.entities:
        detail = await read_service.get_entity_detail(entity.id)
        measurements = await read_service.list_entity_measurements(entity.id)
        history = await read_service.list_entity_selection_history(entity.id)
        assert all(quantity.current_selection is None for quantity in detail.quantities)
        assert len(measurements.items) == 3
        assert all(
            item.selection_state is SelectionState.NEVER_SELECTED for item in measurements.items
        )
        assert history.items == ()
    assert quality.source_record_count == 5
    assert quality.measurement_count == 15


@pytest.mark.asyncio
async def test_valid_current_and_historical_selection_do_not_change_permanent_source_fingerprint(
    reviewed_slice_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    await _ingest_and_replay(reviewed_slice_runtime)
    service = ReviewedSliceDataQualityService(
        PostgreSqlCatalogDataQualityRepository(reviewed_slice_runtime.session_factory),
        build_reviewed_gaia_commands,
    )
    before = await service.check(REVIEWED_SLICE_ID)
    engine = create_engine(integration_settings.test_database_sync_url.get_secret_value())
    try:
        with engine.begin() as connection:
            row = (
                connection.execute(
                    text(
                        "SELECT measurement.id, measurement.entity_id, measurement.quantity_id "
                        "FROM public.measurement AS measurement "
                        "JOIN public.source_record AS source_record "
                        "ON source_record.id = measurement.source_record_id "
                        "JOIN public.provider AS provider "
                        "ON provider.id = source_record.provider_id "
                        "WHERE provider.code = 'esa-gaia' ORDER BY measurement.id LIMIT 1"
                    )
                )
                .mappings()
                .one()
            )
            selected_at = datetime(2026, 8, 15, tzinfo=UTC)
            parameters = {
                "entity_id": row["entity_id"],
                "measurement_id": row["id"],
                "quantity_id": row["quantity_id"],
                "selected_at": selected_at,
            }
            connection.execute(
                text(
                    "INSERT INTO public.canonical_measurement "
                    "(id, entity_id, quantity_id, measurement_id, selection_rule, "
                    "selection_version, "
                    "explanation, selected_at, superseded_at) "
                    "VALUES (:id, :entity_id, :quantity_id, :measurement_id, 'fixture-rule', "
                    "'fixture-v1', 'Valid historical fixture selection.', :selected_at, "
                    ":superseded_at)"
                ),
                {
                    **parameters,
                    "id": uuid4(),
                    "superseded_at": selected_at + timedelta(seconds=1),
                },
            )
            connection.execute(
                text(
                    "INSERT INTO public.canonical_measurement "
                    "(id, entity_id, quantity_id, measurement_id, selection_rule, "
                    "selection_version, "
                    "explanation, selected_at, superseded_at) "
                    "VALUES (:id, :entity_id, :quantity_id, :measurement_id, 'fixture-rule', "
                    "'fixture-v1', 'Valid current fixture selection.', :selected_at, NULL)"
                ),
                {**parameters, "id": uuid4()},
            )
    finally:
        engine.dispose()

    after = await service.check(REVIEWED_SLICE_ID)

    assert after.state_sha256 == before.state_sha256
    assert after.source_record_count == before.source_record_count == 5
    assert after.measurement_count == before.measurement_count == 15
