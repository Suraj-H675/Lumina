"""Deterministic search request rules and slice validation contracts."""

from __future__ import annotations

from uuid import uuid4

import pytest
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogEntityType,
    CatalogReadValidationRejected,
    PublicEntitySummary,
)
from lumina.catalog.domain.search import (
    DEFAULT_SEARCH_LIMIT,
    DEFAULT_SUGGEST_LIMIT,
    MAX_SEARCH_LIMIT,
    MAX_SUGGEST_LIMIT,
    SearchMatchReason,
    SearchResult,
    SearchSlice,
    escape_prefix,
    is_fuzzy_eligible,
    validate_search_query,
    validate_search_result,
    validate_search_slice,
)


def _summary(slug: str) -> PublicEntitySummary:
    return PublicEntitySummary(
        id=uuid4(),
        slug=slug,
        entity_type=CatalogEntityType.STAR,
        canonical_name=slug.replace("-", " ").title(),
    )


@pytest.mark.parametrize(
    ("query", "eligible"),
    [
        ("ab", False),
        ("abc", True),
        ("kepler", True),
        ("123", False),
        ("1234567890", False),
        ("12a", True),
        ("a1b2c", True),
    ],
)
def test_fuzzy_eligibility_applies_length_and_numeric_rules(query: str, eligible: bool) -> None:
    assert is_fuzzy_eligible(query) is eligible


@pytest.mark.parametrize(
    ("raw", "escaped"),
    [
        ("abc%", "abc\\%%"),
        ("a_b", "a\\_b%"),
        ("back\\slash", "back\\\\slash%"),
        ("plain", "plain%"),
    ],
)
def test_prefix_escape_neutralizes_like_metacharacters(raw: str, escaped: str) -> None:
    assert escape_prefix(raw) == escaped


def test_search_query_defaults_and_bounds_come_from_locked_constants() -> None:
    query = validate_search_query("hd 209458", default_limit=20, maximum_limit=50)
    assert query.limit == DEFAULT_SEARCH_LIMIT == 20
    assert query.fuzzy_eligible is True

    suggest_query = validate_search_query("hd 209458", default_limit=5, maximum_limit=10)
    assert suggest_query.limit == DEFAULT_SUGGEST_LIMIT == 5

    assert MAX_SEARCH_LIMIT == 50
    assert MAX_SUGGEST_LIMIT == 10


def test_search_query_rejects_invalid_requests() -> None:
    with pytest.raises(CatalogReadValidationRejected):
        validate_search_query("a", default_limit=20, maximum_limit=50)
    with pytest.raises(CatalogReadValidationRejected):
        validate_search_query("x" * 256, default_limit=20, maximum_limit=50)
    with pytest.raises(CatalogReadValidationRejected):
        validate_search_query("ok", entity_type="not-a-type", default_limit=20, maximum_limit=50)
    with pytest.raises(CatalogReadValidationRejected):
        validate_search_query("ok", limit=51, default_limit=20, maximum_limit=50)


def test_numeric_only_normalized_query_is_fuzzy_ineligible() -> None:
    query = validate_search_query("  209458 ", default_limit=20, maximum_limit=50)
    assert query.normalized == "209458"
    assert query.fuzzy_eligible is False


def test_slice_validation_accepts_similarity_ordered_fuzzy_tiers() -> None:
    first = SearchResult(
        entity=_summary("zeta"),
        match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
        matched_alias=None,
        ranking_similarity=0.9,
    )
    second = SearchResult(
        entity=_summary("alpha"),
        match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
        matched_alias=None,
        ranking_similarity=0.5,
    )
    validated = validate_search_slice(SearchSlice(items=(first, second)))
    assert [item.entity.slug for item in validated.items] == ["zeta", "alpha"]


def test_slice_validation_rejects_contract_violations() -> None:
    def build(**overrides: object) -> SearchSlice:
        base: dict[str, object] = {
            "entity": _summary("solo"),
            "match_reason": SearchMatchReason.EXACT_SLUG,
            "matched_alias": None,
            "ranking_similarity": None,
        }
        base.update(overrides)
        return SearchSlice(items=(SearchResult(**base),))  # type: ignore[arg-type]

    # Same-tier fuzzy results must be ordered by similarity descending;
    # similarity ascending across two hits violates the contract.
    with pytest.raises(CatalogDataInconsistent):
        validate_search_slice(
            SearchSlice(
                items=(
                    SearchResult(
                        entity=_summary("zeta"),
                        match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
                        matched_alias=None,
                        ranking_similarity=0.5,
                    ),
                    SearchResult(
                        entity=_summary("alpha"),
                        match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
                        matched_alias=None,
                        ranking_similarity=0.9,
                    ),
                )
            )
        )
    # Same-tier fuzzy with equal similarity must fall back to slug order.
    with pytest.raises(CatalogDataInconsistent):
        validate_search_slice(
            SearchSlice(
                items=(
                    SearchResult(
                        entity=_summary("zeta"),
                        match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
                        matched_alias=None,
                        ranking_similarity=0.5,
                    ),
                    SearchResult(
                        entity=_summary("alpha"),
                        match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
                        matched_alias=None,
                        ranking_similarity=0.5,
                    ),
                )
            )
        )

    with pytest.raises(CatalogDataInconsistent):
        validate_search_slice(build(match_reason=SearchMatchReason.EXACT_ALIAS, matched_alias=None))
    with pytest.raises(CatalogDataInconsistent):
        validate_search_slice(
            build(
                match_reason=SearchMatchReason.CANONICAL_NAME_FUZZY,
                ranking_similarity=None,
            )
        )
    with pytest.raises(CatalogDataInconsistent):
        validate_search_slice(build(ranking_similarity=0.75))
    with pytest.raises(CatalogDataInconsistent):
        validate_search_slice(build(match_reason=SearchMatchReason.ALIAS_PREFIX, matched_alias=""))


def test_single_item_slices_validate_with_identity_keys() -> None:
    summary = _summary("solo")
    result = SearchResult(
        entity=summary,
        match_reason=SearchMatchReason.EXACT_SLUG,
        matched_alias=None,
    )
    assert validate_search_result(result).entity.id == summary.id
