from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
from lumina.identification.domain.nova import NovaJobId, NovaSubmissionId
from lumina.identification.domain.remote_state import (
    RemoteFinalizationOutcome,
    RemoteLeaseToken,
    RemoteSolveClaim,
    RemoteSolveRecord,
    RemoteSolveState,
)
from lumina.identification.domain.solution import (
    AstrometricFrame,
    NormalizedPlateSolution,
    NormalizedWcs,
    PlateAnnotation,
    PlateCalibration,
)
from lumina.identification.infrastructure.solution_postgresql import PostgreSqlSolutionRepository
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_NOW = datetime(2026, 9, 15, 18, 0, tzinfo=UTC)
_SUBMISSION_ID = UUID("74000000-0000-4000-8000-000000000001")
_TOKEN = RemoteLeaseToken("d" * 64)


class _Result:
    def __init__(self, row: dict[str, object] | None = None) -> None:
        self._row = row

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> dict[str, object] | None:
        return self._row


class _Connection:
    def __init__(self, rows: list[dict[str, object] | None]) -> None:
        self.rows = list(rows)
        self.statements: list[tuple[str, object]] = []

    async def execute(self, statement: object, parameters: object = None) -> _Result:
        self.statements.append((str(statement), parameters))
        if "SET LOCAL statement_timeout" in str(statement):
            return _Result()
        return _Result(self.rows.pop(0) if self.rows else None)


class _Transaction:
    async def __aenter__(self) -> _Transaction:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:  # type: ignore[no-untyped-def]
        del exc_type, exc, traceback


class _Session:
    def __init__(self, connection: _Connection) -> None:
        self.connection_value = connection

    async def __aenter__(self) -> _Session:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:  # type: ignore[no-untyped-def]
        del exc_type, exc, traceback

    def begin(self) -> _Transaction:
        return _Transaction()

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self.connection_value)


def _repository(connection: _Connection) -> PostgreSqlSolutionRepository:
    return PostgreSqlSolutionRepository(
        cast(async_sessionmaker[AsyncSession], lambda: _Session(connection))
    )


def _claim() -> RemoteSolveClaim:
    record = RemoteSolveRecord(
        submission_id=_SUBMISSION_ID,
        state=RemoteSolveState.FETCHING_RESULTS,
        external_submission_id=NovaSubmissionId(111),
        external_job_id=NovaJobId(222),
        next_poll_at=_NOW,
        deadline_at=_NOW + timedelta(minutes=10),
        last_polled_at=_NOW - timedelta(seconds=5),
        upload_attempted_at=_NOW - timedelta(minutes=1),
        terminal_at=None,
        safe_reason=None,
        created_at=_NOW - timedelta(minutes=2),
        updated_at=_NOW - timedelta(seconds=1),
    )
    return RemoteSolveClaim(
        record=record,
        lease_token=_TOKEN,
        database_claimed_at=_NOW,
        lease_expires_at=_NOW + timedelta(seconds=30),
    )


def _solution() -> NormalizedPlateSolution:
    return NormalizedPlateSolution(
        calibration=PlateCalibration(
            center_ra_deg=120.0,
            center_dec_deg=20.0,
            orientation_deg=45.0,
            parity=-1,
            pixel_scale_arcsec_per_pixel=1.2,
            radius_deg=0.5,
        ),
        wcs=NormalizedWcs(
            frame=AstrometricFrame.FK5_J2000,
            header_text="WCSAXES =                    2\nCTYPE1  = 'RA---TAN'",
            source_sha256="e" * 64,
            image_width=1000,
            image_height=800,
        ),
        annotations=(
            PlateAnnotation(
                category="ngc",
                names=("NGC 1",),
                pixel_x=10.0,
                pixel_y=20.0,
                ra_deg=119.99,
                dec_deg=20.01,
            ),
            PlateAnnotation(
                category="hd",
                names=("HD 2",),
                pixel_x=30.0,
                pixel_y=40.0,
                ra_deg=120.01,
                dec_deg=19.99,
            ),
        ),
    )


@pytest.mark.asyncio
async def test_store_and_succeed_is_lease_fenced_and_atomic_in_shape() -> None:
    connection = _Connection(
        [
            {"submission_id": _SUBMISSION_ID, "external_job_id": 222},
            None,
            None,
            {"submission_id": _SUBMISSION_ID},
            None,
        ]
    )
    outcome = await _repository(connection).store_and_succeed(_claim(), _solution())

    assert outcome is RemoteFinalizationOutcome.APPLIED
    assert len(connection.statements) == 6

    lock_sql, lock_params = connection.statements[1]
    assert "state = 'fetching_results'" in lock_sql
    assert "active_lease_expires_at > CURRENT_TIMESTAMP" in lock_sql
    assert "submission.deleted_at IS NULL" in lock_sql
    assert lock_params == {
        "submission_id": _SUBMISSION_ID,
        "external_job_id": 222,
        "lease_token": "d" * 64,
    }

    solution_sql, solution_params = connection.statements[2]
    assert "INSERT INTO public.identification_solution" in solution_sql
    assert isinstance(solution_params, dict)
    assert solution_params["external_job_id"] == 222
    assert solution_params["coordinate_frame"] == "fk5_j2000"
    assert solution_params["wcs_sha256"] == "e" * 64

    annotation_sql, annotation_params = connection.statements[3]
    assert "INSERT INTO public.identification_annotation" in annotation_sql
    assert isinstance(annotation_params, list)
    assert [item["ordinal"] for item in annotation_params] == [0, 1]
    assert annotation_params[0]["names"] == ["NGC 1"]

    success_sql, success_params = connection.statements[4]
    assert "state = 'succeeded'" in success_sql
    assert "safe_reason = 'results_stored'" in success_sql
    assert success_params == {"submission_id": _SUBMISSION_ID, "lease_token": "d" * 64}

    history_sql, history_params = connection.statements[5]
    assert "'fetching_results', 'succeeded', 'results_stored'" in history_sql
    assert isinstance(history_params, dict)
    assert history_params["submission_id"] == _SUBMISSION_ID


@pytest.mark.asyncio
async def test_store_is_fenced_before_any_scientific_row_when_claim_is_stale() -> None:
    connection = _Connection([None])
    outcome = await _repository(connection).store_and_succeed(_claim(), _solution())

    assert outcome is RemoteFinalizationOutcome.FENCED
    assert len(connection.statements) == 2
    assert all("identification_solution" not in sql for sql, _ in connection.statements)


@pytest.mark.asyncio
async def test_purge_is_idempotent_and_targets_only_solution_parent() -> None:
    connection = _Connection([{"submission_id": _SUBMISSION_ID}, None])
    repository = _repository(connection)

    assert await repository.purge(_SUBMISSION_ID) is True
    assert await repository.purge(_SUBMISSION_ID) is False
    purge_sql = [sql for sql, _ in connection.statements if "DELETE FROM" in sql]
    expected = (
        "DELETE FROM public.identification_solution WHERE submission_id = :submission_id "
        "RETURNING submission_id"
    )
    assert purge_sql == [expected, expected]
