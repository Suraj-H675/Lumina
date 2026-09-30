"""Shared guarded helpers for job integration tests."""

from __future__ import annotations

from uuid import UUID

from lumina.settings import IntegrationTestSettings

from ..migration_lifecycle import execute_integration_sql

_JOB_ROW_COLUMNS = (
    "id, job_type, status, idempotency_key, priority, payload, result, progress, "
    "attempts, max_attempts, available_at, claimed_by, claimed_at, heartbeat_at, "
    "completed_at, error_code, error_message, created_at"
)


def job_row(settings: IntegrationTestSettings, identifier: UUID) -> tuple[object, ...]:
    rows = execute_integration_sql(
        settings,
        f"SELECT {_JOB_ROW_COLUMNS} FROM public.job WHERE id = :id",
        {"id": identifier},
    )
    assert len(rows) == 1
    return rows[0]
