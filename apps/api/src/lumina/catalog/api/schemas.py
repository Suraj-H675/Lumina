"""Strict public contracts for the provenance-first catalogue read boundary."""

from __future__ import annotations

import re
from datetime import datetime
from enum import StrEnum
from typing import Annotated
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr

from lumina.catalog.domain.read import validate_public_entity_slug

_DECIMAL_TEXT_PATTERN = r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$"
_DECIMAL_RE = re.compile(rf"\A{_DECIMAL_TEXT_PATTERN}\Z", re.ASCII)


def _decimal_text(value: str) -> str:
    if _DECIMAL_RE.fullmatch(value) is None:
        raise ValueError("value must be an exact decimal string")
    return value


def _public_url(value: str) -> str:
    """Require persisted public links to be credential-free HTTP(S) URLs."""
    if not value or value != value.strip() or any(character.isspace() for character in value):
        raise ValueError("URL must be a credential-free HTTP(S) URL")
    try:
        parsed = urlsplit(value)
        _ = parsed.port
    except ValueError as error:
        raise ValueError("URL must be a credential-free HTTP(S) URL") from error
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or "\\" in value
    ):
        raise ValueError("URL must be a credential-free HTTP(S) URL")
    return value


DecimalText = Annotated[
    StrictStr,
    Field(pattern=_DECIMAL_TEXT_PATTERN),
    AfterValidator(_decimal_text),
]
PublicUrl = Annotated[StrictStr, AfterValidator(_public_url)]
PublicSlug = Annotated[
    StrictStr,
    Field(min_length=1, max_length=100),
    AfterValidator(validate_public_entity_slug),
]


class _ResponseModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class EntityType(StrEnum):
    """Closed persisted catalogue entity vocabulary."""

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


class SelectionState(StrEnum):
    """Public state of an immutable measurement relative to selection history."""

    CURRENT = "current"
    HISTORICAL = "historical"
    NEVER_SELECTED = "never_selected"


class QuantityReference(_ResponseModel):
    code: StrictStr
    name: StrictStr


class UnitReference(_ResponseModel):
    code: StrictStr
    symbol: StrictStr
    name: StrictStr


class ProviderReference(_ResponseModel):
    code: StrictStr
    name: StrictStr


class DatasetReference(_ResponseModel):
    code: StrictStr
    name: StrictStr
    release_version: StrictStr


class CompactSourceReference(_ResponseModel):
    source_record_id: UUID
    provider: ProviderReference
    dataset: DatasetReference


class SelectionReference(_ResponseModel):
    rule: StrictStr
    version: StrictStr
    explanation: StrictStr = Field(
        description=(
            "Public-safe scientific/editorial rationale for this canonical selection. "
            "Must not contain credentials, private reviewer notes, raw provider payloads, "
            "SQL/database details, debugging information, or hidden operational state."
        )
    )
    selected_at: datetime


class CurrentSelectionReference(SelectionReference):
    pass


class HistorySelectionReference(SelectionReference):
    superseded_at: datetime | None


class MeasurementReference(_ResponseModel):
    id: UUID
    value: DecimalText
    unit: UnitReference
    original_value: StrictStr
    original_unit: StrictStr
    source: CompactSourceReference


class CurrentCanonicalSelectionResponse(_ResponseModel):
    measurement: MeasurementReference
    selection: CurrentSelectionReference


class EntityQuantityResponse(_ResponseModel):
    quantity: QuantityReference
    measurement_count: Annotated[StrictInt, Field(gt=0)]
    current_selection: CurrentCanonicalSelectionResponse | None


class EntityDetailResponse(_ResponseModel):
    id: UUID
    entity_type: EntityType
    canonical_name: StrictStr = Field(min_length=1)
    quantities: list[EntityQuantityResponse]


class EntitySummaryResponse(_ResponseModel):
    """The stable four-field public navigation projection for one entity."""

    id: UUID
    slug: PublicSlug
    entity_type: EntityType
    canonical_name: StrictStr = Field(min_length=1)


class SearchMatchReason(StrEnum):
    EXACT_SLUG = "exact_slug"
    EXACT_CANONICAL_NAME = "exact_canonical_name"
    EXACT_ALIAS = "exact_alias"
    CANONICAL_NAME_PREFIX = "canonical_name_prefix"
    ALIAS_PREFIX = "alias_prefix"
    CANONICAL_NAME_FUZZY = "canonical_name_fuzzy"
    ALIAS_FUZZY = "alias_fuzzy"


class CatalogSearchResultResponse(_ResponseModel):
    entity: EntitySummaryResponse
    match_reason: SearchMatchReason
    matched_alias: StrictStr | None


class CatalogSearchResponse(_ResponseModel):
    items: list[CatalogSearchResultResponse]


class CatalogSuggestResponse(_ResponseModel):
    items: list[EntitySummaryResponse]


class MeasurementResponse(_ResponseModel):
    id: UUID
    quantity: QuantityReference
    value: DecimalText
    unit: UnitReference
    original_value: StrictStr
    original_unit: StrictStr
    selection_state: SelectionState
    source: CompactSourceReference


class SelectionHistoryResponse(_ResponseModel):
    quantity: QuantityReference
    measurement_id: UUID
    value: DecimalText
    unit: UnitReference
    source: CompactSourceReference
    selection: HistorySelectionReference


class PageResponse(_ResponseModel):
    next_cursor: StrictStr | None
    has_more: StrictBool
    limit: Annotated[StrictInt, Field(ge=1, le=100)]


class MeasurementPageResponse(_ResponseModel):
    items: list[MeasurementResponse]
    page: PageResponse


class SelectionHistoryPageResponse(_ResponseModel):
    items: list[SelectionHistoryResponse]
    page: PageResponse


class EntityBrowsePageResponse(_ResponseModel):
    items: list[EntitySummaryResponse]
    page: PageResponse


class SourceProviderResponse(_ResponseModel):
    code: StrictStr
    name: StrictStr
    documentation_url: PublicUrl
    terms_url: PublicUrl
    attribution_text: StrictStr


class SourceDatasetResponse(_ResponseModel):
    code: StrictStr
    name: StrictStr
    release_version: StrictStr
    source_url: PublicUrl
    licence: StrictStr
    citation: StrictStr


class SourceRecordResponse(_ResponseModel):
    provider_record_id: StrictStr
    provider_version: StrictStr
    source_url: PublicUrl | None
    fetched_at: datetime


class SourceProvenanceResponse(_ResponseModel):
    source_record_id: UUID
    provider: SourceProviderResponse
    dataset: SourceDatasetResponse
    record: SourceRecordResponse


__all__ = [
    "CatalogSearchResponse",
    "CatalogSearchResultResponse",
    "CatalogSuggestResponse",
    "CompactSourceReference",
    "CurrentCanonicalSelectionResponse",
    "CurrentSelectionReference",
    "DatasetReference",
    "EntityDetailResponse",
    "EntityBrowsePageResponse",
    "EntityQuantityResponse",
    "EntitySummaryResponse",
    "EntityType",
    "HistorySelectionReference",
    "MeasurementPageResponse",
    "MeasurementReference",
    "MeasurementResponse",
    "PageResponse",
    "ProviderReference",
    "QuantityReference",
    "SelectionHistoryPageResponse",
    "SelectionHistoryResponse",
    "SelectionReference",
    "SearchMatchReason",
    "SelectionState",
    "SourceDatasetResponse",
    "SourceProvenanceResponse",
    "SourceProviderResponse",
    "SourceRecordResponse",
    "UnitReference",
]
