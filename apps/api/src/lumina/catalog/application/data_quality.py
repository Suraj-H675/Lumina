"""Deterministic, source-only verification for the approved Gaia DR3 slice.

This service deliberately validates immutable provenance and source facts.  It neither reads nor
derives any preferred-value state; a later selection policy cannot alter this gate or fingerprint.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from time import perf_counter
from typing import Protocol, TypeVar, cast
from uuid import UUID

from lumina.catalog.application.reviewed_slice import ReviewedSliceContract
from lumina.catalog.domain.ingestion import (
    IngestReviewedDatasetCommand,
    normalized_source_content_sha256,
)
from lumina.catalog.domain.read import CatalogReadError
from lumina.catalog.domain.reviewed_slice import (
    REVIEWED_STATE_SHA256,
    ReviewedSliceError,
    ReviewedSlicePolicyRejected,
    load_reviewed_slice,
)
from lumina.provenance.domain.manifests import serialize_manifest

_FINGERPRINT_SCHEMA_VERSION = 1
_LOGGER = logging.getLogger("lumina.catalog.data_quality")


SliceContractT = TypeVar("SliceContractT", bound=ReviewedSliceContract)


@dataclass(frozen=True, slots=True)
class SliceProvider:
    """Persisted provider metadata selected by one reviewed slice."""

    id: UUID
    code: str
    name: str
    documentation_url: str
    terms_url: str
    attribution_text: str


@dataclass(frozen=True, slots=True)
class SliceDataset:
    """Exact release-level dataset metadata selected by one reviewed slice."""

    id: UUID
    provider_id: UUID
    code: str
    name: str
    release_version: str
    source_url: str
    licence: str
    citation: str


@dataclass(frozen=True, slots=True)
class SliceEntity:
    """One persisted entity reachable from the reviewed source-fact closure."""

    id: UUID
    entity_type: str
    canonical_name: str


@dataclass(frozen=True, slots=True)
class SliceQuantity:
    """One exact quantity vocabulary record."""

    id: UUID
    code: str
    name: str


@dataclass(frozen=True, slots=True)
class SliceUnit:
    """The exact unit vocabulary record required by the slice."""

    id: UUID
    code: str
    symbol: str
    name: str


@dataclass(frozen=True, slots=True)
class SliceCompatibilityPair:
    """One persisted quantity/unit compatibility fact."""

    quantity_id: UUID
    unit_id: UUID


@dataclass(frozen=True, slots=True)
class SliceSourceRecord:
    """One immutable provenance record and its content digest."""

    id: UUID
    provider_id: UUID
    dataset_id: UUID
    provider_record_id: str
    provider_version: str
    entity_id: UUID
    source_url: str | None
    fetched_at: datetime
    adapter_id: str
    adapter_version: str
    parser_version: str
    normalized_content_sha256: str


@dataclass(frozen=True, slots=True)
class SliceMeasurement:
    """One immutable source fact, including its original provider lexemes."""

    id: UUID
    entity_id: UUID
    source_record_id: UUID
    quantity_id: UUID
    unit_id: UUID
    value_numeric: Decimal
    created_at: datetime
    source_fact_key: str
    original_value: str
    original_unit: str


@dataclass(frozen=True, slots=True)
class SliceConflict:
    """A conflict whose persisted anchor is inside the reviewed closure."""

    fingerprint: str
    category: str
    provider_id: UUID | None
    dataset_id: UUID | None
    source_record_id: UUID | None
    measurement_id: UUID | None
    source_fact_key: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None


@dataclass(frozen=True, slots=True)
class SliceDatabaseState:
    """An immutable, repeatable-read view of the exact source-fact closure."""

    provider: SliceProvider | None
    dataset: SliceDataset | None
    entities: tuple[SliceEntity, ...]
    quantities: tuple[SliceQuantity, ...]
    unit: SliceUnit | None
    pairs: tuple[SliceCompatibilityPair, ...]
    source_records: tuple[SliceSourceRecord, ...]
    measurements: tuple[SliceMeasurement, ...]
    conflicts: tuple[SliceConflict, ...]


class CatalogDataQualityRepository(Protocol):
    """Read one bounded immutable source-fact closure in a repeatable snapshot."""

    async def load_slice_state(self, slice_contract: ReviewedSliceContract) -> SliceDatabaseState:
        """Return no more than one reviewed source-slice state."""
        ...


@dataclass(frozen=True, slots=True)
class ReviewedSliceDataCheckResult:
    """Safe evidence emitted by a successful immutable reviewed-slice data check."""

    slice_id: str
    artifact_sha256: str
    state_sha256: str
    source_record_count: int
    measurement_count: int
    unresolved_source_record_count: int
    conflict_count: int


class ReviewedSliceDataQualityService[SliceContractT]:
    """Validate the complete reviewed source-fact closure and calculate its stable fingerprint."""

    def __init__(
        self,
        repository: CatalogDataQualityRepository,
        command_builder: Callable[[SliceContractT], tuple[IngestReviewedDatasetCommand, ...]],
        slice_loader: Callable[[str], SliceContractT] | None = None,
        expected_state_sha256: str | None = REVIEWED_STATE_SHA256,
    ) -> None:
        self._repository = repository
        self._command_builder = command_builder
        self._slice_loader = (
            cast(Callable[[str], SliceContractT], load_reviewed_slice)
            if slice_loader is None
            else slice_loader
        )
        self._expected_state_sha256 = expected_state_sha256

    async def check(self, slice_id: str) -> ReviewedSliceDataCheckResult:
        """Fail closed unless immutable artifact, metadata, provenance, and facts all agree."""
        started = perf_counter()
        try:
            slice_contract = self._slice_loader(slice_id)
            commands = self._command_builder(slice_contract)
            contract = cast(ReviewedSliceContract, slice_contract)
            state = await self._repository.load_slice_state(contract)
            self._validate_state(contract, state, commands)
            state_sha256 = _state_fingerprint(contract, state)
            if (
                self._expected_state_sha256 is not None
                and state_sha256 != self._expected_state_sha256
            ):
                raise ReviewedSlicePolicyRejected()
            result = ReviewedSliceDataCheckResult(
                slice_id=contract.slice_id,
                artifact_sha256=contract.artifact.sha256,
                state_sha256=state_sha256,
                source_record_count=len(state.source_records),
                measurement_count=len(state.measurements),
                unresolved_source_record_count=0,
                conflict_count=0,
            )
            _LOGGER.info(
                "catalog.data_check.completed",
                extra={
                    "slice_event": "catalog.data_check.completed",
                    "slice_id": result.slice_id,
                    "status": "passed",
                    "source_record_count": result.source_record_count,
                    "measurement_count": result.measurement_count,
                    "conflict_count": result.conflict_count,
                    "unresolved_source_record_count": result.unresolved_source_record_count,
                    "duration_ms": _elapsed_milliseconds(started),
                },
            )
            return result
        except (CatalogReadError, ReviewedSliceError) as error:
            _LOGGER.warning(
                "catalog.data_check.failed",
                extra={
                    "slice_event": "catalog.data_check.failed",
                    "status": "failed",
                    "error_category": error.code,
                    "duration_ms": _elapsed_milliseconds(started),
                },
            )
            raise
        except Exception:
            _LOGGER.warning(
                "catalog.data_check.failed",
                extra={
                    "slice_event": "catalog.data_check.failed",
                    "status": "failed",
                    "error_category": ReviewedSlicePolicyRejected.code,
                    "duration_ms": _elapsed_milliseconds(started),
                },
            )
            raise ReviewedSlicePolicyRejected() from None

    @staticmethod
    def _validate_state(
        slice_contract: ReviewedSliceContract,
        state: SliceDatabaseState,
        commands: tuple[IngestReviewedDatasetCommand, ...],
    ) -> None:
        if (
            type(state) is not SliceDatabaseState
            or len(commands) != slice_contract.expected.source_records
            or state.provider is None
            or state.dataset is None
            or state.unit is None
            or state.conflicts
        ):
            raise ReviewedSlicePolicyRejected()
        source_manifest = slice_contract.source_manifest
        data_manifest = slice_contract.data_manifest
        provider = state.provider
        dataset = state.dataset
        if (
            provider.code != slice_contract.provider.code
            or provider.name != slice_contract.provider.name
            or provider.documentation_url != source_manifest.official_documentation_url
            or provider.terms_url != source_manifest.terms_or_licence_url
            or provider.attribution_text != source_manifest.attribution_text
            or dataset.provider_id != provider.id
            or dataset.code != slice_contract.dataset.code
            or dataset.name != slice_contract.dataset.name
            or dataset.release_version != slice_contract.dataset.release_version
            or dataset.source_url != data_manifest.official_url
            or dataset.licence != data_manifest.terms_or_licence
            or dataset.citation != data_manifest.citation
        ):
            raise ReviewedSlicePolicyRejected()
        _require_exact_entities(slice_contract, state)
        _require_exact_vocabulary(slice_contract, state)
        _require_exact_source_facts(slice_contract, state, commands)


def _require_exact_entities(
    slice_contract: ReviewedSliceContract, state: SliceDatabaseState
) -> None:
    expected = {
        entity.id: (entity.entity_type, entity.canonical_name) for entity in slice_contract.entities
    }
    actual = {entity.id: (entity.entity_type, entity.canonical_name) for entity in state.entities}
    if len(actual) != len(state.entities) or actual != expected:
        raise ReviewedSlicePolicyRejected()


def _require_exact_vocabulary(
    slice_contract: ReviewedSliceContract, state: SliceDatabaseState
) -> None:
    if state.unit is None:
        raise ReviewedSlicePolicyRejected()
    expected_quantities = {
        quantity.id: (quantity.code, quantity.name) for quantity in slice_contract.quantities
    }
    actual_quantities = {
        quantity.id: (quantity.code, quantity.name) for quantity in state.quantities
    }
    expected_pairs = {
        (pair.quantity_id, pair.unit_id) for pair in slice_contract.compatibility_pairs
    }
    actual_pairs = {(pair.quantity_id, pair.unit_id) for pair in state.pairs}
    if (
        len(actual_quantities) != len(state.quantities)
        or actual_quantities != expected_quantities
        or (state.unit.id, state.unit.code, state.unit.symbol, state.unit.name)
        != (
            slice_contract.unit.id,
            slice_contract.unit.code,
            slice_contract.unit.symbol,
            slice_contract.unit.name,
        )
        or len(actual_pairs) != len(state.pairs)
        or actual_pairs != expected_pairs
    ):
        raise ReviewedSlicePolicyRejected()


def _require_exact_source_facts(
    slice_contract: ReviewedSliceContract,
    state: SliceDatabaseState,
    commands: tuple[IngestReviewedDatasetCommand, ...],
) -> None:
    expected_commands = {command.source_record.provider_record_id: command for command in commands}
    sources = {source.provider_record_id: source for source in state.source_records}
    if (
        len(sources) != len(state.source_records)
        or len(sources) != slice_contract.expected.source_records
        or set(sources) != set(expected_commands)
    ):
        raise ReviewedSlicePolicyRejected()
    measurements_by_source: dict[UUID, list[SliceMeasurement]] = {}
    for measurement in state.measurements:
        measurements_by_source.setdefault(measurement.source_record_id, []).append(measurement)
    if len(state.measurements) != slice_contract.expected.measurements:
        raise ReviewedSlicePolicyRejected()
    for provider_record_id, source in sources.items():
        command = expected_commands[provider_record_id]
        record = command.source_record
        if (
            source.provider_id != state.provider.id  # type: ignore[union-attr]
            or source.dataset_id != state.dataset.id  # type: ignore[union-attr]
            or source.provider_version != record.provider_version
            or source.entity_id != record.canonical_entity_id
            or source.source_url != record.source_url
            or source.fetched_at != record.fetched_at
            or source.adapter_id != command.source_manifest.adapter_id
            or source.adapter_version != command.source_manifest.adapter_version
            or source.parser_version != command.data_manifest.parser_version
            or source.normalized_content_sha256 != normalized_source_content_sha256(command)
        ):
            raise ReviewedSlicePolicyRejected()
        expected_measurements = {
            measurement.source_fact_key: measurement for measurement in record.measurements
        }
        actual_measurements = {
            measurement.source_fact_key: measurement
            for measurement in measurements_by_source.get(source.id, [])
        }
        if len(actual_measurements) != len(measurements_by_source.get(source.id, [])) or set(
            actual_measurements
        ) != set(expected_measurements):
            raise ReviewedSlicePolicyRejected()
        quantity_ids = {quantity.code: quantity.id for quantity in slice_contract.quantities}
        for source_fact_key, expected in expected_measurements.items():
            actual = actual_measurements[source_fact_key]
            if (
                actual.entity_id != record.canonical_entity_id
                or actual.quantity_id != quantity_ids[expected.quantity_code]
                or actual.unit_id != slice_contract.unit.id
                or actual.value_numeric != expected.value_numeric
                or not actual.value_numeric.is_finite()
                or str(actual.value_numeric) != str(expected.value_numeric)
                or actual.original_value != expected.original_value
                or actual.original_unit != expected.original_unit
            ):
                raise ReviewedSlicePolicyRejected()


def _fingerprint_timestamp(value: datetime) -> str:
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ReviewedSlicePolicyRejected()
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _elapsed_milliseconds(started: float) -> int:
    return max(0, int((perf_counter() - started) * 1000))


def _state_fingerprint(slice_contract: ReviewedSliceContract, state: SliceDatabaseState) -> str:
    """Hash only durable reviewed source-slice facts, never local surrogate or selection state."""
    if state.provider is None or state.dataset is None or state.unit is None:
        raise ReviewedSlicePolicyRejected()
    quantity_by_id = {quantity.id: quantity for quantity in slice_contract.quantities}
    source_by_id = {source.id: source for source in state.source_records}
    document = {
        "artifact": {
            "byte_length": slice_contract.artifact.byte_length,
            "path": slice_contract.artifact.path,
            "sha256": slice_contract.artifact.sha256,
        },
        "dataset": {
            "citation": state.dataset.citation,
            "code": state.dataset.code,
            "licence": state.dataset.licence,
            "name": state.dataset.name,
            "release_version": state.dataset.release_version,
            "source_url": state.dataset.source_url,
        },
        "entities": [
            {"id": str(entity.id), "name": entity.canonical_name, "type": entity.entity_type}
            for entity in sorted(state.entities, key=lambda item: str(item.id))
        ],
        "fingerprint_schema_version": _FINGERPRINT_SCHEMA_VERSION,
        "manifests": {
            "data": {
                "path": slice_contract.data_manifest_path,
                "sha256": hashlib.sha256(
                    serialize_manifest(slice_contract.data_manifest)
                ).hexdigest(),
            },
            "source": {
                "path": slice_contract.source_manifest_path,
                "sha256": hashlib.sha256(
                    serialize_manifest(slice_contract.source_manifest)
                ).hexdigest(),
            },
        },
        "measurements": [
            {
                "original_unit": measurement.original_unit,
                "original_value": measurement.original_value,
                "provider_record_id": source_by_id[measurement.source_record_id].provider_record_id,
                "quantity": {
                    "code": quantity_by_id[measurement.quantity_id].code,
                    "id": str(measurement.quantity_id),
                },
                "source_fact_key": measurement.source_fact_key,
                "unit": {"code": state.unit.code, "id": str(measurement.unit_id)},
                "value_decimal": str(measurement.value_numeric),
            }
            for measurement in sorted(
                state.measurements,
                key=lambda item: (
                    source_by_id[item.source_record_id].provider_record_id,
                    item.source_fact_key,
                ),
            )
        ],
        "pairs": [
            {"quantity_id": str(pair.quantity_id), "unit_id": str(pair.unit_id)}
            for pair in sorted(
                state.pairs,
                key=lambda item: (str(item.quantity_id), str(item.unit_id)),
            )
        ],
        "provider": {
            "attribution_text": state.provider.attribution_text,
            "code": state.provider.code,
            "documentation_url": state.provider.documentation_url,
            "name": state.provider.name,
            "terms_url": state.provider.terms_url,
        },
        "quantities": [
            {
                "code": quantity.code,
                "id": str(quantity.id),
                "name": quantity.name,
                "source_fact_key": quantity.source_fact_key,
            }
            for quantity in sorted(slice_contract.quantities, key=lambda item: item.code)
        ],
        "source_records": [
            {
                "adapter_id": source.adapter_id,
                "adapter_version": source.adapter_version,
                "entity_id": str(source.entity_id),
                "fetched_at": _fingerprint_timestamp(source.fetched_at),
                "normalized_content_sha256": source.normalized_content_sha256,
                "parser_version": source.parser_version,
                "provider_record_id": source.provider_record_id,
                "provider_version": source.provider_version,
                "source_url": source.source_url,
            }
            for source in sorted(
                state.source_records,
                key=lambda item: int(item.provider_record_id),
            )
        ],
        "slice_id": slice_contract.slice_id,
        "unit": {
            "code": state.unit.code,
            "id": str(state.unit.id),
            "name": state.unit.name,
            "symbol": state.unit.symbol,
        },
    }
    try:
        encoded = json.dumps(
            document,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, UnicodeError, ValueError):
        raise ReviewedSlicePolicyRejected() from None
    return hashlib.sha256(encoded).hexdigest()


__all__ = [
    "CatalogDataQualityRepository",
    "ReviewedSliceDataCheckResult",
    "ReviewedSliceDataQualityService",
    "SliceCompatibilityPair",
    "SliceConflict",
    "SliceDatabaseState",
    "SliceDataset",
    "SliceEntity",
    "SliceMeasurement",
    "SliceProvider",
    "SliceQuantity",
    "SliceSourceRecord",
    "SliceUnit",
]
