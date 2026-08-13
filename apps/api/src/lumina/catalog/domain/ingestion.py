"""Deterministic, source-preserving catalogue ingestion contracts.

This module intentionally knows nothing about transport, provider execution, SQLAlchemy, or
canonical-selection policy.  It validates the reviewed boundary between a provider adapter and
the one-record transactional persistence capability.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Final, cast
from uuid import UUID

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    Field,
    Strict,
    StrictBool,
    StrictInt,
    StrictStr,
    ValidationError,
    field_validator,
    model_validator,
)

from lumina.provenance.domain.manifests import (
    DataManifest,
    HttpUrl,
    NarrativeText,
    SourceManifest,
    StableToken,
)

_STABLE_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,128}", re.ASCII)
_SHA256_PATTERN = re.compile(r"[0-9a-f]{64}", re.ASCII)
_JSON_NUMBER_PATTERN = re.compile(
    r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?",
    re.ASCII,
)

# These are application resource bounds for source strings stored in existing TEXT columns.  They
# do not reinterpret a provider's science and intentionally do not create a new schema limit.
MAX_NORMALIZED_SOURCE_TEXT_BYTES = 8_192
NORMALIZED_CONTENT_SCHEMA_VERSION = 1
FINGERPRINT_SCHEMA_VERSION = 1
# PostgreSQL's unconstrained ``numeric`` implementation limits.  The migration deliberately
# uses an unconstrained numeric column, so this boundary rejects values PostgreSQL cannot store
# instead of deferring a predictable validation failure to the transaction.
MAX_POSTGRES_NUMERIC_INTEGER_DIGITS = 131_072
MAX_POSTGRES_NUMERIC_FRACTIONAL_DIGITS = 16_383


class CatalogIngestionError(RuntimeError):
    """Base class for stable, non-evidentiary ingestion failures."""

    code: str
    safe_message: str

    def __init__(self) -> None:
        super().__init__(self.safe_message)

    def __repr__(self) -> str:
        """Prevent source values, URLs, SQL, and exception chains leaking through repr."""
        return f"{type(self).__name__}(code={self.code!r})"


class CatalogIngestionValidationRejected(CatalogIngestionError, ValueError):
    """The command did not satisfy the strict normalized ingestion boundary."""

    code = "catalog.ingestion_validation_rejected"
    safe_message = "The catalogue ingestion command was rejected."


class CatalogUnknownEntity(CatalogIngestionError):
    """A reviewed canonical entity UUID could not be resolved exactly."""

    code = "catalog.unknown_entity"
    safe_message = "The reviewed canonical entity was not found."


class CatalogUnknownVocabulary(CatalogIngestionError):
    """A reviewed quantity/unit reference could not be resolved exactly."""

    code = "catalog.unknown_vocabulary"
    safe_message = "The reviewed measurement vocabulary was not found."


class CatalogIngestionContention(CatalogIngestionError):
    """The short ingestion transaction exceeded its bounded database wait."""

    code = "catalog.ingestion_contention"
    safe_message = "Catalogue ingestion timed out while waiting for database contention."


class CatalogStorageUnavailable(CatalogIngestionError):
    """The confirmed database transport is temporarily unavailable."""

    code = "catalog.storage_unavailable"
    safe_message = "Catalogue ingestion storage is temporarily unavailable."


class CatalogDatabaseStateFailure(CatalogIngestionError):
    """Persisted state or an integrity invariant was unexpectedly inconsistent."""

    code = "catalog.database_state_failure"
    safe_message = "Catalogue ingestion failed because database state is inconsistent."


class CatalogDatabaseProgrammingFailure(CatalogIngestionError):
    """The database schema, ACLs, or SQL programming is incompatible with ingestion."""

    code = "catalog.database_programming_failure"
    safe_message = "Catalogue ingestion failed because database operations are incompatible."


class CatalogDatabaseOperationFailure(CatalogIngestionError):
    """An otherwise unclassified database operation failed safely."""

    code = "catalog.database_operation_failure"
    safe_message = "Catalogue ingestion database operation failed."


class CatalogIngestionOutcomeUnknown(CatalogIngestionError):
    """A commit acknowledgement cannot prove or disprove the resulting outcome."""

    code = "catalog.ingestion_outcome_unknown"
    safe_message = "Catalogue ingestion outcome is unknown."


_CATALOG_INGESTION_ERROR_TYPES: Final = (
    CatalogIngestionValidationRejected,
    CatalogUnknownEntity,
    CatalogUnknownVocabulary,
    CatalogIngestionContention,
    CatalogStorageUnavailable,
    CatalogDatabaseStateFailure,
    CatalogDatabaseProgrammingFailure,
    CatalogDatabaseOperationFailure,
    CatalogIngestionOutcomeUnknown,
)


def is_catalog_ingestion_error(error: BaseException) -> bool:
    """Accept only the closed catalogue-ingestion failure taxonomy."""
    return type(error) in _CATALOG_INGESTION_ERROR_TYPES


def _contains_disallowed_character(value: str) -> bool:
    return any(unicodedata.category(character) in {"Cc", "Cs"} for character in value)


def _utf8_byte_length(value: str) -> int:
    try:
        return len(value.encode("utf-8"))
    except UnicodeEncodeError as error:
        del error
        raise ValueError("text is not valid UTF-8") from None


def _validate_exact_source_text(value: str) -> str:
    if (
        not value
        or not value.strip()
        or _contains_disallowed_character(value)
        or _utf8_byte_length(value) > MAX_NORMALIZED_SOURCE_TEXT_BYTES
    ):
        raise ValueError("invalid exact source text")
    return value


def _validate_original_value(value: str) -> str:
    if (
        _JSON_NUMBER_PATTERN.fullmatch(value) is None
        or not value.isascii()
        or _utf8_byte_length(value) > MAX_NORMALIZED_SOURCE_TEXT_BYTES
    ):
        raise ValueError("invalid original numeric lexeme")
    return value


def _validate_original_unit(value: str) -> str:
    # This is source text, not a normalized display unit.  Preserve its spelling and whitespace
    # exactly; the schema only requires a nonempty, control-free value.
    if (
        not value
        or _contains_disallowed_character(value)
        or _utf8_byte_length(value) > MAX_NORMALIZED_SOURCE_TEXT_BYTES
    ):
        raise ValueError("invalid original unit")
    _utf8_byte_length(value)
    return value


def _validate_source_fact_key(value: str) -> str:
    parts = value.split(":")
    if len(parts) not in {1, 2} or any(
        _STABLE_TOKEN_PATTERN.fullmatch(part) is None for part in parts
    ):
        raise ValueError("invalid stable source fact key")
    return value


def _validate_sha256(value: str) -> str:
    if _SHA256_PATTERN.fullmatch(value) is None:
        raise ValueError("invalid SHA-256 digest")
    return value


def _validate_finite_decimal(value: Decimal) -> Decimal:
    if not value.is_finite():
        raise ValueError("numeric value must be finite")

    exponent = value.as_tuple().exponent
    if not isinstance(exponent, int):  # Defensive: finite Decimals have an integer exponent.
        raise ValueError("numeric value has an invalid exponent")
    fractional_digits = max(-exponent, 0)
    if fractional_digits > MAX_POSTGRES_NUMERIC_FRACTIONAL_DIGITS:
        raise ValueError("numeric value exceeds PostgreSQL numeric bounds")
    if value.is_zero():
        # A positive-exponent zero is still zero in PostgreSQL; only its requested fractional
        # scale can exceed the numeric implementation bound.
        return value

    integer_digits = max(value.adjusted() + 1, 0)
    if integer_digits > MAX_POSTGRES_NUMERIC_INTEGER_DIGITS:
        raise ValueError("numeric value exceeds PostgreSQL numeric bounds")
    return value


def _decimal_wire_text(value: Decimal) -> str:
    """Keep the caller's Decimal scale without a float or locale conversion."""
    return str(value)


ExactSourceText = Annotated[StrictStr, AfterValidator(_validate_exact_source_text)]
StableSourceFactKey = Annotated[StrictStr, AfterValidator(_validate_source_fact_key)]
FiniteDecimal = Annotated[Decimal, Strict(), AfterValidator(_validate_finite_decimal)]
OriginalNumericLexeme = Annotated[StrictStr, AfterValidator(_validate_original_value)]
OriginalUnitText = Annotated[StrictStr, AfterValidator(_validate_original_unit)]


class _IngestionModel(BaseModel):
    """Make every accepted ingestion DTO immutable, strict, and closed to extra fields."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    def __repr__(self) -> str:
        """Keep source URLs, source text, evidence, and identifiers out of diagnostics."""
        return f"{type(self).__name__}(<redacted>)"

    def __str__(self) -> str:
        """Keep normal string conversion as redacted as representation."""
        return self.__repr__()


class NormalizedMeasurement(_IngestionModel):
    """One source-preserving numeric fact with an adapter-defined stable key."""

    source_fact_key: StableSourceFactKey
    quantity_code: StableToken
    unit_code: StableToken
    value_numeric: FiniteDecimal
    original_value: OriginalNumericLexeme
    original_unit: OriginalUnitText

    @model_validator(mode="after")
    def _validate_original_numeric_integrity(self) -> NormalizedMeasurement:
        if Decimal(self.original_value) != self.value_numeric:
            raise ValueError("original numeric lexeme does not match numeric value")
        return self


class NormalizedSourceRecord(_IngestionModel):
    """One fully normalized provider record, independent of provider payload DTOs."""

    provider_record_id: ExactSourceText
    provider_version: ExactSourceText
    canonical_entity_id: UUID | None
    source_url: HttpUrl | None
    fetched_at: datetime
    measurements: tuple[NormalizedMeasurement, ...]

    @field_validator("fetched_at")
    @classmethod
    def _validate_fetched_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() != timedelta(0):
            raise ValueError("fetched timestamp must be UTC-aware")
        return value.astimezone(UTC)

    @field_validator("measurements")
    @classmethod
    def _canonicalize_measurements(
        cls,
        value: tuple[NormalizedMeasurement, ...],
    ) -> tuple[NormalizedMeasurement, ...]:
        if not value:
            raise ValueError("source record must contain measurements")
        fact_keys = [measurement.source_fact_key for measurement in value]
        if len(fact_keys) != len(set(fact_keys)):
            raise ValueError("source record contains duplicate source fact keys")
        return tuple(sorted(value, key=lambda measurement: measurement.source_fact_key))


class IngestReviewedDatasetCommand(_IngestionModel):
    """The single reviewed, manifest-backed request accepted for one source record."""

    source_manifest: SourceManifest
    data_manifest: DataManifest
    dataset_name: NarrativeText
    source_record: NormalizedSourceRecord

    @model_validator(mode="after")
    def _validate_manifest_and_fact_contract(self) -> IngestReviewedDatasetCommand:
        if self.data_manifest.source_id != self.source_manifest.source_id:
            raise ValueError("data manifest source identity does not match source manifest")
        declared_fields = set(self.source_manifest.normalized_fields)
        if any(
            measurement.source_fact_key.split(":", 1)[0] not in declared_fields
            for measurement in self.source_record.measurements
        ):
            raise ValueError("source fact key references an undeclared normalized field")
        return self


class PreparedCatalogIngestion(_IngestionModel):
    """Validated command plus application-allocated, non-scientific UUIDv4 surrogates."""

    command: IngestReviewedDatasetCommand
    provider_id: UUID
    dataset_id: UUID
    source_record_id: UUID
    measurement_ids: tuple[UUID, ...]

    @model_validator(mode="after")
    def _validate_allocations(self) -> PreparedCatalogIngestion:
        # ``model_copy(update=...)`` bypasses Pydantic validation.  Rebuild the command from its
        # primitive fields so this persistence-facing DTO never carries a forged nested model.
        object.__setattr__(self, "command", validate_ingestion_command(self.command))
        identifiers = (
            self.provider_id,
            self.dataset_id,
            self.source_record_id,
            *self.measurement_ids,
        )
        if any(identifier.version != 4 for identifier in identifiers):
            raise ValueError("prepared catalogue identifiers must be UUIDv4")
        if len(self.measurement_ids) != len(self.command.source_record.measurements):
            raise ValueError("prepared measurement identifiers do not match source facts")
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("prepared catalogue identifiers must be distinct")
        return self


def _fresh_source_manifest(value: object) -> SourceManifest:
    if type(value) is not SourceManifest:
        raise CatalogIngestionValidationRejected()
    try:
        return SourceManifest.model_validate(
            {name: getattr(value, name) for name in SourceManifest.model_fields},
            strict=True,
        )
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


def _fresh_data_manifest(value: object) -> DataManifest:
    if type(value) is not DataManifest:
        raise CatalogIngestionValidationRejected()
    try:
        return DataManifest.model_validate(
            {name: getattr(value, name) for name in DataManifest.model_fields},
            strict=True,
        )
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


def _fresh_measurement(value: object) -> NormalizedMeasurement:
    if type(value) is not NormalizedMeasurement:
        raise CatalogIngestionValidationRejected()
    try:
        return NormalizedMeasurement.model_validate(
            {
                "source_fact_key": value.source_fact_key,
                "quantity_code": value.quantity_code,
                "unit_code": value.unit_code,
                "value_numeric": value.value_numeric,
                "original_value": value.original_value,
                "original_unit": value.original_unit,
            },
            strict=True,
        )
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


def _fresh_source_record(value: object) -> NormalizedSourceRecord:
    if type(value) is not NormalizedSourceRecord:
        raise CatalogIngestionValidationRejected()
    try:
        measurements = tuple(_fresh_measurement(item) for item in value.measurements)
        return NormalizedSourceRecord.model_validate(
            {
                "provider_record_id": value.provider_record_id,
                "provider_version": value.provider_version,
                "canonical_entity_id": value.canonical_entity_id,
                "source_url": value.source_url,
                "fetched_at": value.fetched_at,
                "measurements": measurements,
            },
            strict=True,
        )
    except CatalogIngestionError:
        raise
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


def _validate_persistence_text_bounds(command: IngestReviewedDatasetCommand) -> None:
    """Bound every command string written into an existing unbounded ``TEXT`` column."""
    source = command.source_manifest
    dataset = command.data_manifest
    record = command.source_record
    values = (
        source.source_name,
        source.official_documentation_url,
        source.terms_or_licence_url,
        source.attribution_text,
        command.dataset_name,
        dataset.official_url,
        dataset.terms_or_licence,
        dataset.citation,
        record.provider_record_id,
        record.provider_version,
    )
    for value in values:
        _validate_exact_source_text(value)
    if record.source_url is not None:
        _validate_exact_source_text(record.source_url)


def validate_ingestion_command(value: object) -> IngestReviewedDatasetCommand:
    """Revalidate a command defensively before hashing or persistence.

    Frozen Pydantic models prevent ordinary mutation, but ``model_copy(update=...)`` intentionally
    bypasses validation.  This function reconstructs every nested boundary value so public
    ingestion entry points retain their strict contract even when handed such a copy.
    """
    if type(value) is not IngestReviewedDatasetCommand:
        raise CatalogIngestionValidationRejected()
    try:
        command = IngestReviewedDatasetCommand.model_validate(
            {
                "source_manifest": _fresh_source_manifest(value.source_manifest),
                "data_manifest": _fresh_data_manifest(value.data_manifest),
                "dataset_name": value.dataset_name,
                "source_record": _fresh_source_record(value.source_record),
            },
            strict=True,
        )
        _validate_persistence_text_bounds(command)
        return command
    except CatalogIngestionError:
        raise
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


class CatalogIngestionStatus(StrEnum):
    """The only normal ingestion outcomes."""

    INSERTED = "inserted"
    REPLAYED = "replayed"
    UNRESOLVED = "unresolved"
    CONFLICT = "conflict"


class IngestionRecordState(StrEnum):
    """Closed provider/dataset/source-record reconciliation states."""

    INSERTED = "inserted"
    EXISTING = "existing"
    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"


class IngestionConflictCategory(StrEnum):
    """The complete durable conflict taxonomy for immutable identity claims."""

    PROVIDER_METADATA_MISMATCH = "provider_metadata_mismatch"
    DATASET_METADATA_MISMATCH = "dataset_metadata_mismatch"
    SOURCE_RECORD_CONTENT_MISMATCH = "source_record_content_mismatch"
    SOURCE_RECORD_ENTITY_MISMATCH = "source_record_entity_mismatch"
    MEASUREMENT_FACT_MISMATCH = "measurement_fact_mismatch"


class IngestionConflictStatus(StrEnum):
    """Lifecycle state returned for a deduplicated persisted conflict report."""

    OPEN = "open"
    RESOLVED = "resolved"


class ConflictReference(_IngestionModel):
    """A safe pointer to a persistent conflict, without its evidence payload."""

    fingerprint: Annotated[StrictStr, AfterValidator(_validate_sha256)]
    category: IngestionConflictCategory
    status: IngestionConflictStatus


class CatalogIngestionOutcome(_IngestionModel):
    """Safe aggregate result for exactly one atomic normalized source-record attempt."""

    status: CatalogIngestionStatus
    provider_state: IngestionRecordState
    dataset_state: IngestionRecordState
    source_record_state: IngestionRecordState
    source_record_id: UUID | None
    inserted_measurement_count: Annotated[StrictInt, Field(ge=0)]
    existing_measurement_count: Annotated[StrictInt, Field(ge=0)]
    competing_measurement_count: Annotated[StrictInt, Field(ge=0)]
    scientific_disagreement_count: Annotated[StrictInt, Field(ge=0)]
    canonical_review_required: StrictBool
    conflicts: tuple[ConflictReference, ...]

    @field_validator("conflicts")
    @classmethod
    def _canonicalize_conflicts(
        cls,
        value: tuple[ConflictReference, ...],
    ) -> tuple[ConflictReference, ...]:
        fingerprints = [conflict.fingerprint for conflict in value]
        if len(fingerprints) != len(set(fingerprints)):
            raise ValueError("outcome contains duplicate conflict references")
        return tuple(sorted(value, key=lambda conflict: conflict.fingerprint))

    @model_validator(mode="after")
    def _validate_record_state_scopes(self) -> CatalogIngestionOutcome:
        provenance_states = {IngestionRecordState.INSERTED, IngestionRecordState.EXISTING}
        if (
            self.provider_state not in provenance_states
            or self.dataset_state not in provenance_states
        ):
            raise ValueError("provider and dataset states must be inserted or existing")
        all_counts = (
            self.inserted_measurement_count,
            self.existing_measurement_count,
            self.competing_measurement_count,
            self.scientific_disagreement_count,
        )
        if self.scientific_disagreement_count > self.competing_measurement_count:
            raise ValueError("scientific disagreements cannot exceed competing measurements")
        if self.status is CatalogIngestionStatus.INSERTED:
            if (
                self.source_record_id is None
                or self.source_record_state
                not in {IngestionRecordState.INSERTED, IngestionRecordState.RESOLVED}
                or self.inserted_measurement_count == 0
                or self.existing_measurement_count != 0
                or self.conflicts
            ):
                raise ValueError("inserted outcome has incompatible state")
        elif self.status is CatalogIngestionStatus.REPLAYED:
            if (
                self.source_record_id is None
                or self.source_record_state is not IngestionRecordState.EXISTING
                or self.inserted_measurement_count != 0
                or self.conflicts
            ):
                raise ValueError("replayed outcome has incompatible state")
        elif self.status is CatalogIngestionStatus.UNRESOLVED:
            if (
                self.source_record_id is None
                or self.source_record_state is not IngestionRecordState.UNRESOLVED
                or any(all_counts)
                or self.canonical_review_required
                or self.conflicts
            ):
                raise ValueError("unresolved outcome has incompatible state")
        elif self.status is CatalogIngestionStatus.CONFLICT and (
            self.inserted_measurement_count != 0 or not self.conflicts
        ):
            raise ValueError("conflict outcome has incompatible state")
        return self


def _fresh_conflict_reference(value: object) -> ConflictReference:
    if type(value) is not ConflictReference:
        raise CatalogIngestionValidationRejected()
    try:
        return ConflictReference.model_validate(
            {
                "fingerprint": value.fingerprint,
                "category": value.category,
                "status": value.status,
            },
            strict=True,
        )
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


def validate_catalog_ingestion_outcome(value: object) -> CatalogIngestionOutcome:
    """Rebuild a store result before it reaches logging or a caller."""
    if type(value) is not CatalogIngestionOutcome:
        raise CatalogIngestionValidationRejected()
    try:
        return CatalogIngestionOutcome.model_validate(
            {
                "status": value.status,
                "provider_state": value.provider_state,
                "dataset_state": value.dataset_state,
                "source_record_state": value.source_record_state,
                "source_record_id": value.source_record_id,
                "inserted_measurement_count": value.inserted_measurement_count,
                "existing_measurement_count": value.existing_measurement_count,
                "competing_measurement_count": value.competing_measurement_count,
                "scientific_disagreement_count": value.scientific_disagreement_count,
                "canonical_review_required": value.canonical_review_required,
                "conflicts": tuple(_fresh_conflict_reference(item) for item in value.conflicts),
            },
            strict=True,
        )
    except CatalogIngestionError:
        raise
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogIngestionValidationRejected() from None


def _canonical_json_bytes(document: object) -> bytes:
    """Return the one explicit JSON wire representation used for immutable hashes."""
    try:
        rendered = json.dumps(
            document,
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        return rendered.encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError) as error:
        del error
        raise CatalogIngestionValidationRejected() from None


def normalized_source_content_bytes(command: IngestReviewedDatasetCommand) -> bytes:
    """Serialize the immutable normalized content whose SHA-256 identifies a replay.

    The reviewed canonical entity and fetched-at timestamp deliberately do not participate: entity
    resolution has its own one-way state transition, and a later successful fetch is a replay.
    """
    command = validate_ingestion_command(command)
    source_record = command.source_record
    return _canonical_json_bytes(
        {
            "normalized_content_schema": NORMALIZED_CONTENT_SCHEMA_VERSION,
            "source_id": command.source_manifest.source_id,
            "dataset_id": command.data_manifest.dataset_id,
            "release_version": command.data_manifest.release_version,
            "provider_record_id": source_record.provider_record_id,
            "provider_version": source_record.provider_version,
            "source_url": source_record.source_url,
            "adapter_id": command.source_manifest.adapter_id,
            "adapter_version": command.source_manifest.adapter_version,
            "parser_version": command.data_manifest.parser_version,
            "measurements": [
                {
                    "source_fact_key": measurement.source_fact_key,
                    "quantity_code": measurement.quantity_code,
                    "unit_code": measurement.unit_code,
                    "value_numeric": _decimal_wire_text(measurement.value_numeric),
                    "original_value": measurement.original_value,
                    "original_unit": measurement.original_unit,
                }
                for measurement in source_record.measurements
            ],
        }
    )


def normalized_source_content_sha256(command: IngestReviewedDatasetCommand) -> str:
    """Return the lowercase SHA-256 checksum of immutable normalized source content."""
    return hashlib.sha256(normalized_source_content_bytes(command)).hexdigest()


_UUID_EVIDENCE_KEYS: Final = frozenset(
    {
        "provider_id",
        "dataset_id",
        "source_record_id",
        "measurement_id",
        "canonical_entity_id",
    }
)
_NULLABLE_UUID_EVIDENCE_KEYS: Final = frozenset({"canonical_entity_id"})
_TOKEN_EVIDENCE_KEYS: Final = frozenset(
    {
        "provider_code",
        "dataset_code",
        "release_version",
        "adapter_id",
        "adapter_version",
        "parser_version",
        "quantity_code",
        "unit_code",
    }
)
_TRIMMED_TEXT_EVIDENCE_KEYS: Final = frozenset(
    {
        "name",
        "documentation_url",
        "terms_url",
        "attribution_text",
        "source_url",
        "licence",
        "citation",
    }
)
_MEASUREMENT_EVIDENCE_KEYS: Final = frozenset(
    {
        "quantity_code",
        "unit_code",
        "value_numeric",
        "original_value",
        "original_unit",
    }
)
_SOURCE_METADATA_EVIDENCE_KEYS: Final = frozenset(
    {"source_url", "adapter_id", "adapter_version", "parser_version"}
)
_SOURCE_CONTENT_EVIDENCE_KEYSETS: Final = (
    _SOURCE_METADATA_EVIDENCE_KEYS,
    frozenset({"normalized_content_sha256"}),
    frozenset({"source_fact_keys"}),
)


def _allowed_conflict_evidence_keys(
    category: IngestionConflictCategory,
    section: str,
) -> tuple[frozenset[str], ...]:
    if category is IngestionConflictCategory.PROVIDER_METADATA_MISMATCH:
        return (
            (frozenset({"provider_id", "provider_code"}),)
            if section == "anchor"
            else (frozenset({"name", "documentation_url", "terms_url", "attribution_text"}),)
        )
    if category is IngestionConflictCategory.DATASET_METADATA_MISMATCH:
        return (
            (frozenset({"dataset_id", "dataset_code", "release_version"}),)
            if section == "anchor"
            else (frozenset({"name", "source_url", "licence", "citation"}),)
        )
    if category is IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH:
        return (
            (frozenset({"source_record_id"}),)
            if section == "anchor"
            else _SOURCE_CONTENT_EVIDENCE_KEYSETS
        )
    if category is IngestionConflictCategory.SOURCE_RECORD_ENTITY_MISMATCH:
        return (
            (frozenset({"source_record_id"}),)
            if section == "anchor"
            else (frozenset({"canonical_entity_id"}),)
        )
    if category is IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH:
        return (
            (frozenset({"measurement_id", "source_fact_key"}),)
            if section == "anchor"
            else (_MEASUREMENT_EVIDENCE_KEYS,)
        )
    raise CatalogIngestionValidationRejected()


def _canonical_uuid_evidence(value: object, *, nullable: bool = False) -> str | None:
    if value is None:
        if nullable:
            return None
        raise CatalogIngestionValidationRejected()
    try:
        if isinstance(value, UUID):
            return str(value)
        if type(value) is str:
            return str(UUID(value))
    except ValueError:
        pass
    raise CatalogIngestionValidationRejected()


def _canonical_source_fact_key(value: object) -> str:
    if type(value) is not str:
        raise CatalogIngestionValidationRejected()
    try:
        return _validate_source_fact_key(value)
    except ValueError:
        raise CatalogIngestionValidationRejected() from None


def _canonical_safe_text(value: object, *, trimmed: bool = False) -> str:
    if type(value) is not str:
        raise CatalogIngestionValidationRejected()
    try:
        canonical = _validate_exact_source_text(value)
    except ValueError:
        raise CatalogIngestionValidationRejected() from None
    if trimmed and canonical != canonical.strip():
        raise CatalogIngestionValidationRejected()
    return canonical


def _canonical_source_url_evidence(value: object) -> str | None:
    if value is None:
        return None
    return _canonical_safe_text(value, trimmed=True)


def _canonical_source_fact_keys(value: object) -> list[str]:
    if type(value) not in {tuple, list}:
        raise CatalogIngestionValidationRejected()
    items = cast(tuple[object, ...] | list[object], value)
    keys = [_canonical_source_fact_key(item) for item in items]
    if len(keys) != len(set(keys)):
        raise CatalogIngestionValidationRejected()
    return sorted(keys)


def _canonical_conflict_evidence_value(key: str, value: object) -> object:
    if key in _UUID_EVIDENCE_KEYS:
        return _canonical_uuid_evidence(value, nullable=key in _NULLABLE_UUID_EVIDENCE_KEYS)
    if key in _TOKEN_EVIDENCE_KEYS:
        if type(value) is not str:
            raise CatalogIngestionValidationRejected()
        if _STABLE_TOKEN_PATTERN.fullmatch(value) is None:
            raise CatalogIngestionValidationRejected()
        return value
    if key == "source_fact_key":
        return _canonical_source_fact_key(value)
    if key == "source_fact_keys":
        return _canonical_source_fact_keys(value)
    if key == "normalized_content_sha256":
        if type(value) is not str:
            raise CatalogIngestionValidationRejected()
        try:
            return _validate_sha256(value)
        except ValueError:
            raise CatalogIngestionValidationRejected() from None
    if key in _TRIMMED_TEXT_EVIDENCE_KEYS:
        if key == "source_url":
            return _canonical_source_url_evidence(value)
        return _canonical_safe_text(value, trimmed=True)
    if key in {"value_numeric", "original_value"}:
        if type(value) is not str:
            raise CatalogIngestionValidationRejected()
        try:
            return _validate_original_value(value)
        except ValueError:
            raise CatalogIngestionValidationRejected() from None
    if key == "original_unit":
        if type(value) is not str:
            raise CatalogIngestionValidationRejected()
        try:
            return _validate_original_unit(value)
        except ValueError:
            raise CatalogIngestionValidationRejected() from None
    raise CatalogIngestionValidationRejected()


def _canonical_conflict_object(
    category: IngestionConflictCategory,
    section: str,
    value: Mapping[str, object],
) -> dict[str, object]:
    if not isinstance(value, Mapping):
        raise CatalogIngestionValidationRejected()
    try:
        items = tuple(value.items())
    except (AttributeError, TypeError):
        raise CatalogIngestionValidationRejected() from None
    if any(type(key) is not str for key, _ in items):
        raise CatalogIngestionValidationRejected()
    keys = frozenset(key for key, _ in items)
    allowed_keysets = _allowed_conflict_evidence_keys(category, section)
    keys_are_allowed = (
        keys in allowed_keysets
        if section == "anchor"
        else bool(keys) and any(keys <= allowed for allowed in allowed_keysets)
    )
    if len(keys) != len(items) or not keys_are_allowed:
        raise CatalogIngestionValidationRejected()
    return {
        key: _canonical_conflict_evidence_value(key, nested_value)
        for key, nested_value in sorted(items)
    }


def conflict_fingerprint_bytes(
    category: IngestionConflictCategory | str,
    *,
    anchor: Mapping[str, object],
    existing: Mapping[str, object],
    incoming: Mapping[str, object],
) -> bytes:
    """Canonicalize the versioned, allowlisted conflict fingerprint input.

    Callers supply category-specific minimized evidence only.  This serializer excludes timestamps,
    UUID allocation order, database order, floats, and any raw provider payload representation.
    """
    try:
        selected_category = IngestionConflictCategory(category)
    except (TypeError, ValueError) as error:
        del error
        raise CatalogIngestionValidationRejected() from None
    return _canonical_json_bytes(
        {
            "fingerprint_schema": FINGERPRINT_SCHEMA_VERSION,
            "category": selected_category.value,
            "anchor": _canonical_conflict_object(selected_category, "anchor", anchor),
            "existing": _canonical_conflict_object(selected_category, "existing", existing),
            "incoming": _canonical_conflict_object(selected_category, "incoming", incoming),
        }
    )


def conflict_fingerprint(
    category: IngestionConflictCategory | str,
    *,
    anchor: Mapping[str, object],
    existing: Mapping[str, object],
    incoming: Mapping[str, object],
) -> str:
    """Return the lowercase SHA-256 fingerprint for one immutable conflict claim."""
    return hashlib.sha256(
        conflict_fingerprint_bytes(
            category,
            anchor=anchor,
            existing=existing,
            incoming=incoming,
        )
    ).hexdigest()
