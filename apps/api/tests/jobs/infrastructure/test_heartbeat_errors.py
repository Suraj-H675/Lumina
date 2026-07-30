"""Heartbeat SQL, lifecycle, mapping, and safe error classification tests."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.heartbeat import (
    HeartbeatJobRequest,
    JobHeartbeatContention,
    JobHeartbeatDatabaseOperationFailure,
    JobHeartbeatDatabaseProgrammingFailure,
    JobHeartbeatDatabaseStateFailure,
    JobHeartbeatStorageUnavailable,
    JobOwnershipLost,
    JobOwnerToken,
)
from lumina.jobs.domain.models import ExpectedJobAttempt
from lumina.jobs.infrastructure.postgresql.heartbeat import (
    _HEARTBEAT_SQL,
    PostgreSqlHeartbeatJobStore,
    _classify_database_failure,
    _DatabasePhase,
)
from sqlalchemy import RowMapping
from sqlalchemy.exc import DBAPIError, OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_OWNER = "worker.infrastructure-secret"
_HEARTBEAT_AT = datetime(2026, 7, 26, 12, 30, tzinfo=UTC)
_SQL_SENTINEL = "HEARTBEAT-RAW-SQL-SENTINEL"
_PARAMETER_SENTINEL = "HEARTBEAT-RAW-PARAMETER-SENTINEL"
_DRIVER_SENTINEL = "HEARTBEAT-RAW-DRIVER-SENTINEL"


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str, message: str = _DRIVER_SENTINEL) -> None:
        super().__init__(message)
        self.sqlstate = sqlstate


def _error(
    sqlstate: str,
    message: str = _DRIVER_SENTINEL,
    *,
    invalidated: bool = False,
) -> DBAPIError:
    return OperationalError(
        _SQL_SENTINEL,
        {"secret": _PARAMETER_SENTINEL},
        _DriverFailure(sqlstate, message),
        connection_invalidated=invalidated,
    )


@pytest.mark.parametrize(
    ("error", "timeout_installed", "expected"),
    [
        (
            _error("57014", "canceling statement due to statement timeout"),
            True,
            JobHeartbeatContention,
        ),
        (
            _error("57014", "canceling statement due to user request"),
            True,
            JobHeartbeatDatabaseOperationFailure,
        ),
        (
            _error("57014", "canceling statement due to statement timeout"),
            False,
            JobHeartbeatDatabaseOperationFailure,
        ),
        (
            _error("55P03", "canceling statement due to lock timeout"),
            True,
            JobHeartbeatContention,
        ),
        (
            _error("55P03", "could not obtain lock"),
            False,
            JobHeartbeatDatabaseOperationFailure,
        ),
        (
            _error("55P03", invalidated=True),
            True,
            JobHeartbeatStorageUnavailable,
        ),
        (
            _error("57014", invalidated=True),
            True,
            JobHeartbeatStorageUnavailable,
        ),
        (
            _error("08006"),
            True,
            JobHeartbeatStorageUnavailable,
        ),
    ],
)
def test_classification_requires_specific_timeout_or_connectivity_evidence(
    error: DBAPIError,
    timeout_installed: bool,
    expected: type[RuntimeError],
) -> None:
    assert (
        _classify_database_failure(
            error,
            _DatabasePhase.OPERATION,
            timeout_installed=timeout_installed,
        )
        is expected
    )


def test_heartbeat_sql_is_exactly_the_single_guarded_column_update() -> None:
    assert _HEARTBEAT_SQL.text == (
        "UPDATE public.job "
        "SET heartbeat_at = transaction_timestamp() "
        "WHERE id = :job_id "
        "AND status = 'running' "
        "AND claimed_by = :owner "
        "AND attempts = :expected_attempt "
        "RETURNING heartbeat_at"
    )
    for excluded in (
        "SET attempts =",
        "SET progress =",
        "SET status =",
        "SET result =",
        "SET error_code =",
        "SET completed_at =",
        "SET claimed_at =",
        "SET available_at =",
    ):
        assert excluded not in _HEARTBEAT_SQL.text


class _Result:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[RowMapping]:
        return cast(list[RowMapping], self._rows)


class _Connection:
    def __init__(
        self,
        rows: list[dict[str, object]] | None = None,
        *,
        error: BaseException | None = None,
    ) -> None:
        self.rows = rows or []
        self.error = error
        self.executions: list[tuple[str, object | None]] = []

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _Result:
        self.executions.append((str(statement), parameters))
        if str(statement) == _HEARTBEAT_SQL.text and self.error is not None:
            raise self.error
        return _Result(self.rows if str(statement) == _HEARTBEAT_SQL.text else [])


class _Session:
    def __init__(self, connection: _Connection) -> None:
        self.connection_value = connection
        self.transaction_active = False
        self.commits = 0
        self.rollbacks = 0
        self.closes = 0
        self.invalidations = 0

    async def begin(self) -> None:
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self.connection_value)

    def in_transaction(self) -> bool:
        return self.transaction_active

    async def commit(self) -> None:
        self.commits += 1
        self.transaction_active = False

    async def rollback(self) -> None:
        self.rollbacks += 1
        self.transaction_active = False

    async def close(self) -> None:
        self.closes += 1
        self.transaction_active = False

    async def invalidate(self) -> None:
        self.invalidations += 1
        self.transaction_active = False


class _Factory:
    def __init__(self, session: _Session) -> None:
        self.session = session
        self.calls = 0

    def __call__(self) -> _Session:
        self.calls += 1
        return self.session


def _request() -> HeartbeatJobRequest:
    return HeartbeatJobRequest(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
    )


def _store(
    session: _Session,
) -> PostgreSqlHeartbeatJobStore:
    return PostgreSqlHeartbeatJobStore(
        cast(async_sessionmaker[AsyncSession], _Factory(session)),
        operation_wait_timeout_ms=500,
    )


@pytest.mark.asyncio
async def test_success_maps_before_commit_and_closes_before_return() -> None:
    connection = _Connection([{"heartbeat_at": _HEARTBEAT_AT}])
    session = _Session(connection)

    recorded = await _store(session).heartbeat(_request())

    assert recorded.job_id == _JOB_ID
    assert recorded.heartbeat_at == _HEARTBEAT_AT
    assert session.commits == 1
    assert session.rollbacks == 0
    assert session.closes == 1
    assert not session.in_transaction()
    assert len(connection.executions) == 2
    assert connection.executions[1][1] == {
        "job_id": _JOB_ID,
        "owner": _OWNER,
        "expected_attempt": 2,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("rows", "expected"),
    [
        ([], JobOwnershipLost),
        ([{"heartbeat_at": "malformed"}], JobHeartbeatDatabaseStateFailure),
        (
            [
                {"heartbeat_at": _HEARTBEAT_AT},
                {"heartbeat_at": _HEARTBEAT_AT},
            ],
            JobHeartbeatDatabaseStateFailure,
        ),
    ],
)
async def test_rejected_or_malformed_results_roll_back_close_and_remain_safe(
    rows: list[dict[str, object]],
    expected: type[RuntimeError],
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    session = _Session(_Connection(rows))

    with pytest.raises(expected) as failure:
        await _store(session).heartbeat(_request())

    captured = capsys.readouterr()
    serialized = (
        str(failure.value)
        + repr(failure.value)
        + repr(failure.value.args)
        + repr(failure.value.__cause__)
        + repr(failure.value.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert session.commits == 0
    assert session.rollbacks == 1
    assert session.closes == 1
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    for sentinel in (str(_JOB_ID), _OWNER, str(_HEARTBEAT_AT)):
        assert sentinel not in serialized


@pytest.mark.asyncio
async def test_raw_database_failure_is_fixed_safe_and_releases_session(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    raw_error = ProgrammingError(
        _SQL_SENTINEL,
        {"secret": _PARAMETER_SENTINEL},
        _DriverFailure("42501"),
    )
    session = _Session(_Connection(error=raw_error))

    with pytest.raises(JobHeartbeatDatabaseProgrammingFailure) as failure:
        await _store(session).heartbeat(_request())

    captured = capsys.readouterr()
    serialized = (
        str(failure.value)
        + repr(failure.value)
        + repr(failure.value.args)
        + repr(failure.value.__cause__)
        + repr(failure.value.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert session.rollbacks == 1
    assert session.closes == 1
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    for sentinel in (
        str(_JOB_ID),
        _OWNER,
        _SQL_SENTINEL,
        _PARAMETER_SENTINEL,
        _DRIVER_SENTINEL,
        "42501",
    ):
        assert sentinel not in serialized


class _CancelledConnection(_Connection):
    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _Result:
        if str(statement) == _HEARTBEAT_SQL.text:
            raise asyncio.CancelledError
        return await super().execute(statement, parameters)


@pytest.mark.asyncio
async def test_process_control_passes_through_after_synchronous_cleanup() -> None:
    session = _Session(_CancelledConnection())

    with pytest.raises(asyncio.CancelledError):
        await _store(session).heartbeat(_request())

    assert session.rollbacks == 1
    assert session.closes == 1
    assert not session.in_transaction()
