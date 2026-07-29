"""Completion SQL, mapping, lifecycle, and safe error classification tests."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from time import monotonic
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.completion import (
    CompleteJobRequest,
    JobCompletionContention,
    JobCompletionDatabaseOperationFailure,
    JobCompletionDatabaseProgrammingFailure,
    JobCompletionDatabaseStateFailure,
    JobCompletionOutcomeUnknown,
    JobCompletionStorageUnavailable,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
from lumina.jobs.domain.result import JobResultTooLarge, validate_job_result
from lumina.jobs.infrastructure.postgresql.completion import (
    _COMPLETE_SQL,
    _RECONCILE_SQL,
    _RESULT_SIZE_SQL,
    PostgreSqlJobCompletionStore,
    _classify_database_failure,
    _DatabasePhase,
)
from sqlalchemy import RowMapping
from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
)
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_OWNER = "worker.infrastructure-secret"
_COMPLETED_AT = datetime(2026, 7, 28, 10, 30, tzinfo=UTC)
_RESULT_SENTINEL = "COMPLETION-RESULT-SENTINEL"
_SQL_SENTINEL = "COMPLETION-RAW-SQL-SENTINEL"
_PARAMETER_SENTINEL = "COMPLETION-RAW-PARAMETER-SENTINEL"
_DRIVER_SENTINEL = "COMPLETION-RAW-DRIVER-SENTINEL"


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str, message: str = _DRIVER_SENTINEL) -> None:
        super().__init__(message)
        self.sqlstate = sqlstate


def _error(
    sqlstate: str,
    message: str = _DRIVER_SENTINEL,
    *,
    invalidated: bool = False,
    error_type: type[DBAPIError] = OperationalError,
) -> DBAPIError:
    return error_type(
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
            JobCompletionContention,
        ),
        (
            _error("57014", "canceling statement due to user request"),
            True,
            JobCompletionDatabaseOperationFailure,
        ),
        (
            _error("55P03", "canceling statement due to lock timeout"),
            True,
            JobCompletionContention,
        ),
        (
            _error("55P03", invalidated=True),
            True,
            JobCompletionStorageUnavailable,
        ),
        (
            _error("57014", invalidated=True),
            True,
            JobCompletionStorageUnavailable,
        ),
        (_error("08006"), True, JobCompletionStorageUnavailable),
        (
            _error("23514", error_type=IntegrityError),
            True,
            JobCompletionDatabaseStateFailure,
        ),
        (
            _error("42501", error_type=ProgrammingError),
            True,
            JobCompletionDatabaseProgrammingFailure,
        ),
    ],
)
def test_classification_uses_the_accepted_evidence_precedence(
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


def test_completion_sql_is_the_exact_guarded_successful_transition() -> None:
    assert _COMPLETE_SQL.text == (
        "UPDATE public.job "
        "SET status = 'succeeded', "
        "result = CAST(:result AS jsonb), "
        "progress = 1, "
        "completed_at = transaction_timestamp(), "
        "error_code = NULL, "
        "error_message = NULL "
        "WHERE id = :job_id "
        "AND status = 'running' "
        "AND claimed_by = :owner "
        "RETURNING id, completed_at"
    )
    assert _RESULT_SIZE_SQL.text == (
        "SELECT octet_length(convert_to(CAST(:result AS jsonb)::text, 'UTF8'))"
    )
    for immutable_column in (
        "job_type",
        "payload",
        "idempotency_key",
        "priority",
        "attempts",
        "max_attempts",
        "available_at",
        "claimed_by =",
        "claimed_at =",
        "heartbeat_at =",
        "created_at",
    ):
        assert f"SET {immutable_column}" not in _COMPLETE_SQL.text


class _Result:
    def __init__(
        self,
        *,
        rows: list[dict[str, object]] | None = None,
        scalar: object | None = None,
    ) -> None:
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[RowMapping]:
        return cast(list[RowMapping], self._rows)

    def scalar_one(self) -> object:
        return self._scalar


class _Connection:
    def __init__(
        self,
        *,
        rows: list[dict[str, object]] | None = None,
        database_size: object = 2,
        error: BaseException | None = None,
    ) -> None:
        self.rows = rows or []
        self.database_size = database_size
        self.error = error
        self.executions: list[tuple[str, object | None]] = []

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _Result:
        rendered = str(statement)
        self.executions.append((rendered, parameters))
        if rendered == _COMPLETE_SQL.text:
            if self.error is not None:
                raise self.error
            return _Result(rows=self.rows)
        if rendered == _RESULT_SIZE_SQL.text:
            return _Result(scalar=self.database_size)
        if "pg_backend_pid" in rendered:
            return _Result(scalar=101)
        return _Result()


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

    def __call__(self) -> _Session:
        return self.session


def _request() -> CompleteJobRequest:
    return CompleteJobRequest(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        result=validate_job_result({"secret": _RESULT_SENTINEL}, max_bytes=256),
    )


def _store(session: _Session) -> PostgreSqlJobCompletionStore:
    return PostgreSqlJobCompletionStore(
        cast(async_sessionmaker[AsyncSession], _Factory(session)),
        operation_wait_timeout_ms=500,
    )


@pytest.mark.asyncio
async def test_success_maps_before_commit_and_binds_every_request_value() -> None:
    connection = _Connection(rows=[{"id": _JOB_ID, "completed_at": _COMPLETED_AT}])
    session = _Session(connection)

    completed = await _store(session).complete(_request())

    assert completed.job_id == _JOB_ID
    assert completed.completed_at == _COMPLETED_AT
    assert session.commits == 1
    assert session.rollbacks == 0
    assert session.closes == 1
    assert not session.in_transaction()
    assert connection.executions[-1][1] == {
        "job_id": _JOB_ID,
        "owner": _OWNER,
        "result": '{"secret":"COMPLETION-RESULT-SENTINEL"}',
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("rows", "expected"),
    [
        ([], JobOwnershipLost),
        ([{"id": _JOB_ID, "completed_at": "malformed"}], JobCompletionDatabaseStateFailure),
        (
            [
                {"id": _JOB_ID, "completed_at": _COMPLETED_AT},
                {"id": _JOB_ID, "completed_at": _COMPLETED_AT},
            ],
            JobCompletionDatabaseStateFailure,
        ),
    ],
)
async def test_rejected_or_malformed_results_roll_back_and_close(
    rows: list[dict[str, object]],
    expected: type[RuntimeError],
) -> None:
    session = _Session(_Connection(rows=rows))

    with pytest.raises(expected) as failure:
        await _store(session).complete(_request())

    assert session.commits == 0
    assert session.rollbacks == 1
    assert session.closes == 1
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None


@pytest.mark.asyncio
async def test_database_text_size_rejection_precedes_the_update() -> None:
    connection = _Connection(
        rows=[{"id": _JOB_ID, "completed_at": _COMPLETED_AT}],
        database_size=65_537,
    )
    session = _Session(connection)

    with pytest.raises(JobResultTooLarge) as failure:
        await _store(session).complete(_request())

    assert failure.value.args == ("Job result exceeds the database size limit.",)
    assert _COMPLETE_SQL.text not in [statement for statement, _ in connection.executions]
    assert session.rollbacks == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_raw_database_failure_is_fixed_safe_and_releases_session(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    session = _Session(
        _Connection(
            error=ProgrammingError(
                _SQL_SENTINEL,
                {"secret": _PARAMETER_SENTINEL},
                _DriverFailure("42501"),
            )
        )
    )

    with pytest.raises(JobCompletionDatabaseProgrammingFailure) as failure:
        await _store(session).complete(_request())

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
    for sentinel in (
        str(_JOB_ID),
        _OWNER,
        _RESULT_SENTINEL,
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
        if str(statement) == _COMPLETE_SQL.text:
            raise asyncio.CancelledError
        return await super().execute(statement, parameters)


@pytest.mark.asyncio
async def test_pre_mutation_process_control_propagates_after_cleanup() -> None:
    session = _Session(_CancelledConnection())

    with pytest.raises(asyncio.CancelledError):
        await _store(session).complete(_request())

    assert session.rollbacks == 1
    assert session.closes == 1
    assert not session.in_transaction()


class _PoolCounter:
    def __init__(self) -> None:
        self.checked_out = 0
        self.disposals = 0
        self.generation = 0
        self.connections: list[_DeadlineConnection] = []

    def register(self, connection: _DeadlineConnection) -> None:
        self.connections.append(connection)

    def dispose(self) -> None:
        self.disposals += 1
        self.generation += 1
        for connection in self.connections:
            if connection.generation < self.generation:
                connection.detach()


class _DeadlineEngine:
    def __init__(self, pool: _PoolCounter) -> None:
        self._pool = pool

    async def dispose(self, *, close: bool = True) -> None:
        assert close is False
        self._pool.dispose()


class _DeadlineConnection(_Connection):
    def __init__(
        self,
        pool: _PoolCounter,
        *,
        backend_pid: int,
        primary: bool,
        reconciliation: str = "exact",
        invalidate: str = "success",
    ) -> None:
        super().__init__(rows=[{"id": _JOB_ID, "completed_at": _COMPLETED_AT}])
        self._pool = pool
        self._backend_pid = backend_pid
        self._primary = primary
        self._reconciliation = reconciliation
        self._invalidate_behavior = invalidate
        self._checked_out = False
        self.generation = pool.generation
        self.reusable = True
        self.invalidated = False
        self.detached = False
        self.complete_executions = 0
        self.reconciliation_executions = 0
        self.query_started = asyncio.Event()
        self.invalidate_started = asyncio.Event()
        self.engine = _DeadlineEngine(pool)
        pool.register(self)

    def checkout(self) -> None:
        if not self.reusable or self.generation != self._pool.generation:
            raise RuntimeError("CONTROLLED-QUARANTINED-CONNECTION")
        if not self._checked_out:
            self._checked_out = True
            self._pool.checked_out += 1

    def release(self) -> None:
        if self._checked_out:
            self._checked_out = False
            self._pool.checked_out -= 1

    def detach(self) -> None:
        self.detached = True
        self.reusable = False
        self.release()

    def quarantine_from_session(self) -> None:
        self.invalidated = True
        self.reusable = False
        self.release()

    async def invalidate(self) -> None:
        self.invalidate_started.set()
        if self._invalidate_behavior == "hang":
            await asyncio.Event().wait()
        if self._invalidate_behavior == "error":
            raise RuntimeError("CONTROLLED-CONNECTION-INVALIDATION")
        self.quarantine_from_session()

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _Result:
        rendered = str(statement)
        self.executions.append((rendered, parameters))
        if rendered == _COMPLETE_SQL.text:
            self.complete_executions += 1
            return _Result(rows=self.rows)
        if rendered == _RECONCILE_SQL.text:
            self.reconciliation_executions += 1
            self.query_started.set()
            if self._reconciliation == "hang":
                await asyncio.Event().wait()
            if self._reconciliation == "running":
                return _Result(
                    rows=[
                        {
                            "status": "running",
                            "claimed_by": _OWNER,
                            "completed_at": None,
                            "result_equal": None,
                            "progress": 0.5,
                            "error_code": None,
                            "error_message": None,
                        }
                    ]
                )
            return _Result(
                rows=[
                    {
                        "status": "succeeded",
                        "claimed_by": _OWNER,
                        "completed_at": _COMPLETED_AT,
                        "result_equal": True,
                        "progress": 1.0,
                        "error_code": None,
                        "error_message": None,
                    }
                ]
            )
        if rendered == _RESULT_SIZE_SQL.text:
            return _Result(scalar=2)
        if "pg_backend_pid" in rendered:
            return _Result(scalar=self._backend_pid)
        return _Result()


class _DeadlineSession:
    def __init__(
        self,
        connection: _DeadlineConnection,
        *,
        commit: str = "success",
        acquisition: str = "success",
        rollback: str = "success",
        invalidate: str = "success",
        close: str = "success",
    ) -> None:
        self.connection_value = connection
        self.commit_behavior = commit
        self.acquisition_behavior = acquisition
        self.rollback_behavior = rollback
        self.invalidate_behavior = invalidate
        self.close_behavior = close
        self.transaction_active = False
        self.commit_started = asyncio.Event()
        self.acquisition_started = asyncio.Event()
        self.rollback_started = asyncio.Event()
        self.close_started = asyncio.Event()
        self.invalidate_started = asyncio.Event()
        self.bind = connection.engine
        self.close_observed_reusable: bool | None = None

    async def begin(self) -> None:
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        self.acquisition_started.set()
        if self.acquisition_behavior == "hang":
            await asyncio.Event().wait()
        if self.acquisition_behavior == "error":
            raise RuntimeError("CONTROLLED-CONNECTION-ACQUISITION")
        self.connection_value.checkout()
        return cast(AsyncConnection, self.connection_value)

    def get_bind(self) -> _DeadlineEngine:
        return self.bind

    def in_transaction(self) -> bool:
        return self.transaction_active

    @property
    def discarded(self) -> bool:
        return not self.connection_value.reusable

    async def commit(self) -> None:
        self.commit_started.set()
        if self.commit_behavior == "hang":
            await asyncio.Event().wait()
        if self.commit_behavior == "error":
            raise RuntimeError("CONTROLLED-COMMIT-FAILURE")
        self.transaction_active = False
        self.connection_value.release()

    async def rollback(self) -> None:
        self.rollback_started.set()
        if self.rollback_behavior == "hang":
            await asyncio.Event().wait()
        if self.rollback_behavior == "error":
            raise RuntimeError("CONTROLLED-ROLLBACK")
        self.transaction_active = False

    async def close(self) -> None:
        self.close_started.set()
        self.close_observed_reusable = self.connection_value.reusable
        if self.close_behavior == "hang":
            await asyncio.Event().wait()
        if self.close_behavior == "error":
            raise RuntimeError("CONTROLLED-SESSION-CLOSE")
        self.transaction_active = False
        self.connection_value.release()

    async def invalidate(self) -> None:
        self.invalidate_started.set()
        if self.invalidate_behavior == "hang":
            await asyncio.Event().wait()
        if self.invalidate_behavior == "error":
            raise RuntimeError("CONTROLLED-SESSION-INVALIDATION")
        self.transaction_active = False
        self.connection_value.quarantine_from_session()


class _DeadlineFactory:
    def __init__(self, sessions: list[_DeadlineSession]) -> None:
        self.sessions = sessions
        self.calls = 0

    def __call__(self) -> _DeadlineSession:
        session = self.sessions[self.calls]
        self.calls += 1
        return session


def _deadline_store(
    primary: _DeadlineSession,
    reconciliations: list[_DeadlineSession],
    *,
    timeout_ms: int = 120,
) -> tuple[PostgreSqlJobCompletionStore, _DeadlineFactory]:
    factory = _DeadlineFactory([primary, *reconciliations])
    store = PostgreSqlJobCompletionStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=timeout_ms,
    )
    return store, factory


async def _assert_deadline_cleanup(
    *,
    pool: _PoolCounter,
    pending_before: set[asyncio.Task[object]],
    sessions: list[_DeadlineSession],
) -> None:
    scheduler_turn = asyncio.Event()
    asyncio.get_running_loop().call_soon(scheduler_turn.set)
    await asyncio.wait_for(scheduler_turn.wait(), timeout=1)
    assert pool.checked_out == 0
    for session in sessions:
        assert session.in_transaction() is False or session.discarded
    current = asyncio.current_task()
    pending_after = {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not current and not task.done()
    }
    assert pending_after <= pending_before


def _pending_tasks() -> set[asyncio.Task[object]]:
    current = asyncio.current_task()
    return {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not current and not task.done()
    }


@pytest.mark.asyncio
async def test_confirmed_commit_closes_with_inactive_transaction_and_safe_pool() -> None:
    pool = _PoolCounter()
    connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(connection)
    store, _ = _deadline_store(primary, [])
    pending_before = _pending_tasks()

    completed = await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert completed.completed_at == _COMPLETED_AT
    assert connection.complete_executions == 1
    assert connection.reusable
    assert pool.disposals == 0
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary],
    )


@pytest.mark.asyncio
async def test_connection_invalidation_quarantines_ambiguous_primary() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="error")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(reconciliation_connection)
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()

    completed = await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert completed.completed_at == _COMPLETED_AT
    assert primary_connection.invalidated
    assert not primary_connection.reusable
    assert primary.close_observed_reusable is False
    assert pool.disposals == 0
    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
async def test_session_invalidation_quarantines_when_connection_invalidation_fails() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(
        pool,
        backend_pid=101,
        primary=True,
        invalidate="error",
    )
    primary = _DeadlineSession(primary_connection, commit="error")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(reconciliation_connection)
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()

    completed = await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert completed.completed_at == _COMPLETED_AT
    assert primary_connection.invalidate_started.is_set()
    assert primary.invalidate_started.is_set()
    assert primary_connection.invalidated
    assert not primary_connection.reusable
    assert primary.close_observed_reusable is False
    assert pool.disposals == 0
    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("connection_invalidation", "session_invalidation"),
    [("error", "error"), ("hang", "error"), ("error", "hang")],
)
async def test_failed_invalidations_detach_pool_before_close_and_prevent_reuse(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
    connection_invalidation: str,
    session_invalidation: str,
) -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(
        pool,
        backend_pid=101,
        primary=True,
        invalidate=connection_invalidation,
    )
    primary = _DeadlineSession(
        primary_connection,
        commit="error",
        invalidate=session_invalidation,
    )
    store, factory = _deadline_store(primary, [])
    pending_before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobCompletionOutcomeUnknown) as failure:
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert monotonic() - started < 0.27
    assert pool.disposals == 1
    assert primary_connection.detached
    assert not primary_connection.reusable
    assert primary.close_observed_reusable is False
    assert primary_connection.complete_executions == 1
    with pytest.raises(RuntimeError):
        primary_connection.checkout()

    later_connection = _DeadlineConnection(pool, backend_pid=303, primary=True)
    later = _DeadlineSession(later_connection)
    factory.sessions.append(later)
    completed = await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert completed.completed_at == _COMPLETED_AT
    assert later_connection.complete_executions == 1
    assert later_connection is not primary_connection
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
    for sentinel in (
        "CONTROLLED-CONNECTION-INVALIDATION",
        "CONTROLLED-SESSION-INVALIDATION",
        str(_JOB_ID),
        _OWNER,
        _RESULT_SENTINEL,
    ):
        assert sentinel not in serialized
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, later],
    )


@pytest.mark.asyncio
async def test_hanging_reconciliation_acquisition_is_bounded_and_discarded() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="error")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(
        reconciliation_connection,
        acquisition="hang",
    )
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobCompletionOutcomeUnknown):
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert monotonic() - started < 0.27
    assert reconciliation.acquisition_started.is_set()
    assert reconciliation_connection.reconciliation_executions == 0
    assert reconciliation.discarded
    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
async def test_hanging_reconciliation_rollback_is_bounded_and_discarded() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="error")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(
        reconciliation_connection,
        rollback="hang",
    )
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobCompletionOutcomeUnknown):
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert monotonic() - started < 0.27
    assert reconciliation_connection.reconciliation_executions == 1
    assert reconciliation.rollback_started.is_set()
    assert reconciliation.discarded
    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
async def test_never_settling_commit_is_bounded_and_reconciliation_is_attempted() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="hang")
    reconciliation_connection = _DeadlineConnection(
        pool,
        backend_pid=202,
        primary=False,
        reconciliation="running",
    )
    reconciliation = _DeadlineSession(reconciliation_connection)
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobCompletionDatabaseOperationFailure) as failure:
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert monotonic() - started < 0.27
    assert reconciliation_connection.reconciliation_executions == 1
    assert primary_connection.complete_executions == 1
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
async def test_hanging_commit_can_reconcile_exact_completion_once() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="hang")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(reconciliation_connection)
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()

    completed = await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert completed.job_id == _JOB_ID
    assert completed.completed_at == _COMPLETED_AT
    assert primary_connection.complete_executions == 1
    assert reconciliation_connection.reconciliation_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
async def test_hanging_commit_without_fresh_backend_is_bounded_unknown() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="hang")
    reconciliations = [
        _DeadlineSession(
            _DeadlineConnection(pool, backend_pid=101, primary=False),
        )
        for _ in range(3)
    ]
    store, factory = _deadline_store(primary, reconciliations)
    pending_before = _pending_tasks()

    with pytest.raises(JobCompletionOutcomeUnknown) as failure:
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert factory.calls == 4
    assert primary_connection.complete_executions == 1
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, *reconciliations],
    )


@pytest.mark.asyncio
async def test_hanging_reconciliation_query_is_bounded_unknown() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="error")
    reconciliation_connection = _DeadlineConnection(
        pool,
        backend_pid=202,
        primary=False,
        reconciliation="hang",
    )
    reconciliation = _DeadlineSession(reconciliation_connection)
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobCompletionOutcomeUnknown):
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert monotonic() - started < 0.27
    assert reconciliation_connection.query_started.is_set()
    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("lifecycle", ["invalidate", "close"])
async def test_hanging_primary_quarantine_or_close_is_bounded_unknown(
    lifecycle: str,
) -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(
        primary_connection,
        commit="error" if lifecycle == "invalidate" else "success",
        invalidate="hang" if lifecycle == "invalidate" else "success",
        close="hang" if lifecycle == "close" else "success",
    )
    store, _ = _deadline_store(primary, [])
    pending_before = _pending_tasks()

    with pytest.raises(JobCompletionOutcomeUnknown):
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary],
    )


@pytest.mark.asyncio
async def test_hanging_reconciliation_close_is_bounded_unknown() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="error")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(reconciliation_connection, close="hang")
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()

    with pytest.raises(JobCompletionOutcomeUnknown):
        await asyncio.wait_for(store.complete(_request()), timeout=1)

    assert reconciliation.close_started.is_set()
    assert primary_connection.complete_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )


@pytest.mark.asyncio
async def test_post_update_cancellation_settles_through_reconciliation() -> None:
    pool = _PoolCounter()
    primary_connection = _DeadlineConnection(pool, backend_pid=101, primary=True)
    primary = _DeadlineSession(primary_connection, commit="hang")
    reconciliation_connection = _DeadlineConnection(pool, backend_pid=202, primary=False)
    reconciliation = _DeadlineSession(reconciliation_connection)
    store, _ = _deadline_store(primary, [reconciliation])
    pending_before = _pending_tasks()
    task = asyncio.create_task(store.complete(_request()))

    await asyncio.wait_for(primary.commit_started.wait(), timeout=1)
    task.cancel()
    completed = await asyncio.wait_for(task, timeout=1)

    assert completed.completed_at == _COMPLETED_AT
    assert primary_connection.complete_executions == 1
    assert reconciliation_connection.reconciliation_executions == 1
    await _assert_deadline_cleanup(
        pool=pool,
        pending_before=pending_before,
        sessions=[primary, reconciliation],
    )
