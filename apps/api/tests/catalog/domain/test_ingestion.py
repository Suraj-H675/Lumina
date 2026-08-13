"""Strict normalized catalogue-ingestion domain tests."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import cast
from uuid import UUID, uuid4

import pytest
from lumina.catalog.domain.ingestion import (
    CatalogIngestionOutcome,
    CatalogIngestionStatus,
    CatalogIngestionValidationRejected,
    ConflictReference,
    IngestionConflictCategory,
    IngestionConflictStatus,
    IngestionRecordState,
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
    PreparedCatalogIngestion,
    conflict_fingerprint,
    conflict_fingerprint_bytes,
    normalized_source_content_bytes,
    normalized_source_content_sha256,
    validate_ingestion_command,
)
from lumina.provenance.domain.manifests import DataManifest, SourceManifest
from pydantic import ValidationError

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")
_PROVIDER_ID = UUID("12345678-1234-4234-9234-123456789abd")
_DATASET_ID = UUID("12345678-1234-4234-9234-123456789abe")
_SOURCE_RECORD_ID = UUID("12345678-1234-4234-9234-123456789abf")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789ac0")


def _measurement(
    *,
    fact_key: str = "fixture.mass:primary",
    quantity_code: str = "fixture.quantity.mass",
    unit_code: str = "fixture.unit.kg",
    value: Decimal = Decimal("1.2300"),
    original_value: str = "1.2300",
    original_unit: str = "kg source spelling",
) -> NormalizedMeasurement:
    return NormalizedMeasurement(
        source_fact_key=fact_key,
        quantity_code=quantity_code,
        unit_code=unit_code,
        value_numeric=value,
        original_value=original_value,
        original_unit=original_unit,
    )


def _source_record(
    *measurements: NormalizedMeasurement,
    canonical_entity_id: UUID | None = _ENTITY_ID,
) -> NormalizedSourceRecord:
    return NormalizedSourceRecord(
        provider_record_id="fixture-record-1",
        provider_version="fixture-provider-v1",
        canonical_entity_id=canonical_entity_id,
        source_url="https://fixtures.invalid/catalog/record-1",
        fetched_at=datetime(2026, 8, 1, 12, tzinfo=UTC),
        measurements=measurements or (_measurement(),),
    )


def _command(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
    *measurements: NormalizedMeasurement,
    canonical_entity_id: UUID | None = _ENTITY_ID,
) -> IngestReviewedDatasetCommand:
    return IngestReviewedDatasetCommand(
        source_manifest=source_manifest,
        data_manifest=data_manifest,
        dataset_name="Fictional Catalogue Release",
        source_record=_source_record(*measurements, canonical_entity_id=canonical_entity_id),
    )


def test_models_are_strict_frozen_and_forbid_unknown_fields(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    command = _command(source_manifest, data_manifest)

    assert command.model_config["frozen"] is True
    assert command.model_config["extra"] == "forbid"
    with pytest.raises(ValidationError):
        NormalizedMeasurement.model_validate(
            {
                "source_fact_key": "fixture.mass",
                "quantity_code": "fixture.quantity.mass",
                "unit_code": "fixture.unit.kg",
                "value_numeric": Decimal("1"),
                "original_value": "1",
                "original_unit": "kg",
                "unexpected": "rejected",
            }
        )
    with pytest.raises(ValidationError):
        command.dataset_name = "Mutated"


@pytest.mark.parametrize(
    "value",
    [1.0, float("nan"), float("inf"), Decimal("NaN"), Decimal("Infinity")],
)
def test_measurement_rejects_floats_and_nonfinite_values(value: object) -> None:
    with pytest.raises(ValidationError):
        _measurement(value=cast(Decimal, value))


@pytest.mark.parametrize(
    "original_value",
    ["01", "+1", ".1", "1.", "NaN", "Infinity", "１", "1\n", "1 "],
)
def test_original_value_requires_bounded_ascii_json_number_lexeme(original_value: str) -> None:
    with pytest.raises(ValidationError):
        _measurement(original_value=original_value)


def test_decimal_and_source_text_are_preserved_exactly() -> None:
    measurement = _measurement(
        value=Decimal("1.2300"),
        original_value="1.2300",
        original_unit="  kg (source text)  ",
    )

    assert measurement.value_numeric == Decimal("1.2300")
    assert measurement.original_value == "1.2300"
    assert measurement.original_unit == "  kg (source text)  "


@pytest.mark.parametrize("original_unit", ["", "unit\nname", "unit\x00name", "x" * 8_193])
def test_original_unit_matches_the_nonempty_control_free_bounded_schema_contract(
    original_unit: str,
) -> None:
    with pytest.raises(ValidationError):
        _measurement(original_unit=original_unit)


def test_original_unit_preserves_whitespace_instead_of_normalizing_source_evidence() -> None:
    measurement = _measurement(original_unit=" ")

    assert measurement.original_unit == " "


@pytest.mark.parametrize(
    ("value", "original_value"),
    [
        (Decimal("1e131072"), "1e131072"),
        (Decimal("1e-16384"), "1e-16384"),
    ],
)
def test_measurement_rejects_values_outside_postgresql_numeric_bounds(
    value: Decimal,
    original_value: str,
) -> None:
    with pytest.raises(ValidationError):
        _measurement(value=value, original_value=original_value)


def test_measurement_accepts_postgresql_numeric_boundaries() -> None:
    assert _measurement(
        value=Decimal("1e131071"), original_value="1e131071"
    ).value_numeric == Decimal("1e131071")
    assert _measurement(
        value=Decimal("1e-16383"), original_value="1e-16383"
    ).value_numeric == Decimal("1e-16383")


def test_zero_decimal_still_respects_postgresql_fractional_scale_bound() -> None:
    with pytest.raises(ValidationError):
        _measurement(value=Decimal("0e-16384"), original_value="0e-16384")

    assert _measurement(
        value=Decimal("0e+131072"), original_value="0e+131072"
    ).value_numeric == Decimal("0e+131072")


def test_normalized_contract_representations_redact_source_values(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    sentinel = "ORIGINAL-UNIT-SENTINEL"
    command = _command(
        source_manifest,
        data_manifest,
        _measurement(original_unit=sentinel),
    )

    for value in (command, command.source_record, command.source_record.measurements[0]):
        assert sentinel not in repr(value)
        assert sentinel not in str(value)


@pytest.mark.parametrize(
    "fact_key",
    ["fixture.mass", "fixture.mass:native-id", "fixture.mass:ABCDEFGHIJ._-09"],
)
def test_source_fact_key_accepts_exact_stable_contract(fact_key: str) -> None:
    assert _measurement(fact_key=fact_key).source_fact_key == fact_key


@pytest.mark.parametrize("fact_key", ["fixture:mass:extra", "fixture mass", ":native", "native:"])
def test_source_fact_key_rejects_unstable_shapes(fact_key: str) -> None:
    with pytest.raises(ValidationError):
        _measurement(fact_key=fact_key)


def test_command_requires_declared_normalized_fact_field(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    with pytest.raises(ValidationError, match="undeclared normalized field"):
        _command(
            source_manifest,
            data_manifest,
            _measurement(fact_key="fixture.unknown:primary"),
        )


def test_command_requires_matching_manifest_source_identity(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    mismatched = data_manifest.model_copy(update={"source_id": "fixture.other-source"})

    with pytest.raises(ValidationError, match="source identity does not match"):
        _command(source_manifest, mismatched)


def test_source_facts_are_order_independent_and_duplicate_keys_rejected(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    mass = _measurement(fact_key="fixture.mass:primary")
    radius = _measurement(
        fact_key="fixture.radius:primary",
        quantity_code="fixture.quantity.radius",
        unit_code="fixture.unit.m",
        value=Decimal("2"),
        original_value="2",
        original_unit="m",
    )
    first = _command(source_manifest, data_manifest, radius, mass)
    second = _command(source_manifest, data_manifest, mass, radius)

    assert [item.source_fact_key for item in first.source_record.measurements] == [
        "fixture.mass:primary",
        "fixture.radius:primary",
    ]
    assert normalized_source_content_bytes(first) == normalized_source_content_bytes(second)
    with pytest.raises(ValidationError, match="duplicate source fact keys"):
        _source_record(mass, mass)


def test_checksum_is_versioned_and_excludes_fetch_and_entity_resolution(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    first = _command(source_manifest, data_manifest, canonical_entity_id=None)
    second = IngestReviewedDatasetCommand(
        source_manifest=source_manifest,
        data_manifest=data_manifest,
        dataset_name="Fictional Catalogue Release",
        source_record=NormalizedSourceRecord(
            provider_record_id="fixture-record-1",
            provider_version="fixture-provider-v1",
            canonical_entity_id=_ENTITY_ID,
            source_url="https://fixtures.invalid/catalog/record-1",
            fetched_at=datetime(2026, 8, 2, tzinfo=UTC),
            measurements=(_measurement(),),
        ),
    )

    assert normalized_source_content_sha256(first) == normalized_source_content_sha256(second)
    assert normalized_source_content_bytes(first).startswith(b'{"adapter_id":')


def test_checksum_changes_for_source_truth_change(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    original = _command(source_manifest, data_manifest)
    changed = _command(
        source_manifest,
        data_manifest,
        _measurement(original_value="1.230", value=Decimal("1.230")),
    )

    assert normalized_source_content_sha256(original) != normalized_source_content_sha256(changed)


def test_checksum_revalidates_model_copy_before_hashing(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    forged = _command(source_manifest, data_manifest).model_copy(update={"source_record": object()})

    with pytest.raises(CatalogIngestionValidationRejected):
        normalized_source_content_bytes(forged)
    with pytest.raises(CatalogIngestionValidationRejected):
        validate_ingestion_command(forged)


def test_fingerprint_has_explicit_canonical_bytes_and_deduplicates_mapping_order() -> None:
    first = conflict_fingerprint_bytes(
        IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH,
        anchor={"measurement_id": _MEASUREMENT_ID, "source_fact_key": "fixture.mass:primary"},
        existing={"value_numeric": "1.2300", "original_unit": "kg"},
        incoming={"original_unit": "kg", "value_numeric": "1.2300"},
    )
    second = conflict_fingerprint_bytes(
        "measurement_fact_mismatch",
        anchor={"source_fact_key": "fixture.mass:primary", "measurement_id": _MEASUREMENT_ID},
        existing={"original_unit": "kg", "value_numeric": "1.2300"},
        incoming={"value_numeric": "1.2300", "original_unit": "kg"},
    )

    assert first == second
    assert first == (
        b'{"anchor":{"measurement_id":"12345678-1234-4234-9234-123456789ac0",'
        b'"source_fact_key":"fixture.mass:primary"},"category":"measurement_fact_mismatch",'
        b'"existing":{"original_unit":"kg","value_numeric":"1.2300"},'
        b'"fingerprint_schema":1,"incoming":{"original_unit":"kg","value_numeric":"1.2300"}}'
    )
    assert (
        conflict_fingerprint(
            IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH,
            anchor={"measurement_id": _MEASUREMENT_ID, "source_fact_key": "fixture.mass:primary"},
            existing={"value_numeric": "1.2300", "original_unit": "kg"},
            incoming={"original_unit": "kg", "value_numeric": "1.2300"},
        )
        == "21a0eaf89b3c7cbf223c5f43cc4c3614e638d919437e2a8e2eacc81b2e61071b"
    )


def test_fingerprint_rejects_float_and_untrusted_values() -> None:
    with pytest.raises(CatalogIngestionValidationRejected):
        conflict_fingerprint(
            "provider_metadata_mismatch",
            anchor={"provider_id": uuid4()},
            existing={"name": "Fixture"},
            incoming={"fraction": 1.0},
        )


def test_fingerprint_accepts_only_category_allowlisted_safe_evidence() -> None:
    with pytest.raises(CatalogIngestionValidationRejected):
        conflict_fingerprint(
            IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
            anchor={"provider_id": _PROVIDER_ID, "provider_code": "fixture.catalog-source"},
            existing={"raw_payload": "RAW-PROVIDER-PAYLOAD-SENTINEL"},
            incoming={"name": "Fixture"},
        )
    with pytest.raises(CatalogIngestionValidationRejected):
        conflict_fingerprint(
            IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH,
            anchor={"measurement_id": _MEASUREMENT_ID},
            existing={"quantity_code": "fixture.quantity.mass"},
            incoming={"quantity_code": "fixture.quantity.mass"},
        )


def test_prepared_identifiers_are_uuid4_distinct_and_match_facts(
    source_manifest: SourceManifest,
    data_manifest: DataManifest,
) -> None:
    command = _command(source_manifest, data_manifest)
    prepared = PreparedCatalogIngestion(
        command=command,
        provider_id=_PROVIDER_ID,
        dataset_id=_DATASET_ID,
        source_record_id=_SOURCE_RECORD_ID,
        measurement_ids=(_MEASUREMENT_ID,),
    )

    assert prepared.measurement_ids == (_MEASUREMENT_ID,)
    with pytest.raises(ValidationError):
        PreparedCatalogIngestion(
            command=command,
            provider_id=_PROVIDER_ID,
            dataset_id=_DATASET_ID,
            source_record_id=_SOURCE_RECORD_ID,
            measurement_ids=(),
        )


def test_outcome_sorts_conflicts_and_redacts_only_references() -> None:
    outcome = CatalogIngestionOutcome(
        status=CatalogIngestionStatus.CONFLICT,
        provider_state=IngestionRecordState.EXISTING,
        dataset_state=IngestionRecordState.EXISTING,
        source_record_state=IngestionRecordState.EXISTING,
        source_record_id=_SOURCE_RECORD_ID,
        inserted_measurement_count=0,
        existing_measurement_count=1,
        competing_measurement_count=0,
        scientific_disagreement_count=0,
        canonical_review_required=False,
        conflicts=(
            ConflictReference(
                fingerprint="b" * 64,
                category=IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH,
                status=IngestionConflictStatus.OPEN,
            ),
            ConflictReference(
                fingerprint="a" * 64,
                category=IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH,
                status=IngestionConflictStatus.RESOLVED,
            ),
        ),
    )

    assert [reference.fingerprint for reference in outcome.conflicts] == ["a" * 64, "b" * 64]


def test_outcomes_reject_impossible_closed_state_combinations() -> None:
    with pytest.raises(ValidationError):
        CatalogIngestionOutcome(
            status=CatalogIngestionStatus.INSERTED,
            provider_state=IngestionRecordState.INSERTED,
            dataset_state=IngestionRecordState.INSERTED,
            source_record_state=IngestionRecordState.UNRESOLVED,
            source_record_id=None,
            inserted_measurement_count=0,
            existing_measurement_count=0,
            competing_measurement_count=0,
            scientific_disagreement_count=0,
            canonical_review_required=False,
            conflicts=(),
        )
    with pytest.raises(ValidationError):
        CatalogIngestionOutcome(
            status=CatalogIngestionStatus.CONFLICT,
            provider_state=IngestionRecordState.EXISTING,
            dataset_state=IngestionRecordState.EXISTING,
            source_record_state=IngestionRecordState.EXISTING,
            source_record_id=_SOURCE_RECORD_ID,
            inserted_measurement_count=0,
            existing_measurement_count=0,
            competing_measurement_count=0,
            scientific_disagreement_count=0,
            canonical_review_required=False,
            conflicts=(),
        )


def test_fetched_at_requires_utc_aware_datetime() -> None:
    source_record = _source_record()
    with pytest.raises(ValidationError):
        NormalizedSourceRecord(
            provider_record_id=source_record.provider_record_id,
            provider_version=source_record.provider_version,
            canonical_entity_id=source_record.canonical_entity_id,
            source_url=source_record.source_url,
            fetched_at=datetime(2026, 8, 1),
            measurements=source_record.measurements,
        )
    accepted = NormalizedSourceRecord(
        provider_record_id=source_record.provider_record_id,
        provider_version=source_record.provider_version,
        canonical_entity_id=source_record.canonical_entity_id,
        source_url=source_record.source_url,
        fetched_at=datetime(2026, 8, 1, tzinfo=UTC),
        measurements=source_record.measurements,
    )
    assert accepted.fetched_at.tzinfo is UTC
