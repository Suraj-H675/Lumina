"""Contracts for the bounded, fail-closed Phase 1A5 catalogue seed migration."""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import pytest
from alembic.script import ScriptDirectory
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, text
from sqlalchemy.engine import make_url

from .migration_lifecycle import (
    integration_migration_identity,
    migration_config,
    run_alembic,
    run_migration_operation,
)

_PARENT_REVISION = "a1a3c0f17c5e"
_REVISION = "c4b9e2d7a6f1"
_SAFE_ERROR = "Gaia DR3 seed migration precondition failed."

_ENTITY_ROWS = (
    (UUID("26f4b667-ecd9-524d-8121-29508723715a"), "star", "HD 209458"),
    (UUID("bbfe8678-81ca-5e70-ac95-c597d7655540"), "star", "Kepler-186"),
    (UUID("bfd42670-3013-598e-8eb5-5a1c084dd1a0"), "star", "Kepler-452"),
    (UUID("c593bd18-c4bc-5551-8a41-09f1b501f981"), "star", "51 Pegasi"),
    (UUID("403d0e71-8d81-5c52-abad-c4666c1b5cd6"), "star", "K2-18"),
)
_QUANTITY_ROWS = (
    (
        UUID("2c3626b7-647f-5180-8662-5240238e1acc"),
        "gaia_g_mean_magnitude",
        "Gaia G-band mean magnitude (Vega scale)",
    ),
    (
        UUID("b9532ccd-e769-5d36-9046-b7c1bc138841"),
        "gaia_bp_mean_magnitude",
        "Gaia integrated BP mean magnitude (Vega scale)",
    ),
    (
        UUID("347f0167-0786-5d34-a4d4-a4da006343eb"),
        "gaia_rp_mean_magnitude",
        "Gaia integrated RP mean magnitude (Vega scale)",
    ),
)
_UNIT_ROW = (UUID("4e4a920b-dc09-5556-a056-c08ba155c18a"), "mag", "mag", "magnitude")
_ENTITY_IDS = tuple(row[0] for row in _ENTITY_ROWS)
_QUANTITY_IDS = tuple(row[0] for row in _QUANTITY_ROWS)
_QUANTITY_UNIT_ROWS = {(quantity_id, _UNIT_ROW[0]) for quantity_id in _QUANTITY_IDS}

_FIXTURE_PROVIDER_ID = UUID("c1000000-0000-4000-8000-000000000001")
_FIXTURE_DATASET_ID = UUID("c2000000-0000-4000-8000-000000000001")
_FIXTURE_ENTITY_ID = UUID("c3000000-0000-4000-8000-000000000001")
_FIXTURE_SOURCE_ID = UUID("c4000000-0000-4000-8000-000000000001")
_FIXTURE_MEASUREMENT_ID = UUID("c5000000-0000-4000-8000-000000000001")
_FIXTURE_CANONICAL_ID = UUID("c6000000-0000-4000-8000-000000000001")
_FIXTURE_COMPATIBILITY_UNIT_ID = UUID("c7000000-0000-4000-8000-000000000001")


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _revision(connection: Connection) -> str | None:
    return connection.execute(
        text("SELECT version_num FROM public.alembic_version")
    ).scalar_one_or_none()


def _run_upgrade(settings: IntegrationTestSettings, revision: str = _REVISION) -> None:
    sync_url = _sync_url(settings)
    identity = integration_migration_identity(settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, revision, downgrade=False),
    )


def _run_downgrade(settings: IntegrationTestSettings, revision: str = _PARENT_REVISION) -> None:
    sync_url = _sync_url(settings)
    identity = integration_migration_identity(settings)
    run_migration_operation(
        sync_url,
        lambda connection: run_alembic(connection, identity, revision, downgrade=True),
    )


def _execute(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object],
) -> None:
    def operation(connection: Connection) -> None:
        with connection.begin():
            connection.execute(text(statement), parameters)

    run_migration_operation(_sync_url(settings), operation)


def _query_one(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object],
) -> object:
    return run_migration_operation(
        _sync_url(settings),
        lambda connection: connection.execute(text(statement), parameters).scalar_one(),
    )


def _query_count_row(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object],
) -> tuple[int, ...]:
    return run_migration_operation(
        _sync_url(settings),
        lambda connection: tuple(connection.execute(text(statement), parameters).one()),
    )


@pytest.fixture
def at_parent_revision(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Run each seed contract from the immutable migration's parent revision."""
    _run_downgrade(integration_settings)
    assert (
        _query_one(
            integration_settings,
            "SELECT version_num FROM public.alembic_version",
            {},
        )
        == _PARENT_REVISION
    )
    try:
        yield
    finally:
        _run_upgrade(integration_settings)


def _seed_counts(settings: IntegrationTestSettings) -> tuple[int, int, int, int]:
    counts = _query_count_row(
        settings,
        "SELECT "
        "(SELECT count(*) FROM public.entity WHERE id = ANY(CAST(:entity_ids AS uuid[]))), "
        "(SELECT count(*) FROM public.quantity WHERE id = ANY(CAST(:quantity_ids AS uuid[]))), "
        "(SELECT count(*) FROM public.unit WHERE id = :unit_id), "
        "(SELECT count(*) FROM public.quantity_unit "
        "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) AND unit_id = :unit_id)",
        {
            "entity_ids": list(_ENTITY_IDS),
            "quantity_ids": list(_QUANTITY_IDS),
            "unit_id": _UNIT_ROW[0],
        },
    )
    assert len(counts) == 4
    return counts[0], counts[1], counts[2], counts[3]


def _assert_seed_rows(settings: IntegrationTestSettings) -> None:
    def query(connection: Connection) -> tuple[set[tuple[object, ...]], ...]:
        entities = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT id, entity_type, canonical_name FROM public.entity "
                    "WHERE id = ANY(CAST(:ids AS uuid[]))"
                ),
                {"ids": list(_ENTITY_IDS)},
            )
        }
        quantities = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT id, code, name FROM public.quantity "
                    "WHERE id = ANY(CAST(:ids AS uuid[]))"
                ),
                {"ids": list(_QUANTITY_IDS)},
            )
        }
        units = {
            tuple(row)
            for row in connection.execute(
                text("SELECT id, code, symbol, name FROM public.unit WHERE id = :id"),
                {"id": _UNIT_ROW[0]},
            )
        }
        pairs = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT quantity_id, unit_id FROM public.quantity_unit "
                    "WHERE quantity_id = ANY(CAST(:quantity_ids AS uuid[])) "
                    "AND unit_id = :unit_id"
                ),
                {"quantity_ids": list(_QUANTITY_IDS), "unit_id": _UNIT_ROW[0]},
            )
        }
        return entities, quantities, units, pairs

    entities, quantities, units, pairs = run_migration_operation(_sync_url(settings), query)
    assert entities == set(_ENTITY_ROWS)
    assert quantities == set(_QUANTITY_ROWS)
    assert units == {_UNIT_ROW}
    assert pairs == _QUANTITY_UNIT_ROWS
    assert _seed_counts(settings) == (5, 3, 1, 3)


def test_lineage_and_plain_insert_contract_are_exact() -> None:
    script = ScriptDirectory.from_config(migration_config())
    assert script.get_heads() == [_REVISION]
    assert script.get_revision(_REVISION).down_revision == _PARENT_REVISION

    migration = (
        Path(__file__).resolve().parents[4]
        / "migrations"
        / "versions"
        / "c4b9e2d7a6f1_seed_gaia_dr3_slice.py"
    ).read_text(encoding="utf-8")
    assert "LOCK TABLE " in migration
    assert "IN SHARE ROW EXCLUSIVE MODE" in migration
    for table in (
        "provider",
        "dataset",
        "entity",
        "source_record",
        "quantity",
        "unit",
        "quantity_unit",
        "measurement",
        "canonical_measurement",
        "ingestion_conflict",
    ):
        assert f'"{table}"' in migration
    for forbidden in ("ON CONFLICT", "DO NOTHING", "DO UPDATE", "MERGE INTO"):
        assert forbidden not in migration


def test_upgrade_seeds_only_exact_reviewed_closure(
    integration_settings: IntegrationTestSettings,
    at_parent_revision: None,
) -> None:
    _run_upgrade(integration_settings)
    assert (
        _query_one(
            integration_settings,
            "SELECT version_num FROM public.alembic_version",
            {},
        )
        == _REVISION
    )
    _assert_seed_rows(integration_settings)

    runtime_counts = _query_count_row(
        integration_settings,
        "SELECT (SELECT count(*) FROM public.provider), "
        "(SELECT count(*) FROM public.dataset), "
        "(SELECT count(*) FROM public.source_record), "
        "(SELECT count(*) FROM public.measurement), "
        "(SELECT count(*) FROM public.canonical_measurement), "
        "(SELECT count(*) FROM public.ingestion_conflict)",
        {},
    )
    assert runtime_counts == (0, 0, 0, 0, 0, 0)


@dataclass(frozen=True)
class _Collision:
    name: str
    insert: str
    cleanup: str
    parameters: dict[str, object]


_COLLISIONS = (
    _Collision(
        "entity UUID",
        "INSERT INTO public.entity (id, entity_type, canonical_name) "
        "VALUES (:id, 'star', 'Fixture collision entity UUID')",
        "DELETE FROM public.entity WHERE id = :id",
        {"id": _ENTITY_ROWS[0][0]},
    ),
    _Collision(
        "entity canonical name",
        "INSERT INTO public.entity (id, entity_type, canonical_name) VALUES (:id, 'star', :name)",
        "DELETE FROM public.entity WHERE id = :id",
        {"id": UUID("d1000000-0000-4000-8000-000000000001"), "name": _ENTITY_ROWS[0][2]},
    ),
    _Collision(
        "quantity UUID",
        "INSERT INTO public.quantity (id, code, name) "
        "VALUES (:id, 'fixture.quantity.uuid', 'Fixture collision quantity UUID')",
        "DELETE FROM public.quantity WHERE id = :id",
        {"id": _QUANTITY_ROWS[0][0]},
    ),
    _Collision(
        "quantity code",
        "INSERT INTO public.quantity (id, code, name) "
        "VALUES (:id, :code, 'Fixture collision quantity code')",
        "DELETE FROM public.quantity WHERE id = :id",
        {"id": UUID("d2000000-0000-4000-8000-000000000001"), "code": _QUANTITY_ROWS[0][1]},
    ),
    _Collision(
        "quantity name",
        "INSERT INTO public.quantity (id, code, name) VALUES (:id, 'fixture.quantity.name', :name)",
        "DELETE FROM public.quantity WHERE id = :id",
        {"id": UUID("d3000000-0000-4000-8000-000000000001"), "name": _QUANTITY_ROWS[0][2]},
    ),
    _Collision(
        "unit UUID",
        "INSERT INTO public.unit (id, code, symbol, name) "
        "VALUES (:id, 'fixture.unit.uuid', 'fu', 'Fixture collision unit UUID')",
        "DELETE FROM public.unit WHERE id = :id",
        {"id": _UNIT_ROW[0]},
    ),
    _Collision(
        "unit code",
        "INSERT INTO public.unit (id, code, symbol, name) "
        "VALUES (:id, :code, 'fu', 'Fixture collision unit code')",
        "DELETE FROM public.unit WHERE id = :id",
        {"id": UUID("d4000000-0000-4000-8000-000000000001"), "code": _UNIT_ROW[1]},
    ),
    _Collision(
        "unit name",
        "INSERT INTO public.unit (id, code, symbol, name) "
        "VALUES (:id, 'fixture.unit.name', 'fu', :name)",
        "DELETE FROM public.unit WHERE id = :id",
        {"id": UUID("d5000000-0000-4000-8000-000000000001"), "name": _UNIT_ROW[3]},
    ),
)


@pytest.mark.parametrize("collision", _COLLISIONS, ids=lambda collision: collision.name)
def test_upgrade_rejects_every_target_identity_collision_without_adopting_rows(
    integration_settings: IntegrationTestSettings,
    at_parent_revision: None,
    collision: _Collision,
) -> None:
    _execute(integration_settings, collision.insert, collision.parameters)
    collision_counts = _seed_counts(integration_settings)
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_upgrade(integration_settings)
        assert (
            _query_one(
                integration_settings,
                "SELECT version_num FROM public.alembic_version",
                {},
            )
            == _PARENT_REVISION
        )
        assert _seed_counts(integration_settings) == collision_counts
    finally:
        _execute(integration_settings, collision.cleanup, collision.parameters)


def test_upgrade_rejects_existing_target_compatibility_pair_without_partial_seed(
    integration_settings: IntegrationTestSettings,
    at_parent_revision: None,
) -> None:
    quantity_id, quantity_code, quantity_name = _QUANTITY_ROWS[0]
    _execute(
        integration_settings,
        "INSERT INTO public.quantity (id, code, name) VALUES (:id, :code, :name)",
        {"id": quantity_id, "code": quantity_code, "name": quantity_name},
    )
    _execute(
        integration_settings,
        "INSERT INTO public.unit (id, code, symbol, name) VALUES (:id, :code, :symbol, :name)",
        {"id": _UNIT_ROW[0], "code": _UNIT_ROW[1], "symbol": _UNIT_ROW[2], "name": _UNIT_ROW[3]},
    )
    _execute(
        integration_settings,
        "INSERT INTO public.quantity_unit (quantity_id, unit_id) VALUES (:quantity_id, :unit_id)",
        {"quantity_id": quantity_id, "unit_id": _UNIT_ROW[0]},
    )
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_upgrade(integration_settings)
        assert (
            _query_one(
                integration_settings,
                "SELECT version_num FROM public.alembic_version",
                {},
            )
            == _PARENT_REVISION
        )
        assert _seed_counts(integration_settings) == (0, 1, 1, 1)
    finally:
        _execute(
            integration_settings,
            "DELETE FROM public.quantity_unit "
            "WHERE quantity_id = :quantity_id AND unit_id = :unit_id",
            {"quantity_id": quantity_id, "unit_id": _UNIT_ROW[0]},
        )
        _execute(
            integration_settings,
            "DELETE FROM public.unit WHERE id = :id",
            {"id": _UNIT_ROW[0]},
        )
        _execute(
            integration_settings,
            "DELETE FROM public.quantity WHERE id = :id",
            {"id": quantity_id},
        )


def test_downgrade_requires_exact_metadata_then_deletes_only_seed_closure(
    integration_settings: IntegrationTestSettings,
    at_parent_revision: None,
) -> None:
    _run_upgrade(integration_settings)
    _execute(
        integration_settings,
        "UPDATE public.quantity SET name = 'Tampered reviewed quantity' WHERE id = :id",
        {"id": _QUANTITY_ROWS[0][0]},
    )
    with pytest.raises(RuntimeError, match=_SAFE_ERROR):
        _run_downgrade(integration_settings)
    assert (
        _query_one(
            integration_settings,
            "SELECT version_num FROM public.alembic_version",
            {},
        )
        == _REVISION
    )
    assert _seed_counts(integration_settings) == (5, 3, 1, 3)

    _execute(
        integration_settings,
        "UPDATE public.quantity SET name = :name WHERE id = :id",
        {"id": _QUANTITY_ROWS[0][0], "name": _QUANTITY_ROWS[0][2]},
    )
    _execute(
        integration_settings,
        "INSERT INTO public.unit (id, code, symbol, name) "
        "VALUES (:id, 'fixture.seed.compatibility', 'fsc', 'Fixture compatibility unit')",
        {"id": _FIXTURE_COMPATIBILITY_UNIT_ID},
    )
    _execute(
        integration_settings,
        "INSERT INTO public.quantity_unit (quantity_id, unit_id) VALUES (:quantity_id, :unit_id)",
        {"quantity_id": _QUANTITY_ROWS[0][0], "unit_id": _FIXTURE_COMPATIBILITY_UNIT_ID},
    )
    with pytest.raises(RuntimeError, match=_SAFE_ERROR):
        _run_downgrade(integration_settings)
    assert _seed_counts(integration_settings) == (5, 3, 1, 3)
    _execute(
        integration_settings,
        "DELETE FROM public.quantity_unit WHERE quantity_id = :quantity_id AND unit_id = :unit_id",
        {"quantity_id": _QUANTITY_ROWS[0][0], "unit_id": _FIXTURE_COMPATIBILITY_UNIT_ID},
    )
    _execute(
        integration_settings,
        "DELETE FROM public.unit WHERE id = :id",
        {"id": _FIXTURE_COMPATIBILITY_UNIT_ID},
    )
    _run_downgrade(integration_settings)
    assert (
        _query_one(
            integration_settings,
            "SELECT version_num FROM public.alembic_version",
            {},
        )
        == _PARENT_REVISION
    )
    assert _seed_counts(integration_settings) == (0, 0, 0, 0)


@dataclass(frozen=True)
class _Dependency:
    name: str
    setup: Callable[[IntegrationTestSettings], None]


def _insert_fixture_provider(
    settings: IntegrationTestSettings,
    *,
    code: str = "fixture.seed.migration",
) -> None:
    _execute(
        settings,
        "INSERT INTO public.provider "
        "(id, code, name, documentation_url, terms_url, attribution_text) "
        "VALUES (:id, :code, 'Fixture Seed Migration Provider', "
        "'https://fixtures.invalid/provider', 'https://fixtures.invalid/terms', "
        "'Fixture-only attribution')",
        {"id": _FIXTURE_PROVIDER_ID, "code": code},
    )


def _insert_fixture_dataset(
    settings: IntegrationTestSettings,
    *,
    code: str = "fixture.seed.dataset",
    release: str = "fixture-v1",
) -> None:
    _execute(
        settings,
        "INSERT INTO public.dataset "
        "(id, provider_id, code, name, release_version, source_url, licence, citation) "
        "VALUES (:id, :provider_id, :code, 'Fixture Seed Migration Dataset', :release, "
        "'https://fixtures.invalid/dataset', 'Fixture-only licence', 'Fixture-only citation')",
        {
            "id": _FIXTURE_DATASET_ID,
            "provider_id": _FIXTURE_PROVIDER_ID,
            "code": code,
            "release": release,
        },
    )


def _insert_fixture_source(
    settings: IntegrationTestSettings,
    *,
    entity_id: UUID,
) -> None:
    _execute(
        settings,
        "INSERT INTO public.source_record "
        "(id, provider_id, dataset_id, provider_record_id, provider_version, "
        "canonical_entity_id, source_url, fetched_at, adapter_id, adapter_version, "
        "parser_version, normalized_content_sha256) "
        "VALUES (:id, :provider_id, :dataset_id, 'fixture-seed-record', 'fixture-v1', :entity_id, "
        "'https://fixtures.invalid/source', CURRENT_TIMESTAMP, 'fixture.adapter', "
        "'fixture-v1', 'fixture-parser-v1', :checksum)",
        {
            "id": _FIXTURE_SOURCE_ID,
            "provider_id": _FIXTURE_PROVIDER_ID,
            "dataset_id": _FIXTURE_DATASET_ID,
            "entity_id": entity_id,
            "checksum": "a" * 64,
        },
    )


def _insert_fixture_measurement(settings: IntegrationTestSettings) -> None:
    _execute(
        settings,
        "INSERT INTO public.measurement "
        "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, source_fact_key, "
        "original_value, original_unit) "
        "VALUES (:id, :entity_id, :source_id, :quantity_id, :unit_id, 1.2300, "
        "'fixture.seed:fact-1', '1.2300', 'mag')",
        {
            "id": _FIXTURE_MEASUREMENT_ID,
            "entity_id": _FIXTURE_ENTITY_ID,
            "source_id": _FIXTURE_SOURCE_ID,
            "quantity_id": _QUANTITY_ROWS[0][0],
            "unit_id": _UNIT_ROW[0],
        },
    )


def _setup_provider_dependency(settings: IntegrationTestSettings) -> None:
    _insert_fixture_provider(settings, code="esa-gaia")


def _setup_dataset_dependency(settings: IntegrationTestSettings) -> None:
    _insert_fixture_provider(settings)
    _insert_fixture_dataset(settings, code="gaia-source", release="dr3")


def _setup_source_dependency(settings: IntegrationTestSettings) -> None:
    _insert_fixture_provider(settings)
    _insert_fixture_dataset(settings)
    _insert_fixture_source(settings, entity_id=_ENTITY_ROWS[0][0])


def _setup_measurement_dependency(settings: IntegrationTestSettings) -> None:
    _insert_fixture_provider(settings)
    _insert_fixture_dataset(settings)
    _execute(
        settings,
        "INSERT INTO public.entity (id, entity_type, canonical_name) "
        "VALUES (:id, 'star', 'Fixture Seed Dependency Star')",
        {"id": _FIXTURE_ENTITY_ID},
    )
    _insert_fixture_source(settings, entity_id=_FIXTURE_ENTITY_ID)
    _insert_fixture_measurement(settings)


def _setup_canonical_dependency(settings: IntegrationTestSettings) -> None:
    _setup_measurement_dependency(settings)
    _execute(
        settings,
        "INSERT INTO public.canonical_measurement "
        "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
        "explanation) "
        "VALUES (:id, :entity_id, :quantity_id, :measurement_id, 'fixture.rule', 'fixture-v1', "
        "'Fixture-only canonical selection')",
        {
            "id": _FIXTURE_CANONICAL_ID,
            "entity_id": _FIXTURE_ENTITY_ID,
            "quantity_id": _QUANTITY_ROWS[0][0],
            "measurement_id": _FIXTURE_MEASUREMENT_ID,
        },
    )


def _setup_conflict_dependency(settings: IntegrationTestSettings) -> None:
    _setup_measurement_dependency(settings)
    _execute(
        settings,
        "INSERT INTO public.ingestion_conflict "
        "(fingerprint, category, measurement_id, source_fact_key, incoming_evidence) "
        "VALUES (:fingerprint, 'measurement_fact_mismatch', :measurement_id, "
        "'fixture.seed:fact-1', '{}'::jsonb)",
        {"fingerprint": "f" * 64, "measurement_id": _FIXTURE_MEASUREMENT_ID},
    )


_DEPENDENCIES = (
    _Dependency("scoped provider", _setup_provider_dependency),
    _Dependency("scoped dataset", _setup_dataset_dependency),
    _Dependency("source record for a seeded entity", _setup_source_dependency),
    _Dependency("measurement using the seed compatibility pair", _setup_measurement_dependency),
    _Dependency("canonical selection on a dependent measurement", _setup_canonical_dependency),
    _Dependency("conflict anchored to a dependent measurement", _setup_conflict_dependency),
)


def _delete_fixture_dependency(settings: IntegrationTestSettings) -> None:
    _execute(
        settings,
        "DELETE FROM public.ingestion_conflict WHERE fingerprint = :fingerprint",
        {"fingerprint": "f" * 64},
    )
    _execute(
        settings,
        "DELETE FROM public.canonical_measurement WHERE id = :id",
        {"id": _FIXTURE_CANONICAL_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.measurement WHERE id = :id",
        {"id": _FIXTURE_MEASUREMENT_ID},
    )
    _execute(
        settings,
        "DELETE FROM public.source_record WHERE id = :id",
        {"id": _FIXTURE_SOURCE_ID},
    )
    _execute(settings, "DELETE FROM public.entity WHERE id = :id", {"id": _FIXTURE_ENTITY_ID})
    _execute(settings, "DELETE FROM public.dataset WHERE id = :id", {"id": _FIXTURE_DATASET_ID})
    _execute(settings, "DELETE FROM public.provider WHERE id = :id", {"id": _FIXTURE_PROVIDER_ID})


@pytest.mark.parametrize("dependency", _DEPENDENCIES, ids=lambda dependency: dependency.name)
def test_downgrade_rejects_every_runtime_seed_dependency_before_deleting(
    integration_settings: IntegrationTestSettings,
    at_parent_revision: None,
    dependency: _Dependency,
) -> None:
    _run_upgrade(integration_settings)
    dependency.setup(integration_settings)
    try:
        with pytest.raises(RuntimeError, match=_SAFE_ERROR):
            _run_downgrade(integration_settings)
        assert (
            _query_one(
                integration_settings,
                "SELECT version_num FROM public.alembic_version",
                {},
            )
            == _REVISION
        )
        assert _seed_counts(integration_settings) == (5, 3, 1, 3)
    finally:
        _delete_fixture_dependency(integration_settings)
