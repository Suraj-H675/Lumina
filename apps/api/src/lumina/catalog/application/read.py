"""Application services for bounded, provenance-preserving catalogue reads."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Protocol
from uuid import UUID

from lumina.catalog.domain.ingestion import IngestionConflictCategory, IngestionConflictStatus
from lumina.catalog.domain.read import (
    CatalogConflictNotFound,
    CatalogDataInconsistent,
    CatalogEntityNotFound,
    CatalogEntityType,
    CatalogReadError,
    CatalogReadOperationFailure,
    CatalogReadUnavailable,
    CatalogReadValidationRejected,
    CatalogSourceRecordNotFound,
    ConflictCursor,
    ConflictPage,
    ConflictSlice,
    EntityBrowseCursor,
    EntityBrowsePage,
    EntityBrowseSlice,
    EntityDetail,
    IngestionConflictDetail,
    MeasurementCursor,
    MeasurementPage,
    MeasurementSlice,
    PublicEntitySummary,
    SelectionHistoryCursor,
    SelectionHistoryPage,
    SelectionHistorySlice,
    SourceProvenance,
    decode_conflict_cursor,
    decode_entity_browse_cursor,
    decode_measurement_cursor,
    decode_selection_history_cursor,
    encode_conflict_cursor,
    encode_entity_browse_cursor,
    encode_measurement_cursor,
    encode_selection_history_cursor,
    validate_conflict_slice,
    validate_entity_browse_slice,
    validate_entity_detail,
    validate_entity_type_filter,
    validate_fingerprint,
    validate_ingestion_conflict_detail,
    validate_limit,
    validate_measurement_slice,
    validate_public_entity_slug,
    validate_public_entity_summary,
    validate_selection_history_slice,
    validate_source_provenance,
    validate_uuid,
)

_LOGGER = logging.getLogger("lumina.catalog.read")
_MEASUREMENT_DEFAULT_LIMIT = 20
_SELECTION_HISTORY_DEFAULT_LIMIT = 20
_CONFLICT_DEFAULT_LIMIT = 50
_ENTITY_BROWSE_DEFAULT_LIMIT = 20
_MAX_LIMIT = 100


class CatalogReadRepository(Protocol):
    """Read-only public-catalogue persistence operations introduced by Phase 1A4."""

    async def get_entity_detail(self, *, entity_id: UUID) -> EntityDetail | None:
        """Return one entity detail or a typed absence represented by ``None``."""
        ...

    async def get_entity_summary_by_slug(
        self,
        *,
        slug: str,
    ) -> PublicEntitySummary | None:
        """Return one exact public slug summary or a typed absence represented by ``None``."""
        ...

    async def list_entity_summaries(
        self,
        *,
        entity_type: CatalogEntityType | None,
        cursor: EntityBrowseCursor | None,
        limit: int,
    ) -> EntityBrowseSlice:
        """Return a bounded canonical-slug page without a count query."""
        ...

    async def list_entity_measurements(
        self,
        *,
        entity_id: UUID,
        cursor: MeasurementCursor | None,
        limit: int,
    ) -> MeasurementSlice | None:
        """Return one bounded entity page or ``None`` when the entity is absent."""
        ...

    async def list_entity_selection_history(
        self,
        *,
        entity_id: UUID,
        cursor: SelectionHistoryCursor | None,
        limit: int,
    ) -> SelectionHistorySlice | None:
        """Return one bounded selection history page or ``None`` when absent."""
        ...

    async def get_source_provenance(self, *, source_record_id: UUID) -> SourceProvenance | None:
        """Return public provenance only for a linked and measured source record."""
        ...


class CatalogOperatorReadRepository(Protocol):
    """The separate local-only read capability for source-integrity conflicts."""

    async def list_ingestion_conflicts(
        self,
        *,
        status: IngestionConflictStatus,
        category: IngestionConflictCategory | None,
        cursor: ConflictCursor | None,
        limit: int,
    ) -> ConflictSlice:
        """Return one bounded operator conflict page."""
        ...

    async def get_ingestion_conflict(self, *, fingerprint: str) -> IngestionConflictDetail | None:
        """Return one validated conflict or its absence."""
        ...


class CatalogReadService:
    """Validate public requests and rebuild repository results before API translation."""

    def __init__(self, repository: CatalogReadRepository) -> None:
        self._repository = repository

    async def get_entity_detail(self, entity_id: object) -> EntityDetail:
        """Return one canonical entity while retaining entities without measurements."""
        identifier = validate_uuid(entity_id)
        value = await self._call_public_repository(
            lambda: self._repository.get_entity_detail(entity_id=identifier)
        )
        if value is None:
            raise CatalogEntityNotFound()
        return self._validate_public_result(validate_entity_detail, value)

    async def get_entity_by_slug(self, slug: object) -> PublicEntitySummary:
        """Return exactly one canonical public-slug summary."""
        canonical_slug = validate_public_entity_slug(slug)
        value = await self._call_public_repository(
            lambda: self._repository.get_entity_summary_by_slug(slug=canonical_slug)
        )
        if value is None:
            raise CatalogEntityNotFound()
        return self._validate_public_result(validate_public_entity_summary, value)

    async def list_entities(
        self,
        *,
        entity_type: object | None = None,
        cursor: object | None = None,
        limit: object | None = None,
    ) -> EntityBrowsePage:
        """Return one deterministic, filter-bound canonical entity browse page."""
        selected_type = validate_entity_type_filter(entity_type)
        bounded_limit = validate_limit(
            limit,
            default=_ENTITY_BROWSE_DEFAULT_LIMIT,
            maximum=_MAX_LIMIT,
        )
        decoded_cursor = (
            None
            if cursor is None
            else decode_entity_browse_cursor(cursor, entity_type=selected_type)
        )
        value = await self._call_public_repository(
            lambda: self._repository.list_entity_summaries(
                entity_type=selected_type,
                cursor=decoded_cursor,
                limit=bounded_limit,
            )
        )
        page = self._validate_public_result(validate_entity_browse_slice, value)
        self._validate_entity_browse_page(
            page,
            limit=bounded_limit,
            entity_type=selected_type,
            cursor=decoded_cursor,
        )
        visible = page.items[:bounded_limit]
        has_more = len(page.items) > bounded_limit
        next_cursor = (
            encode_entity_browse_cursor(
                EntityBrowseCursor(
                    entity_type=selected_type,
                    slug=visible[-1].slug,
                )
            )
            if has_more
            else None
        )
        return EntityBrowsePage(
            items=visible,
            next_cursor=next_cursor,
            has_more=has_more,
            limit=bounded_limit,
        )

    async def list_entity_measurements(
        self,
        entity_id: object,
        *,
        cursor: object | None = None,
        limit: object | None = None,
    ) -> MeasurementPage:
        """Return immutable alternatives without any comparison or ranking inference."""
        identifier = validate_uuid(entity_id)
        bounded_limit = validate_limit(
            limit,
            default=_MEASUREMENT_DEFAULT_LIMIT,
            maximum=_MAX_LIMIT,
        )
        decoded_cursor = (
            None if cursor is None else decode_measurement_cursor(cursor, entity_id=identifier)
        )
        value = await self._call_public_repository(
            lambda: self._repository.list_entity_measurements(
                entity_id=identifier,
                cursor=decoded_cursor,
                limit=bounded_limit,
            )
        )
        if value is None:
            raise CatalogEntityNotFound()
        page = self._validate_public_result(validate_measurement_slice, value)
        self._validate_measurement_page(page, limit=bounded_limit, cursor=decoded_cursor)
        visible = page.items[:bounded_limit]
        has_more = len(page.items) > bounded_limit
        next_cursor = (
            encode_measurement_cursor(
                MeasurementCursor(
                    entity_id=identifier,
                    quantity_code=visible[-1].quantity.code,
                    created_at=visible[-1].created_at,
                    measurement_id=visible[-1].id,
                )
            )
            if has_more
            else None
        )
        return MeasurementPage(
            items=visible,
            next_cursor=next_cursor,
            has_more=has_more,
            limit=bounded_limit,
        )

    async def list_entity_selection_history(
        self,
        entity_id: object,
        *,
        cursor: object | None = None,
        limit: object | None = None,
    ) -> SelectionHistoryPage:
        """Return immutable selection records in their public historical order."""
        identifier = validate_uuid(entity_id)
        bounded_limit = validate_limit(
            limit,
            default=_SELECTION_HISTORY_DEFAULT_LIMIT,
            maximum=_MAX_LIMIT,
        )
        decoded_cursor = (
            None
            if cursor is None
            else decode_selection_history_cursor(cursor, entity_id=identifier)
        )
        value = await self._call_public_repository(
            lambda: self._repository.list_entity_selection_history(
                entity_id=identifier,
                cursor=decoded_cursor,
                limit=bounded_limit,
            )
        )
        if value is None:
            raise CatalogEntityNotFound()
        page = self._validate_public_result(validate_selection_history_slice, value)
        self._validate_selection_history_page(page, limit=bounded_limit, cursor=decoded_cursor)
        visible = page.items[:bounded_limit]
        has_more = len(page.items) > bounded_limit
        next_cursor = (
            encode_selection_history_cursor(
                SelectionHistoryCursor(
                    entity_id=identifier,
                    selected_at=visible[-1].selection.selected_at,
                    canonical_measurement_id=visible[-1].canonical_measurement_id,
                )
            )
            if has_more
            else None
        )
        return SelectionHistoryPage(
            items=visible,
            next_cursor=next_cursor,
            has_more=has_more,
            limit=bounded_limit,
        )

    async def get_source_provenance(self, source_record_id: object) -> SourceProvenance:
        """Return full source drawer provenance only for an eligible public record."""
        identifier = validate_uuid(source_record_id)
        value = await self._call_public_repository(
            lambda: self._repository.get_source_provenance(source_record_id=identifier)
        )
        if value is None:
            raise CatalogSourceRecordNotFound()
        return self._validate_public_result(validate_source_provenance, value)

    async def _call_public_repository[Result](
        self,
        operation: Callable[[], Awaitable[Result]],
    ) -> Result:
        try:
            return await operation()
        except (CatalogReadUnavailable, CatalogReadOperationFailure):
            raise
        except CatalogDataInconsistent:
            raise
        except CatalogReadValidationRejected:
            # The service validates every caller-controlled value before delegation.  A repository
            # validation failure now therefore describes malformed persisted state, not a request.
            self._log_failure(CatalogDataInconsistent())
            raise CatalogDataInconsistent() from None
        except CatalogReadError:
            self._log_failure(CatalogReadOperationFailure())
            raise CatalogReadOperationFailure() from None
        except Exception:
            self._log_failure(CatalogReadOperationFailure())
            raise CatalogReadOperationFailure() from None

    @staticmethod
    def _validate_public_result[Result](
        validator: Callable[[object], Result], value: object
    ) -> Result:
        try:
            return validator(value)
        except CatalogReadError:
            raise CatalogDataInconsistent() from None
        except Exception:
            raise CatalogDataInconsistent() from None

    @staticmethod
    def _validate_measurement_page(
        page: MeasurementSlice,
        *,
        limit: int,
        cursor: MeasurementCursor | None,
    ) -> None:
        if len(page.items) > limit + 1:
            raise CatalogDataInconsistent()
        tuples = tuple((item.quantity.code, item.created_at, item.id) for item in page.items)
        if tuples != tuple(sorted(tuples)) or len(tuples) != len(set(tuples)):
            raise CatalogDataInconsistent()
        if cursor is not None and tuples:
            first = tuples[0]
            expected = (cursor.quantity_code, cursor.created_at, cursor.measurement_id)
            if first <= expected:
                raise CatalogDataInconsistent()
        current_counts: dict[str, int] = {}
        for item in page.items:
            if item.selection_state.value == "current":
                current_counts[item.quantity.code] = current_counts.get(item.quantity.code, 0) + 1
        if any(count > 1 for count in current_counts.values()):
            raise CatalogDataInconsistent()

    @staticmethod
    def _validate_entity_browse_page(
        page: EntityBrowseSlice,
        *,
        limit: int,
        entity_type: CatalogEntityType | None,
        cursor: EntityBrowseCursor | None,
    ) -> None:
        if len(page.items) > limit + 1:
            raise CatalogDataInconsistent()
        slugs = tuple(item.slug for item in page.items)
        if slugs != tuple(sorted(slugs)) or len(slugs) != len(set(slugs)):
            raise CatalogDataInconsistent()
        if entity_type is not None and any(
            item.entity_type is not entity_type for item in page.items
        ):
            raise CatalogDataInconsistent()
        if cursor is not None and slugs and slugs[0] <= cursor.slug:
            raise CatalogDataInconsistent()

    @staticmethod
    def _validate_selection_history_page(
        page: SelectionHistorySlice,
        *,
        limit: int,
        cursor: SelectionHistoryCursor | None,
    ) -> None:
        if len(page.items) > limit + 1:
            raise CatalogDataInconsistent()
        tuples = tuple(
            (item.selection.selected_at, item.canonical_measurement_id) for item in page.items
        )
        ordered = tuple(sorted(tuples, key=lambda item: (item[0], item[1]), reverse=True))
        if tuples != ordered or len(tuples) != len(set(tuples)):
            raise CatalogDataInconsistent()
        if cursor is not None and tuples:
            first = tuples[0]
            expected = (cursor.selected_at, cursor.canonical_measurement_id)
            if first >= expected:
                raise CatalogDataInconsistent()

    @staticmethod
    def _log_failure(error: CatalogReadError) -> None:
        _LOGGER.warning(
            "catalog.read.failed",
            extra={"catalog_read_event": "catalog.read.failed", "error_category": error.code},
        )


class CatalogOperatorReadService:
    """Validate local operator conflict reads without exposing them through HTTP."""

    def __init__(self, repository: CatalogOperatorReadRepository) -> None:
        self._repository = repository

    async def list_ingestion_conflicts(
        self,
        *,
        status: object = IngestionConflictStatus.OPEN,
        category: object | None = None,
        cursor: object | None = None,
        limit: object | None = None,
    ) -> ConflictPage:
        """Return deterministic source-integrity conflict summaries for the local CLI."""
        try:
            if not isinstance(status, str) or (
                category is not None and not isinstance(category, str)
            ):
                raise CatalogReadValidationRejected()
            selected_status = IngestionConflictStatus(status)
            selected_category = None if category is None else IngestionConflictCategory(category)
        except (CatalogReadValidationRejected, ValueError):
            raise CatalogReadValidationRejected() from None
        bounded_limit = validate_limit(limit, default=_CONFLICT_DEFAULT_LIMIT, maximum=_MAX_LIMIT)
        decoded_cursor = (
            None
            if cursor is None
            else decode_conflict_cursor(
                cursor,
                status=selected_status,
                category=selected_category,
            )
        )
        value = await self._call_operator_repository(
            lambda: self._repository.list_ingestion_conflicts(
                status=selected_status,
                category=selected_category,
                cursor=decoded_cursor,
                limit=bounded_limit,
            )
        )
        page = self._validate_operator_result(validate_conflict_slice, value)
        self._validate_conflict_page(
            page,
            limit=bounded_limit,
            status=selected_status,
            category=selected_category,
            cursor=decoded_cursor,
        )
        visible = page.items[:bounded_limit]
        has_more = len(page.items) > bounded_limit
        next_cursor = (
            encode_conflict_cursor(
                ConflictCursor(
                    status=selected_status,
                    category=selected_category,
                    last_category=visible[-1].category,
                    created_at=visible[-1].created_at,
                    fingerprint=visible[-1].fingerprint,
                )
            )
            if has_more
            else None
        )
        return ConflictPage(
            items=visible,
            next_cursor=next_cursor,
            has_more=has_more,
            limit=bounded_limit,
        )

    async def get_ingestion_conflict(self, fingerprint: object) -> IngestionConflictDetail:
        """Return one local-only conflict with the validated allowlisted evidence form."""
        selected_fingerprint = validate_fingerprint(fingerprint)
        value = await self._call_operator_repository(
            lambda: self._repository.get_ingestion_conflict(fingerprint=selected_fingerprint)
        )
        if value is None:
            raise CatalogConflictNotFound()
        return self._validate_operator_result(validate_ingestion_conflict_detail, value)

    async def _call_operator_repository[Result](
        self,
        operation: Callable[[], Awaitable[Result]],
    ) -> Result:
        try:
            return await operation()
        except (CatalogReadUnavailable, CatalogReadOperationFailure, CatalogDataInconsistent):
            raise
        except CatalogReadValidationRejected:
            CatalogReadService._log_failure(CatalogDataInconsistent())
            raise CatalogDataInconsistent() from None
        except CatalogReadError:
            CatalogReadService._log_failure(CatalogReadOperationFailure())
            raise CatalogReadOperationFailure() from None
        except Exception:
            CatalogReadService._log_failure(CatalogReadOperationFailure())
            raise CatalogReadOperationFailure() from None

    @staticmethod
    def _validate_operator_result[Result](
        validator: Callable[[object], Result], value: object
    ) -> Result:
        return CatalogReadService._validate_public_result(validator, value)

    @staticmethod
    def _validate_conflict_page(
        page: ConflictSlice,
        *,
        limit: int,
        status: IngestionConflictStatus,
        category: IngestionConflictCategory | None,
        cursor: ConflictCursor | None,
    ) -> None:
        if len(page.items) > limit + 1:
            raise CatalogDataInconsistent()
        tuples = tuple(
            (item.category.value, item.created_at, item.fingerprint) for item in page.items
        )
        if tuples != tuple(sorted(tuples)) or len(tuples) != len(set(tuples)):
            raise CatalogDataInconsistent()
        for item in page.items:
            if item.status is not status or (
                category is not None and item.category is not category
            ):
                raise CatalogDataInconsistent()
        if cursor is not None and tuples:
            first = tuples[0]
            expected = (cursor.last_category.value, cursor.created_at, cursor.fingerprint)
            if first <= expected:
                raise CatalogDataInconsistent()
