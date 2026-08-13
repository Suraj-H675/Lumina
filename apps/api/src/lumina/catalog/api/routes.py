"""HTTP translation for the bounded public catalogue read interfaces."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal
from enum import Enum
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, ValidationError
from starlette.responses import JSONResponse

from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogEntityNotFound,
    CatalogReadUnavailable,
    CatalogReadValidationRejected,
    CatalogSourceRecordNotFound,
)
from lumina.shared.api.errors import ErrorResponse, error_response

from .schemas import (
    EntityDetailResponse,
    EntityType,
    MeasurementPageResponse,
    SelectionHistoryPageResponse,
    SelectionState,
    SourceProvenanceResponse,
)

router = APIRouter(prefix="/api/v1/catalog", tags=["catalog"])

_ERROR_RESPONSES = {
    404: {"model": ErrorResponse, "description": "The requested catalogue resource was not found."},
    422: {"model": ErrorResponse, "description": "The request could not be validated."},
    500: {"model": ErrorResponse, "description": "The request could not be completed."},
    503: {"model": ErrorResponse, "description": "The database is temporarily unavailable."},
}
_LIMIT = Annotated[int, Query(ge=1, le=100, description="Maximum number of items to return.")]
_CURSOR = Annotated[
    str | None,
    Query(description="Opaque cursor returned by the preceding page."),
]


class _ResponseMappingFailure(RuntimeError):
    """Persisted read data did not satisfy the public contract."""

    code = "catalog.data_inconsistent"


class _EntityNotFound(RuntimeError):
    code = "catalog.entity_not_found"


class _SourceRecordNotFound(RuntimeError):
    code = "catalog.source_record_not_found"


def _service(request: Request) -> Any:
    return request.app.state.catalog_read_service


def _dump(value: object) -> object:
    """Convert immutable domain projections into transport-neutral Python values."""
    if isinstance(value, BaseModel):
        return _dump(value.model_dump(mode="python"))
    if isinstance(value, Mapping):
        return {key: _dump(item) for key, item in value.items()}
    if isinstance(value, (tuple, list)):
        return [_dump(item) for item in value]
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, Decimal):
        return str(value)
    return value


def _field(value: object, name: str) -> object:
    if isinstance(value, Mapping):
        return value[name]
    return getattr(value, name)


def _enum_text(value: object) -> object:
    return value.value if isinstance(value, Enum) else value


def _quantity_payload(value: object) -> dict[str, object]:
    quantity = _field(value, "quantity")
    return {"code": _field(quantity, "code"), "name": _field(quantity, "name")}


def _unit_payload(value: object) -> dict[str, object]:
    unit = _field(value, "unit")
    return {
        "code": _field(unit, "code"),
        "symbol": _field(unit, "symbol"),
        "name": _field(unit, "name"),
    }


def _source_payload(value: object) -> dict[str, object]:
    source = _field(value, "source")
    provider = _field(source, "provider")
    dataset = _field(source, "dataset")
    return {
        "source_record_id": _field(source, "source_record_id"),
        "provider": {"code": _field(provider, "code"), "name": _field(provider, "name")},
        "dataset": {
            "code": _field(dataset, "code"),
            "name": _field(dataset, "name"),
            "release_version": _field(dataset, "release_version"),
        },
    }


def _measurement_payload(value: object) -> dict[str, object]:
    return {
        "id": _field(value, "id"),
        "quantity": _quantity_payload(value),
        "value": _dump(_field(value, "value")),
        "unit": _unit_payload(value),
        "original_value": _field(value, "original_value"),
        "original_unit": _field(value, "original_unit"),
        "source": _source_payload(value),
    }


def _selected_measurement_payload(value: object) -> dict[str, object]:
    return {
        "id": _field(value, "id"),
        "value": _dump(_field(value, "value")),
        "unit": _unit_payload(value),
        "original_value": _field(value, "original_value"),
        "original_unit": _field(value, "original_unit"),
        "source": _source_payload(value),
    }


def _selection_payload(value: object, *, include_superseded: bool) -> dict[str, object]:
    selection = _field(value, "selection") if hasattr(value, "selection") else value
    payload: dict[str, object] = {
        "rule": _field(selection, "rule"),
        "version": _field(selection, "version"),
        "explanation": _field(selection, "explanation"),
        "selected_at": _field(selection, "selected_at"),
    }
    if include_superseded:
        payload["superseded_at"] = _field(selection, "superseded_at")
    return payload


def _entity_payload(value: object) -> dict[str, object]:
    quantities: list[dict[str, object]] = []
    for item in cast(Any, _field(value, "quantities")):
        current = _field(item, "current_selection")
        quantities.append(
            {
                "quantity": _quantity_payload(item),
                "measurement_count": _field(item, "measurement_count"),
                "current_selection": (
                    None
                    if current is None
                    else {
                        "measurement": _selected_measurement_payload(
                            _field(current, "measurement")
                        ),
                        "selection": _selection_payload(
                            _field(current, "selection"), include_superseded=False
                        ),
                    }
                ),
            }
        )
    return {
        "id": _field(value, "id"),
        "entity_type": EntityType(cast(str, _enum_text(_field(value, "entity_type")))),
        "canonical_name": _field(value, "canonical_name"),
        "quantities": quantities,
    }


def _public_page_payload(value: object, *, history: bool) -> dict[str, object]:
    items = []
    for item in cast(Any, _field(value, "items")):
        if history:
            items.append(
                {
                    "quantity": _quantity_payload(item),
                    "measurement_id": _field(item, "measurement_id"),
                    "value": _dump(_field(item, "value")),
                    "unit": _unit_payload(item),
                    "source": _source_payload(item),
                    "selection": _selection_payload(item, include_superseded=True),
                }
            )
        else:
            items.append(
                {
                    "id": _field(item, "id"),
                    "quantity": _quantity_payload(item),
                    "value": _dump(_field(item, "value")),
                    "unit": _unit_payload(item),
                    "original_value": _field(item, "original_value"),
                    "original_unit": _field(item, "original_unit"),
                    "selection_state": SelectionState(
                        cast(str, _enum_text(_field(item, "selection_state")))
                    ),
                    "source": _source_payload(item),
                }
            )
    return {
        "items": items,
        "page": {
            "next_cursor": _field(value, "next_cursor"),
            "has_more": _field(value, "has_more"),
            "limit": _field(value, "limit"),
        },
    }


def _source_provenance_payload(value: object) -> dict[str, object]:
    provider = _field(value, "provider")
    dataset = _field(value, "dataset")
    record = _field(value, "record")
    return {
        "source_record_id": _field(value, "source_record_id"),
        "provider": {
            "code": _field(provider, "code"),
            "name": _field(provider, "name"),
            "documentation_url": _field(provider, "documentation_url"),
            "terms_url": _field(provider, "terms_url"),
            "attribution_text": _field(provider, "attribution_text"),
        },
        "dataset": {
            "code": _field(dataset, "code"),
            "name": _field(dataset, "name"),
            "release_version": _field(dataset, "release_version"),
            "source_url": _field(dataset, "source_url"),
            "licence": _field(dataset, "licence"),
            "citation": _field(dataset, "citation"),
        },
        "record": {
            "provider_record_id": _field(record, "provider_record_id"),
            "provider_version": _field(record, "provider_version"),
            "source_url": _field(record, "source_url"),
            "fetched_at": _field(record, "fetched_at"),
        },
    }


def _response[ResponseModel: BaseModel](model: type[ResponseModel], value: object) -> ResponseModel:
    if isinstance(value, model):
        return value
    try:
        if model is EntityDetailResponse:
            value = _entity_payload(value)
        elif model is MeasurementPageResponse:
            value = _public_page_payload(value, history=False)
        elif model is SelectionHistoryPageResponse:
            value = _public_page_payload(value, history=True)
        elif model is SourceProvenanceResponse:
            value = _source_provenance_payload(value)
        else:
            raise TypeError
        if not isinstance(value, Mapping):
            raise TypeError
        return model.model_validate(value)
    except (TypeError, ValueError, ValidationError) as error:
        raise _ResponseMappingFailure from error


def _error_kind(error: BaseException) -> tuple[int, str, str]:
    """Reduce application failures to the fixed, non-reflective public taxonomy."""
    if isinstance(error, (CatalogEntityNotFound, _EntityNotFound)):
        return 404, "catalog.entity_not_found", "No matching object was found."
    if isinstance(error, (CatalogSourceRecordNotFound, _SourceRecordNotFound)):
        return (
            404,
            "catalog.source_record_not_found",
            "No matching source record was found.",
        )
    if isinstance(error, CatalogReadValidationRejected):
        return 422, "request.validation_failed", "The request could not be validated."
    if isinstance(error, CatalogReadUnavailable):
        return 503, "database.unavailable", "The database is temporarily unavailable."
    if isinstance(error, (CatalogDataInconsistent, _ResponseMappingFailure)):
        return 500, "catalog.data_inconsistent", "The catalogue data is inconsistent."
    return 500, "server.internal_error", "The request could not be completed."


def _failure(request: Request, error: BaseException) -> JSONResponse:
    status, code, message = _error_kind(error)
    return error_response(request, status_code=status, code=code, message=message)


@router.get(
    "/entities/{entity_id}",
    operation_id="get_catalog_entity",
    response_model=EntityDetailResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def get_catalog_entity(
    request: Request,
    entity_id: UUID,
) -> EntityDetailResponse | JSONResponse:
    """Return one public canonical entity and its bounded current quantities."""
    try:
        result = await _service(request).get_entity_detail(entity_id)
        if result is None:
            raise _EntityNotFound
        return _response(EntityDetailResponse, result)
    except Exception as error:
        return _failure(request, error)


@router.get(
    "/entities/{entity_id}/measurements",
    operation_id="list_catalog_entity_measurements",
    response_model=MeasurementPageResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def list_catalog_entity_measurements(
    request: Request,
    entity_id: UUID,
    limit: _LIMIT = 20,
    cursor: _CURSOR = None,
) -> MeasurementPageResponse | JSONResponse:
    """Return one bounded immutable measurement page in deterministic order."""
    try:
        result = await _service(request).list_entity_measurements(
            entity_id,
            cursor=cursor,
            limit=limit,
        )
        return _response(MeasurementPageResponse, result)
    except Exception as error:
        return _failure(request, error)


@router.get(
    "/entities/{entity_id}/canonical-selections",
    operation_id="list_catalog_entity_canonical_selections",
    response_model=SelectionHistoryPageResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def list_catalog_entity_canonical_selections(
    request: Request,
    entity_id: UUID,
    limit: _LIMIT = 20,
    cursor: _CURSOR = None,
) -> SelectionHistoryPageResponse | JSONResponse:
    """Return one bounded immutable canonical-selection history page."""
    try:
        result = await _service(request).list_entity_selection_history(
            entity_id,
            cursor=cursor,
            limit=limit,
        )
        return _response(SelectionHistoryPageResponse, result)
    except Exception as error:
        return _failure(request, error)


@router.get(
    "/sources/{source_record_id}",
    operation_id="get_source_record_provenance",
    response_model=SourceProvenanceResponse,
    responses=cast(Any, _ERROR_RESPONSES),
)
async def get_source_record_provenance(
    request: Request,
    source_record_id: UUID,
) -> SourceProvenanceResponse | JSONResponse:
    """Return the eligible provenance closure for one public source record."""
    try:
        result = await _service(request).get_source_provenance(source_record_id)
        if result is None:
            raise _SourceRecordNotFound
        return _response(SourceProvenanceResponse, result)
    except Exception as error:
        return _failure(request, error)


__all__ = ["router"]
