"""Essential risky semantics for immutable catalogue read projections."""

from __future__ import annotations

import base64
import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from lumina.catalog.domain.ingestion import (
    IngestionConflictCategory,
    IngestionConflictStatus,
    conflict_fingerprint_bytes,
)
from lumina.catalog.domain.read import (
    CatalogMeasurement,
    CompactDataset,
    CompactProvider,
    CompactSource,
    ConflictAnchor,
    ConflictCursor,
    IngestionConflictItem,
    MeasurementCursor,
    Quantity,
    SelectionState,
    Unit,
    decode_conflict_cursor,
    decode_measurement_cursor,
    encode_conflict_cursor,
    encode_measurement_cursor,
    validate_ingestion_conflict_evidence,
)

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789abd")
_PROVIDER_ID = UUID("12345678-1234-4234-9234-123456789abe")
_TIMESTAMP = datetime(2026, 8, 12, 12, tzinfo=UTC)


def _source() -> CompactSource:
    return CompactSource(
        source_record_id=UUID("12345678-1234-4234-9234-123456789abf"),
        provider=CompactProvider(code="fixture.provider", name="Fixture Provider"),
        dataset=CompactDataset(
            code="fixture.dataset",
            name="Fixture Dataset",
            release_version="fixture-v1",
        ),
    )


def test_measurement_preserves_exact_decimal_without_a_float_path() -> None:
    value = Decimal("-0.0000000000000000000000000012300")
    measurement = CatalogMeasurement(
        id=_MEASUREMENT_ID,
        quantity=Quantity(code="fixture.mass", name="Fixture mass"),
        value=value,
        unit=Unit(code="fixture.kg", symbol="kg", name="kilogram"),
        original_value="-1.2300e-27",
        original_unit="kg",
        selection_state=SelectionState.NEVER_SELECTED,
        source=_source(),
        created_at=_TIMESTAMP,
    )

    assert str(measurement.value) == "-1.2300E-27"
    assert measurement.original_value == "-1.2300e-27"


def test_measurement_cursor_rejects_cross_entity_reuse() -> None:
    encoded = encode_measurement_cursor(
        MeasurementCursor(
            entity_id=_ENTITY_ID,
            quantity_code="fixture.mass",
            created_at=_TIMESTAMP,
            measurement_id=_MEASUREMENT_ID,
        )
    )

    assert (
        decode_measurement_cursor(encoded, entity_id=_ENTITY_ID).measurement_id == _MEASUREMENT_ID
    )
    with pytest.raises(ValueError):
        decode_measurement_cursor(
            encoded,
            entity_id=UUID("12345678-1234-4234-9234-123456789aaa"),
        )


@pytest.mark.parametrize("version", [True, 1.0])
def test_measurement_cursor_rejects_non_integer_versions(version: object) -> None:
    payload = {
        "e": str(_ENTITY_ID),
        "k": "measurements",
        "m": str(_MEASUREMENT_ID),
        "q": "fixture.mass",
        "t": "2026-08-12T12:00:00Z",
        "v": version,
    }
    encoded = (
        base64.urlsafe_b64encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("ascii")
        )
        .decode("ascii")
        .rstrip("=")
    )

    with pytest.raises(ValueError):
        decode_measurement_cursor(encoded, entity_id=_ENTITY_ID)


def test_measurement_cursor_rejects_non_base64url_characters() -> None:
    encoded = encode_measurement_cursor(
        MeasurementCursor(
            entity_id=_ENTITY_ID,
            quantity_code="fixture.mass",
            created_at=_TIMESTAMP,
            measurement_id=_MEASUREMENT_ID,
        )
    )

    with pytest.raises(ValueError):
        decode_measurement_cursor(f"{encoded}$$$$", entity_id=_ENTITY_ID)


def test_conflict_cursor_binds_status_and_category_filter() -> None:
    encoded = encode_conflict_cursor(
        ConflictCursor(
            status=IngestionConflictStatus.OPEN,
            category=IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
            last_category=IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
            created_at=_TIMESTAMP,
            fingerprint="a" * 64,
        )
    )

    assert (
        decode_conflict_cursor(
            encoded,
            status=IngestionConflictStatus.OPEN,
            category=IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
        ).fingerprint
        == "a" * 64
    )
    with pytest.raises(ValueError):
        decode_conflict_cursor(
            encoded,
            status=IngestionConflictStatus.RESOLVED,
            category=IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
        )


def test_full_conflict_evidence_rejects_credential_bearing_provenance_url() -> None:
    anchor = {"provider_id": str(_PROVIDER_ID), "provider_code": "fixture.provider"}
    existing: dict[str, object] = {
        "documentation_url": "https://name:secret@fixtures.invalid/docs"  # trufflehog:ignore
    }
    incoming: dict[str, object] = {"documentation_url": "https://fixtures.invalid/docs"}
    evidence: dict[str, object] = {
        "fingerprint_schema": 1,
        "category": "provider_metadata_mismatch",
        "anchor": anchor,
        "existing": existing,
        "incoming": incoming,
    }
    fingerprint = hashlib.sha256(
        conflict_fingerprint_bytes(
            IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
            anchor=anchor,
            existing=existing,
            incoming=incoming,
        )
    ).hexdigest()
    item = IngestionConflictItem(
        fingerprint=fingerprint,
        category=IngestionConflictCategory.PROVIDER_METADATA_MISMATCH,
        anchor=ConflictAnchor(provider_id=_PROVIDER_ID),
        status=IngestionConflictStatus.OPEN,
        created_at=_TIMESTAMP,
        resolved_at=None,
    )

    with pytest.raises(ValueError):
        validate_ingestion_conflict_evidence(
            evidence,
            category=item.category,
            anchor=item.anchor,
            fingerprint=item.fingerprint,
        )
