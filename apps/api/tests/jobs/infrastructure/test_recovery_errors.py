"""Recovery SQL, aggregate validation, lifecycle, and safe error tests."""

from __future__ import annotations

import asyncio
from time import monotonic
from typing import cast

import pytest
from lumina.jobs.domain.recovery import (
    JobRecoveryContention,
    JobRecoveryDatabaseOperationFailure,
    JobRecoveryDatabaseProgrammingFailure,
    JobRecoveryDatabaseStateFailure,
    JobRecoveryOutcomeUnknown,
    JobRecoveryStorageUnavailable,
    JobStaleThresholdSeconds,
    RecoverStaleJobsRequest,
)
from lumina.jobs.infrastructure.postgresql.recovery import (
    _RECOVER_SQL,
    _TIMEOUT_SQL,
    PostgreSqlRecoverStaleJobsStore,
    _aggregate_result,
    _classify_database_failure,
    _DatabasePhase,
    _detach_connection_pool,
    _run_until_deadline,
)
from sqlalchemy import RowMapping
from sqlalchemy.exc import DBAPIError, OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_SQL_SENTINEL = "RECOVERY-RAW-SQL-SENTINEL"
_PARAMETER_SENTINEL = "RECOVERY-RAW-PARAMETER-SENTINEL"
_DRIVER_SENTINEL = "RECOVERY-RAW-DRIVER-SENTINEL"


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
            JobRecoveryContention,
        ),
        (
            _error("57014", "canceling statement due to user request"),
            True,
            JobRecoveryDatabaseOperationFailure,
        ),
        (
            _error("55P03", "canceling statement due to lock timeout"),
            True,
            JobRecoveryContention,
        ),
        (_error("08006"), True, JobRecoveryStorageUnavailable),
        (_error("55P03", invalidated=True), True, JobRecoveryStorageUnavailable),
        (
            ProgrammingError(
                _SQL_SENTINEL,
                {"secret": _PARAMETER_SENTINEL},
                _DriverFailure("42501"),
            ),
            True,
            JobRecoveryDatabaseProgrammingFailure,
        ),
    ],
)
def test_timeout_and_database_error_classification(
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


def test_recovery_sql_has_exact_stale_predicate_order_limit_and_one_mutation() -> None:
    sql = _RECOVER_SQL.text
    assert sql.count("UPDATE public.job") == 1
    assert "WITH stale AS MATERIALIZED" in sql
    assert "WHERE status = 'running'" in sql
    assert (
        "COALESCE(heartbeat_at, claimed_at) "
        "<= transaction_timestamp() - make_interval(secs => :stale_seconds)"
    ) in sql
    assert "ORDER BY COALESCE(heartbeat_at, claimed_at) ASC, claimed_at ASC, id ASC" in sql
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "LIMIT 100" in sql
    assert "AND job.status = 'running'" in sql
    assert "AND job.attempts = stale.attempts" in sql
    assert "AND job.max_attempts = stale.max_attempts" in sql
    assert "RETURNING job.status" in sql
    assert "RETURNING job.id" not in sql
    assert "SELECT id FROM updated" not in sql


def test_recovery_sql_has_exact_requeue_and_dead_letter_field_policy() -> None:
    sql = _RECOVER_SQL.text
    for fragment in (
        "WHEN stale.attempts < stale.max_attempts THEN 'queued'",
        "ELSE 'dead_letter'",
        "THEN transaction_timestamp()",
        "WHEN stale.attempts < stale.max_attempts THEN NULL",
        "WHEN stale.attempts < stale.max_attempts THEN 0",
        "ELSE :stale_error_code",
        "ELSE :stale_error_message",
        "result = NULL",
    ):
        assert fragment in sql
    set_clause = sql.partition("SET ")[2].partition("FROM stale")[0]
    assert "attempts =" not in set_clause
    assert "max_attempts =" not in set_clause


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [
            {
                "selected_count": 0,
                "requeued_count": 0,
                "dead_lettered_count": 0,
            },
            {
                "selected_count": 0,
                "requeued_count": 0,
                "dead_lettered_count": 0,
            },
        ],
        [{"selected_count": None, "requeued_count": 0, "dead_lettered_count": 0}],
        [{"selected_count": True, "requeued_count": 1, "dead_lettered_count": 0}],
        [{"selected_count": 101, "requeued_count": 101, "dead_lettered_count": 0}],
        [{"selected_count": 2, "requeued_count": 1, "dead_lettered_count": 0}],
        [{"selected_count": 1, "requeued_count": 0, "dead_lettered_count": -1}],
        [{"selected_count": 1, "requeued_count": 0, "unexpected": 1}],
    ],
)
def test_malformed_or_contradictory_aggregate_evidence_is_database_state_failure(
    rows: list[dict[str, object]],
) -> None:
    with pytest.raises(JobRecoveryDatabaseStateFailure):
        _aggregate_result(cast(list[RowMapping], rows))


def test_valid_aggregate_evidence_returns_only_public_counts() -> None:
    result = _aggregate_result(
        cast(
            list[RowMapping],
            [{"selected_count": 100, "requeued_count": 73, "dead_lettered_count": 27}],
        )
    )

    assert result.requeued_count == 73
    assert result.dead_lettered_count == 27
    assert result.total_count == 100
    assert not hasattr(result, "selected_count")


class _Result:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[RowMapping]:
        return cast(list[RowMapping], self._rows)


class _Pool:
    def __init__(self, *, replacement: str = "success") -> None:
        self.replacement = replacement
        self.replacements = 0
        self.connections: list[_Connection] = []
        self.replacement_cancelled = asyncio.Event()


class _Engine:
    def __init__(self, pool: _Pool) -> None:
        self._pool = pool

    async def dispose(self, *, close: bool = True) -> None:
        assert close is False
        try:
            if self._pool.replacement == "hang":
                await asyncio.Event().wait()
            if self._pool.replacement == "error":
                raise RuntimeError("RECOVERY-POOL-PRIVATE")
            self._pool.replacements += 1
            for connection in self._pool.connections:
                connection.reusable = False
                connection.checked_out = False
        finally:
            if self._pool.replacement == "hang":
                self._pool.replacement_cancelled.set()


class _Connection:
    def __init__(
        self,
        rows: list[dict[str, object]],
        *,
        error: BaseException | None = None,
        invalidate: str = "success",
        pool_replacement: str = "success",
    ) -> None:
        self.rows = rows
        self.error = error
        self.invalidate_behavior = invalidate
        self.pool = _Pool(replacement=pool_replacement)
        self.pool.connections.append(self)
        self.engine = _Engine(self.pool)
        self.executions: list[tuple[str, object | None]] = []
        self.recovery_executions = 0
        self.reusable = True
        self.checked_out = False
        self.invalidate_cancelled = asyncio.Event()

    def checkout(self) -> None:
        if not self.reusable:
            raise RuntimeError("RECOVERY-UNSAFE-PHYSICAL-CONNECTION")
        if self.checked_out:
            raise RuntimeError("RECOVERY-PHYSICAL-CONNECTION-STILL-RETAINED")
        self.checked_out = True

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _Result:
        rendered = str(statement)
        self.executions.append((rendered, parameters))
        if rendered == _RECOVER_SQL.text:
            self.recovery_executions += 1
            if self.error is not None:
                raise self.error
            return _Result(self.rows)
        return _Result([])

    async def invalidate(self) -> None:
        try:
            if self.invalidate_behavior == "hang":
                await asyncio.Event().wait()
            if self.invalidate_behavior == "error":
                raise RuntimeError("RECOVERY-CONNECTION-INVALIDATE-PRIVATE")
            self.reusable = False
            self.checked_out = False
        finally:
            if self.invalidate_behavior == "hang":
                self.invalidate_cancelled.set()


class _Session:
    def __init__(
        self,
        connection: _Connection,
        *,
        rollback: str = "success",
        commit: str = "success",
        close: str = "success",
        invalidate: str = "success",
        transaction_state: str = "normal",
    ) -> None:
        self.connection_value = connection
        self.rollback_behavior = rollback
        self.commit_behavior = commit
        self.close_behavior = close
        self.invalidate_behavior = invalidate
        self.transaction_state_behavior = transaction_state
        self.bind = connection.engine
        self.transaction_active = False
        self.commits = 0
        self.rollbacks = 0
        self.closes = 0
        self.invalidations = 0
        self.rollback_cancelled = asyncio.Event()
        self.commit_cancelled = asyncio.Event()
        self.close_cancelled = asyncio.Event()
        self.invalidate_cancelled = asyncio.Event()

    async def begin(self) -> None:
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        self.connection_value.checkout()
        return cast(AsyncConnection, self.connection_value)

    def get_bind(self) -> _Engine:
        return self.bind

    def in_transaction(self) -> bool:
        if self.transaction_state_behavior == "error":
            raise RuntimeError("RECOVERY-TRANSACTION-STATE-PRIVATE")
        return self.transaction_active

    async def rollback(self) -> None:
        self.rollbacks += 1
        try:
            if self.rollback_behavior == "hang":
                await asyncio.Event().wait()
            if self.rollback_behavior == "error":
                raise RuntimeError("RECOVERY-ROLLBACK-PRIVATE")
            self.transaction_active = False
        finally:
            if self.rollback_behavior == "hang":
                self.rollback_cancelled.set()

    async def commit(self) -> None:
        self.commits += 1
        try:
            if self.commit_behavior == "hang":
                await asyncio.Event().wait()
            if self.commit_behavior == "error":
                raise RuntimeError("RECOVERY-COMMIT-PRIVATE")
            self.transaction_active = False
        finally:
            if self.commit_behavior == "hang":
                self.commit_cancelled.set()

    async def close(self) -> None:
        self.closes += 1
        try:
            if self.close_behavior == "hang":
                await asyncio.Event().wait()
            if self.close_behavior == "error":
                raise RuntimeError("RECOVERY-CLOSE-PRIVATE")
            self.transaction_active = False
            self.connection_value.checked_out = False
        finally:
            if self.close_behavior == "hang":
                self.close_cancelled.set()

    async def invalidate(self) -> None:
        self.invalidations += 1
        try:
            if self.invalidate_behavior == "hang":
                await asyncio.Event().wait()
            if self.invalidate_behavior == "error":
                raise RuntimeError("RECOVERY-SESSION-INVALIDATE-PRIVATE")
            self.connection_value.reusable = False
            self.connection_value.checked_out = False
            self.transaction_active = False
        finally:
            if self.invalidate_behavior == "hang":
                self.invalidate_cancelled.set()


class _Factory:
    def __init__(self, session: _Session) -> None:
        self.session = session
        self.calls = 0

    def __call__(self) -> _Session:
        self.calls += 1
        return self.session


def _request() -> RecoverStaleJobsRequest:
    return RecoverStaleJobsRequest(JobStaleThresholdSeconds(120))


def _store(
    session: _Session,
    *,
    timeout_ms: int = 500,
) -> PostgreSqlRecoverStaleJobsStore:
    return PostgreSqlRecoverStaleJobsStore(
        cast(async_sessionmaker[AsyncSession], _Factory(session)),
        operation_wait_timeout_ms=timeout_ms,
    )


def _pending_tasks() -> set[asyncio.Task[object]]:
    current = asyncio.current_task()
    return {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not current and not task.done()
    }


async def _assert_no_new_pending_tasks(before: set[asyncio.Task[object]]) -> None:
    turn = asyncio.Event()
    asyncio.get_running_loop().call_soon(turn.set)
    await asyncio.wait_for(turn.wait(), timeout=1)
    after = {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not asyncio.current_task() and not task.done()
    }
    assert after <= before


@pytest.mark.asyncio
async def test_empty_batch_rolls_back_closes_and_does_not_commit() -> None:
    connection = _Connection([{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}])
    session = _Session(connection)

    result = await _store(session).recover(_request())

    assert result.total_count == 0
    assert session.rollbacks == 1
    assert session.commits == 0
    assert session.closes == 1
    assert connection.recovery_executions == 1
    assert connection.executions[0] == (_TIMEOUT_SQL.text, {"timeout": "500ms"})


@pytest.mark.asyncio
async def test_positive_batch_commits_once_and_uses_canonical_stale_error_bindings() -> None:
    connection = _Connection([{"selected_count": 2, "requeued_count": 1, "dead_lettered_count": 1}])
    session = _Session(connection)

    result = await _store(session).recover(_request())

    assert result.total_count == 2
    assert session.commits == 1
    assert session.rollbacks == 0
    assert session.closes == 1
    assert connection.recovery_executions == 1
    assert connection.executions[1][1] == {
        "stale_seconds": 120,
        "stale_error_code": "job.stale_attempts_exhausted",
        "stale_error_message": "Stale job exhausted its maximum attempts.",
    }


@pytest.mark.asyncio
async def test_malformed_aggregate_rolls_back_and_keeps_database_state_category() -> None:
    connection = _Connection([{"selected_count": 2, "requeued_count": 1, "dead_lettered_count": 0}])
    session = _Session(connection)

    with pytest.raises(JobRecoveryDatabaseStateFailure):
        await _store(session).recover(_request())

    assert session.rollbacks == 1
    assert session.commits == 0
    assert session.closes == 1
    assert connection.recovery_executions == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("commit_behavior", ["error", "hang"])
async def test_positive_ambiguous_commit_is_fatal_quarantined_and_never_retried(
    commit_behavior: str,
) -> None:
    connection = _Connection([{"selected_count": 1, "requeued_count": 1, "dead_lettered_count": 0}])
    session = _Session(connection, commit=commit_behavior)
    before = _pending_tasks()

    with pytest.raises(JobRecoveryOutcomeUnknown) as failure:
        await asyncio.wait_for(
            _store(session, timeout_ms=120).recover(_request()),
            timeout=1,
        )

    assert failure.value.args == ("Job recovery outcome is unknown.",)
    assert connection.recovery_executions == 1
    assert session.commits == 1
    assert session.invalidations == 0
    assert not connection.reusable
    if commit_behavior == "hang":
        assert session.commit_cancelled.is_set()
    await _assert_no_new_pending_tasks(before)


@pytest.mark.asyncio
async def test_confirmed_commit_with_unsafe_close_is_operation_failure_not_unknown() -> None:
    connection = _Connection([{"selected_count": 1, "requeued_count": 1, "dead_lettered_count": 0}])
    session = _Session(connection, close="error")

    with pytest.raises(JobRecoveryDatabaseOperationFailure):
        await _store(session, timeout_ms=120).recover(_request())

    assert session.commits == 1
    assert connection.recovery_executions == 1
    assert session.invalidations == 0
    assert not connection.reusable


@pytest.mark.asyncio
async def test_empty_batch_hanging_rollback_is_bounded_quarantined_and_observed() -> None:
    connection = _Connection([{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}])
    session = _Session(connection, rollback="hang")
    before = _pending_tasks()
    started = monotonic()

    result = await asyncio.wait_for(
        _store(session, timeout_ms=120).recover(_request()),
        timeout=1,
    )

    assert result.total_count == 0
    assert monotonic() - started < 0.5
    assert session.rollback_cancelled.is_set()
    assert session.invalidations == 0
    assert not connection.reusable
    await _assert_no_new_pending_tasks(before)


@pytest.mark.asyncio
async def test_failed_rollback_uses_physical_invalidation_before_normal_close() -> None:
    connection = _Connection([{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}])
    session = _Session(connection, rollback="error")

    result = await _store(session).recover(_request())

    assert result.total_count == 0
    assert session.rollbacks == 1
    assert session.invalidations == 0
    assert session.closes == 1
    assert not connection.reusable
    assert not connection.checked_out


@pytest.mark.asyncio
async def test_session_invalidation_follows_failed_physical_invalidation() -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="error",
    )
    session = _Session(connection, rollback="error")

    result = await _store(session).recover(_request())

    assert result.total_count == 0
    assert session.invalidations == 1
    assert connection.pool.replacements == 0
    assert session.closes == 1
    assert not connection.reusable
    assert not connection.checked_out


@pytest.mark.asyncio
async def test_pool_replacement_follows_both_failed_invalidation_paths() -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="error",
    )
    session = _Session(
        connection,
        rollback="error",
        invalidate="error",
    )

    result = await _store(session).recover(_request())

    assert result.total_count == 0
    assert session.invalidations == 1
    assert connection.pool.replacements == 1
    assert session.closes == 1
    assert not connection.reusable
    assert not connection.checked_out


@pytest.mark.asyncio
async def test_all_failed_quarantine_paths_skip_normal_close_within_shared_deadline() -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="error",
        pool_replacement="error",
    )
    session = _Session(
        connection,
        rollback="error",
        close="hang",
        invalidate="error",
    )
    before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobRecoveryDatabaseOperationFailure):
        await asyncio.wait_for(
            _store(session, timeout_ms=500).recover(_request()),
            timeout=2,
        )

    assert monotonic() - started < 0.5
    assert session.closes == 0
    assert connection.reusable
    assert connection.checked_out
    with pytest.raises(
        RuntimeError,
        match="RECOVERY-PHYSICAL-CONNECTION-STILL-RETAINED",
    ):
        connection.checkout()
    await _assert_no_new_pending_tasks(before)


@pytest.mark.asyncio
async def test_ambiguous_commit_failed_quarantine_skips_close_and_stays_unknown() -> None:
    connection = _Connection(
        [{"selected_count": 1, "requeued_count": 1, "dead_lettered_count": 0}],
        invalidate="error",
        pool_replacement="error",
    )
    session = _Session(
        connection,
        commit="error",
        close="success",
        invalidate="error",
    )

    with pytest.raises(JobRecoveryOutcomeUnknown):
        await _store(session, timeout_ms=120).recover(_request())

    assert connection.recovery_executions == 1
    assert session.commits == 1
    assert session.closes == 0
    assert connection.reusable
    assert connection.checked_out


@pytest.mark.asyncio
async def test_confirmed_commit_unconfirmed_state_and_failed_quarantine_is_operation_failure() -> (
    None
):
    connection = _Connection(
        [{"selected_count": 1, "requeued_count": 1, "dead_lettered_count": 0}],
        invalidate="error",
        pool_replacement="error",
    )
    session = _Session(
        connection,
        close="success",
        invalidate="error",
        transaction_state="error",
    )

    with pytest.raises(JobRecoveryDatabaseOperationFailure) as failure:
        await _store(session, timeout_ms=120).recover(_request())

    assert not isinstance(failure.value, JobRecoveryOutcomeUnknown)
    assert connection.recovery_executions == 1
    assert session.commits == 1
    assert session.closes == 0
    assert connection.reusable
    assert connection.checked_out


@pytest.mark.asyncio
async def test_zero_batch_failed_rollback_and_failed_quarantine_skips_close() -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="error",
        pool_replacement="error",
    )
    session = _Session(
        connection,
        rollback="error",
        close="success",
        invalidate="error",
    )

    with pytest.raises(JobRecoveryDatabaseOperationFailure):
        await _store(session, timeout_ms=120).recover(_request())

    assert session.rollbacks == 1
    assert session.closes == 0
    assert connection.reusable
    assert connection.checked_out


@pytest.mark.asyncio
async def test_hanging_invalidations_are_cancelled_observed_and_close_is_skipped() -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="hang",
        pool_replacement="error",
    )
    session = _Session(
        connection,
        rollback="error",
        close="hang",
        invalidate="hang",
    )
    before = _pending_tasks()

    with pytest.raises(JobRecoveryDatabaseOperationFailure):
        await asyncio.wait_for(
            _store(session, timeout_ms=120).recover(_request()),
            timeout=1,
        )

    assert connection.invalidate_cancelled.is_set()
    assert session.invalidate_cancelled.is_set()
    assert session.closes == 0
    await _assert_no_new_pending_tasks(before)


@pytest.mark.asyncio
async def test_hanging_pool_replacement_is_bounded_and_close_is_skipped() -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="error",
        pool_replacement="hang",
    )
    session = _Session(
        connection,
        rollback="error",
        close="hang",
        invalidate="error",
    )
    before = _pending_tasks()

    with pytest.raises(JobRecoveryDatabaseOperationFailure):
        await asyncio.wait_for(
            _store(session, timeout_ms=500).recover(_request()),
            timeout=2,
        )

    assert session.closes == 0
    await _assert_no_new_pending_tasks(before)


@pytest.mark.asyncio
async def test_started_hanging_pool_replacement_is_cancelled_and_observed() -> None:
    connection = _Connection([], pool_replacement="hang")
    session = _Session(connection)
    deadline = asyncio.get_running_loop().time() + 0.1
    before = _pending_tasks()

    result = await _run_until_deadline(
        _detach_connection_pool(
            cast(AsyncSession, session),
            cast(AsyncConnection, connection),
        ),
        deadline=deadline,
        settlement_deadline=deadline,
    )

    assert result.error is not None
    await _assert_no_new_pending_tasks(before)
    assert connection.pool.replacement_cancelled.is_set()


@pytest.mark.asyncio
async def test_safe_errors_are_cause_free_and_do_not_leak_database_evidence(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    connection = _Connection(
        [],
        error=_error("57014", "canceling statement due to user request"),
    )
    session = _Session(connection)

    with pytest.raises(JobRecoveryDatabaseOperationFailure) as failure:
        await _store(session).recover(_request())

    captured = capsys.readouterr()
    serialized = (
        str(failure.value)
        + repr(failure.value)
        + repr(failure.value.args)
        + repr(failure.value.__cause__)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert failure.value.__cause__ is None
    for sentinel in (
        _SQL_SENTINEL,
        _PARAMETER_SENTINEL,
        _DRIVER_SENTINEL,
        "120",
        "job.stale_attempts_exhausted",
    ):
        assert sentinel not in serialized


@pytest.mark.asyncio
async def test_failed_cleanup_evidence_never_leaks(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    connection = _Connection(
        [{"selected_count": 0, "requeued_count": 0, "dead_lettered_count": 0}],
        invalidate="error",
        pool_replacement="error",
    )
    session = _Session(
        connection,
        rollback="error",
        close="hang",
        invalidate="error",
    )

    with pytest.raises(JobRecoveryDatabaseOperationFailure) as failure:
        await _store(session, timeout_ms=120).recover(_request())

    captured = capsys.readouterr()
    serialized = (
        str(failure.value)
        + repr(failure.value)
        + repr(failure.value.args)
        + repr(failure.value.__cause__)
        + captured.out
        + captured.err
        + caplog.text
    )
    for sentinel in (
        "RECOVERY-ROLLBACK-PRIVATE",
        "RECOVERY-CONNECTION-INVALIDATE-PRIVATE",
        "RECOVERY-SESSION-INVALIDATE-PRIVATE",
        "RECOVERY-POOL-PRIVATE",
        "RECOVERY-CLOSE-PRIVATE",
    ):
        assert sentinel not in serialized
