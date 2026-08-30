"""Focused PostgreSQL contracts for the Phase 2A0 vocabulary migration."""

from __future__ import annotations

from collections.abc import Iterator
from uuid import UUID

import pytest
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    historical_migration_identity,
    historical_sync_url,
    run_alembic,
    run_migration_operation,
)

_PARENT_REVISION = "e8f4c1a9b362"
_REVISION = "f2a6c8d9e0b1"
_UNIT_ID = UUID("48176d92-8406-52ae-855a-aa2f48dfd089")
_RA_ID = UUID("3c034f43-6cac-58b0-863a-c72c01cbbd0f")
_DEC_ID = UUID("18e12409-5731-5fb0-bb26-8f7033a52621")
_FIXTURE_QUANTITY_ID = UUID("d1000000-0000-4000-8000-000000000001")
_FIXTURE_PAIR_UNIT_ID = UUID("d2000000-0000-4000-8000-000000000001")
_FIXTURE_MEASUREMENT_ID = UUID("d3000000-0000-4000-8000-000000000001")
_FIXTURE_PROVIDER_ID = UUID("d4000000-0000-4000-8000-000000000001")
_FIXTURE_DATASET_ID = UUID("d5000000-0000-4000-8000-000000000001")
_FIXTURE_SOURCE_RECORD_ID = UUID("d6000000-0000-4000-8000-000000000001")


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return historical_sync_url(settings)


def _revision(connection: Connection) -> str:
    return str(connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one())


def _run(
    settings: IntegrationTestSettings,
    revision: str,
    *,
    downgrade: bool,
) -> None:
    sync_url = _sync_url(settings)
    identity = historical_migration_identity(settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, revision, downgrade=downgrade),
    )


def _execute(
    settings: IntegrationTestSettings, statement: str, parameters: dict[str, object]
) -> None:
    engine = create_engine(_sync_url(settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(text(statement), parameters)
    finally:
        engine.dispose()


def _cleanup_fixture_state(settings: IntegrationTestSettings) -> None:
    _execute(
        settings,
        "DELETE FROM public.canonical_measurement AS item USING public.measurement AS measurement, "
        "public.source_record AS source_record, public.dataset AS dataset "
        "WHERE item.measurement_id = measurement.id "
        "AND measurement.source_record_id = source_record.id "
        "AND source_record.dataset_id = dataset.id AND dataset.code = 'gaia-source-astrometry'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.ingestion_conflict AS conflict USING public.dataset AS dataset "
        "WHERE conflict.dataset_id = dataset.id AND dataset.code = 'gaia-source-astrometry'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.measurement AS measurement USING "
        "public.source_record AS source_record, "
        "public.dataset AS dataset "
        "WHERE measurement.source_record_id = source_record.id "
        "AND source_record.dataset_id = dataset.id AND dataset.code = 'gaia-source-astrometry'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.source_record AS source_record USING public.dataset AS dataset "
        "WHERE source_record.dataset_id = dataset.id AND dataset.code = 'gaia-source-astrometry'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.dataset WHERE code = 'gaia-source-astrometry'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.canonical_measurement WHERE measurement_id = :measurement_id",
        {"measurement_id": _FIXTURE_MEASUREMENT_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.measurement WHERE id = :measurement_id",
        {"measurement_id": _FIXTURE_MEASUREMENT_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.quantity_unit WHERE quantity_id = :quantity_id",
        {"quantity_id": _FIXTURE_QUANTITY_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.quantity WHERE id = :quantity_id",
        {"quantity_id": _FIXTURE_QUANTITY_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.quantity WHERE name = 'collision quantity'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.unit WHERE id = :unit_id",
        {"unit_id": _FIXTURE_PAIR_UNIT_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.unit WHERE name = 'collision unit'",
        {},
    )
    _execute(
        settings,
        "DELETE FROM public.source_record WHERE id = :source_record_id",
        {"source_record_id": _FIXTURE_SOURCE_RECORD_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.dataset WHERE id = :dataset_id",
        {"dataset_id": _FIXTURE_DATASET_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.provider WHERE id = :provider_id",
        {"provider_id": _FIXTURE_PROVIDER_ID},
    )


@pytest.fixture
def at_b3(
    integration_settings: IntegrationTestSettings,
    historical_test_database_with_pg_trgm: None,
) -> Iterator[None]:
    """Put only the active test database at B3, then restore the repository head."""
    del historical_test_database_with_pg_trgm
    _cleanup_fixture_state(integration_settings)
    sync_url = _sync_url(integration_settings)
    current = run_migration_operation(sync_url, _revision)
    if current == _REVISION:
        _run(integration_settings, _PARENT_REVISION, downgrade=True)
    elif current == "b7f3a2c81d4e":
        _run(integration_settings, _PARENT_REVISION, downgrade=False)
    elif current != _PARENT_REVISION:
        pytest.fail("Active test database is not at the accepted B3 or astrometry revision.")
    try:
        yield
    finally:
        _cleanup_fixture_state(integration_settings)
        current = run_migration_operation(sync_url, _revision)
        if current == _REVISION:
            _run(integration_settings, _PARENT_REVISION, downgrade=True)
            current = _PARENT_REVISION
        if current == _PARENT_REVISION:
            _run(integration_settings, "b7f3a2c81d4e", downgrade=True)


def _vocabulary_counts(settings: IntegrationTestSettings) -> tuple[int, int, int, int]:
    return run_migration_operation(
        _sync_url(settings),
        lambda connection: tuple(
            connection.execute(
                text(
                    "SELECT "
                    "(SELECT count(*) FROM public.unit WHERE id = :unit_id), "
                    "(SELECT count(*) FROM public.quantity "
                    "WHERE id = ANY(CAST(:quantity_ids AS uuid[]))), "
                    "(SELECT count(*) FROM public.quantity_unit WHERE unit_id = :unit_id), "
                    "(SELECT count(*) FROM public.quantity_unit "
                    "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])))"
                ),
                {"unit_id": _UNIT_ID, "quantity_ids": [_RA_ID, _DEC_ID]},
            ).one()
        ),
    )


def _shape_snapshot(settings: IntegrationTestSettings) -> tuple[object, ...]:
    def query(connection: Connection) -> tuple[object, ...]:
        columns = tuple(
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT table_name, ordinal_position, column_name, data_type, "
                    "is_nullable, COALESCE(column_default, '<none>') "
                    "FROM information_schema.columns WHERE table_schema = 'public' "
                    "ORDER BY table_name, ordinal_position"
                )
            )
        )
        constraints = tuple(
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT table_name, constraint_name, constraint_type "
                    "FROM information_schema.table_constraints WHERE table_schema = 'public' "
                    "ORDER BY table_name, constraint_name"
                )
            )
        )
        indexes = tuple(
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' "
                    "ORDER BY indexname"
                )
            )
        )
        privileges = tuple(
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT table_name, grantee, privilege_type, is_grantable "
                    "FROM information_schema.role_table_grants WHERE table_schema = 'public' "
                    "ORDER BY table_name, grantee, privilege_type"
                )
            )
        )
        extensions = tuple(
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT extname, extversion, n.nspname, pg_get_userbyid(extowner) "
                    "FROM pg_extension AS e JOIN pg_namespace AS n ON n.oid = e.extnamespace "
                    "ORDER BY extname"
                )
            )
        )
        return columns, constraints, indexes, privileges, extensions

    return run_migration_operation(_sync_url(settings), query)


def _create_measurement_dependency(settings: IntegrationTestSettings, quantity_id: UUID) -> None:
    entity_id = run_migration_operation(
        _sync_url(settings),
        lambda connection: connection.execute(
            text("SELECT id FROM public.entity LIMIT 1")
        ).scalar_one(),
    )
    _execute(
        settings,
        "INSERT INTO public.provider "
        "(id, code, name, documentation_url, terms_url, attribution_text) "
        "VALUES (:provider_id, 'fixture-migration', 'Fixture migration provider', "
        "'https://example.invalid/docs', 'https://example.invalid/terms', 'Fixture only')",
        {"provider_id": _FIXTURE_PROVIDER_ID},
    )
    _execute(
        settings,
        "INSERT INTO public.dataset "
        "(id, provider_id, code, name, release_version, source_url, licence, citation) "
        "VALUES (:dataset_id, :provider_id, 'fixture-migration', 'Fixture migration dataset', "
        "'v1', 'https://example.invalid/data', 'Fixture licence', 'Fixture citation')",
        {"dataset_id": _FIXTURE_DATASET_ID, "provider_id": _FIXTURE_PROVIDER_ID},
    )
    _execute(
        settings,
        "INSERT INTO public.source_record "
        "(id, provider_id, dataset_id, provider_record_id, provider_version, "
        "canonical_entity_id, source_url, fetched_at, adapter_id, adapter_version, "
        "parser_version, normalized_content_sha256) "
        "VALUES (:source_record_id, :provider_id, :dataset_id, 'fixture-record', 'v1', "
        ":entity_id, 'https://example.invalid/record', '2026-08-27T00:00:00Z', "
        "'fixture-migration', '1', 'fixture-migration-v1', "
        "'0000000000000000000000000000000000000000000000000000000000000000')",
        {
            "source_record_id": _FIXTURE_SOURCE_RECORD_ID,
            "provider_id": _FIXTURE_PROVIDER_ID,
            "dataset_id": _FIXTURE_DATASET_ID,
            "entity_id": entity_id,
        },
    )
    _execute(
        settings,
        "INSERT INTO public.measurement "
        "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, "
        "source_fact_key, original_value, original_unit) "
        "VALUES (:measurement_id, :entity_id, :source_record_id, :quantity_id, :unit_id, "
        "1, 'fixture-coordinate', '1', 'deg')",
        {
            "measurement_id": _FIXTURE_MEASUREMENT_ID,
            "entity_id": entity_id,
            "source_record_id": _FIXTURE_SOURCE_RECORD_ID,
            "quantity_id": quantity_id,
            "unit_id": _UNIT_ID,
        },
    )


def test_upgrade_adds_only_exact_vocabulary_and_preserves_shape_acl_extensions(
    integration_settings: IntegrationTestSettings,
    at_b3: None,
) -> None:
    del at_b3
    before_shape = _shape_snapshot(integration_settings)
    _run(integration_settings, _REVISION, downgrade=False)
    after_shape = _shape_snapshot(integration_settings)
    after_counts = _vocabulary_counts(integration_settings)

    assert before_shape == after_shape
    assert after_counts == (1, 2, 2, 2)
    assert run_migration_operation(_sync_url(integration_settings), _revision) == _REVISION
    unit = run_migration_operation(
        _sync_url(integration_settings),
        lambda connection: tuple(
            connection.execute(
                text("SELECT id, code, symbol, name FROM public.unit WHERE id = :unit_id"),
                {"unit_id": _UNIT_ID},
            ).one()
        ),
    )
    quantities = run_migration_operation(
        _sync_url(integration_settings),
        lambda connection: tuple(
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT id, code, name FROM public.quantity "
                    "WHERE id = ANY(CAST(:quantity_ids AS uuid[])) ORDER BY code"
                ),
                {"quantity_ids": [_RA_ID, _DEC_ID]},
            )
        ),
    )
    assert unit == (_UNIT_ID, "deg", "deg", "degree")
    assert quantities == (
        (_DEC_ID, "gaia_icrs_declination", "Gaia ICRS declination at reference epoch"),
        (_RA_ID, "gaia_icrs_right_ascension", "Gaia ICRS right ascension at reference epoch"),
    )


@pytest.mark.parametrize(
    ("column", "value"),
    [("id", _UNIT_ID), ("code", "deg")],
)
def test_upgrade_fails_closed_on_unit_collision(
    integration_settings: IntegrationTestSettings,
    at_b3: None,
    column: str,
    value: object,
) -> None:
    del at_b3
    if column == "id":
        statement = (
            "INSERT INTO public.unit (id, code, symbol, name) "
            "VALUES (:value, 'collision-unit', 'u', 'collision unit')"
        )
    else:
        statement = (
            "INSERT INTO public.unit (id, code, symbol, name) "
            "VALUES (:id, :value, 'u', 'collision unit')"
        )
    _execute(integration_settings, statement, {"id": _FIXTURE_PAIR_UNIT_ID, "value": value})
    with pytest.raises(
        RuntimeError, match="Gaia DR3 astrometry vocabulary migration precondition failed"
    ):
        _run(integration_settings, _REVISION, downgrade=False)
    assert run_migration_operation(_sync_url(integration_settings), _revision) == _PARENT_REVISION


@pytest.mark.parametrize(
    ("column", "value"),
    [("id", _RA_ID), ("code", "gaia_icrs_right_ascension")],
)
def test_upgrade_fails_closed_on_quantity_collision(
    integration_settings: IntegrationTestSettings,
    at_b3: None,
    column: str,
    value: object,
) -> None:
    del at_b3
    if column == "id":
        statement = (
            "INSERT INTO public.quantity (id, code, name) "
            "VALUES (:value, 'collision-quantity', 'collision quantity')"
        )
    else:
        statement = (
            "INSERT INTO public.quantity (id, code, name) "
            "VALUES (:id, :value, 'collision quantity')"
        )
    _execute(integration_settings, statement, {"id": _FIXTURE_QUANTITY_ID, "value": value})
    with pytest.raises(
        RuntimeError, match="Gaia DR3 astrometry vocabulary migration precondition failed"
    ):
        _run(integration_settings, _REVISION, downgrade=False)
    assert run_migration_operation(_sync_url(integration_settings), _revision) == _PARENT_REVISION


def test_clean_downgrade_and_reupgrade_are_exact(
    integration_settings: IntegrationTestSettings,
    at_b3: None,
) -> None:
    del at_b3
    _run(integration_settings, _REVISION, downgrade=False)
    _run(integration_settings, _PARENT_REVISION, downgrade=True)
    assert _vocabulary_counts(integration_settings) == (0, 0, 0, 0)
    assert run_migration_operation(_sync_url(integration_settings), _revision) == _PARENT_REVISION
    _run(integration_settings, _REVISION, downgrade=False)
    assert _vocabulary_counts(integration_settings) == (1, 2, 2, 2)


@pytest.mark.parametrize("quantity_id", [_RA_ID, _DEC_ID])
def test_downgrade_blocks_measurement_dependency(
    integration_settings: IntegrationTestSettings,
    at_b3: None,
    quantity_id: UUID,
) -> None:
    del at_b3
    _run(integration_settings, _REVISION, downgrade=False)
    _create_measurement_dependency(integration_settings, quantity_id)
    with pytest.raises(
        RuntimeError, match="Gaia DR3 astrometry vocabulary migration precondition failed"
    ):
        _run(integration_settings, _PARENT_REVISION, downgrade=True)
    assert run_migration_operation(_sync_url(integration_settings), _revision) == _REVISION


def test_downgrade_blocks_unexpected_degree_compatibility_pair(
    integration_settings: IntegrationTestSettings,
    at_b3: None,
) -> None:
    del at_b3
    _run(integration_settings, _REVISION, downgrade=False)
    _execute(
        integration_settings,
        "INSERT INTO public.unit (id, code, symbol, name) "
        "VALUES (:unit_id, 'fixture-deg-alias', 'deg', 'fixture degree alias')",
        {"unit_id": _FIXTURE_PAIR_UNIT_ID},
    )
    _execute(
        integration_settings,
        "INSERT INTO public.quantity (id, code, name) "
        "VALUES (:quantity_id, 'fixture-degree-quantity', 'Fixture degree quantity')",
        {"quantity_id": _FIXTURE_QUANTITY_ID},
    )
    _execute(
        integration_settings,
        "INSERT INTO public.quantity_unit (quantity_id, unit_id) VALUES (:quantity_id, :unit_id)",
        {"quantity_id": _FIXTURE_QUANTITY_ID, "unit_id": _UNIT_ID},
    )
    with pytest.raises(
        RuntimeError, match="Gaia DR3 astrometry vocabulary migration precondition failed"
    ):
        _run(integration_settings, _PARENT_REVISION, downgrade=True)
    assert run_migration_operation(_sync_url(integration_settings), _revision) == _REVISION
