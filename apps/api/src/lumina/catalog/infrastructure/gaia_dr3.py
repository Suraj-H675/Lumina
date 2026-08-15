"""Offline parser for the single checksum-pinned Gaia DR3 reviewed artifact.

No network client, endpoint selection, provider registry, or generic CSV interpretation lives
here.  This adapter converts the one immutable release file into Phase 1A3 ingestion commands.
"""

from __future__ import annotations

import csv
from decimal import Decimal, InvalidOperation
from io import StringIO
from pathlib import Path
from typing import NoReturn

from lumina.catalog.domain.ingestion import (
    IngestReviewedDatasetCommand,
    NormalizedMeasurement,
    NormalizedSourceRecord,
)
from lumina.catalog.domain.reviewed_slice import (
    REPOSITORY_ROOT,
    ReviewedSlice,
    ReviewedSlicePolicyRejected,
    ReviewedSliceValidationRejected,
    read_reviewed_artifact,
    reviewed_fetched_at,
)

_MAGNITUDE_FIELDS = (
    "phot_g_mean_mag",
    "phot_bp_mean_mag",
    "phot_rp_mean_mag",
)
_QUALITY_ZERO_FIELDS = (
    "phot_proc_mode",
    "phot_bp_n_contaminated_transits",
    "phot_bp_n_blended_transits",
    "phot_rp_n_contaminated_transits",
    "phot_rp_n_blended_transits",
)


def _reject_validation() -> NoReturn:
    raise ReviewedSliceValidationRejected()


def _reject_policy() -> NoReturn:
    raise ReviewedSlicePolicyRejected()


def _parse_rows(slice_contract: ReviewedSlice, artifact: bytes) -> tuple[dict[str, str], ...]:
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
    if tuple(rows[0]) != slice_contract.artifact.columns:
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


def _checked_measurement(
    source_fact_key: str,
    quantity_code: str,
    reviewed_unit: str,
    lexeme: str,
) -> NormalizedMeasurement:
    try:
        value = Decimal(lexeme)
        return NormalizedMeasurement(
            source_fact_key=source_fact_key,
            quantity_code=quantity_code,
            unit_code=reviewed_unit,
            value_numeric=value,
            original_value=lexeme,
            original_unit=reviewed_unit,
        )
    except (InvalidOperation, ValueError):
        _reject_validation()


def build_reviewed_gaia_commands(
    slice_contract: ReviewedSlice,
    *,
    repository_root: Path = REPOSITORY_ROOT,
) -> tuple[IngestReviewedDatasetCommand, ...]:
    """Build all five reviewed commands before an application service starts a write."""
    if type(slice_contract) is not ReviewedSlice:
        _reject_validation()
    artifact = read_reviewed_artifact(slice_contract, repository_root=repository_root)
    records = _parse_rows(slice_contract, artifact)
    entities = {entity.provider_record_id: entity for entity in slice_contract.entities}
    quantities = {quantity.source_fact_key: quantity for quantity in slice_contract.quantities}
    if set(quantities) != set(_MAGNITUDE_FIELDS):
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
        _reject_validation()

    commands: list[IngestReviewedDatasetCommand] = []
    for record in records:
        source_id = record["source_id"]
        entity = entities[source_id]
        quality = slice_contract.quality
        if (
            record["designation"] != f"{quality.designation_prefix}{source_id}"
            or record["solution_id"] != quality.solution_id
            or record["duplicated_source"] != "false"
            or record["phot_proc_mode"] != str(quality.phot_proc_mode)
            or record["phot_bp_n_contaminated_transits"]
            != str(quality.phot_bp_n_contaminated_transits)
            or record["phot_bp_n_blended_transits"] != str(quality.phot_bp_n_blended_transits)
            or record["phot_rp_n_contaminated_transits"]
            != str(quality.phot_rp_n_contaminated_transits)
            or record["phot_rp_n_blended_transits"] != str(quality.phot_rp_n_blended_transits)
        ):
            _reject_policy()
        if any(record[field] != "0" for field in _QUALITY_ZERO_FIELDS[1:]):
            _reject_policy()
        measurements = tuple(
            _checked_measurement(
                field,
                quantities[field].code,
                slice_contract.unit.code,
                record[field],
            )
            for field in _MAGNITUDE_FIELDS
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
                        fetched_at=reviewed_fetched_at(slice_contract),
                        measurements=measurements,
                    ),
                )
            )
        except ValueError:
            _reject_validation()
    if len(commands) != slice_contract.expected.source_records:
        _reject_validation()
    return tuple(commands)


__all__ = ["build_reviewed_gaia_commands"]
