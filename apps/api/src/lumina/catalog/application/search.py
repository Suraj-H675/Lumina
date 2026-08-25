"""Application service boundary for explainable catalogue search."""

from __future__ import annotations

from typing import Final, Protocol

from lumina.catalog.domain.read import CatalogDataInconsistent
from lumina.catalog.domain.search import (
    DEFAULT_SEARCH_LIMIT,
    DEFAULT_SUGGEST_LIMIT,
    MAX_SEARCH_LIMIT,
    MAX_SUGGEST_LIMIT,
    SearchMatchReason,
    SearchQuery,
    SearchResult,
    SearchSlice,
    validate_search_query,
    validate_search_slice,
)

_FUZZY_MATCH_REASONS: Final = frozenset(
    {
        SearchMatchReason.CANONICAL_NAME_FUZZY,
        SearchMatchReason.ALIAS_FUZZY,
    }
)


class CatalogSearchRepository(Protocol):
    """Persistence port implemented by the fixed PostgreSQL search adapter."""

    async def search(self, *, query: SearchQuery) -> SearchSlice: ...

    async def suggest(self, *, query: SearchQuery) -> SearchSlice:
        """Suggest shares the bounded slice contract without fuzzy tiers."""
        ...


class CatalogSearchService:
    """Validate requests and rebuild persistence results before HTTP translation."""

    def __init__(self, repository: CatalogSearchRepository) -> None:
        self._repository = repository

    async def search(
        self,
        raw_query: object,
        *,
        entity_type: object | None = None,
        limit: object | None = None,
    ) -> tuple[SearchResult, ...]:
        query = validate_search_query(
            raw_query,
            entity_type=entity_type,
            limit=limit,
            default_limit=DEFAULT_SEARCH_LIMIT,
            maximum_limit=MAX_SEARCH_LIMIT,
        )
        return validate_search_slice(await self._repository.search(query=query)).items

    async def suggest(
        self,
        raw_query: object,
        *,
        entity_type: object | None = None,
        limit: object | None = None,
    ) -> tuple[SearchResult, ...]:
        query = validate_search_query(
            raw_query,
            entity_type=entity_type,
            limit=limit,
            default_limit=DEFAULT_SUGGEST_LIMIT,
            maximum_limit=MAX_SUGGEST_LIMIT,
        )
        slice_value = await self._repository.suggest(query=query)
        if any(item.match_reason in _FUZZY_MATCH_REASONS for item in slice_value.items):
            raise CatalogDataInconsistent()
        return validate_search_slice(slice_value).items
