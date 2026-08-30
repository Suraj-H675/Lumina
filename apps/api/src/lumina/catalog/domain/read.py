"""Immutable catalogue read projections and safe persisted-state validation.

The catalogue read boundary deliberately carries no SQL, web-framework, or scientific-selection
policy.  Its projections preserve source values exactly; consumers must not compare, convert, or
otherwise reinterpret alternative measurements.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Annotated, Final
from urllib.parse import unquote, urlsplit
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
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)

from lumina.catalog.domain.identity import (
    CatalogIdentityValidationError,
    validate_public_slug,
)
from lumina.catalog.domain.ingestion import (
    ExactSourceText,
    FiniteDecimal,
    IngestionConflictCategory,
    IngestionConflictStatus,
    OriginalNumericLexeme,
    OriginalUnitText,
    StableSourceFactKey,
    conflict_fingerprint_bytes,
)
from lumina.provenance.domain.manifests import StableToken

_JSON_NUMBER_PATTERN = re.compile(
    r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?",
    re.ASCII,
)
_SHA256_PATTERN = re.compile(r"[0-9a-f]{64}", re.ASCII)
_BASE64URL_PATTERN = re.compile(r"[A-Za-z0-9_-]+", re.ASCII)
_MAX_CURSOR_BYTES = 1_024
_CURSOR_VERSION: Final = 1


class CatalogReadError(RuntimeError):
    """Base class for fixed, non-evidentiary catalogue read failures."""

    code: str
    safe_message: str

    def __init__(self) -> None:
        super().__init__(self.safe_message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(code={self.code!r})"


class CatalogReadValidationRejected(CatalogReadError, ValueError):
    """A UUID, cursor, filter, or read projection failed strict validation."""

    code = "catalog.read_validation_rejected"
    safe_message = "The catalogue read request was invalid."


class CatalogEntityNotFound(CatalogReadError):
    """No public canonical entity exists for an exact UUID."""

    code = "catalog.entity_not_found"
    safe_message = "No matching object was found."


class CatalogSourceRecordNotFound(CatalogReadError):
    """No public source record exists for an exact UUID."""

    code = "catalog.source_record_not_found"
    safe_message = "No matching source record was found."


class CatalogConflictNotFound(CatalogReadError):
    """No persisted operator conflict exists for an exact fingerprint."""

    code = "catalog.conflict_not_found"
    safe_message = "No matching ingestion conflict was found."


class CatalogDataInconsistent(CatalogReadError):
    """A database result violated an accepted catalogue read invariant."""

    code = "catalog.data_inconsistent"
    safe_message = "Catalogue data is inconsistent."


class CatalogReadUnavailable(CatalogReadError):
    """A bounded catalogue read could not reach storage."""

    code = "database.unavailable"
    safe_message = "The database is temporarily unavailable."


class CatalogReadOperationFailure(CatalogReadError):
    """A database operation failed outside recognised safe categories."""

    code = "catalog.read_operation_failed"
    safe_message = "The catalogue read could not be completed."


_READ_ERROR_TYPES: Final = (
    CatalogReadValidationRejected,
    CatalogEntityNotFound,
    CatalogSourceRecordNotFound,
    CatalogConflictNotFound,
    CatalogDataInconsistent,
    CatalogReadUnavailable,
    CatalogReadOperationFailure,
)


def is_catalog_read_error(error: BaseException) -> bool:
    """Return whether ``error`` belongs to the closed read failure taxonomy."""
    return type(error) in _READ_ERROR_TYPES


def validate_public_entity_slug(value: object) -> str:
    """Translate public-identity validation into the catalogue-read taxonomy."""
    if type(value) is not str:
        raise CatalogReadValidationRejected()
    try:
        return validate_public_slug(value)
    except CatalogIdentityValidationError:
        raise CatalogReadValidationRejected() from None


def _validate_nonempty_text(value: str) -> str:
    if not value or value != value.strip() or any(ord(character) < 32 for character in value):
        raise ValueError("invalid text")
    return value


def _validate_exact_numeric_text(value: str) -> str:
    if not value.isascii() or _JSON_NUMBER_PATTERN.fullmatch(value) is None:
        raise ValueError("invalid numeric text")
    return value


def _validate_utc_timestamp(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() != timedelta(0):
        raise ValueError("timestamp must be UTC-aware")
    return value.astimezone(UTC)


def _validate_sha256(value: str) -> str:
    if _SHA256_PATTERN.fullmatch(value) is None:
        raise ValueError("invalid SHA-256 digest")
    return value


def _validate_public_http_url(value: str) -> str:
    """Accept only credential-free HTTP(S) persisted provenance URLs."""
    if not value or value != value.strip() or any(ord(character) < 32 for character in value):
        raise ValueError("invalid URL")
    if any(character.isspace() for character in value) or "\\" in value:
        raise ValueError("invalid URL")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        _ = parsed.port
    except ValueError as error:
        raise ValueError("invalid URL") from error
    # Both literal and percent-encoded userinfo are an unsafe persisted provenance URL.  Reject
    # percent escapes in authority too: a host never needs them, while retaining them can obscure
    # an ambiguous userinfo delimiter from logs or clients.
    authority = parsed.netloc.rsplit("@", 1)[-1]
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or "%" in authority
        or "@" in unquote(parsed.netloc)
    ):
        raise ValueError("invalid URL")
    return value


NarrativeText = Annotated[StrictStr, AfterValidator(_validate_nonempty_text)]
DecimalText = Annotated[StrictStr, AfterValidator(_validate_exact_numeric_text)]
UtcDateTime = Annotated[datetime, Strict(), AfterValidator(_validate_utc_timestamp)]
Sha256 = Annotated[StrictStr, AfterValidator(_validate_sha256)]
PublicHttpUrl = Annotated[StrictStr, AfterValidator(_validate_public_http_url)]


class _ReadModel(BaseModel):
    """Strict immutable records rebuilt at every application boundary."""

    model_config = ConfigDict(
        extra="forbid", frozen=True, strict=True, arbitrary_types_allowed=True
    )

    def __repr__(self) -> str:
        return f"{type(self).__name__}(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class CatalogEntityType(StrEnum):
    """The complete persisted canonical entity classification."""

    STAR = "star"
    PLANET = "planet"
    DWARF_PLANET = "dwarf_planet"
    MOON = "moon"
    ASTEROID = "asteroid"
    COMET = "comet"
    EXOPLANET = "exoplanet"
    GALAXY = "galaxy"
    NEBULA = "nebula"
    CLUSTER = "cluster"
    BLACK_HOLE = "black_hole"
    COMPACT_OBJECT = "compact_object"
    SYSTEM = "system"
    CONSTELLATION = "constellation"
    MISSION = "mission"
    SPACECRAFT = "spacecraft"
    LAUNCH_VEHICLE = "launch_vehicle"
    OBSERVATORY = "observatory"
    PERSON = "person"
    CONCEPT = "concept"
    EVENT = "event"
    SKY_REGION = "sky_region"


class SelectionState(StrEnum):
    """A raw measurement's relationship to immutable selection records."""

    CURRENT = "current"
    HISTORICAL = "historical"
    NEVER_SELECTED = "never_selected"


class Quantity(_ReadModel):
    code: StableToken
    name: NarrativeText


class Unit(_ReadModel):
    code: StableToken
    symbol: NarrativeText
    name: NarrativeText


class CompactProvider(_ReadModel):
    code: StableToken
    name: NarrativeText


class CompactDataset(_ReadModel):
    code: StableToken
    name: NarrativeText
    release_version: StableToken


class CompactSource(_ReadModel):
    source_record_id: UUID
    provider: CompactProvider
    dataset: CompactDataset


class SelectedMeasurement(_ReadModel):
    """A measurement embedded by a current canonical selection."""

    id: UUID
    value: FiniteDecimal
    unit: Unit
    original_value: OriginalNumericLexeme
    original_unit: OriginalUnitText
    source: CompactSource


class CatalogSelection(_ReadModel):
    """Public-safe scientific/editorial selection rationale, never private operations notes."""

    rule: StableToken
    version: StableToken
    explanation: NarrativeText
    selected_at: UtcDateTime


class CurrentCanonicalSelection(_ReadModel):
    measurement: SelectedMeasurement
    selection: CatalogSelection


class EntityQuantity(_ReadModel):
    quantity: Quantity
    measurement_count: Annotated[StrictInt, Field(gt=0)]
    current_selection: CurrentCanonicalSelection | None


class EntityDetail(_ReadModel):
    id: UUID
    entity_type: CatalogEntityType
    canonical_name: NarrativeText
    quantities: tuple[EntityQuantity, ...]

    @field_validator("quantities")
    @classmethod
    def _require_ordered_unique_quantities(
        cls, value: tuple[EntityQuantity, ...]
    ) -> tuple[EntityQuantity, ...]:
        codes = tuple(item.quantity.code for item in value)
        if codes != tuple(sorted(codes)) or len(codes) != len(set(codes)):
            raise ValueError("entity quantities must be ordered and unique")
        return value


class PublicEntitySummary(_ReadModel):
    """The stable, four-field public identity used for navigation reads."""

    id: UUID
    slug: StrictStr
    entity_type: CatalogEntityType
    canonical_name: NarrativeText

    @field_validator("slug", mode="before")
    @classmethod
    def _require_canonical_slug(cls, value: object) -> str:
        return validate_public_entity_slug(value)


class CatalogMeasurement(_ReadModel):
    """One immutable alternative, including its internal stable page-order timestamp."""

    id: UUID
    quantity: Quantity
    value: FiniteDecimal
    unit: Unit
    original_value: OriginalNumericLexeme
    original_unit: OriginalUnitText
    selection_state: SelectionState
    source: CompactSource
    created_at: UtcDateTime


class HistoricalSelection(_ReadModel):
    rule: StableToken
    version: StableToken
    explanation: NarrativeText
    selected_at: UtcDateTime
    superseded_at: UtcDateTime | None

    @model_validator(mode="after")
    def _validate_temporal_order(self) -> HistoricalSelection:
        if self.superseded_at is not None and self.superseded_at < self.selected_at:
            raise ValueError("selection supersession predates selection")
        return self


class SelectionHistoryItem(_ReadModel):
    """One immutable canonical-selection record with its selected source fact."""

    canonical_measurement_id: UUID
    quantity: Quantity
    measurement_id: UUID
    value: FiniteDecimal
    unit: Unit
    source: CompactSource
    selection: HistoricalSelection


class ProviderProvenance(_ReadModel):
    code: StableToken
    name: NarrativeText
    documentation_url: PublicHttpUrl
    terms_url: PublicHttpUrl
    attribution_text: NarrativeText


class DatasetProvenance(_ReadModel):
    code: StableToken
    name: NarrativeText
    release_version: StableToken
    source_url: PublicHttpUrl
    licence: NarrativeText
    citation: NarrativeText


class SourceRecordProvenance(_ReadModel):
    provider_record_id: ExactSourceText
    provider_version: ExactSourceText
    source_url: PublicHttpUrl | None
    fetched_at: UtcDateTime


class SourceProvenance(_ReadModel):
    source_record_id: UUID
    provider: ProviderProvenance
    dataset: DatasetProvenance
    record: SourceRecordProvenance


class MeasurementCursor(_ReadModel):
    entity_id: UUID
    quantity_code: StableToken
    created_at: UtcDateTime
    measurement_id: UUID


class SelectionHistoryCursor(_ReadModel):
    entity_id: UUID
    selected_at: UtcDateTime
    canonical_measurement_id: UUID


class ConflictCursor(_ReadModel):
    status: IngestionConflictStatus
    category: IngestionConflictCategory | None
    last_category: IngestionConflictCategory
    created_at: UtcDateTime
    fingerprint: Sha256


class EntityBrowseCursor(_ReadModel):
    """The unique canonical-slug continuation position for entity navigation."""

    entity_type: CatalogEntityType | None
    slug: StrictStr

    @field_validator("slug", mode="before")
    @classmethod
    def _require_canonical_slug(cls, value: object) -> str:
        return validate_public_entity_slug(value)


class MeasurementSlice(_ReadModel):
    """One repository result containing at most ``limit + 1`` measurement rows."""

    items: tuple[CatalogMeasurement, ...]


class SelectionHistorySlice(_ReadModel):
    """One repository result containing at most ``limit + 1`` selection rows."""

    items: tuple[SelectionHistoryItem, ...]


class EntityBrowseSlice(_ReadModel):
    """One repository result containing at most ``limit + 1`` entity summaries."""

    items: tuple[PublicEntitySummary, ...]


class ConflictAnchor(_ReadModel):
    """The single durable identity to which an ingestion conflict belongs."""

    provider_id: UUID | None = None
    dataset_id: UUID | None = None
    source_record_id: UUID | None = None
    measurement_id: UUID | None = None
    source_fact_key: StableSourceFactKey | None = None

    @model_validator(mode="after")
    def _validate_exact_anchor(self) -> ConflictAnchor:
        identifiers = (
            self.provider_id,
            self.dataset_id,
            self.source_record_id,
            self.measurement_id,
        )
        if sum(identifier is not None for identifier in identifiers) != 1:
            raise ValueError("conflict anchor must name exactly one identity")
        if (self.measurement_id is None) != (self.source_fact_key is None):
            raise ValueError("only a measurement anchor may have a source fact key")
        return self


class IngestionConflictItem(_ReadModel):
    fingerprint: Sha256
    category: IngestionConflictCategory
    anchor: ConflictAnchor
    status: IngestionConflictStatus
    created_at: UtcDateTime
    resolved_at: UtcDateTime | None

    @model_validator(mode="after")
    def _validate_conflict_state(self) -> IngestionConflictItem:
        if (self.status is IngestionConflictStatus.OPEN) != (self.resolved_at is None):
            raise ValueError("conflict status and resolution timestamp disagree")
        expected = {
            IngestionConflictCategory.PROVIDER_METADATA_MISMATCH: "provider_id",
            IngestionConflictCategory.DATASET_METADATA_MISMATCH: "dataset_id",
            IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH: "source_record_id",
            IngestionConflictCategory.SOURCE_RECORD_ENTITY_MISMATCH: "source_record_id",
            IngestionConflictCategory.MEASUREMENT_FACT_MISMATCH: "measurement_id",
        }[self.category]
        if getattr(self.anchor, expected) is None:
            raise ValueError("conflict anchor does not match category")
        return self


@dataclass(frozen=True, repr=False, slots=True)
class IngestionConflictEvidence:
    """Validated full evidence or its deterministic digest-only reduction."""

    _canonical_json: str = field(repr=False)
    evidence_truncated: bool

    def as_object(self) -> dict[str, object]:
        """Return a fresh JSON-safe object for local CLI rendering only."""
        value = json.loads(self._canonical_json)
        if type(value) is not dict:
            raise CatalogReadValidationRejected()
        return value

    def __repr__(self) -> str:
        return "IngestionConflictEvidence(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class IngestionConflictDetail(IngestionConflictItem):
    evidence: IngestionConflictEvidence


class ConflictSlice(_ReadModel):
    """One repository result containing at most ``limit + 1`` conflict rows."""

    items: tuple[IngestionConflictItem, ...]


class MeasurementPage(_ReadModel):
    items: tuple[CatalogMeasurement, ...]
    next_cursor: str | None
    has_more: StrictBool
    limit: Annotated[StrictInt, Field(ge=1, le=100)]


class SelectionHistoryPage(_ReadModel):
    items: tuple[SelectionHistoryItem, ...]
    next_cursor: str | None
    has_more: StrictBool
    limit: Annotated[StrictInt, Field(ge=1, le=100)]


class EntityBrowsePage(_ReadModel):
    items: tuple[PublicEntitySummary, ...]
    next_cursor: str | None
    has_more: StrictBool
    limit: Annotated[StrictInt, Field(ge=1, le=100)]


class ConflictPage(_ReadModel):
    items: tuple[IngestionConflictItem, ...]
    next_cursor: str | None
    has_more: StrictBool
    limit: Annotated[StrictInt, Field(ge=1, le=100)]


def _refresh_model[Model: _ReadModel](model_type: type[Model], value: object) -> Model:
    if type(value) is not model_type:
        raise CatalogReadValidationRejected()
    try:
        return model_type.model_validate(value.model_dump(mode="python"), strict=True)
    except (AttributeError, TypeError, ValidationError, ValueError):
        raise CatalogReadValidationRejected() from None


def validate_entity_detail(value: object) -> EntityDetail:
    return _refresh_model(EntityDetail, value)


def validate_public_entity_summary(value: object) -> PublicEntitySummary:
    return _refresh_model(PublicEntitySummary, value)


def validate_measurement_slice(value: object) -> MeasurementSlice:
    return _refresh_model(MeasurementSlice, value)


def validate_selection_history_slice(value: object) -> SelectionHistorySlice:
    return _refresh_model(SelectionHistorySlice, value)


def validate_entity_browse_slice(value: object) -> EntityBrowseSlice:
    return _refresh_model(EntityBrowseSlice, value)


def validate_source_provenance(value: object) -> SourceProvenance:
    return _refresh_model(SourceProvenance, value)


def validate_conflict_slice(value: object) -> ConflictSlice:
    return _refresh_model(ConflictSlice, value)


def validate_ingestion_conflict_detail(value: object) -> IngestionConflictDetail:
    if (
        type(value) is not IngestionConflictDetail
        or type(value.evidence) is not IngestionConflictEvidence
    ):
        raise CatalogReadValidationRejected()
    try:
        rebuilt = IngestionConflictDetail.model_validate(
            {
                **value.model_dump(mode="python", exclude={"evidence"}),
                "evidence": value.evidence,
            },
            strict=True,
        )
        validate_ingestion_conflict_evidence(
            rebuilt.evidence.as_object(),
            category=rebuilt.category,
            anchor=rebuilt.anchor,
            fingerprint=rebuilt.fingerprint,
        )
        return rebuilt
    except (AttributeError, TypeError, ValidationError, ValueError, json.JSONDecodeError):
        raise CatalogReadValidationRejected() from None


def validate_uuid(value: object) -> UUID:
    if type(value) is not UUID:
        raise CatalogReadValidationRejected()
    return value


def validate_limit(value: object, *, default: int, maximum: int = 100) -> int:
    if value is None:
        return default
    if type(value) is not int or not 1 <= value <= maximum:
        raise CatalogReadValidationRejected()
    return value


def validate_entity_type_filter(value: object | None) -> CatalogEntityType | None:
    """Accept one exact persisted entity-type value or the absence of a filter."""
    if value is None:
        return None
    if type(value) is not str:
        raise CatalogReadValidationRejected()
    try:
        return CatalogEntityType(value)
    except ValueError:
        raise CatalogReadValidationRejected() from None


def validate_fingerprint(value: object) -> str:
    if type(value) is not str:
        raise CatalogReadValidationRejected()
    try:
        return _validate_sha256(value)
    except ValueError:
        raise CatalogReadValidationRejected() from None


def _cursor_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _decode_cursor_payload(value: object, *, expected_kind: str) -> dict[str, object]:
    if (
        type(value) is not str
        or len(value) > _MAX_CURSOR_BYTES
        or _BASE64URL_PATTERN.fullmatch(value) is None
    ):
        raise CatalogReadValidationRejected()
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        if not raw or len(raw) > _MAX_CURSOR_BYTES or not raw.isascii():
            raise ValueError
        if base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") != value:
            raise ValueError
        decoded = json.loads(raw, object_pairs_hook=_no_duplicate_object)
        if type(decoded) is not dict:
            raise ValueError
        canonical = json.dumps(decoded, separators=(",", ":"), sort_keys=True).encode("ascii")
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError):
        raise CatalogReadValidationRejected() from None
    if (
        canonical != raw
        or "v" not in decoded
        or "k" not in decoded
        or type(decoded.get("v")) is not int
        or decoded["v"] != _CURSOR_VERSION
        or type(decoded.get("k")) is not str
        or decoded["k"] != expected_kind
    ):
        raise CatalogReadValidationRejected()
    return decoded


def _no_duplicate_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    output: dict[str, object] = {}
    for key, item in pairs:
        if key in output:
            raise ValueError("duplicate cursor key")
        output[key] = item
    return output


def _decode_uuid(value: object) -> UUID:
    if type(value) is not str:
        raise CatalogReadValidationRejected()
    try:
        return UUID(value)
    except ValueError:
        raise CatalogReadValidationRejected() from None


def _decode_timestamp(value: object) -> datetime:
    if type(value) is not str or not value.endswith("Z"):
        raise CatalogReadValidationRejected()
    try:
        decoded = datetime.fromisoformat(value[:-1] + "+00:00")
        return _validate_utc_timestamp(decoded)
    except ValueError:
        raise CatalogReadValidationRejected() from None


def encode_measurement_cursor(cursor: MeasurementCursor) -> str:
    cursor = _refresh_model(MeasurementCursor, cursor)
    return _encode_cursor(
        {
            "v": _CURSOR_VERSION,
            "k": "measurements",
            "e": str(cursor.entity_id),
            "q": cursor.quantity_code,
            "t": _cursor_timestamp(cursor.created_at),
            "m": str(cursor.measurement_id),
        }
    )


def decode_measurement_cursor(value: object, *, entity_id: UUID) -> MeasurementCursor:
    payload = _decode_cursor_payload(value, expected_kind="measurements")
    if set(payload) != {"v", "k", "e", "q", "t", "m"}:
        raise CatalogReadValidationRejected()
    if type(payload["q"]) is not str:
        raise CatalogReadValidationRejected()
    try:
        cursor = MeasurementCursor(
            entity_id=_decode_uuid(payload["e"]),
            quantity_code=payload["q"],
            created_at=_decode_timestamp(payload["t"]),
            measurement_id=_decode_uuid(payload["m"]),
        )
    except (ValidationError, CatalogReadValidationRejected):
        raise CatalogReadValidationRejected() from None
    if cursor.entity_id != entity_id:
        raise CatalogReadValidationRejected()
    return cursor


def encode_entity_browse_cursor(cursor: EntityBrowseCursor) -> str:
    """Encode a filter-bound canonical-slug continuation cursor."""
    cursor = _refresh_model(EntityBrowseCursor, cursor)
    return _encode_cursor(
        {
            "v": _CURSOR_VERSION,
            "k": "entities",
            "f": cursor.entity_type.value if cursor.entity_type is not None else None,
            "s": cursor.slug,
        }
    )


def decode_entity_browse_cursor(
    value: object,
    *,
    entity_type: CatalogEntityType | None,
) -> EntityBrowseCursor:
    """Decode one canonical entity continuation cursor bound to its active filter."""
    if entity_type is not None and type(entity_type) is not CatalogEntityType:
        raise CatalogReadValidationRejected()
    payload = _decode_cursor_payload(value, expected_kind="entities")
    if set(payload) != {"v", "k", "f", "s"}:
        raise CatalogReadValidationRejected()
    try:
        if payload["f"] is not None and type(payload["f"]) is not str:
            raise CatalogReadValidationRejected()
        cursor = EntityBrowseCursor(
            entity_type=(None if payload["f"] is None else CatalogEntityType(payload["f"])),
            slug=validate_public_entity_slug(payload["s"]),
        )
    except (TypeError, ValueError, ValidationError, CatalogReadValidationRejected):
        raise CatalogReadValidationRejected() from None
    if cursor.entity_type is not entity_type:
        raise CatalogReadValidationRejected()
    return cursor


def encode_selection_history_cursor(cursor: SelectionHistoryCursor) -> str:
    cursor = _refresh_model(SelectionHistoryCursor, cursor)
    return _encode_cursor(
        {
            "v": _CURSOR_VERSION,
            "k": "canonical-selections",
            "e": str(cursor.entity_id),
            "t": _cursor_timestamp(cursor.selected_at),
            "c": str(cursor.canonical_measurement_id),
        }
    )


def decode_selection_history_cursor(value: object, *, entity_id: UUID) -> SelectionHistoryCursor:
    payload = _decode_cursor_payload(value, expected_kind="canonical-selections")
    if set(payload) != {"v", "k", "e", "t", "c"}:
        raise CatalogReadValidationRejected()
    try:
        cursor = SelectionHistoryCursor(
            entity_id=_decode_uuid(payload["e"]),
            selected_at=_decode_timestamp(payload["t"]),
            canonical_measurement_id=_decode_uuid(payload["c"]),
        )
    except (ValidationError, CatalogReadValidationRejected):
        raise CatalogReadValidationRejected() from None
    if cursor.entity_id != entity_id:
        raise CatalogReadValidationRejected()
    return cursor


def encode_conflict_cursor(cursor: ConflictCursor) -> str:
    cursor = _refresh_model(ConflictCursor, cursor)
    return _encode_cursor(
        {
            "v": _CURSOR_VERSION,
            "k": "ingestion-conflicts",
            "s": cursor.status.value,
            "f": cursor.category.value if cursor.category is not None else None,
            "c": cursor.last_category.value,
            "t": _cursor_timestamp(cursor.created_at),
            "p": cursor.fingerprint,
        }
    )


def decode_conflict_cursor(
    value: object,
    *,
    status: IngestionConflictStatus,
    category: IngestionConflictCategory | None,
) -> ConflictCursor:
    payload = _decode_cursor_payload(value, expected_kind="ingestion-conflicts")
    if set(payload) != {"v", "k", "s", "f", "c", "t", "p"}:
        raise CatalogReadValidationRejected()
    try:
        if (
            type(payload["s"]) is not str
            or (payload["f"] is not None and type(payload["f"]) is not str)
            or type(payload["c"]) is not str
        ):
            raise CatalogReadValidationRejected()
        selected_status = IngestionConflictStatus(payload["s"])
        selected_category = (
            None if payload["f"] is None else IngestionConflictCategory(payload["f"])
        )
        cursor = ConflictCursor(
            status=selected_status,
            category=selected_category,
            last_category=IngestionConflictCategory(payload["c"]),
            created_at=_decode_timestamp(payload["t"]),
            fingerprint=validate_fingerprint(payload["p"]),
        )
    except (TypeError, ValueError, ValidationError, CatalogReadValidationRejected):
        raise CatalogReadValidationRejected() from None
    if cursor.status is not status or cursor.category is not category:
        raise CatalogReadValidationRejected()
    return cursor


def _encode_cursor(payload: dict[str, object]) -> str:
    try:
        rendered = json.dumps(payload, separators=(",", ":"), sort_keys=True, allow_nan=False)
        raw = rendered.encode("ascii")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise CatalogReadValidationRejected() from None
    if len(raw) > _MAX_CURSOR_BYTES:
        raise CatalogReadValidationRejected()
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _conflict_anchor_matches(value: object, anchor: ConflictAnchor) -> bool:
    if type(value) is not dict:
        return False
    expected: tuple[str, UUID | str] | None = None
    if anchor.provider_id is not None:
        expected = ("provider_id", anchor.provider_id)
    elif anchor.dataset_id is not None:
        expected = ("dataset_id", anchor.dataset_id)
    elif anchor.source_record_id is not None:
        expected = ("source_record_id", anchor.source_record_id)
    elif anchor.measurement_id is not None and anchor.source_fact_key is not None:
        expected = ("measurement_id", anchor.measurement_id)
        if value.get("source_fact_key") != anchor.source_fact_key:
            return False
    if expected is None:
        return False
    candidate = value.get(expected[0])
    try:
        return UUID(str(candidate)) == expected[1]
    except (TypeError, ValueError, AttributeError):
        return False


def _evidence_probe(category: IngestionConflictCategory) -> dict[str, object]:
    if category is IngestionConflictCategory.PROVIDER_METADATA_MISMATCH:
        return {"name": "fixture"}
    if category is IngestionConflictCategory.DATASET_METADATA_MISMATCH:
        return {"name": "fixture"}
    if category is IngestionConflictCategory.SOURCE_RECORD_CONTENT_MISMATCH:
        return {"normalized_content_sha256": "0" * 64}
    if category is IngestionConflictCategory.SOURCE_RECORD_ENTITY_MISMATCH:
        return {"canonical_entity_id": None}
    return {"quantity_code": "fixture.quantity"}


def _validated_evidence_anchor(
    value: object, *, category: IngestionConflictCategory, anchor: ConflictAnchor
) -> dict[str, object]:
    if type(value) is not dict:
        raise CatalogReadValidationRejected()
    try:
        document = json.loads(
            conflict_fingerprint_bytes(
                category,
                anchor=value,
                existing=_evidence_probe(category),
                incoming=_evidence_probe(category),
            )
        )
    except (CatalogReadValidationRejected, ValueError, TypeError, json.JSONDecodeError):
        raise CatalogReadValidationRejected() from None
    if type(document) is not dict or not _conflict_anchor_matches(document.get("anchor"), anchor):
        raise CatalogReadValidationRejected()
    stored = document.get("anchor")
    if type(stored) is not dict:
        raise CatalogReadValidationRejected()
    return stored


def _validate_evidence_urls(value: object) -> None:
    if type(value) is dict:
        for key, item in value.items():
            if type(key) is not str:
                raise CatalogReadValidationRejected()
            if key in {"documentation_url", "terms_url", "source_url"} and item is not None:
                try:
                    TypeAdapter(PublicHttpUrl).validate_python(item, strict=True)
                except ValidationError:
                    raise CatalogReadValidationRejected() from None
            _validate_evidence_urls(item)
    elif type(value) is list:
        for item in value:
            _validate_evidence_urls(item)


def validate_ingestion_conflict_evidence(
    value: object,
    *,
    category: IngestionConflictCategory,
    anchor: ConflictAnchor,
    fingerprint: str,
) -> IngestionConflictEvidence:
    """Validate the only two persisted, non-payload conflict evidence representations."""
    if type(value) is not dict:
        raise CatalogReadValidationRejected()
    keys = set(value)
    full_keys = {"fingerprint_schema", "category", "anchor", "existing", "incoming"}
    reduced_keys = {
        "fingerprint_schema",
        "anchor",
        "existing_sha256",
        "incoming_sha256",
        "evidence_truncated",
    }
    try:
        if keys == full_keys:
            if value.get("fingerprint_schema") != 1 or value.get("category") != category.value:
                raise CatalogReadValidationRejected()
            encoded = conflict_fingerprint_bytes(
                category,
                anchor=value["anchor"],
                existing=value["existing"],
                incoming=value["incoming"],
            )
            if hashlib.sha256(encoded).hexdigest() != fingerprint:
                raise CatalogReadValidationRejected()
            decoded = json.loads(encoded)
            if type(decoded) is not dict or not _conflict_anchor_matches(
                decoded.get("anchor"), anchor
            ):
                raise CatalogReadValidationRejected()
            _validate_evidence_urls(decoded)
            canonical = encoded.decode("utf-8")
            return IngestionConflictEvidence(canonical, evidence_truncated=False)
        if keys == reduced_keys:
            if type(value.get("fingerprint_schema")) is not int or value["fingerprint_schema"] != 1:
                raise CatalogReadValidationRejected()
            if value.get("evidence_truncated") is not True:
                raise CatalogReadValidationRejected()
            _validated_evidence_anchor(value["anchor"], category=category, anchor=anchor)
            for key in ("existing_sha256", "incoming_sha256"):
                if type(value.get(key)) is not str or _SHA256_PATTERN.fullmatch(value[key]) is None:
                    raise CatalogReadValidationRejected()
            canonical = json.dumps(value, allow_nan=False, separators=(",", ":"), sort_keys=True)
            return IngestionConflictEvidence(canonical, evidence_truncated=True)
    except (KeyError, TypeError, ValueError, UnicodeEncodeError, json.JSONDecodeError):
        raise CatalogReadValidationRejected() from None
    raise CatalogReadValidationRejected()
