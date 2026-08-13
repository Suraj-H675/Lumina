"""Local-only, redacted operator reads for deterministic ingestion conflicts."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import NoReturn

from lumina.catalog.application.read import CatalogOperatorReadService
from lumina.catalog.domain.ingestion import IngestionConflictCategory, IngestionConflictStatus
from lumina.catalog.domain.read import (
    CatalogConflictNotFound,
    CatalogReadError,
    CatalogReadValidationRejected,
    ConflictAnchor,
    ConflictPage,
    IngestionConflictDetail,
    IngestionConflictItem,
)
from lumina.catalog.infrastructure.postgresql.read import PostgreSqlCatalogReadRepository
from lumina.settings import load_settings
from lumina.shared.infrastructure.database.runtime import create_database_runtime

_INVALID_MESSAGE = "Invalid catalogue command."
_FAILURE_MESSAGE = "Catalogue command failed."


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
    settings = load_settings()
    runtime = create_database_runtime(settings.database_url)
    try:
        service = CatalogOperatorReadService(
            PostgreSqlCatalogReadRepository(runtime.session_factory)
        )
        if namespace.conflict_command == "list":
            page = await service.list_ingestion_conflicts(
                status=namespace.status,
                category=namespace.category,
                cursor=namespace.cursor,
                limit=namespace.limit,
            )
            return _page_payload(page)
        if namespace.conflict_command == "show":
            detail = await service.get_ingestion_conflict(namespace.fingerprint)
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
    except CatalogConflictNotFound:
        _write_stderr("Catalogue conflict was not found.")
        return 3
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


__all__ = ["main"]
