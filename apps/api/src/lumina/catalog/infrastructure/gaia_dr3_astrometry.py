"""Offline adapter for the checksum-pinned Gaia DR3 astrometry slice.

The adapter accepts only the reviewed five-row artifact.  It deliberately
keeps ``ref_epoch``, ``ra_error``, and ``dec_error`` as validated artifact
evidence while emitting only the approved RA/Dec measurements.
"""

from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path
from typing import NoReturn

from lumina.catalog.domain.astrometry_slice import (
    ASTROMETRY_PROVIDER_VERSION,
    ASTROMETRY_REFERENCE_EPOCH,
    ASTROMETRY_SLICE_ID,
    AstrometrySlice,
    astrometry_fetched_at,
    read_astrometry_artifact,
)
from lumina.catalog.domain.ingestion import (
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
)
from lumina.catalog.domain.reviewed_slice import (
    REPOSITORY_ROOT,
    ReviewedSlicePolicyRejected,
    ReviewedSliceValidationRejected,
)

_ASTROMETRY_FIELDS = ("ra", "dec")
_SOURCE_COLUMNS = (
    "source_id",
    "solution_id",
    "designation",
    "ref_epoch",
    "ra",
    "ra_error",
    "dec",
    "dec_error",
)


def _reject_validation() -> NoReturn:
    raise ReviewedSliceValidationRejected()


def _reject_policy() -> NoReturn:
    raise ReviewedSlicePolicyRejected()


def _parse_rows(slice_contract: AstrometrySlice, artifact: bytes) -> tuple[dict[str, str], ...]:
    if b"\r" in artifact:
        _reject_validation()
    try:
        text = artifact.decode("utf-8")
    except UnicodeDecodeError:
        _reject_validation()
    if not text.endswith("\n") or "\x00" in text:
        _reject_validation()
    try:
        rows = list(csv.reader(StringIO(text, newline=""), strict=True))
    except csv.Error:
        _reject_validation()
    if len(rows) != slice_contract.expected.source_records + 1:
        _reject_validation()
    if tuple(rows[0]) != _SOURCE_COLUMNS or tuple(rows[0]) != slice_contract.artifact.columns:
        _reject_validation()
    records: list[dict[str, str]] = []
    for row in rows[1:]:
        if len(row) != len(slice_contract.artifact.columns):
            _reject_validation()
        record = dict(zip(slice_contract.artifact.columns, row, strict=True))
        if any(not value or value != value.strip() for value in record.values()):
            _reject_validation()
        records.append(record)
    return tuple(records)


def _finite_decimal(lexeme: str) -> Decimal:
    try:
        value = Decimal(lexeme)
    except InvalidOperation:
        _reject_validation()
    if not value.is_finite():
        _reject_validation()
    return value


def _checked_coordinate(
    source_fact_key: str,
    quantity_code: str,
    lexeme: str,
    *,
    minimum: Decimal,
    maximum: Decimal,
    upper_inclusive: bool = True,
) -> NormalizedMeasurement:
    value = _finite_decimal(lexeme)
    if value < minimum or (value > maximum if upper_inclusive else value >= maximum):
        _reject_policy()
    try:
        return NormalizedMeasurement(
            source_fact_key=source_fact_key,
            quantity_code=quantity_code,
            unit_code="deg",
            value_numeric=value,
            original_value=lexeme,
            original_unit="deg",
        )
    except ValueError:
        _reject_validation()


def build_reviewed_gaia_astrometry_commands(
    slice_contract: AstrometrySlice,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> tuple[IngestReviewedDatasetCommand, ...]:
    """Build five immutable source-record commands in exact source-ID order."""
    if type(slice_contract) is not AstrometrySlice:
        _reject_validation()
    if slice_contract.slice_id != ASTROMETRY_SLICE_ID:
        _reject_validation()
    artifact = read_astrometry_artifact(slice_contract, repository_root=repository_root)
    records = _parse_rows(slice_contract, artifact)
    entities = {entity.provider_record_id: entity for entity in slice_contract.entities}
    quantities = {quantity.source_fact_key: quantity for quantity in slice_contract.quantities}
    if set(quantities) != set(_ASTROMETRY_FIELDS):
        _reject_validation()

    source_ids = [record["source_id"] for record in records]
    try:
        ordered_source_ids = sorted(source_ids, key=int)
    except ValueError:
        _reject_validation()
    if (
        len(source_ids) != len(set(source_ids))
        or source_ids != ordered_source_ids
        or set(source_ids) != set(entities)
    ):
        _reject_policy()

    commands: list[IngestReviewedDatasetCommand] = []
    for record in records:
        source_id = record["source_id"]
        entity = entities[source_id]
        if (
            record["designation"] != f"Gaia DR3 {source_id}"
            or record["solution_id"] != slice_contract.provider_version
            or record["solution_id"] != ASTROMETRY_PROVIDER_VERSION
            or record["ref_epoch"] != slice_contract.reference_epoch
            or record["ref_epoch"] != ASTROMETRY_REFERENCE_EPOCH
        ):
            _reject_policy()
        for error_field in ("ra_error", "dec_error"):
            error_value = _finite_decimal(record[error_field])
            if error_value < Decimal("0"):
                _reject_policy()
        measurements = (
            _checked_coordinate(
                "ra",
                quantities["ra"].code,
                record["ra"],
                minimum=Decimal("0"),
                maximum=Decimal("360"),
                upper_inclusive=False,
            ),
            _checked_coordinate(
                "dec",
                quantities["dec"].code,
                record["dec"],
                minimum=Decimal("-90"),
                maximum=Decimal("90"),
            ),
        )
        try:
            commands.append(
                IngestReviewedDatasetCommand(
                    source_manifest=slice_contract.source_manifest,
                    data_manifest=slice_contract.data_manifest,
                    dataset_name=slice_contract.dataset.name,
                    source_record=NormalizedSourceRecord(
                        provider_record_id=source_id,
                        provider_version=slice_contract.provider_version,
                        canonical_entity_id=entity.id,
                        source_url=None,
                        fetched_at=astrometry_fetched_at(slice_contract),
                        measurements=measurements,
                    ),
                )
            )
        except ValueError:
            _reject_validation()
    if len(commands) != slice_contract.expected.source_records:
        _reject_validation()
    return tuple(commands)


__all__ = ["build_reviewed_gaia_astrometry_commands"]
