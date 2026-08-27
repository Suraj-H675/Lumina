"""Local-only, redacted operator reads for deterministic ingestion conflicts."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from time import perf_counter
from typing import NoReturn

from lumina.catalog.application.data_quality import ReviewedSliceDataQualityService
from lumina.catalog.application.ingest import CatalogIngestionService
from lumina.catalog.application.read import CatalogOperatorReadService
from lumina.catalog.application.reviewed_slice import ReviewedSliceIngestionService
from lumina.catalog.domain.astrometry_slice import (
    ASTROMETRY_ARTIFACT_SHA256,
    ASTROMETRY_SLICE_ID,
    ASTROMETRY_STATE_SHA256,
    load_astrometry_slice,
)
from lumina.catalog.domain.ingestion import (
    CatalogIngestionError,
    IngestionConflictCategory,
    IngestionConflictStatus,
)
from lumina.catalog.domain.read import (
    CatalogConflictNotFound,
    CatalogReadError,
    CatalogReadValidationRejected,
    ConflictAnchor,
    ConflictPage,
    IngestionConflictDetail,
    IngestionConflictItem,
)
from lumina.catalog.domain.reviewed_slice import (
    REVIEWED_ARTIFACT_SHA256,
    REVIEWED_SLICE_ID,
    ReviewedSlicePolicyRejected,
    ReviewedSliceValidationRejected,
)
from lumina.catalog.infrastructure.gaia_dr3 import build_reviewed_gaia_commands
from lumina.catalog.infrastructure.gaia_dr3_astrometry import (
    build_reviewed_gaia_astrometry_commands,
)
from lumina.catalog.infrastructure.postgresql.data_quality import (
    PostgreSqlCatalogDataQualityRepository,
)
from lumina.catalog.infrastructure.postgresql.ingestion import PostgreSqlCatalogIngestionStore
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.settings import load_settings
from lumina.shared.infrastructure.database.runtime import create_database_runtime

_INVALID_MESSAGE = "Invalid catalogue command."
_FAILURE_MESSAGE = "Catalogue command failed."
_POLICY_FAILURE_MESSAGE = "Catalogue data policy check failed."


class InvalidCatalogInvocation(ValueError):
    """Fixed marker for parser failures that must not reflect an argument value."""


class _SafeArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        del message
        raise InvalidCatalogInvocation()


def _limit(value: str) -> int:
    try:
        parsed = int(value, 10)
    except ValueError:
        raise argparse.ArgumentTypeError("invalid limit") from None
    if not 1 <= parsed <= 100:
        raise argparse.ArgumentTypeError("invalid limit")
    return parsed


def _parser() -> _SafeArgumentParser:
    parser = _SafeArgumentParser(
        prog="lumina-catalog",
        description="Read local Lumina catalogue ingestion conflicts.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    ingest = commands.add_parser("ingest", help="Ingest the one reviewed offline source slice.")
    ingest.add_argument("--slice", required=True, choices=(REVIEWED_SLICE_ID, ASTROMETRY_SLICE_ID))
    ingest.add_argument("--validate-only", action="store_true")

    data_check = commands.add_parser(
        "data-check",
        help="Validate immutable provenance and source facts for one reviewed slice.",
    )
    data_check.add_argument(
        "--slice", required=True, choices=(REVIEWED_SLICE_ID, ASTROMETRY_SLICE_ID)
    )

    conflicts = commands.add_parser("conflicts", help="Read source-integrity conflicts.")
    conflict_commands = conflicts.add_subparsers(dest="conflict_command", required=True)

    list_parser = conflict_commands.add_parser("list", help="List bounded conflict summaries.")
    list_parser.add_argument(
        "--status",
        choices=tuple(item.value for item in IngestionConflictStatus),
        default=IngestionConflictStatus.OPEN.value,
    )
    list_parser.add_argument(
        "--category",
        choices=tuple(item.value for item in IngestionConflictCategory),
    )
    list_parser.add_argument("--limit", type=_limit, default=50)
    list_parser.add_argument("--cursor")

    show_parser = conflict_commands.add_parser("show", help="Show one validated conflict.")
    show_parser.add_argument("fingerprint")
    return parser


async def _run(namespace: argparse.Namespace) -> dict[str, object]:
    if namespace.command == "ingest" and namespace.validate_only:
        started = perf_counter()
        if namespace.slice == ASTROMETRY_SLICE_ID:
            validated = await ReviewedSliceIngestionService(
                build_reviewed_gaia_astrometry_commands,
                slice_loader=load_astrometry_slice,
            ).validate(namespace.slice)
            artifact_sha256 = ASTROMETRY_ARTIFACT_SHA256
        else:
            validated = await ReviewedSliceIngestionService(build_reviewed_gaia_commands).validate(
                namespace.slice
            )
            artifact_sha256 = _reviewed_artifact_sha256()
        return {
            "artifact_sha256": artifact_sha256,
            "duration_ms": _elapsed_milliseconds(started),
            "measurement_count": validated.measurement_count,
            "replayed_source_record_count": validated.replayed_source_record_count,
            "slice_id": validated.slice_id,
            "source_record_count": validated.source_record_count,
            "status": validated.status,
        }

    settings = load_settings()
    runtime = create_database_runtime(settings.database_url)
    try:
        if namespace.command == "ingest":
            started = perf_counter()
            catalog_ingestion = CatalogIngestionService(
                PostgreSqlCatalogIngestionStore(runtime.session_factory)
            )
            if namespace.slice == ASTROMETRY_SLICE_ID:
                ingestion_result = await ReviewedSliceIngestionService(
                    build_reviewed_gaia_astrometry_commands,
                    catalog_ingestion,
                    slice_loader=load_astrometry_slice,
                ).ingest(namespace.slice)
                artifact_sha256 = ASTROMETRY_ARTIFACT_SHA256
            else:
                ingestion_result = await ReviewedSliceIngestionService(
                    build_reviewed_gaia_commands, catalog_ingestion
                ).ingest(namespace.slice)
                artifact_sha256 = _reviewed_artifact_sha256()
            return {
                "artifact_sha256": artifact_sha256,
                "duration_ms": _elapsed_milliseconds(started),
                "existing_measurement_count": ingestion_result.existing_measurement_count,
                "inserted_measurement_count": ingestion_result.inserted_measurement_count,
                "inserted_source_record_count": ingestion_result.inserted_source_record_count,
                "measurement_count": ingestion_result.measurement_count,
                "replayed_source_record_count": ingestion_result.replayed_source_record_count,
                "slice_id": ingestion_result.slice_id,
                "source_record_count": ingestion_result.source_record_count,
                "status": ingestion_result.status,
            }
        if namespace.command == "data-check":
            started = perf_counter()
            if namespace.slice == ASTROMETRY_SLICE_ID:
                check_result = await ReviewedSliceDataQualityService(
                    PostgreSqlCatalogDataQualityRepository(runtime.session_factory),
                    build_reviewed_gaia_astrometry_commands,
                    slice_loader=load_astrometry_slice,
                    expected_state_sha256=ASTROMETRY_STATE_SHA256,
                ).check(namespace.slice)
            else:
                check_result = await ReviewedSliceDataQualityService(
                    PostgreSqlCatalogDataQualityRepository(runtime.session_factory),
                    build_reviewed_gaia_commands,
                ).check(namespace.slice)
            return {
                "artifact_sha256": check_result.artifact_sha256,
                "conflict_count": check_result.conflict_count,
                "duration_ms": _elapsed_milliseconds(started),
                "measurement_count": check_result.measurement_count,
                "slice_id": check_result.slice_id,
                "source_record_count": check_result.source_record_count,
                "state_sha256": check_result.state_sha256,
                "status": "passed",
                "unresolved_source_record_count": check_result.unresolved_source_record_count,
            }
        operator_service = CatalogOperatorReadService(
            PostgreSqlCatalogReadRepository(runtime.session_factory)
        )
        if namespace.conflict_command == "list":
            page = await operator_service.list_ingestion_conflicts(
                status=namespace.status,
                category=namespace.category,
                cursor=namespace.cursor,
                limit=namespace.limit,
            )
            return _page_payload(page)
        if namespace.conflict_command == "show":
            detail = await operator_service.get_ingestion_conflict(namespace.fingerprint)
            return _detail_payload(detail)
        raise CatalogReadValidationRejected()
    finally:
        await runtime.engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    """Parse, execute one bounded read, and emit only a known structured representation."""
    parser = _parser()
    try:
        namespace = parser.parse_args(argv)
    except InvalidCatalogInvocation:
        _write_stderr(_INVALID_MESSAGE)
        return 2
    except SystemExit as error:
        return 0 if error.code == 0 else 2

    try:
        payload = asyncio.run(_run(namespace))
        _write_stdout(payload)
        return 0
    except (KeyboardInterrupt, SystemExit):
        raise
    except CatalogReadValidationRejected:
        _write_stderr(_INVALID_MESSAGE)
        return 2
    except ReviewedSliceValidationRejected:
        _write_stderr(_INVALID_MESSAGE)
        return 2
    except ReviewedSlicePolicyRejected:
        _write_stderr(_POLICY_FAILURE_MESSAGE)
        return 4
    except CatalogConflictNotFound:
        _write_stderr("Catalogue conflict was not found.")
        return 3
    except CatalogIngestionError:
        _write_stderr(_FAILURE_MESSAGE)
        return 1
    except CatalogReadError:
        _write_stderr(_FAILURE_MESSAGE)
        return 1
    except BaseException:
        _write_stderr(_FAILURE_MESSAGE)
        return 1


def _page_payload(page: ConflictPage) -> dict[str, object]:
    return {
        "items": [_item_payload(item) for item in page.items],
        "page": {
            "next_cursor": page.next_cursor,
            "has_more": page.has_more,
            "limit": page.limit,
        },
    }


def _detail_payload(detail: IngestionConflictDetail) -> dict[str, object]:
    return {
        **_item_payload(detail),
        "evidence": detail.evidence.as_object(),
    }


def _item_payload(item: IngestionConflictItem) -> dict[str, object]:
    return {
        "fingerprint": item.fingerprint,
        "category": item.category.value,
        "anchor": _anchor_payload(item.anchor),
        "status": item.status.value,
        "created_at": _timestamp(item.created_at),
        "resolved_at": _timestamp(item.resolved_at) if item.resolved_at is not None else None,
    }


def _anchor_payload(anchor: ConflictAnchor) -> dict[str, object]:
    if anchor.provider_id is not None:
        return {"provider_id": str(anchor.provider_id)}
    if anchor.dataset_id is not None:
        return {"dataset_id": str(anchor.dataset_id)}
    if anchor.source_record_id is not None:
        return {"source_record_id": str(anchor.source_record_id)}
    if anchor.measurement_id is not None and anchor.source_fact_key is not None:
        return {
            "measurement_id": str(anchor.measurement_id),
            "source_fact_key": anchor.source_fact_key,
        }
    raise CatalogReadValidationRejected()


def _timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _write_stdout(payload: dict[str, object]) -> None:
    rendered = json.dumps(payload, allow_nan=False, separators=(",", ":"), sort_keys=True)
    sys.stdout.write(f"{rendered}\n")


def _write_stderr(message: str) -> None:
    sys.stderr.write(f"{message}\n")


def _reviewed_artifact_sha256() -> str:
    """Avoid duplicating a file read after the service has validated the artifact."""
    return REVIEWED_ARTIFACT_SHA256


def _elapsed_milliseconds(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1_000))


__all__ = ["main"]
