"""Real-PostgreSQL verification for the Phase 2G semantic and ACL correction."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from lumina.catalog.application.data_quality import ReviewedSliceDataQualityService
from lumina.catalog.application.ingest import CatalogIngestionService
from lumina.catalog.application.messier import (
    MESSIER_V2_SLICE_ID,
    MessierReviewedIngestionService,
)
from lumina.catalog.infrastructure.postgresql.data_quality import (
    PostgreSqlCatalogDataQualityRepository,
)
from lumina.catalog.infrastructure.postgresql.ingestion import PostgreSqlCatalogIngestionStore
from lumina.catalog.infrastructure.postgresql.messier_selection import (
    MESSIER_V2_SELECTION_SHA256,
    V2_EXPLANATION,
    V2_SELECTION_PROFILE,
    V2_SELECTION_RULE,
    V2_SELECTION_VERSION,
    PostgreSqlMessierCanonicalSelectionStore,
)
from lumina.catalog.infrastructure.simbad_messier_v2 import (
    ARTIFACT_SHA256,
    MESSIER_V2_STATE_SHA256,
    build_reviewed_simbad_v2_commands,
    load_messier_v2_slice,
)
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    historical_admin_connection_url,
    historical_migration_identity,
    historical_sync_url,
    read_historical_revision,
    run_alembic,
    run_migration_operation,
)

_B2 = "b7f3a2c81d4e"
_SEMANTIC_REVISION = "b8e5f1a2c3d4"
_ACL_REVISION = "c9f6a2b3d4e5"
_V2_PROVIDER = "cds-simbad"
_V2_DATASET = "messier-j2000"
_V2_RELEASE = "v2"
_V2_QUANTITIES = (
    "icrs_right_ascension_j2000",
    "icrs_declination_j2000",
)
_ALL_SELECTION_COLUMNS = (
    "id",
    "entity_id",
    "quantity_id",
    "measurement_id",
    "selection_rule",
    "selection_version",
    "explanation",
    "selected_at",
    "superseded_at",
)
_INSERT_SELECTION_COLUMNS = (
    "id",
    "entity_id",
    "quantity_id",
    "measurement_id",
    "selection_rule",
    "selection_version",
    "explanation",
)


def _engine(url: URL) -> Engine:
    return create_engine(url, poolclass=NullPool, hide_parameters=True)


def _test_sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _sync_runtime_url(secret_url: str) -> URL:
    return make_url(secret_url).set(drivername="postgresql+psycopg")


def _delete_v2_rows(connection: Connection) -> None:
    connection.execute(
        text(
            "DELETE FROM public.canonical_measurement AS canonical "
            "USING public.measurement AS measurement, public.source_record AS source_record, "
            "public.dataset AS dataset, public.provider AS provider "
            "WHERE canonical.measurement_id = measurement.id "
            "AND measurement.source_record_id = source_record.id "
            "AND source_record.dataset_id = dataset.id "
            "AND dataset.provider_id = provider.id "
            "AND provider.code = :provider AND dataset.code = :dataset "
            "AND dataset.release_version = :release"
        ),
        {"provider": _V2_PROVIDER, "dataset": _V2_DATASET, "release": _V2_RELEASE},
    )
    connection.execute(
        text(
            "DELETE FROM public.ingestion_conflict "
            "WHERE dataset_id IN (SELECT dataset.id FROM public.dataset AS dataset "
            "JOIN public.provider AS provider ON provider.id = dataset.provider_id "
            "WHERE provider.code = :provider AND dataset.code = :dataset "
            "AND dataset.release_version = :release)"
        ),
        {"provider": _V2_PROVIDER, "dataset": _V2_DATASET, "release": _V2_RELEASE},
    )
    connection.execute(
        text(
            "DELETE FROM public.measurement AS measurement USING "
            "public.source_record AS source_record, "
            "public.dataset AS dataset, public.provider AS provider "
            "WHERE measurement.source_record_id = source_record.id "
            "AND source_record.dataset_id = dataset.id AND dataset.provider_id = provider.id "
            "AND provider.code = :provider AND dataset.code = :dataset "
            "AND dataset.release_version = :release"
        ),
        {"provider": _V2_PROVIDER, "dataset": _V2_DATASET, "release": _V2_RELEASE},
    )
    connection.execute(
        text(
            "DELETE FROM public.source_record AS source_record USING public.dataset AS dataset, "
            "public.provider AS provider WHERE source_record.dataset_id = dataset.id "
            "AND dataset.provider_id = provider.id AND provider.code = :provider "
            "AND dataset.code = :dataset AND dataset.release_version = :release"
        ),
        {"provider": _V2_PROVIDER, "dataset": _V2_DATASET, "release": _V2_RELEASE},
    )
    connection.execute(
        text(
            "DELETE FROM public.dataset USING public.provider "
            "WHERE dataset.provider_id = provider.id AND provider.code = :provider "
            "AND dataset.code = :dataset AND dataset.release_version = :release"
        ),
        {"provider": _V2_PROVIDER, "dataset": _V2_DATASET, "release": _V2_RELEASE},
    )


@pytest.fixture(autouse=True)
def clean_v2_rows(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Keep the v2 replay test isolated without touching v1 or Gaia evidence."""
    engine = _engine(_test_sync_url(integration_settings))
    try:
        with engine.begin() as connection:
            _delete_v2_rows(connection)
        yield
    finally:
        with engine.begin() as connection:
            _delete_v2_rows(connection)
        engine.dispose()


def _assert_denied(url: URL, statement: str, parameters: dict[str, object] | None = None) -> None:
    engine = _engine(url)
    try:
        with engine.connect() as connection, pytest.raises(ProgrammingError):
            connection.execute(text(statement), parameters or {})
    finally:
        engine.dispose()


def test_catalogue_operator_acl_is_narrow_and_runtime_is_denied(
    integration_settings: IntegrationTestSettings,
) -> None:
    app_url = _sync_runtime_url(integration_settings.test_database_url.get_secret_value())
    operator_url = _sync_runtime_url(
        integration_settings.test_catalog_operator_database_url.get_secret_value()
    )
    engine = _engine(_test_sync_url(integration_settings))
    try:
        with engine.connect() as connection:
            roles = connection.execute(
                text(
                    "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, "
                    "rolbypassrls, rolinherit FROM pg_roles WHERE rolname = :role"
                ),
                {"role": "lumina_test_catalog_operator"},
            ).one()
            assert tuple(roles) == (True, False, False, False, False, False, False)
            assert (
                connection.execute(
                    text(
                        "SELECT count(*) FROM pg_auth_members AS membership "
                        "JOIN pg_roles AS role ON role.oid = membership.roleid "
                        "JOIN pg_roles AS member ON member.oid = membership.member "
                        "WHERE role.rolname = 'lumina_test_catalog_operator' "
                        "OR member.rolname = 'lumina_test_catalog_operator'"
                    )
                ).scalar_one()
                == 0
            )
            assert connection.execute(
                text(
                    "SELECT has_database_privilege("
                    "'lumina_test_catalog_operator', current_database(), 'CONNECT'), "
                    "has_database_privilege("
                    "'lumina_test_catalog_operator', current_database(), 'TEMP')"
                )
            ).one() == (True, False)
            assert connection.execute(
                text(
                    "SELECT has_schema_privilege("
                    "'lumina_test_catalog_operator', 'public', 'USAGE'), "
                    "has_schema_privilege('lumina_test_catalog_operator', 'public', 'CREATE')"
                )
            ).one() == (True, False)
            assert (
                connection.execute(
                    text(
                        "SELECT count(*) FROM pg_class AS relation "
                        "JOIN pg_namespace AS namespace "
                        "ON namespace.oid = relation.relnamespace "
                        "JOIN pg_roles AS owner ON owner.oid = relation.relowner "
                        "WHERE namespace.nspname = 'public' "
                        "AND owner.rolname = 'lumina_test_catalog_operator'"
                    )
                ).scalar_one()
                == 0
            )

            for role in ("lumina_test_app", "lumina_test_catalog_operator"):
                assert all(
                    not connection.execute(
                        text(
                            "SELECT has_table_privilege("
                            ":role, 'public.canonical_measurement', :privilege)"
                        ),
                        {"role": role, "privilege": privilege},
                    ).scalar_one()
                    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE")
                )
            assert (
                connection.execute(
                    text(
                        "SELECT has_table_privilege("
                        "'public', 'public.canonical_measurement', 'INSERT') "
                        "OR has_table_privilege("
                        "'public', 'public.canonical_measurement', 'UPDATE') "
                        "OR has_table_privilege("
                        "'public', 'public.canonical_measurement', 'DELETE') "
                        "OR has_table_privilege("
                        "'public', 'public.canonical_measurement', 'TRUNCATE')"
                    )
                ).scalar_one()
                is False
            )

            actual = {
                (row.column_name, row.privilege_type, row.is_grantable)
                for row in connection.execute(
                    text(
                        "SELECT column_name, privilege_type, is_grantable "
                        "FROM information_schema.column_privileges "
                        "WHERE grantee = 'lumina_test_catalog_operator' "
                        "AND table_schema = 'public' AND table_name = 'canonical_measurement'"
                    )
                )
            }
            expected = (
                {(column, "SELECT", "NO") for column in _ALL_SELECTION_COLUMNS}
                | {(column, "INSERT", "NO") for column in _INSERT_SELECTION_COLUMNS}
                | {("superseded_at", "UPDATE", "NO")}
            )
            assert actual == expected
            assert (
                connection.execute(
                    text(
                        "SELECT count(*) FROM information_schema.table_privileges "
                        "WHERE grantee = 'lumina_test_catalog_operator' "
                        "AND table_schema = 'public' AND table_name = 'canonical_measurement' "
                        "AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')"
                    )
                ).scalar_one()
                == 0
            )
            assert (
                connection.execute(
                    text(
                        "SELECT count(*) FROM information_schema.column_privileges "
                        "WHERE grantee = 'lumina_test_catalog_operator' AND is_grantable = 'YES'"
                    )
                ).scalar_one()
                == 0
            )
    finally:
        engine.dispose()

    selection_values = {
        "id": UUID("d0000000-0000-4000-8000-000000000001"),
        "entity_id": UUID("d0000000-0000-4000-8000-000000000002"),
        "quantity_id": UUID("d0000000-0000-4000-8000-000000000003"),
        "measurement_id": UUID("d0000000-0000-4000-8000-000000000004"),
        "selection_rule": "acl.test",
        "selection_version": "v1",
        "explanation": "ACL test only",
    }
    _assert_denied(
        app_url,
        "INSERT INTO public.canonical_measurement "
        "(id, entity_id, quantity_id, measurement_id, selection_rule, "
        "selection_version, explanation) "
        "VALUES (:id, :entity_id, :quantity_id, :measurement_id, :selection_rule, "
        ":selection_version, :explanation)",
        selection_values,
    )
    _assert_denied(
        app_url,
        "UPDATE public.canonical_measurement SET superseded_at = CURRENT_TIMESTAMP WHERE false",
    )
    _assert_denied(
        app_url,
        "DELETE FROM public.canonical_measurement WHERE false",
    )
    _assert_denied(app_url, "TRUNCATE public.canonical_measurement")
    _assert_denied(operator_url, "DELETE FROM public.canonical_measurement WHERE false")
    _assert_denied(operator_url, "TRUNCATE public.canonical_measurement")

    bootstrap_source = Path("apps/api/src/lumina/bootstrap.py").read_text(encoding="utf-8")
    worker_source = Path("apps/api/src/lumina/worker/composition.py").read_text(encoding="utf-8")
    cli_source = Path("apps/api/src/lumina/catalog/cli.py").read_text(encoding="utf-8")
    assert "load_catalog_operator_settings" not in bootstrap_source
    assert "load_catalog_operator_settings" not in worker_source
    assert "load_catalog_operator_settings" in cli_source


@pytest.mark.asyncio
async def test_v2_ingestion_quality_selection_and_replay(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    operator_runtime = create_database_runtime(
        integration_settings.test_catalog_operator_database_url
    )
    try:
        ingestion = MessierReviewedIngestionService(
            CatalogIngestionService(PostgreSqlCatalogIngestionStore(runtime.session_factory)),
            slice_id=MESSIER_V2_SLICE_ID,
            command_builder=build_reviewed_simbad_v2_commands,
        )
        first = await ingestion.ingest()
        second = await ingestion.ingest()
        assert (first.inserted_source_record_count, first.replayed_source_record_count) == (110, 0)
        assert (first.inserted_measurement_count, first.existing_measurement_count) == (220, 0)
        assert (second.inserted_source_record_count, second.replayed_source_record_count) == (
            0,
            110,
        )
        assert (second.inserted_measurement_count, second.existing_measurement_count) == (
            0,
            220,
        )

        async with operator_runtime.engine.connect() as connection:
            prior_active = (
                await connection.execute(
                    text(
                        "SELECT count(*) FROM public.canonical_measurement AS canonical "
                        "JOIN public.entity AS entity ON entity.id = canonical.entity_id "
                        "JOIN public.quantity AS quantity ON quantity.id = canonical.quantity_id "
                        "WHERE entity.slug LIKE 'messier-%' "
                        "AND quantity.code = ANY(:quantities) AND canonical.superseded_at IS NULL"
                    ),
                    {"quantities": list(_V2_QUANTITIES)},
                )
            ).scalar_one()
        selection = await PostgreSqlMessierCanonicalSelectionStore(
            operator_runtime.session_factory, profile=V2_SELECTION_PROFILE
        ).select_and_fingerprint()
        replay_selection = await PostgreSqlMessierCanonicalSelectionStore(
            operator_runtime.session_factory, profile=V2_SELECTION_PROFILE
        ).select_and_fingerprint()
        assert selection.inserted_count == 220
        assert selection.superseded_count == prior_active
        assert selection.unchanged_count == 0
        assert replay_selection.inserted_count == 0
        assert replay_selection.superseded_count == 0
        assert replay_selection.unchanged_count == 220
        assert selection.fingerprint == replay_selection.fingerprint

        quality = await ReviewedSliceDataQualityService(
            PostgreSqlCatalogDataQualityRepository(runtime.session_factory),
            lambda _contract: build_reviewed_simbad_v2_commands(),
            slice_loader=load_messier_v2_slice,
            expected_state_sha256=MESSIER_V2_STATE_SHA256,
        ).check(MESSIER_V2_SLICE_ID)
        assert quality.artifact_sha256 == ARTIFACT_SHA256
        assert (quality.source_record_count, quality.measurement_count) == (110, 220)
        assert quality.conflict_count == 0
        assert quality.state_sha256 == MESSIER_V2_STATE_SHA256
        assert selection.fingerprint == MESSIER_V2_SELECTION_SHA256
        assert replay_selection.fingerprint == MESSIER_V2_SELECTION_SHA256

        async with operator_runtime.engine.connect() as connection:
            types = {
                row.slug: row.entity_type
                for row in (
                    await connection.execute(
                        text(
                            "SELECT slug, entity_type FROM public.entity "
                            "WHERE slug IN ('messier-8', 'messier-16', 'messier-17', 'messier-20', "
                            "'messier-24', 'messier-40', 'messier-73', 'messier-102')"
                        )
                    )
                ).mappings()
            }
            assert types == {
                "messier-8": "nebula",
                "messier-16": "nebula",
                "messier-17": "nebula",
                "messier-20": "nebula",
                "messier-24": "sky_region",
                "messier-40": "system",
                "messier-73": "sky_region",
                "messier-102": "galaxy",
            }
            provenance = (
                (
                    await connection.execute(
                        text(
                            "SELECT canonical.selection_rule, canonical.selection_version, "
                            "canonical.explanation, dataset.release_version "
                            "FROM public.canonical_measurement AS canonical "
                            "JOIN public.measurement AS measurement "
                            "ON measurement.id = canonical.measurement_id "
                            "JOIN public.source_record AS source_record "
                            "ON source_record.id = measurement.source_record_id "
                            "JOIN public.dataset AS dataset "
                            "ON dataset.id = source_record.dataset_id "
                            "JOIN public.entity AS entity "
                            "ON entity.id = canonical.entity_id "
                            "WHERE entity.slug = 'messier-16' "
                            "AND canonical.superseded_at IS NULL"
                        )
                    )
                )
                .mappings()
                .all()
            )
            assert len(provenance) == 2
            assert {
                (
                    row["selection_rule"],
                    row["selection_version"],
                    row["explanation"],
                    row["release_version"],
                )
                for row in provenance
            } == {(V2_SELECTION_RULE, V2_SELECTION_VERSION, V2_EXPLANATION, "v2")}
    finally:
        await runtime.engine.dispose()
        await operator_runtime.engine.dispose()


def _cleanup_history_fixture(settings: IntegrationTestSettings) -> None:
    engine = _engine(historical_admin_connection_url(_test_sync_url(settings)))
    try:
        with engine.begin() as connection:
            connection.execute(
                text("DELETE FROM public.measurement WHERE source_record_id = :source_id"),
                {"source_id": UUID("d1000000-0000-4000-8000-000000000003")},
            )
            connection.execute(
                text("DELETE FROM public.source_record WHERE id = :source_id"),
                {"source_id": UUID("d1000000-0000-4000-8000-000000000003")},
            )
            connection.execute(
                text("DELETE FROM public.dataset WHERE id = :dataset_id"),
                {"dataset_id": UUID("d1000000-0000-4000-8000-000000000002")},
            )
            connection.execute(
                text("DELETE FROM public.provider WHERE id = :provider_id"),
                {"provider_id": UUID("d1000000-0000-4000-8000-000000000001")},
            )
    finally:
        engine.dispose()


def _seed_history_dependency(settings: IntegrationTestSettings) -> None:
    engine = _engine(historical_admin_connection_url(_test_sync_url(settings)))
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.provider "
                    "(id, code, name, documentation_url, terms_url, attribution_text) VALUES "
                    "(:id, 'correction.fixture', 'Correction fixture', "
                    "'https://fixture.invalid/docs', "
                    "'https://fixture.invalid/terms', 'Correction fixture only')"
                ),
                {"id": UUID("d1000000-0000-4000-8000-000000000001")},
            )
            connection.execute(
                text(
                    "INSERT INTO public.dataset "
                    "(id, provider_id, code, name, release_version, source_url, licence, "
                    "citation) VALUES "
                    "(:id, :provider_id, 'correction-dataset', 'Correction dataset', 'v1', "
                    "'https://fixture.invalid/data', 'Fixture licence', 'Fixture citation')"
                ),
                {
                    "id": UUID("d1000000-0000-4000-8000-000000000002"),
                    "provider_id": UUID("d1000000-0000-4000-8000-000000000001"),
                },
            )
            connection.execute(
                text(
                    "INSERT INTO public.source_record "
                    "(id, provider_id, dataset_id, provider_record_id, provider_version, "
                    "canonical_entity_id, source_url, fetched_at, adapter_id, adapter_version, "
                    "parser_version, normalized_content_sha256) VALUES "
                    "(:id, :provider_id, :dataset_id, 'dependency', 'v1', :entity_id, "
                    "'https://fixture.invalid/record', :fetched_at, 'fixture.adapter', 'v1', "
                    "'fixture-parser-v1', :checksum)"
                ),
                {
                    "id": UUID("d1000000-0000-4000-8000-000000000003"),
                    "provider_id": UUID("d1000000-0000-4000-8000-000000000001"),
                    "dataset_id": UUID("d1000000-0000-4000-8000-000000000002"),
                    "entity_id": UUID("3756292d-4401-5694-9797-7c7580513eef"),
                    "fetched_at": datetime(2026, 8, 30, tzinfo=UTC),
                    "checksum": "d" * 64,
                },
            )
            connection.execute(
                text(
                    "INSERT INTO public.measurement "
                    "(id, entity_id, source_record_id, quantity_id, unit_id, value_numeric, "
                    "source_fact_key, original_value, original_unit) VALUES "
                    "(:id, :entity_id, :source_id, :quantity_id, :unit_id, 1.0, "
                    "'dependency:fact', '1.0', 'deg')"
                ),
                {
                    "id": UUID("d1000000-0000-4000-8000-000000000004"),
                    "entity_id": UUID("3756292d-4401-5694-9797-7c7580513eef"),
                    "source_id": UUID("d1000000-0000-4000-8000-000000000003"),
                    "quantity_id": UUID("8354f911-f6fd-5b7c-90d8-6f9e5300982a"),
                    "unit_id": UUID("48176d92-8406-52ae-855a-aa2f48dfd089"),
                },
            )
    finally:
        engine.dispose()


def _restore_history_to_b2(settings: IntegrationTestSettings) -> None:
    revision = read_historical_revision(settings)
    identity = historical_migration_identity(settings)
    sync_url = historical_sync_url(settings)
    if revision == _ACL_REVISION:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection, identity, _SEMANTIC_REVISION, downgrade=True
            ),
        )
        revision = _SEMANTIC_REVISION
    if revision == _SEMANTIC_REVISION:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _B2, downgrade=True),
        )
    if read_historical_revision(settings) != _B2:
        pytest.fail("Correction migration lifecycle teardown did not restore B2.")


def test_correction_migrations_upgrade_downgrade_and_refuse_live_dependencies(
    historical_test_database_with_pg_trgm: None,
    integration_settings: IntegrationTestSettings,
) -> None:
    del historical_test_database_with_pg_trgm
    sync_url = historical_sync_url(integration_settings)
    identity = historical_migration_identity(integration_settings)
    try:
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection, identity, _SEMANTIC_REVISION, downgrade=False
            ),
        )
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _ACL_REVISION, downgrade=False),
        )
        assert read_historical_revision(integration_settings) == _ACL_REVISION

        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(
                connection, identity, _SEMANTIC_REVISION, downgrade=True
            ),
        )
        assert read_historical_revision(integration_settings) == _SEMANTIC_REVISION
        _seed_history_dependency(integration_settings)
        with pytest.raises(
            RuntimeError, match="Messier target-semantics migration precondition failed"
        ):
            run_migration_operation(
                sync_url,
                lambda connection: run_alembic(connection, identity, _B2, downgrade=True),
            )
        assert read_historical_revision(integration_settings) == _SEMANTIC_REVISION
        _cleanup_history_fixture(integration_settings)
        run_migration_operation(
            sync_url,
            lambda connection: run_alembic(connection, identity, _B2, downgrade=True),
        )
        assert read_historical_revision(integration_settings) == _B2
    finally:
        _cleanup_history_fixture(integration_settings)
        if read_historical_revision(integration_settings) != _B2:
            _restore_history_to_b2(integration_settings)
