"""Deterministic explainable catalogue-search projections and request rules."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from pydantic import ValidationError

from lumina.catalog.domain.identity import (
    ALIAS_NORMALIZATION_UNICODE_VERSION,
    CatalogIdentityValidationError,
    normalize_alias,
)
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogReadValidationRejected,
    PublicEntitySummary,
    _refresh_model,
    validate_entity_type_filter,
    validate_limit,
    validate_public_entity_summary,
)

CANONICAL_NAME_FUZZY_THRESHOLD: Final = 0.25
ALIAS_FUZZY_THRESHOLD: Final = 0.33
FUZZY_MIN_NORMALIZED_LENGTH: Final = 3
NUMERIC_ONLY_FUZZY_ELIGIBLE: Final = False
SEARCH_RANKING_VERSION: Final = 1
MIN_NORMALIZED_QUERY_LENGTH: Final = 2
MAX_NORMALIZED_QUERY_LENGTH: Final = 255
MAX_QUERY_UTF8_BYTES: Final = 1_020
DEFAULT_SEARCH_LIMIT: Final = 20
MAX_SEARCH_LIMIT: Final = 50
DEFAULT_SUGGEST_LIMIT: Final = 5
MAX_SUGGEST_LIMIT: Final = 10


class SearchMatchReason(StrEnum):
    """The single truthful persisted predicate satisfied by one catalogue entity."""

    EXACT_SLUG = "exact_slug"
    EXACT_CANONICAL_NAME = "exact_canonical_name"
    EXACT_ALIAS = "exact_alias"
    CANONICAL_NAME_PREFIX = "canonical_name_prefix"
    ALIAS_PREFIX = "alias_prefix"
    CANONICAL_NAME_FUZZY = "canonical_name_fuzzy"
    ALIAS_FUZZY = "alias_fuzzy"


@dataclass(frozen=True, repr=False)
class SearchQuery:
    """A validated query plus its fixed eligibility and presentation bounds."""

    normalized: str
    entity_type: str | None
    limit: int
    fuzzy_eligible: bool

    def __repr__(self) -> str:
        return (
            f"SearchQuery(codepoints={len(self.normalized)}, "
            f"entity_type={self.entity_type!r}, limit={self.limit}, "
            f"fuzzy_eligible={self.fuzzy_eligible})"
        )


@dataclass(frozen=True, repr=False)
class SearchResult:
    """One public entity plus the lowest-ranked truthful match explanation.

    ``ranking_similarity`` is internal ranking evidence for fuzzy tiers only;
    it is validated for consistency and never serialized publicly.
    """

    entity: PublicEntitySummary
    match_reason: SearchMatchReason
    matched_alias: str | None
    ranking_similarity: float | None = None


@dataclass(frozen=True)
class SearchSlice:
    """The bounded deterministic result page."""

    items: tuple[SearchResult, ...]


def is_fuzzy_eligible(query: str) -> bool:
    """Apply the calibrated minimum length and numeric-only exclusion rule."""
    if len(query) < FUZZY_MIN_NORMALIZED_LENGTH:
        return False
    return not query.isascii() or not query.isdigit()


def escape_prefix(value: str) -> str:
    """Escape PostgreSQL LIKE metacharacters and append the prefix wildcard."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def validate_search_query(
    raw: object,
    *,
    entity_type: object | None = None,
    limit: object | None = None,
    default_limit: int,
    maximum_limit: int,
) -> SearchQuery:
    """Validate one singular search request without reflecting invalid input."""
    if type(raw) is not str:
        raise CatalogReadValidationRejected()
    if len(raw.encode("utf-8")) > MAX_QUERY_UTF8_BYTES:
        raise CatalogReadValidationRejected()
    if unicodedata.unidata_version != ALIAS_NORMALIZATION_UNICODE_VERSION:
        raise RuntimeError("Unsupported Unicode normalization runtime.")
    try:
        normalized = normalize_alias(raw, version=1)
        if not MIN_NORMALIZED_QUERY_LENGTH <= len(normalized) <= MAX_NORMALIZED_QUERY_LENGTH:
            raise CatalogReadValidationRejected()
    except CatalogIdentityValidationError:
        raise CatalogReadValidationRejected() from None
    selected_type = validate_entity_type_filter(entity_type)
    bounded_limit = validate_limit(limit, default=default_limit, maximum=maximum_limit)
    return SearchQuery(
        normalized=normalized,
        entity_type=None if selected_type is None else selected_type.value,
        limit=bounded_limit,
        fuzzy_eligible=is_fuzzy_eligible(normalized),
    )


def validate_search_result(value: object) -> SearchResult:
    """Rebuild one repository result at the application boundary."""
    if type(value) is not SearchResult:
        raise CatalogDataInconsistent()
    try:
        entity = validate_public_entity_summary(value.entity)
        if type(value.match_reason) is not SearchMatchReason:
            raise CatalogDataInconsistent()
        if value.match_reason in {
            SearchMatchReason.EXACT_ALIAS,
            SearchMatchReason.ALIAS_PREFIX,
            SearchMatchReason.ALIAS_FUZZY,
        }:
            if type(value.matched_alias) is not str or not value.matched_alias:
                raise CatalogDataInconsistent()
        elif value.matched_alias is not None:
            raise CatalogDataInconsistent()
        if value.ranking_similarity is not None and (
            type(value.ranking_similarity) not in (float, int)
            or isinstance(value.ranking_similarity, bool)
        ):
            raise CatalogDataInconsistent()
        fuzzy_tier = value.match_reason in {
            SearchMatchReason.CANONICAL_NAME_FUZZY,
            SearchMatchReason.ALIAS_FUZZY,
        }
        if fuzzy_tier != (value.ranking_similarity is not None):
            raise CatalogDataInconsistent()
        return SearchResult(
            entity=entity,
            match_reason=value.match_reason,
            matched_alias=value.matched_alias,
            ranking_similarity=(
                float(value.ranking_similarity) if value.ranking_similarity is not None else None
            ),
        )
    except ValidationError as error:
        raise CatalogDataInconsistent() from error


def validate_search_slice(value: object) -> SearchSlice:
    """Validate a unique, deterministically ordered bounded search slice."""
    if type(value) is not SearchSlice:
        raise CatalogDataInconsistent()
    results = [validate_search_result(item) for item in value.items]
    identifiers = [item.entity.id for item in results]
    if len(identifiers) != len(set(identifiers)):
        raise CatalogDataInconsistent()
    tier = {
        SearchMatchReason.EXACT_SLUG: 1,
        SearchMatchReason.EXACT_CANONICAL_NAME: 2,
        SearchMatchReason.EXACT_ALIAS: 3,
        SearchMatchReason.CANONICAL_NAME_PREFIX: 4,
        SearchMatchReason.ALIAS_PREFIX: 5,
        SearchMatchReason.CANONICAL_NAME_FUZZY: 6,
        SearchMatchReason.ALIAS_FUZZY: 7,
    }
    keys = [
        (
            tier[item.match_reason],
            -1.0 if item.ranking_similarity is None else -item.ranking_similarity,
            item.entity.slug,
            str(item.entity.id),
        )
        for item in results
    ]
    if keys != sorted(keys):
        raise CatalogDataInconsistent()
    return SearchSlice(items=tuple(results))


def refresh_public_summary(value: object) -> PublicEntitySummary:
    return _refresh_model(PublicEntitySummary, value)
