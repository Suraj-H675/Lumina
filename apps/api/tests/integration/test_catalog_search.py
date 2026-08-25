"""Real-PostgreSQL coverage for the explainable catalogue search adapter."""

from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Iterator
from typing import Final
from uuid import UUID

import pytest
import pytest_asyncio
from lumina.catalog.application.search import CatalogSearchService
from lumina.catalog.domain.identity import ALIAS_NORMALIZATION_VERSION, normalize_alias
from lumina.catalog.domain.read import CatalogEntityType, CatalogReadValidationRejected
from lumina.catalog.domain.search import SearchMatchReason, SearchResult
from lumina.catalog.infrastructure.postgresql.search import PostgreSqlCatalogSearchRepository
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

_FIXTURE_ENTITIES: Final = (
    (
        UUID("9a000000-0000-4000-8000-000000000001"),
        "star",
        "Fixture Alpha Lyrae",
        "fixture-alpha-lyrae",
    ),
    (
        UUID("9a000000-0000-4000-8000-000000000002"),
        "star",
        "Fixture Alpha Hydrae",
        "fixture-alpha-hydrae",
    ),
    (
        UUID("9a000000-0000-4000-8000-000000000003"),
        "galaxy",
        "Fixture Andromeda",
        "fixture-andromeda",
    ),
    (
        UUID("9a000000-0000-4000-8000-000000000004"),
        "star",
        "Fixture Zeta Reticuli",
        "fixture-zeta-reticuli",
    ),
)

# (alias UUID, entity UUID, curated alias) — deterministic fictional aliases.
_FIXTURE_ALIASES: Final = (
    (
        UUID("9b000000-0000-4000-8000-000000000001"),
        UUID("9a000000-0000-4000-8000-000000000001"),
        "Alpha Lyr",
    ),
    (
        UUID("9b000000-0000-4000-8000-000000000002"),
        UUID("9a000000-0000-4000-8000-000000000002"),
        "Alpha Hyd",
    ),
    (
        UUID("9b000000-0000-4000-8000-000000000003"),
        UUID("9a000000-0000-4000-8000-000000000004"),
        "Zeta Ret",
    ),
)


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _fixture_operation(
    settings: IntegrationTestSettings,
    operation: Callable[[Connection], None],
) -> None:
    engine = create_engine(_sync_url(settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            operation(connection)
    finally:
        engine.dispose()


@pytest.fixture
def fixture_search_entities(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Insert and remove only deterministic, clearly named search fixtures."""
    entity_ids = [row[0] for row in _FIXTURE_ENTITIES]
    alias_ids = [row[0] for row in _FIXTURE_ALIASES]
    id_placeholders = ", ".join(f":eid_{index}" for index in range(len(entity_ids)))
    alias_placeholders = ", ".join(f":aid_{index}" for index in range(len(alias_ids)))
    entity_params = {f"eid_{index}": value for index, value in enumerate(entity_ids)}
    alias_params = {f"aid_{index}": value for index, value in enumerate(alias_ids)}

    def prepare(connection: Connection) -> None:
        connection.execute(
            text(f"DELETE FROM public.entity_alias WHERE id IN ({alias_placeholders})"),
            alias_params,
        )
        connection.execute(
            text(f"DELETE FROM public.entity WHERE id IN ({id_placeholders})"), entity_params
        )
        for entity_id, entity_type, canonical_name, slug in _FIXTURE_ENTITIES:
            connection.execute(
                text(
                    "INSERT INTO public.entity "
                    "(id, entity_type, canonical_name, slug, "
                    "normalized_canonical_name, canonical_name_normalization_version) "
                    "VALUES (:id, :entity_type, :canonical_name, :slug, "
                    ":normalized_canonical_name, :normalization_version)"
                ),
                {
                    "id": entity_id,
                    "entity_type": entity_type,
                    "canonical_name": canonical_name,
                    "slug": slug,
                    "normalized_canonical_name": normalize_alias(
                        canonical_name, version=ALIAS_NORMALIZATION_VERSION
                    ),
                    "normalization_version": ALIAS_NORMALIZATION_VERSION,
                },
            )
        for index, (_alias_id, entity_id, alias) in enumerate(_FIXTURE_ALIASES):
            connection.execute(
                text(
                    "INSERT INTO public.entity_alias "
                    "(id, entity_id, alias, normalized_alias, normalization_version, alias_type) "
                    "VALUES (:id, :entity_id, :alias, :normalized_alias, :version, 'fictional')"
                ),
                {
                    "id": alias_ids[index],
                    "entity_id": entity_id,
                    "alias": alias,
                    "normalized_alias": normalize_alias(alias, version=ALIAS_NORMALIZATION_VERSION),
                    "version": ALIAS_NORMALIZATION_VERSION,
                },
            )

    def cleanup(connection: Connection) -> None:
        connection.execute(
            text(f"DELETE FROM public.entity_alias WHERE id IN ({alias_placeholders})"),
            alias_params,
        )
        connection.execute(
            text(f"DELETE FROM public.entity WHERE id IN ({id_placeholders})"), entity_params
        )

    _fixture_operation(integration_settings, prepare)
    try:
        yield
    finally:
        _fixture_operation(integration_settings, cleanup)


@pytest_asyncio.fixture
async def search_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    """Use the least-privilege test runtime without mutating the guarded test database."""
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


@pytest.fixture
def search_service(search_runtime: DatabaseRuntime) -> CatalogSearchService:
    return CatalogSearchService(PostgreSqlCatalogSearchRepository(search_runtime.session_factory))


def _slugs(service_result: tuple[SearchResult, ...]) -> list[str]:
    return [item.entity.slug for item in service_result]


@pytest.mark.asyncio
async def test_exact_slug_and_exact_canonical_name_tiers_rank_in_contract_order(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    by_slug = await search_service.search("fixture-andromeda")
    assert by_slug[0].match_reason is SearchMatchReason.EXACT_SLUG
    assert by_slug[0].entity.slug == "fixture-andromeda"
    assert by_slug[0].matched_alias is None

    # Normalized exact canonical name matches before any lower tier/prefix result.
    by_exact_name = await search_service.search("Fixture Andromeda")
    assert by_exact_name[0].match_reason is SearchMatchReason.EXACT_CANONICAL_NAME
    assert by_exact_name[0].entity.slug == "fixture-andromeda"

    # A shared name prefix matches both alpha fixtures at the prefix tier,
    # ordered by slug within the tier.
    by_prefix = await search_service.search("fixture alpha hy")
    assert by_prefix[0].match_reason is SearchMatchReason.CANONICAL_NAME_PREFIX
    assert by_prefix[0].entity.slug == "fixture-alpha-hydrae"


@pytest.mark.asyncio
async def test_prefix_matches_canonical_names_and_aliases_with_curated_alias_explanations(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    alias_results = await search_service.search("alpha ly")
    lyrae_hits = [item for item in alias_results if item.entity.slug == "fixture-alpha-lyrae"]
    assert len(lyrae_hits) == 1
    best_lyrae = lyrae_hits[0]
    assert best_lyrae.match_reason is SearchMatchReason.ALIAS_PREFIX
    assert best_lyrae.matched_alias == "Alpha Lyr"

    suggest_results = await search_service.suggest("Alpha Lyr")
    assert [(item.match_reason, item.entity.slug) for item in suggest_results] == [
        (SearchMatchReason.EXACT_ALIAS, "fixture-alpha-lyrae")
    ]


@pytest.mark.asyncio
async def test_fuzzy_search_ranks_within_tier_by_similarity_descending(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    results = await search_service.search("fixture alpja lyaae")  # deliberate typos
    fuzzy_hits = [
        (item.entity.slug, float(item.ranking_similarity))
        for item in results
        if item.match_reason is SearchMatchReason.CANONICAL_NAME_FUZZY
        and item.ranking_similarity is not None
    ]
    assert fuzzy_hits, "expected at least one canonical fuzzy hit"
    similarities = [similarity for _slug, similarity in fuzzy_hits]
    assert similarities == sorted(similarities, reverse=True)
    assert all(similarity >= 0.25 for similarity in similarities)


@pytest.mark.asyncio
async def test_numeric_only_query_stays_exact_and_prefix_only(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    results = await search_service.search("209458")
    assert all(item.match_reason is not SearchMatchReason.CANONICAL_NAME_FUZZY for item in results)


@pytest.mark.asyncio
async def test_entity_type_filter_is_singular_and_respected(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    star_results = await search_service.search("fixture andromeda", entity_type="star")
    assert all(item.entity.entity_type is not CatalogEntityType.GALAXY for item in star_results)

    galaxy_results = await search_service.search("fixture", entity_type="galaxy")
    assert [item.entity.slug for item in galaxy_results] == ["fixture-andromeda"]
    assert all(item.entity.entity_type is CatalogEntityType.GALAXY for item in galaxy_results)


@pytest.mark.asyncio
async def test_search_limit_bounds_the_merged_slice(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    limited = await search_service.search("fixture", limit=2)
    assert len(limited) == 2
    full = await search_service.search("fixture")
    assert len(full) > 2
    assert _slugs(limited) == _slugs(full)[:2]


@pytest.mark.asyncio
async def test_suggest_returns_summaries_capped_at_ten_and_never_fuzzy(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    results = await search_service.suggest("fixture", limit=10)
    assert 0 < len(results) <= 10
    assert all(item.match_reason in _SUGGEST_TIERS for item in results)


_SUGGEST_TIERS = frozenset(
    {
        SearchMatchReason.EXACT_SLUG,
        SearchMatchReason.EXACT_CANONICAL_NAME,
        SearchMatchReason.EXACT_ALIAS,
        SearchMatchReason.CANONICAL_NAME_PREFIX,
        SearchMatchReason.ALIAS_PREFIX,
    }
)


@pytest.mark.asyncio
@pytest.mark.parametrize("raw", ["a", "x" * 256])
async def test_invalid_lengths_are_typed_rejections(
    search_service: CatalogSearchService,
    raw: str,
) -> None:
    with pytest.raises(CatalogReadValidationRejected):
        await search_service.search(raw)


@pytest.mark.asyncio
async def test_like_metacharacters_are_literal_prefix_characters(
    search_service: CatalogSearchService,
    fixture_search_entities: None,
) -> None:
    # A literal percent sign must never widen the prefix into a wildcard match:
    # no fixture name contains '%', so no exact/prefix tier may fire.
    results = await search_service.search("fixture %")
    assert all(item.match_reason is SearchMatchReason.CANONICAL_NAME_FUZZY for item in results)
    underscore_query = await search_service.search("fixture_alpha")
    assert all(
        item.match_reason is not SearchMatchReason.CANONICAL_NAME_PREFIX
        for item in underscore_query
    )
