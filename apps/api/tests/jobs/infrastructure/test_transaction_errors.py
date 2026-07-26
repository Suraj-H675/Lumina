"""Deterministic claim commit acknowledgement and reconciliation tests."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.models import (
    ClaimedJob,
    JobClaimDatabaseOperationFailure,
    JobClaimDatabaseProgrammingFailure,
    JobClaimDatabaseStateFailure,
    JobClaimOutcomeUnknown,
    NoEligibleJob,
)
from lumina.jobs.infrastructure.postgresql.claim import PostgreSqlClaimJobStore
from sqlalchemy import RowMapping
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_ID = UUID("12345678-1234-4234-9234-123456789abc")
_CLAIMED_AT = datetime(2026, 7, 26, 12, tzinfo=UTC)
_OWNER = "worker.lifecycle"


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str = "08006") -> None:
        super().__init__("RAW-LIFECYCLE-DRIVER-SENTINEL")
        self.sqlstate = sqlstate


def _database_error(error_type: type[OperationalError] = OperationalError) -> OperationalError:
    return error_type(
        "SELECT RAW-LIFECYCLE-SQL-SENTINEL",
        {"owner": "RAW-LIFECYCLE-OWNER-SENTINEL"},
        _DriverFailure(),
        connection_invalidated=True,
    )


def _claim_row() -> dict[str, object]:
    return {
        "id": _ID,
        "job_type": "system.fixture",
        "payload": {"secret": "RAW-LIFECYCLE-PAYLOAD-SENTINEL"},
        "attempts": 1,
        "max_attempts": 5,
        "claimed_at": _CLAIMED_AT,
        "heartbeat_at": _CLAIMED_AT,
    }


def _exact_reconciliation_row() -> dict[str, object]:
    return {
        "status": "running",
        "claimed_by": _OWNER,
        "attempts": 1,
        "claimed_at": _CLAIMED_AT,
        "heartbeat_at": _CLAIMED_AT,
    }


class _Result:
    def __init__(
        self,
        row: dict[str, object] | None = None,
        scalar: object | None = None,
    ) -> None:
        self._row = row
        self._scalar = scalar

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> RowMapping | None:
        return cast(RowMapping | None, self._row)

    def scalar_one(self) -> object:
        return self._scalar


class _Connection:
    def __init__(
        self,
        *,
        claim_row: dict[str, object] | None = None,
        reconcile_row: dict[str, object] | None = None,
        claim_error: BaseException | None = None,
        backend_pid: int = 101,
    ) -> None:
        self.claim_row = claim_row
        self.reconcile_row = reconcile_row
        self.claim_error = claim_error
        self.backend_pid = backend_pid
        self.claim_executions = 0
        self.reconcile_executions = 0
        self.timeout_executions = 0

    async def execute(
        self,
        statement: object,
        parameters: dict[str, object] | None = None,
    ) -> _Result:
        del parameters
        sql = str(statement)
        if "set_config" in sql:
            self.timeout_executions += 1
            return _Result()
        if "pg_backend_pid" in sql:
            return _Result(scalar=self.backend_pid)
        if "WITH candidate" in sql:
            self.claim_executions += 1
            if self.claim_error is not None:
                raise self.claim_error
            return _Result(self.claim_row)
        self.reconcile_executions += 1
        return _Result(self.reconcile_row)


class _Session:
    def __init__(
        self,
        connection: _Connection,
        *,
        commit_error: BaseException | None = None,
        commit_effect: Callable[[], None] | None = None,
        begin_error: BaseException | None = None,
    ) -> None:
        self.connection_value = connection
        self.commit_error = commit_error
        self.commit_effect = commit_effect
        self.begin_error = begin_error
        self.transaction_active = False
        self.commits = 0
        self.rollbacks = 0
        self.closes = 0
        self.invalidations = 0

    async def begin(self) -> None:
        if self.begin_error is not None:
            raise self.begin_error
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self.connection_value)

    async def commit(self) -> None:
        self.commits += 1
        if self.commit_effect is not None:
            self.commit_effect()
        if self.commit_error is not None:
            raise self.commit_error
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

    def in_transaction(self) -> bool:
        return self.transaction_active


class _BlockingCommitSession(_Session):
    def __init__(self, connection: _Connection) -> None:
        super().__init__(connection)
        self.commit_started = asyncio.Event()
        self.commit_release = asyncio.Event()

    async def commit(self) -> None:
        self.commits += 1
        self.commit_started.set()
        await self.commit_release.wait()
        self.transaction_active = False


class _Factory:
    def __init__(self, sessions: list[_Session]) -> None:
        self.sessions = sessions
        self.calls = 0

    def __call__(self) -> _Session:
        session = self.sessions[self.calls]
        self.calls += 1
        return session


def _store(factory: _Factory) -> PostgreSqlClaimJobStore:
    return PostgreSqlClaimJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )


def _reconciliation_session(
    row: dict[str, object] | None,
    *,
    begin_error: BaseException | None = None,
) -> tuple[_Session, _Connection]:
    connection = _Connection(reconcile_row=row, backend_pid=202)
    return _Session(connection, begin_error=begin_error), connection


@pytest.mark.asyncio
async def test_claim_sql_failure_rolls_back_before_safe_classification() -> None:
    connection = _Connection(claim_error=ProgrammingError("", {}, _DriverFailure("42501")))
    session = _Session(connection)
    factory = _Factory([session])

    with pytest.raises(JobClaimDatabaseProgrammingFailure):
        await _store(factory).claim(claimed_by=_OWNER)

    assert connection.claim_executions == 1
    assert session.rollbacks == 1
    assert session.closes == 1
    assert factory.calls == 1


@pytest.mark.asyncio
async def test_confirmed_commit_closes_before_returning_claim() -> None:
    connection = _Connection(claim_row=_claim_row())
    session = _Session(connection)

    outcome = await _store(_Factory([session])).claim(claimed_by=_OWNER)

    assert isinstance(outcome, ClaimedJob)
    assert session.commits == 1
    assert session.closes == 1
    assert not session.transaction_active


@pytest.mark.asyncio
async def test_no_candidate_commits_and_returns_typed_outcome() -> None:
    session = _Session(_Connection(claim_row=None))

    outcome = await _store(_Factory([session])).claim(claimed_by=_OWNER)

    assert isinstance(outcome, NoEligibleJob)
    assert session.commits == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_commit_failure_with_queued_reconciliation_is_not_success() -> None:
    primary = _Session(_Connection(claim_row=_claim_row()), commit_error=_database_error())
    queued: dict[str, object] = {
        "status": "queued",
        "claimed_by": None,
        "attempts": 0,
        "claimed_at": None,
        "heartbeat_at": None,
    }
    reconciliation, reconcile_connection = _reconciliation_session(queued)
    factory = _Factory([primary, reconciliation])

    with pytest.raises(JobClaimDatabaseOperationFailure):
        await _store(factory).claim(claimed_by=_OWNER)

    assert primary.invalidations == 1
    assert reconcile_connection.reconcile_executions == 1
    assert factory.calls == 2


@pytest.mark.asyncio
async def test_lost_commit_acknowledgement_reconciles_exact_claim() -> None:
    persisted: dict[str, object] = {}

    def persist() -> None:
        persisted.update(_exact_reconciliation_row())

    primary = _Session(
        _Connection(claim_row=_claim_row()),
        commit_error=_database_error(),
        commit_effect=persist,
    )
    reconciliation, _ = _reconciliation_session(persisted)

    outcome = await _store(_Factory([primary, reconciliation])).claim(claimed_by=_OWNER)

    assert isinstance(outcome, ClaimedJob)
    assert outcome.id == _ID


@pytest.mark.asyncio
async def test_unavailable_reconciliation_is_outcome_unknown_without_second_claim() -> None:
    primary_connection = _Connection(claim_row=_claim_row())
    primary = _Session(primary_connection, commit_error=_database_error())
    reconciliation, reconcile_connection = _reconciliation_session(
        None,
        begin_error=_database_error(),
    )
    factory = _Factory([primary, reconciliation])

    with pytest.raises(JobClaimOutcomeUnknown) as failure:
        await _store(factory).claim(claimed_by=_OWNER)

    assert primary_connection.claim_executions == 1
    assert reconcile_connection.claim_executions == 0
    assert factory.calls == 2
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None


@pytest.mark.asyncio
async def test_same_backend_reconciliation_is_rejected_until_attempts_exhaust() -> None:
    primary_connection = _Connection(claim_row=_claim_row(), backend_pid=101)
    primary = _Session(primary_connection, commit_error=_database_error())
    same_backend_sessions = [
        _Session(
            _Connection(
                reconcile_row=_exact_reconciliation_row(),
                backend_pid=101,
            )
        )
        for _ in range(3)
    ]
    factory = _Factory([primary, *same_backend_sessions])

    with pytest.raises(JobClaimOutcomeUnknown):
        await _store(factory).claim(claimed_by=_OWNER)

    assert primary_connection.claim_executions == 1
    assert factory.calls == 4
    assert all(session.invalidations == 1 for session in same_backend_sessions)
    assert all(
        session.connection_value.reconcile_executions == 0 for session in same_backend_sessions
    )


@pytest.mark.asyncio
async def test_foreign_owner_reconciliation_is_database_state_failure() -> None:
    primary = _Session(_Connection(claim_row=_claim_row()), commit_error=_database_error())
    foreign = _exact_reconciliation_row()
    foreign["claimed_by"] = "worker.foreign"
    reconciliation, _ = _reconciliation_session(foreign)

    with pytest.raises(JobClaimDatabaseStateFailure):
        await _store(_Factory([primary, reconciliation])).claim(claimed_by=_OWNER)


@pytest.mark.asyncio
@pytest.mark.parametrize("mismatch", ["attempt", "claimed_at", "heartbeat_at"])
async def test_reconciliation_mismatch_is_outcome_unknown(mismatch: str) -> None:
    primary = _Session(_Connection(claim_row=_claim_row()), commit_error=_database_error())
    persisted = _exact_reconciliation_row()
    if mismatch == "attempt":
        persisted["attempts"] = 2
    else:
        persisted[mismatch] = _CLAIMED_AT + timedelta(seconds=1)
    reconciliation, _ = _reconciliation_session(persisted)

    with pytest.raises(JobClaimOutcomeUnknown):
        await _store(_Factory([primary, reconciliation])).claim(claimed_by=_OWNER)


@pytest.mark.asyncio
async def test_pre_mutation_cancellation_passes_through() -> None:
    cancellation = asyncio.CancelledError()
    session = _Session(_Connection(claim_error=cancellation))

    with pytest.raises(asyncio.CancelledError) as failure:
        await _store(_Factory([session])).claim(claimed_by=_OWNER)

    assert failure.value is cancellation
    assert session.rollbacks == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_post_mutation_cancellation_reconciles_before_returning() -> None:
    primary = _Session(
        _Connection(claim_row=_claim_row()),
        commit_error=asyncio.CancelledError(),
    )
    reconciliation, _ = _reconciliation_session(_exact_reconciliation_row())

    outcome = await _store(_Factory([primary, reconciliation])).claim(claimed_by=_OWNER)

    assert isinstance(outcome, ClaimedJob)


@pytest.mark.asyncio
async def test_outer_cancellation_does_not_abandon_in_flight_confirmed_commit() -> None:
    session = _BlockingCommitSession(_Connection(claim_row=_claim_row()))
    claim_task = asyncio.create_task(_store(_Factory([session])).claim(claimed_by=_OWNER))
    await session.commit_started.wait()

    claim_task.cancel()
    session.commit_release.set()
    outcome = await claim_task

    assert isinstance(outcome, ClaimedJob)
    assert session.commits == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_reconciliation_evidence_never_enters_errors_or_output(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    primary = _Session(_Connection(claim_row=_claim_row()), commit_error=_database_error())
    mismatched = _exact_reconciliation_row()
    mismatched["heartbeat_at"] = _CLAIMED_AT + timedelta(seconds=1)
    reconciliation, _ = _reconciliation_session(mismatched)

    with pytest.raises(JobClaimOutcomeUnknown) as failure:
        await _store(_Factory([primary, reconciliation])).claim(claimed_by=_OWNER)

    captured = capsys.readouterr()
    error = failure.value
    serialized = (
        str(error)
        + repr(error)
        + repr(error.args)
        + repr(error.__cause__)
        + repr(error.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )
    for sentinel in (
        str(_ID),
        _OWNER,
        str(_CLAIMED_AT),
        "RAW-LIFECYCLE-PAYLOAD-SENTINEL",
        "RAW-LIFECYCLE-SQL-SENTINEL",
        "RAW-LIFECYCLE-DRIVER-SENTINEL",
    ):
        assert sentinel not in serialized
    assert error.args == ("Job claim outcome is unknown.",)
    assert error.__cause__ is None
    assert error.__context__ is None
