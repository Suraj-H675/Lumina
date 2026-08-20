"""HTTP contract tests for Phase 1B2 catalogue navigation routes."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, Mock
from uuid import UUID

import anyio
import httpx
import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute
from lumina.bootstrap import create_app
from lumina.catalog.api.routes import router as catalog_router
from lumina.catalog.api.schemas import (
    EntityBrowsePageResponse,
    EntitySummaryResponse,
    EntityType,
    PageResponse,
)
from lumina.catalog.domain.read import CatalogEntityNotFound
from lumina.settings import AppSettings

_ENTITY_ID = UUID("12345678-1234-4234-9234-123456789abc")


def _app() -> FastAPI:
    settings = AppSettings.model_validate(
        {
            "LUMINA_DATABASE_URL": (
                "postgresql+asyncpg://route_test:nonsecret@127.0.0.1:1/lumina_route_test"
            ),
            "LUMINA_ENABLE_API_DOCS": False,
            "LUMINA_ENV": "test",
            "LUMINA_LOG_LEVEL": "CRITICAL",
        }
    )
    return create_app(settings)


def _request(app: FastAPI, path: str) -> httpx.Response:
    async def send() -> httpx.Response:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return anyio.run(send)


def _summary(*, slug: str = "hd-209458") -> EntitySummaryResponse:
    return EntitySummaryResponse(
        id=_ENTITY_ID,
        slug=slug,
        entity_type=EntityType.STAR,
        canonical_name="HD 209458",
    )


def _service(app: FastAPI) -> Mock:
    service = Mock()
    service.get_entity_by_slug = AsyncMock()
    service.get_entity_detail = AsyncMock()
    service.list_entities = AsyncMock()
    service.list_entity_measurements = AsyncMock()
    service.list_entity_selection_history = AsyncMock()
    service.get_source_provenance = AsyncMock()
    app.state.catalog_read_service = service
    return service


def test_catalog_route_registration_preserves_static_precedence() -> None:
    paths = [route.path for route in catalog_router.routes if isinstance(route, APIRoute)]

    assert paths == [
        "/api/v1/catalog/entities",
        "/api/v1/catalog/entities/by-slug/{slug}",
        "/api/v1/catalog/entities/{entity_id}",
        "/api/v1/catalog/entities/{entity_id}/measurements",
        "/api/v1/catalog/entities/{entity_id}/canonical-selections",
        "/api/v1/catalog/sources/{source_record_id}",
    ]


def test_slug_route_calls_only_slug_service_and_never_uuid_service() -> None:
    app = _app()
    service = _service(app)
    service.get_entity_by_slug.return_value = _summary()

    response = _request(app, "/api/v1/catalog/entities/by-slug/hd-209458")

    assert response.status_code == 200
    assert response.json() == {
        "id": str(_ENTITY_ID),
        "slug": "hd-209458",
        "entity_type": "star",
        "canonical_name": "HD 209458",
    }
    service.get_entity_by_slug.assert_awaited_once_with("hd-209458")
    service.get_entity_detail.assert_not_awaited()


def test_uuid_looking_value_under_slug_route_keeps_slug_semantics() -> None:
    app = _app()
    service = _service(app)
    slug = str(_ENTITY_ID)
    service.get_entity_by_slug.return_value = _summary(slug=slug)

    response = _request(app, f"/api/v1/catalog/entities/by-slug/{slug}")

    assert response.status_code == 200
    service.get_entity_by_slug.assert_awaited_once_with(slug)
    service.get_entity_detail.assert_not_awaited()


@pytest.mark.parametrize("slug", ["", "HD-209458", "hd--209458", "hd-209458 "])
def test_public_summary_rejects_noncanonical_slug_values(slug: str) -> None:
    with pytest.raises(ValueError):
        _summary(slug=slug)


def test_missing_slug_is_normalized_to_catalogue_not_found() -> None:
    app = _app()
    service = _service(app)
    service.get_entity_by_slug.side_effect = CatalogEntityNotFound()

    response = _request(app, "/api/v1/catalog/entities/by-slug/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "catalog.entity_not_found"


def test_browse_response_maps_the_nested_page_contract() -> None:
    app = _app()
    service = _service(app)
    service.list_entities.return_value = EntityBrowsePageResponse(
        items=[_summary()],
        page=PageResponse(next_cursor="opaque", has_more=True, limit=1),
    )

    response = _request(app, "/api/v1/catalog/entities?limit=1")

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "id": str(_ENTITY_ID),
                "slug": "hd-209458",
                "entity_type": "star",
                "canonical_name": "HD 209458",
            }
        ],
        "page": {"next_cursor": "opaque", "has_more": True, "limit": 1},
    }
    service.list_entities.assert_awaited_once_with(entity_type=None, cursor=None, limit=1)


def test_browse_without_filter_passes_no_filter() -> None:
    app = _app()
    service = _service(app)
    service.list_entities.return_value = EntityBrowsePageResponse(
        items=[], page=PageResponse(next_cursor=None, has_more=False, limit=20)
    )

    response = _request(app, "/api/v1/catalog/entities")

    assert response.status_code == 200
    service.list_entities.assert_awaited_once_with(entity_type=None, cursor=None, limit=20)


def test_browse_with_one_valid_filter_passes_selected_scalar() -> None:
    app = _app()
    service = _service(app)
    service.list_entities.return_value = EntityBrowsePageResponse(
        items=[], page=PageResponse(next_cursor=None, has_more=False, limit=20)
    )

    response = _request(app, "/api/v1/catalog/entities?entity_type=star")

    assert response.status_code == 200
    service.list_entities.assert_awaited_once_with(entity_type="star", cursor=None, limit=20)


def _assert_repeated_filter_rejected(path: str) -> None:
    app = _app()
    service = _service(app)

    response = _request(app, path)

    assert response.status_code == 422
    payload: dict[str, Any] = response.json()
    assert payload["error"]["code"] == "request.validation_failed"
    assert payload["error"]["message"] == "The request could not be validated."
    assert "star" not in response.text
    assert "planet" not in response.text
    service.list_entities.assert_not_awaited()


def test_same_valid_entity_type_repeated_is_rejected() -> None:
    _assert_repeated_filter_rejected("/api/v1/catalog/entities?entity_type=star&entity_type=star")


def test_different_valid_entity_types_repeated_are_rejected() -> None:
    _assert_repeated_filter_rejected("/api/v1/catalog/entities?entity_type=star&entity_type=planet")


def test_invalid_then_valid_entity_types_are_rejected() -> None:
    _assert_repeated_filter_rejected(
        "/api/v1/catalog/entities?entity_type=not-a-type&entity_type=star"
    )


def test_valid_then_invalid_entity_types_are_rejected() -> None:
    _assert_repeated_filter_rejected(
        "/api/v1/catalog/entities?entity_type=star&entity_type=not-a-type"
    )


def test_existing_uuid_route_remains_reachable() -> None:
    app = _app()
    service = _service(app)
    service.get_entity_detail.side_effect = CatalogEntityNotFound()

    response = _request(app, f"/api/v1/catalog/entities/{_ENTITY_ID}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "catalog.entity_not_found"
    service.get_entity_detail.assert_awaited_once_with(_ENTITY_ID)
    service.get_entity_by_slug.assert_not_awaited()
