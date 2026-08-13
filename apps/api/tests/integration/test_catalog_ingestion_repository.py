"""Real PostgreSQL contracts for the Phase 1A3 deterministic ingestion repository."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable, Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.catalog.domain.ingestion import (
    CatalogIngestionStatus,
    CatalogUnknownEntity,
    CatalogUnknownVocabulary,
    IngestionConflictCategory,
    IngestionConflictStatus,
    IngestionRecordState,
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
    PreparedCatalogIngestion,
)
from lumina.catalog.infrastructure.postgresql.ingestion import PostgreSqlCatalogIngestionStore
from lumina.provenance.domain.manifests import DataManifest, SourceManifest
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import Connection, text
from sqlalchemy.engine import make_url

from .migration_lifecycle import run_migration_operation

_ENTITY_ID = UUID("71000000-0000-4000-8000-000000000001")
_ENTITY_B_ID = UUID("71000000-0000-4000-8000-000000000002")
_UNKNOWN_ENTITY_ID = UUID("71000000-0000-4000-8000-000000000099")
_QUANTITY_MASS_ID = UUID("72000000-0000-4000-8000-000000000001")
_QUANTITY_RADIUS_ID = UUID("72000000-0000-4000-8000-000000000002")
_UNIT_KG_ID = UUID("73000000-0000-4000-8000-000000000001")
_UNIT_M_ID = UUID("73000000-0000-4000-8000-000000000002")
_FETCHED_AT = datetime(2026, 8, 11, 12, tzinfo=UTC)


def _migration_operation[Result](
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], Result],
) -> Result:
    return run_migration_operation(
        make_url(settings.test_database_sync_url.get_secret_value()),
        operation,
    )


@pytest.fixture
def source_manifest() -> SourceManifest:
    """Return a fully declared fictional source, never a production data source."""
    return SourceManifest(
        manifest_type="source",
        manifest_schema_version=1,
        source_id="fixture.catalog-source",
        source_name="Fixture Catalogue Source",
        adapter_id="fixture.catalog-adapter",
        adapter_version="fixture-adapter-v1",
        purpose="Fictional catalogue ingestion repository tests.",
        official_documentation_url="https://fixtures.invalid/catalog/docs",
        terms_or_licence_url="https://fixtures.invalid/catalog/terms",
        attribution_text="Fictional fixture attribution.",
        endpoint_or_base_url=None,
        authentication_method="No authentication for fictional fixtures.",
        contact_or_user_agent_requirement=None,
        rate_or_fair_use_constraints="Fictional fixture-only use.",
        source_schema_version="fixture-source-schema-v1",
        cache_ttl="Not applicable to fixtures.",
        refresh_schedule="Manual fixture execution only.",
        observation_or_publication_time_policy=(
            "Fixture values have no scientific observation time."
        ),
        fetch_time_policy="Caller supplies a UTC fetch timestamp.",
        normalized_fields=("fixture.mass", "fixture.radius"),
        failure_and_fallback_behaviour="Reject invalid fixture input without fallback.",
        fixture_and_checksum_strategy="Fixtures are deterministic and fictional.",
        known_limitations=("No scientific provider execution is present.",),
        last_verified_at=datetime(2026, 8, 1, tzinfo=UTC),
        capabilities=("lookup",),
    )


@pytest.fixture
def data_manifest() -> DataManifest:
    """Return the exact fictional dataset release associated with ``source_manifest``."""
    return DataManifest(
        manifest_type="data",
        manifest_schema_version=1,
        source_id="fixture.catalog-source",
        dataset_id="fixture-catalog-release",
        release_version="fixture-release-v1",
        official_url="https://fixtures.invalid/catalog/release",
        documentation_url="https://fixtures.invalid/catalog/docs",
        terms_or_licence="Fictional fixture licence.",
        citation="Fictional fixture citation.",
        retrieved_at=datetime(2026, 8, 1, tzinfo=UTC),
        coverage="Fictional test coverage only.",
        local_file=None,
        checksum=None,
        parser_version="fixture-parser-v1",
        usage_notes="Only deterministic test inputs are accepted.",
    )


def _clean_catalog(connection: Connection) -> None:
    for statement in (
        "DELETE FROM public.ingestion_conflict",
        "DELETE FROM public.canonical_measurement",
        "DELETE FROM public.measurement",
        "DELETE FROM public.source_record",
        "DELETE FROM public.dataset",
        "DELETE FROM public.provider",
        "DELETE FROM public.quantity_unit",
        "DELETE FROM public.quantity",
        "DELETE FROM public.unit",
        "DELETE FROM public.entity",
    ):
        connection.execute(text(statement))
    connection.commit()


def _seed_catalog_vocabulary(connection: Connection) -> None:
    connection.execute(
        text(
            "INSERT INTO public.entity (id, entity_type, canonical_name) "
            "VALUES (:id, 'star', 'Repository Fixture Star'), "
            "(:second_id, 'star', 'Repository Fixture Star B')"
        ),
        {"id": _ENTITY_ID, "second_id": _ENTITY_B_ID},
    )
    connection.execute(
        text(
            "INSERT INTO public.quantity (id, code, name) VALUES "
            "(:mass_id, 'fixture.quantity.mass', 'Fixture Mass'), "
            "(:radius_id, 'fixture.quantity.radius', 'Fixture Radius')"
        ),
        {"mass_id": _QUANTITY_MASS_ID, "radius_id": _QUANTITY_RADIUS_ID},
    )
    connection.execute(
        text(
            "INSERT INTO public.unit (id, code, symbol, name) VALUES "
            "(:kg_id, 'fixture.unit.kg', 'kg', 'Fixture kilogram'), "
            "(:m_id, 'fixture.unit.m', 'm', 'Fixture metre')"
        ),
        {"kg_id": _UNIT_KG_ID, "m_id": _UNIT_M_ID},
    )
    connection.execute(
        text(
            "INSERT INTO public.quantity_unit (quantity_id, unit_id) VALUES "
            "(:mass_id, :kg_id), (:radius_id, :m_id)"
        ),
        {
            "mass_id": _QUANTITY_MASS_ID,
            "radius_id": _QUANTITY_RADIUS_ID,
            "kg_id": _UNIT_KG_ID,
            "m_id": _UNIT_M_ID,
        },
    )
    connection.commit()


@pytest.fixture(autouse=True)
def catalog_rows(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Keep each repository scenario isolated using the guarded migration role only."""
    _migration_operation(integration_settings, _clean_catalog)
    _migration_operation(integration_settings, _seed_catalog_vocabulary)
    try:
        yield
    finally:
        _migration_operation(integration_settings, _clean_catalog)


@pytest_asyncio.fixture
async def catalog_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _measurement(
    *,
    fact_key: str = "fixture.mass:primary",
    quantity_code: str | None = None,
    unit_code: str | None = None,
    value: Decimal = Decimal("1.2300"),
    original_value: str = "1.2300",
    original_unit: str = "kg source spelling",
) -> NormalizedMeasurement:
    if fact_key.startswith("fixture.radius"):
        quantity_code = quantity_code or "fixture.quantity.radius"
        unit_code = unit_code or "fixture.unit.m"
    else:
        quantity_code = quantity_code or "fixture.quantity.mass"
        unit_code = unit_code or "fixture.unit.kg"
    return NormalizedMeasurement(
        source_fact_key=fact_key,
        quantity_code=quantity_code,
        unit_code=unit_code,
        value_numeric=value,
        original_value=original_value,
        original_unit=original_unit,
    )


def _prepared(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
    *,
    provider_record_id: str,
    canonical_entity_id: UUID | None = _ENTITY_ID,
    measurements: tuple[NormalizedMeasurement, ...] | None = None,
) -> PreparedCatalogIngestion:
    values = measurements or (_measurement(),)
    command = IngestReviewedDatasetCommand(
        source_manifest=source_manifest,
        data_manifest=data_manifest,
        dataset_name="Fictional Catalogue Release",
        source_record=NormalizedSourceRecord(
            provider_record_id=provider_record_id,
            provider_version="fixture-provider-v1",
            canonical_entity_id=canonical_entity_id,
            source_url=f"https://fixtures.invalid/catalog/{provider_record_id}",
            fetched_at=_FETCHED_AT,
            measurements=values,
        ),
    )
    return PreparedCatalogIngestion(
        command=command,
        provider_id=uuid4(),
        dataset_id=uuid4(),
        source_record_id=uuid4(),
        measurement_ids=tuple(uuid4() for _ in values),
    )


def _store(runtime: DatabaseRuntime) -> PostgreSqlCatalogIngestionStore:
    return PostgreSqlCatalogIngestionStore(runtime.session_factory)


def _catalog_counts(settings: IntegrationTestSettings) -> tuple[int, ...]:
    return cast(
        tuple[int, ...],
        _rows(
            settings,
            "SELECT "
            "(SELECT count(*) FROM public.provider), "
            "(SELECT count(*) FROM public.dataset), "
            "(SELECT count(*) FROM public.source_record), "
            "(SELECT count(*) FROM public.measurement), "
            "(SELECT count(*) FROM public.ingestion_conflict)",
        )[0],
    )


def _rows(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object] | None = None,
) -> list[tuple[object, ...]]:
    def query(connection: Connection) -> list[tuple[object, ...]]:
        result = connection.execute(text(statement), parameters or {})
        rows = [tuple(row) for row in result.all()] if result.returns_rows else []
        connection.commit()
        return rows

    return _migration_operation(settings, query)


@pytest.mark.asyncio
async def test_insert_persists_source_lexemes_and_never_selects_a_canonical_value(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    prepared = _prepared(source_manifest, data_manifest, provider_record_id="inserted")

    outcome = await _store(catalog_runtime).ingest(prepared)

    assert outcome.status is CatalogIngestionStatus.INSERTED
    assert outcome.inserted_measurement_count == 1
    assert _rows(
        integration_settings,
        "SELECT value_numeric, original_value, original_unit FROM public.measurement "
        "WHERE id = :id",
        {"id": prepared.measurement_ids[0]},
    ) == [(Decimal("1.2300"), "1.2300", "kg source spelling")]
    assert _rows(
        integration_settings,
        "SELECT count(*) FROM public.canonical_measurement",
    ) == [(0,)]


@pytest.mark.asyncio
async def test_unknown_entity_rolls_back_all_rows(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    prepared = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id="unknown-entity",
        canonical_entity_id=_UNKNOWN_ENTITY_ID,
    )

    with pytest.raises(CatalogUnknownEntity):
        await store.ingest(prepared)

    assert _catalog_counts(integration_settings) == (0, 0, 0, 0, 0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider_record_id", "measurement"),
    [
        (
            "unknown-vocabulary",
            _measurement(quantity_code="fixture.quantity.unknown"),
        ),
        (
            "incompatible-vocabulary",
            _measurement(unit_code="fixture.unit.m"),
        ),
    ],
)
async def test_unknown_or_incompatible_vocabulary_rolls_back_all_rows(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
    provider_record_id: str,
    measurement: NormalizedMeasurement,
) -> None:
    store = _store(catalog_runtime)
    prepared = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id=provider_record_id,
        measurements=(measurement,),
    )

    with pytest.raises(CatalogUnknownVocabulary):
        await store.ingest(prepared)

    assert _catalog_counts(integration_settings) == (0, 0, 0, 0, 0)


@pytest.mark.asyncio
async def test_equal_replay_is_idempotent_and_reports_persisted_fact_count(
    catalog_runtime: DatabaseRuntime,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    first = _prepared(source_manifest, data_manifest, provider_record_id="replay")
    replay = _prepared(source_manifest, data_manifest, provider_record_id="replay")
    store = _store(catalog_runtime)

    inserted = await store.ingest(first)
    replayed = await store.ingest(replay)

    assert inserted.status is CatalogIngestionStatus.INSERTED
    assert replayed.status is CatalogIngestionStatus.REPLAYED
    assert replayed.source_record_id == inserted.source_record_id
    assert replayed.inserted_measurement_count == 0
    assert replayed.existing_measurement_count == 1


@pytest.mark.asyncio
async def test_provider_metadata_mismatch_is_persisted_once_and_replayed_as_the_same_conflict(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    await store.ingest(
        _prepared(source_manifest, data_manifest, provider_record_id="provider-metadata")
    )
    changed_manifest = source_manifest.model_copy(
        update={"source_name": "Fixture Catalogue Source Reworded"}
    )
    changed = _prepared(
        changed_manifest,
        data_manifest,
        provider_record_id="provider-metadata",
    )

    first = await store.ingest(changed)
    replayed = await store.ingest(changed)

    for outcome in (first, replayed):
        assert outcome.status is CatalogIngestionStatus.CONFLICT
        assert [reference.category for reference in outcome.conflicts] == [
            IngestionConflictCategory.PROVIDER_METADATA_MISMATCH
        ]
        assert [reference.status for reference in outcome.conflicts] == [
            IngestionConflictStatus.OPEN
        ]
    assert _catalog_counts(integration_settings) == (1, 1, 1, 1, 1)
    assert _rows(
        integration_settings,
        "SELECT category, count(*) FROM public.ingestion_conflict GROUP BY category",
    ) == [("provider_metadata_mismatch", 1)]


@pytest.mark.asyncio
async def test_dataset_metadata_mismatch_is_persisted_once_without_a_source_record(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    await store.ingest(
        _prepared(source_manifest, data_manifest, provider_record_id="dataset-metadata")
    )
    changed_manifest = data_manifest.model_copy(
        update={"citation": "Fictional fixture citation, revised wording."}
    )
    changed = _prepared(
        source_manifest,
        changed_manifest,
        provider_record_id="dataset-metadata",
    )

    first = await store.ingest(changed)
    replayed = await store.ingest(changed)

    for outcome in (first, replayed):
        assert outcome.status is CatalogIngestionStatus.CONFLICT
        assert [reference.category for reference in outcome.conflicts] == [
            IngestionConflictCategory.DATASET_METADATA_MISMATCH
        ]
    assert _catalog_counts(integration_settings) == (1, 1, 1, 1, 1)
    assert _rows(
        integration_settings,
        "SELECT category, count(*) FROM public.ingestion_conflict GROUP BY category",
    ) == [("dataset_metadata_mismatch", 1)]


@pytest.mark.asyncio
async def test_unresolved_record_rejects_changed_content_before_resolution_and_insertion(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    unresolved = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id="unresolved",
        canonical_entity_id=None,
    )
    changed_resolution = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id="unresolved",
        measurements=(_measurement(value=Decimal("2"), original_value="2"),),
    )

    first = await store.ingest(unresolved)
    rejected = await store.ingest(changed_resolution)

    assert first.status is CatalogIngestionStatus.UNRESOLVED
    assert rejected.status is CatalogIngestionStatus.CONFLICT
    assert [reference.category for reference in rejected.conflicts] == [
        IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH
    ]
    assert _rows(
        integration_settings,
        "SELECT canonical_entity_id, count(measurement.id) FROM public.source_record "
        "LEFT JOIN public.measurement ON measurement.source_record_id = source_record.id "
        "WHERE source_record.id = :id GROUP BY canonical_entity_id",
        {"id": first.source_record_id},
    ) == [(None, 0)]

    resolved = await store.ingest(
        _prepared(source_manifest, data_manifest, provider_record_id="unresolved")
    )
    assert resolved.status is CatalogIngestionStatus.INSERTED
    assert resolved.source_record_state is IngestionRecordState.RESOLVED


@pytest.mark.asyncio
async def test_existing_source_record_cannot_be_remapped_to_a_different_entity(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    inserted = await store.ingest(
        _prepared(source_manifest, data_manifest, provider_record_id="entity-remap")
    )
    remapped = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id="entity-remap",
        canonical_entity_id=_ENTITY_B_ID,
    )

    first = await store.ingest(remapped)
    replayed = await store.ingest(remapped)

    for outcome in (first, replayed):
        assert outcome.status is CatalogIngestionStatus.CONFLICT
        assert [reference.category for reference in outcome.conflicts] == [
            IngestionConflictCategory.SOURCE_RECORD_ENTITY_MISMATCH
        ]
    assert _rows(
        integration_settings,
        "SELECT canonical_entity_id FROM public.source_record WHERE id = :id",
        {"id": inserted.source_record_id},
    ) == [(_ENTITY_ID,)]
    assert _rows(
        integration_settings,
        "SELECT category, count(*) FROM public.ingestion_conflict GROUP BY category",
    ) == [("source_record_entity_mismatch", 1)]


@pytest.mark.asyncio
async def test_same_fact_key_mismatch_has_fact_precedence_and_deduplicates_its_evidence(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    await store.ingest(_prepared(source_manifest, data_manifest, provider_record_id="same-key"))
    changed = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id="same-key",
        measurements=(_measurement(value=Decimal("1.23"), original_value="1.23"),),
    )

    first_conflict = await store.ingest(changed)
    replayed_conflict = await store.ingest(changed)

    for outcome in (first_conflict, replayed_conflict):
        assert outcome.status is CatalogIngestionStatus.CONFLICT
        assert [reference.category for reference in outcome.conflicts] == [
            IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH
        ]
    assert _rows(
        integration_settings,
        "SELECT count(*) FROM public.ingestion_conflict "
        "WHERE category = 'measurement_fact_mismatch'",
    ) == [(1,)]


@pytest.mark.asyncio
async def test_changed_whole_fact_set_has_one_content_conflict_and_no_partial_fact_insert(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    inserted = await store.ingest(
        _prepared(source_manifest, data_manifest, provider_record_id="whole-set")
    )
    changed = _prepared(
        source_manifest,
        data_manifest,
        provider_record_id="whole-set",
        measurements=(
            _measurement(),
            _measurement(
                fact_key="fixture.radius:primary",
                value=Decimal("2.0"),
                original_value="2.0",
                original_unit="m source spelling",
            ),
        ),
    )

    conflict = await store.ingest(changed)

    assert conflict.status is CatalogIngestionStatus.CONFLICT
    assert [reference.category for reference in conflict.conflicts] == [
        IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH
    ]
    assert _rows(
        integration_settings,
        "SELECT source_fact_key, original_value FROM public.measurement "
        "WHERE source_record_id = :id ORDER BY source_fact_key",
        {"id": inserted.source_record_id},
    ) == [("fixture.mass:primary", "1.2300")]


@pytest.mark.asyncio
async def test_competing_measurements_are_reported_without_canonical_mutation(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    first_prepared = _prepared(source_manifest, data_manifest, provider_record_id="first")
    await store.ingest(first_prepared)
    second = await store.ingest(
        _prepared(
            source_manifest,
            data_manifest,
            provider_record_id="second",
            measurements=(_measurement(value=Decimal("2"), original_value="2"),),
        )
    )
    _rows(
        integration_settings,
        "INSERT INTO public.canonical_measurement "
        "(id, entity_id, quantity_id, measurement_id, selection_rule, selection_version, "
        "explanation) "
        "VALUES (:id, :entity_id, :quantity_id, :measurement_id, 'fixture.rule', "
        "'fixture-v1', 'Fixture selection')",
        {
            "id": uuid4(),
            "entity_id": _ENTITY_ID,
            "quantity_id": _QUANTITY_MASS_ID,
            "measurement_id": first_prepared.measurement_ids[0],
        },
    )
    third = await store.ingest(
        _prepared(
            source_manifest,
            data_manifest,
            provider_record_id="third",
            measurements=(_measurement(value=Decimal("3"), original_value="3"),),
        )
    )

    assert second.competing_measurement_count == 1
    assert second.scientific_disagreement_count == 1
    assert not second.canonical_review_required
    assert third.canonical_review_required
    assert _rows(
        integration_settings,
        "SELECT measurement_id FROM public.canonical_measurement",
    ) == [(first_prepared.measurement_ids[0],)]


@pytest.mark.asyncio
async def test_concurrent_equal_records_converge_without_duplicate_source_facts(
    catalog_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    store = _store(catalog_runtime)
    left = _prepared(source_manifest, data_manifest, provider_record_id="concurrent")
    right = _prepared(source_manifest, data_manifest, provider_record_id="concurrent")

    outcomes = await asyncio.gather(store.ingest(left), store.ingest(right))

    assert sorted(outcome.status for outcome in outcomes) == [
        CatalogIngestionStatus.INSERTED,
        CatalogIngestionStatus.REPLAYED,
    ]
    assert _rows(
        integration_settings,
        "SELECT count(*) FROM public.source_record WHERE provider_record_id = 'concurrent'",
    ) == [(1,)]
    assert _rows(
        integration_settings,
        "SELECT count(*) FROM public.measurement WHERE source_fact_key = 'fixture.mass:primary'",
    ) == [(1,)]
