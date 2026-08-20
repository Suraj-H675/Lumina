"""Essential risky semantics for immutable catalogue read projections."""

from __future__ import annotations

import base64
import hashlib
import inspect
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
    CatalogEntityType,
    CatalogMeasurement,
    CatalogReadValidationRejected,
    CompactDataset,
    CompactProvider,
    CompactSource,
    ConflictAnchor,
    ConflictCursor,
    EntityBrowseCursor,
    IngestionConflictItem,
    MeasurementCursor,
    PublicEntitySummary,
    Quantity,
    SelectionState,
    Unit,
    decode_conflict_cursor,
    decode_entity_browse_cursor,
    decode_measurement_cursor,
    encode_conflict_cursor,
    encode_entity_browse_cursor,
    encode_measurement_cursor,
    validate_entity_type_filter,
    validate_ingestion_conflict_evidence,
    validate_public_entity_slug,
)

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")
_MEASUREMENT_ID = UUID("12345678-1234-4234-9234-123456789abd")
_PROVIDER_ID = UUID("12345678-1234-4234-9234-123456789abe")
_TIMESTAMP = datetime(2026, 8, 12, 12, tzinfo=UTC)


class _StringSubclass(str):
    pass


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


def test_existing_measurement_cursor_bytes_remain_stable() -> None:
    assert encode_measurement_cursor(
        MeasurementCursor(
            entity_id=_ENTITY_ID,
            quantity_code="fixture.mass",
            created_at=_TIMESTAMP,
            measurement_id=_MEASUREMENT_ID,
        )
    ) == (
        "eyJlIjoiMTIzNDU2NzgtMTIzNC00MjM0LTkyMzQtMTIzNDU2Nzg5YWJjIiwiayI6Im1l"
        "YXN1cmVtZW50cyIsIm0iOiIxMjM0NTY3OC0xMjM0LTQyMzQtOTIzNC0xMjM0NTY3ODlh"
        "YmQiLCJxIjoiZml4dHVyZS5tYXNzIiwidCI6IjIwMjYtMDgtMTJUMTI6MDA6MDBaIiwidi"
        "I6MX0"
    )


def test_public_entity_slug_returns_the_exact_valid_string() -> None:
    assert validate_public_entity_slug("hd-209458") == "hd-209458"


@pytest.mark.parametrize("value", [None, True, 1, b"hd-209458", _StringSubclass("hd-209458")])
def test_public_entity_slug_rejects_non_exact_strings(value: object) -> None:
    with pytest.raises(CatalogReadValidationRejected):
        validate_public_entity_slug(value)


@pytest.mark.parametrize("value", ["", "HD-209458", " hd-209458", "hd-209458 ", "hd--209458"])
def test_public_entity_slug_rejects_malformed_strings_without_a_cause(value: str) -> None:
    with pytest.raises(CatalogReadValidationRejected) as caught:
        validate_public_entity_slug(value)

    assert caught.value.__cause__ is None


def test_read_boundary_reuses_the_identity_slug_validator_without_copying_its_pattern() -> None:
    source = inspect.getsource(__import__("lumina.catalog.domain.read", fromlist=["*"]))

    assert "[a-z0-9]+(?:-[a-z0-9]+)*" not in source


def test_public_entity_summary_has_exactly_its_four_navigation_fields() -> None:
    summary = PublicEntitySummary(
        id=_ENTITY_ID,
        slug="hd-209458",
        entity_type=CatalogEntityType.STAR,
        canonical_name="HD 209458",
    )

    assert summary.model_dump(mode="python") == {
        "id": _ENTITY_ID,
        "slug": "hd-209458",
        "entity_type": CatalogEntityType.STAR,
        "canonical_name": "HD 209458",
    }
    with pytest.raises(ValueError):
        PublicEntitySummary(
            id=_ENTITY_ID,
            slug="hd-209458",
            entity_type=CatalogEntityType.STAR,
            canonical_name="",
        )


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), ("star", CatalogEntityType.STAR), ("exoplanet", CatalogEntityType.EXOPLANET)],
)
def test_entity_type_filter_accepts_only_one_known_string(
    value: object | None,
    expected: CatalogEntityType | None,
) -> None:
    assert validate_entity_type_filter(value) is expected


@pytest.mark.parametrize("value", [True, 1, _StringSubclass("star"), "unknown"])
def test_entity_type_filter_rejects_noncanonical_values(value: object) -> None:
    with pytest.raises(CatalogReadValidationRejected):
        validate_entity_type_filter(value)


def _encode_payload(payload: object) -> str:
    return (
        base64.urlsafe_b64encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("ascii")
        )
        .decode("ascii")
        .rstrip("=")
    )


def test_entity_browse_cursor_is_canonical_and_round_trips_with_its_filter() -> None:
    cursor = EntityBrowseCursor(entity_type=None, slug="hd-209458")
    encoded = encode_entity_browse_cursor(cursor)

    assert base64.urlsafe_b64decode(encoded + "=").decode("ascii") == (
        '{"f":null,"k":"entities","s":"hd-209458","v":1}'
    )
    assert decode_entity_browse_cursor(encoded, entity_type=None) == cursor


def test_entity_browse_cursor_rejects_a_different_active_filter() -> None:
    encoded = encode_entity_browse_cursor(
        EntityBrowseCursor(entity_type=CatalogEntityType.STAR, slug="hd-209458")
    )

    with pytest.raises(CatalogReadValidationRejected):
        decode_entity_browse_cursor(encoded, entity_type=CatalogEntityType.PLANET)


@pytest.mark.parametrize(
    "payload",
    [
        {"f": None, "k": "entities", "s": "hd-209458", "v": True},
        {"f": None, "k": "measurements", "s": "hd-209458", "v": 1},
        {"f": None, "k": "entities", "s": "HD-209458", "v": 1},
        {"f": "unknown", "k": "entities", "s": "hd-209458", "v": 1},
        {"f": None, "k": "entities", "s": "hd-209458", "v": 1, "x": "extra"},
        {"f": None, "k": "entities", "v": 1},
    ],
)
def test_entity_browse_cursor_rejects_wrong_shape_or_value(payload: dict[str, object]) -> None:
    with pytest.raises(CatalogReadValidationRejected):
        decode_entity_browse_cursor(_encode_payload(payload), entity_type=None)


def test_entity_browse_cursor_rejects_duplicate_noncanonical_and_oversized_encodings() -> None:
    duplicate = (
        base64.urlsafe_b64encode(b'{"f":null,"f":null,"k":"entities","s":"hd-209458","v":1}')
        .decode("ascii")
        .rstrip("=")
    )
    noncanonical = (
        base64.urlsafe_b64encode(b'{"v":1, "k":"entities", "f":null, "s":"hd-209458"}')
        .decode("ascii")
        .rstrip("=")
    )

    for value in (duplicate, noncanonical, "a" * 1025):
        with pytest.raises(CatalogReadValidationRejected):
            decode_entity_browse_cursor(value, entity_type=None)


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
    credential_url = "https://name:" + "secret@fixtures.invalid/docs"
    existing: dict[str, object] = {"documentation_url": credential_url}
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
