from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
from lumina.identification.domain.submissions import FAKE_SOLVER_VERSION
from lumina.identification.infrastructure.postgresql import (
    PostgreSqlIdentificationSubmissionRepository,
    _status,
)
from sqlalchemy import RowMapping
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_NOW = datetime(2026, 9, 15, 12, tzinfo=UTC)
_SUBMISSION_ID = UUID("76000000-0000-4000-8000-000000000001")
_JOB_ID = UUID("76000000-0000-4000-8000-000000000002")


def test_status_normalizes_legacy_fake_solver_version() -> None:
    row = cast(
        RowMapping,
        {
            "id": _SUBMISSION_ID,
            "job_id": _JOB_ID,
            "created_at": _NOW,
            "deleted_at": None,
            "job_status": "succeeded",
            "job_progress": 1.0,
            "job_result": {
                "outcome": "fixture_solved",
                "solver_type": "fake",
                "solver_version": "phase6a-fixture-v1",
                "synthetic": True,
            },
            "job_error_code": None,
            "job_completed_at": _NOW,
        },
    )

    status = _status(row)

    assert status.result is not None
    assert status.result.solver_version == FAKE_SOLVER_VERSION


class _Result:
    def mappings(self) -> _Result:
        return self

    def __iter__(self):  # type: ignore[no-untyped-def]
        return iter(())


class _Connection:
    def __init__(self) -> None:
        self.statements: list[tuple[str, dict[str, object] | None]] = []

    async def execute(
        self, statement: object, parameters: dict[str, object] | None = None
    ) -> _Result:
        self.statements.append((str(statement), parameters))
        return _Result()


class _Transaction:
    async def __aenter__(self) -> _Transaction:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:  # type: ignore[no-untyped-def]
        del exc_type, exc, traceback


class _Session:
    def __init__(self, connection: _Connection) -> None:
        self._connection = connection

    async def __aenter__(self) -> _Session:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:  # type: ignore[no-untyped-def]
        del exc_type, exc, traceback

    def begin(self) -> _Transaction:
        return _Transaction()

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self._connection)


@pytest.mark.asyncio
async def test_retention_query_binds_configured_terminal_duration() -> None:
    connection = _Connection()
    repository = PostgreSqlIdentificationSubmissionRepository(
        cast(async_sessionmaker[AsyncSession], lambda: _Session(connection))
    )

    result = await repository.retention_due(
        now=_NOW,
        limit=7,
        terminal_retention=timedelta(hours=36),
    )

    assert result == ()
    retention = [
        (sql, parameters)
        for sql, parameters in connection.statements
        if "FROM public.identification_submission AS submission" in sql
    ]
    assert len(retention) == 1
    sql, parameters = retention[0]
    assert "make_interval(secs => :terminal_retention_seconds)" in sql
    assert "interval '24 hours'" not in sql
    assert parameters == {
        "now": _NOW,
        "limit": 7,
        "terminal_retention_seconds": 129_600,
    }


@pytest.mark.asyncio
async def test_retention_query_rejects_subsecond_duration_before_database_access() -> None:
    connection = _Connection()
    repository = PostgreSqlIdentificationSubmissionRepository(
        cast(async_sessionmaker[AsyncSession], lambda: _Session(connection))
    )

    with pytest.raises(Exception, match="Identification submission storage failed"):
        await repository.retention_due(
            now=_NOW,
            limit=1,
            terminal_retention=timedelta(seconds=1, microseconds=1),
        )

    assert connection.statements == []
