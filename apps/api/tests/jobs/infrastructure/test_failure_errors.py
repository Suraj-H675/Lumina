"""Failure SQL, defensive validation, reconciliation, and safe error tests."""

from __future__ import annotations

import asyncio
from enum import Enum
from time import monotonic
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.domain.failure import (
    FailJobRequest,
    FailureClassification,
    FailureReason,
    JobFailureDatabaseOperationFailure,
    JobFailureDatabaseStateFailure,
    JobFailureOutcomeUnknown,
    JobFailureValidationError,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt
from lumina.jobs.infrastructure.postgresql.failure import (
    _FAIL_SQL,
    _RECONCILE_SQL,
    _TIMEOUT_SQL,
    PostgreSqlFailureJobStore,
    _reconciliation_outcome,
    _ReconciliationOutcome,
)
from sqlalchemy import RowMapping
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_JOB_ID = UUID("12345678-1234-4234-9234-123456789abc")
_OWNER = "worker.failure-infrastructure-secret"


class _NeverFactory:
    def __init__(self) -> None:
        self.calls = 0

    def __call__(self) -> AsyncSession:
        self.calls += 1
        raise AssertionError("SQL boundary must not be reached")


def _request(reason: FailureReason = FailureReason.HANDLER_RETRYABLE) -> FailJobRequest:
    return FailJobRequest.create(
        job_id=_JOB_ID,
        owner=JobOwnerToken(_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
        reason=reason,
    )


def test_failure_sql_has_one_exact_owner_status_attempt_guarded_mutation() -> None:
    sql = _FAIL_SQL.text
    assert sql.count("UPDATE public.job") == 1
    assert "WITH owned AS MATERIALIZED" in sql
    assert "FOR UPDATE" in sql
    assert "AND status = 'running'" in sql
    assert "AND claimed_by = :owner" in sql
    assert "AND attempts = :expected_attempt" in sql
    assert "transaction_timestamp() + make_interval(secs => :delay_seconds)" in sql
    assert "THEN 'queued'" in sql
    assert "THEN 'dead_letter'" in sql
    assert "ELSE 'failed'" in sql
    assert "RETURNING job.status, job.attempts, job.available_at, job.completed_at" in sql


def test_reconciliation_sql_returns_only_two_boolean_evidence_columns() -> None:
    sql = _RECONCILE_SQL.text
    assert "AS exact_transition" in sql
    assert "AS exact_unchanged_running" in sql
    assert "AND result IS NULL" in sql
    assert "error_code = :error_code" in sql
    assert "error_message = :error_message" in sql
    assert "SELECT payload" not in sql
    assert "SELECT result" not in sql
    assert "SELECT claimed_by" not in sql


@pytest.mark.asyncio
async def test_forged_delay_is_rejected_before_session_or_sql(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    request = _request()
    object.__setattr__(request, "_retry_delay_seconds", 31)
    factory = _NeverFactory()
    store = PostgreSqlFailureJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )

    with pytest.raises(JobFailureValidationError) as failure:
        await store.fail(request)

    assert factory.calls == 0
    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )
    for sentinel in (_OWNER, str(_JOB_ID), "31"):
        assert sentinel not in serialized


@pytest.mark.asyncio
async def test_non_retryable_request_cannot_be_forged_with_a_delay() -> None:
    request = _request(FailureReason.HANDLER_NON_RETRYABLE)
    object.__setattr__(request, "_retry_delay_seconds", 2)
    factory = _NeverFactory()
    store = PostgreSqlFailureJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )

    with pytest.raises(JobFailureValidationError):
        await store.fail(request)

    assert factory.calls == 0


@pytest.mark.asyncio
async def test_stale_or_fixture_reason_is_rejected_before_session() -> None:
    class FixtureReason(Enum):
        VALUE = FailureReason.HANDLER_RETRYABLE.value

    factory = _NeverFactory()
    store = PostgreSqlFailureJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )
    stale = object.__new__(FailJobRequest)
    base = _request()
    for name in (
        "job_id",
        "owner",
        "expected_attempt",
        "_classification",
        "_retry_delay_seconds",
    ):
        object.__setattr__(stale, name, getattr(base, name))
    object.__setattr__(stale, "reason", FailureReason.STALE_ATTEMPTS_EXHAUSTED)
    with pytest.raises(JobFailureValidationError):
        await store.fail(stale)

    fixture = object.__new__(FailJobRequest)
    for name in (
        "job_id",
        "owner",
        "expected_attempt",
        "_classification",
        "_retry_delay_seconds",
    ):
        object.__setattr__(fixture, name, getattr(base, name))
    object.__setattr__(fixture, "reason", FixtureReason.VALUE)
    with pytest.raises(JobFailureValidationError):
        await store.fail(fixture)
    assert factory.calls == 0


@pytest.mark.parametrize(
    ("rows", "expected"),
    [
        ([{"exact_transition": True, "exact_unchanged_running": False}], "transition"),
        ([{"exact_transition": False, "exact_unchanged_running": True}], "unchanged"),
        ([{"exact_transition": False, "exact_unchanged_running": False}], "unknown"),
        ([{"exact_transition": True, "exact_unchanged_running": True}], "unknown"),
        ([{"exact_transition": None, "exact_unchanged_running": False}], "unknown"),
        ([{"exact_transition": 1, "exact_unchanged_running": False}], "unknown"),
        ([], "unknown"),
        (
            [
                {"exact_transition": True, "exact_unchanged_running": False},
                {"exact_transition": True, "exact_unchanged_running": False},
            ],
            "unknown",
        ),
    ],
)
def test_reconciliation_requires_exactly_one_recognized_boolean_outcome(
    rows: list[dict[str, object]],
    expected: str,
) -> None:
    outcome = _reconciliation_outcome(cast(list[RowMapping], rows))
    expected_outcome = {
        "transition": _ReconciliationOutcome.EXACT_TRANSITION,
        "unchanged": _ReconciliationOutcome.EXACT_UNCHANGED_RUNNING,
        "unknown": _ReconciliationOutcome.UNKNOWN,
    }[expected]
    assert outcome is expected_outcome


def test_safe_operation_and_unknown_errors_are_fixed_and_redacted() -> None:
    operation = JobFailureDatabaseOperationFailure()
    unknown = JobFailureOutcomeUnknown()
    assert operation.args == ("Job failure database operation failed.",)
    assert unknown.args == ("Job failure outcome is unknown.",)
    assert repr(operation) == "JobFailureDatabaseOperationFailure(<redacted>)"
    assert repr(unknown) == "JobFailureOutcomeUnknown(<redacted>)"


class _CleanupResult:
    def __init__(
        self,
        *,
        rows: list[dict[str, object]] | None = None,
        scalar: object | None = None,
    ) -> None:
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self) -> _CleanupResult:
        return self

    def all(self) -> list[RowMapping]:
        return cast(list[RowMapping], self._rows)

    def scalar_one(self) -> object:
        return self._scalar


class _CleanupPool:
    def __init__(self, *, replacement: str = "success") -> None:
        self.replacement = replacement
        self.replacements = 0
        self.connections: list[_CleanupConnection] = []
        self.dispose_started = asyncio.Event()
        self.dispose_cancelled = asyncio.Event()

    async def replace(self, *, close: bool) -> None:
        assert close is False
        self.dispose_started.set()
        try:
            if self.replacement == "hang":
                await asyncio.Event().wait()
            if self.replacement == "error":
                raise RuntimeError("POOL-REPLACEMENT-PRIVATE")
            self.replacements += 1
            for connection in self.connections:
                connection.discard()
        finally:
            if self.replacement == "hang":
                self.dispose_cancelled.set()


class _CleanupEngine:
    def __init__(self, pool: _CleanupPool) -> None:
        self._pool = pool

    async def dispose(self, *, close: bool = True) -> None:
        await self._pool.replace(close=close)


class _CleanupConnection:
    def __init__(
        self,
        pool: _CleanupPool,
        *,
        failure: str = "zero",
        invalidate: str = "success",
        suspend_timeout: bool = False,
    ) -> None:
        self._pool = pool
        self.failure = failure
        self.invalidate_behavior = invalidate
        self.suspend_timeout = suspend_timeout
        self.engine = _CleanupEngine(pool)
        self.checked_out = False
        self.reusable = True
        self.executions: list[tuple[str, object | None]] = []
        self.failure_executions = 0
        self.reconciliation_executions = 0
        self.invalidate_started = asyncio.Event()
        self.invalidate_cancelled = asyncio.Event()
        self.timeout_started = asyncio.Event()
        self.allow_timeout = asyncio.Event()
        pool.connections.append(self)

    def checkout(self) -> None:
        if not self.reusable:
            raise RuntimeError("UNSAFE-PHYSICAL-CONNECTION")
        if self.checked_out:
            raise RuntimeError("PHYSICAL-CONNECTION-STILL-RETAINED")
        self.checked_out = True

    def release(self) -> None:
        self.checked_out = False

    def discard(self) -> None:
        self.reusable = False
        self.release()

    async def invalidate(self) -> None:
        self.invalidate_started.set()
        try:
            if self.invalidate_behavior == "hang":
                await asyncio.Event().wait()
            if self.invalidate_behavior == "error":
                raise RuntimeError("PHYSICAL-INVALIDATION-PRIVATE")
            self.discard()
        finally:
            if self.invalidate_behavior == "hang":
                self.invalidate_cancelled.set()

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _CleanupResult:
        rendered = str(statement)
        self.executions.append((rendered, parameters))
        if rendered == _TIMEOUT_SQL.text and self.suspend_timeout:
            self.timeout_started.set()
            await self.allow_timeout.wait()
        if rendered == _FAIL_SQL.text:
            self.failure_executions += 1
            if self.failure == "sql_error":
                raise RuntimeError("SQL-FAILURE-PRIVATE")
            if self.failure == "cancel":
                raise asyncio.CancelledError
            if self.failure == "malformed":
                return _CleanupResult(rows=[{"status": "queued"}])
            return _CleanupResult(rows=[])
        if rendered == _RECONCILE_SQL.text:
            self.reconciliation_executions += 1
        if "pg_backend_pid" in rendered:
            return _CleanupResult(scalar=101)
        return _CleanupResult()


class _CleanupSession:
    def __init__(
        self,
        connection: _CleanupConnection,
        *,
        acquisition: str = "success",
        rollback: str = "success",
        close: str = "success",
        invalidate: str = "success",
    ) -> None:
        self.connection_value = connection
        self.acquisition_behavior = acquisition
        self.rollback_behavior = rollback
        self.close_behavior = close
        self.invalidate_behavior = invalidate
        self.bind = connection.engine
        self.transaction_active = False
        self.rollbacks = 0
        self.closes = 0
        self.invalidations = 0
        self.unsafe_close_attempts = 0
        self.acquisition_started = asyncio.Event()
        self.acquisition_cancelled = asyncio.Event()
        self.rollback_started = asyncio.Event()
        self.rollback_cancelled = asyncio.Event()
        self.close_started = asyncio.Event()
        self.close_cancelled = asyncio.Event()
        self.invalidate_started = asyncio.Event()
        self.invalidate_cancelled = asyncio.Event()

    async def begin(self) -> None:
        self.transaction_active = True

    async def connection(self) -> AsyncConnection:
        self.acquisition_started.set()
        try:
            if self.acquisition_behavior == "hang":
                await asyncio.Event().wait()
            if self.acquisition_behavior == "error":
                raise RuntimeError("ACQUISITION-PRIVATE")
            self.connection_value.checkout()
            return cast(AsyncConnection, self.connection_value)
        finally:
            if self.acquisition_behavior == "hang":
                self.acquisition_cancelled.set()

    def get_bind(self) -> _CleanupEngine:
        return self.bind

    def in_transaction(self) -> bool:
        return self.transaction_active

    async def rollback(self) -> None:
        self.rollbacks += 1
        self.rollback_started.set()
        try:
            if self.rollback_behavior == "hang":
                await asyncio.Event().wait()
            if self.rollback_behavior == "error":
                raise RuntimeError("ROLLBACK-PRIVATE")
            self.transaction_active = False
        finally:
            if self.rollback_behavior == "hang":
                self.rollback_cancelled.set()

    async def close(self) -> None:
        self.closes += 1
        self.close_started.set()
        if self.transaction_active and self.connection_value.reusable:
            self.unsafe_close_attempts += 1
        try:
            if self.close_behavior == "hang":
                await asyncio.Event().wait()
            if self.close_behavior == "error":
                raise RuntimeError("CLOSE-PRIVATE")
            self.transaction_active = False
            self.connection_value.release()
        finally:
            if self.close_behavior == "hang":
                self.close_cancelled.set()

    async def invalidate(self) -> None:
        self.invalidations += 1
        self.invalidate_started.set()
        try:
            if self.invalidate_behavior == "hang":
                await asyncio.Event().wait()
            if self.invalidate_behavior == "error":
                raise RuntimeError("SESSION-INVALIDATION-PRIVATE")
            self.transaction_active = False
            self.connection_value.discard()
        finally:
            if self.invalidate_behavior == "hang":
                self.invalidate_cancelled.set()


class _CleanupFactory:
    def __init__(self, session: _CleanupSession) -> None:
        self.session = session
        self.calls = 0

    def __call__(self) -> _CleanupSession:
        self.calls += 1
        return self.session


def _cleanup_store(
    session: _CleanupSession,
    *,
    timeout_ms: int = 120,
) -> PostgreSqlFailureJobStore:
    return PostgreSqlFailureJobStore(
        cast(async_sessionmaker[AsyncSession], _CleanupFactory(session)),
        operation_wait_timeout_ms=timeout_ms,
    )


def _pending_tasks() -> set[asyncio.Task[object]]:
    current = asyncio.current_task()
    return {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not current and not task.done()
    }


async def _assert_cleanup_settled(
    *,
    before: set[asyncio.Task[object]],
    session: _CleanupSession,
    terminal_confirmed: bool = True,
) -> None:
    scheduler_turn = asyncio.Event()
    asyncio.get_running_loop().call_soon(scheduler_turn.set)
    await asyncio.wait_for(scheduler_turn.wait(), timeout=1)
    after = {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not asyncio.current_task() and not task.done()
    }
    assert after <= before
    if terminal_confirmed:
        assert session.transaction_active is False or session.connection_value.reusable is False
        assert not session.connection_value.checked_out
    else:
        assert session.connection_value.checked_out
        with pytest.raises(RuntimeError, match="PHYSICAL-CONNECTION-STILL-RETAINED"):
            session.connection_value.checkout()
    assert session.unsafe_close_attempts == 0


def _safe_output(
    error: BaseException,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> str:
    captured = capsys.readouterr()
    return (
        str(error)
        + repr(error)
        + repr(error.args)
        + repr(error.__cause__)
        + captured.out
        + captured.err
        + caplog.text
    )


@pytest.mark.asyncio
async def test_zero_row_with_hanging_rollback_is_bounded_and_keeps_ownership_loss() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool)
    session = _CleanupSession(connection, rollback="hang")
    before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobOwnershipLost):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert monotonic() - started < 0.5
    assert connection.failure_executions == 1
    assert connection.reconciliation_executions == 0
    assert session.rollback_cancelled.is_set()
    assert not connection.reusable
    with pytest.raises(RuntimeError, match="UNSAFE-PHYSICAL-CONNECTION"):
        connection.checkout()
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_sql_error_with_hanging_rollback_is_bounded_and_keeps_category() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool, failure="sql_error")
    session = _CleanupSession(connection, rollback="hang")
    before = _pending_tasks()

    with pytest.raises(JobFailureDatabaseOperationFailure):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert connection.failure_executions == 1
    assert connection.reconciliation_executions == 0
    assert session.rollback_cancelled.is_set()
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_malformed_returned_evidence_uses_bounded_cleanup_and_keeps_category() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool, failure="malformed")
    session = _CleanupSession(connection, rollback="hang")
    before = _pending_tasks()

    with pytest.raises(JobFailureDatabaseStateFailure):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert connection.failure_executions == 1
    assert connection.reconciliation_executions == 0
    assert session.rollback_cancelled.is_set()
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_cancellation_with_hanging_rollback_is_bounded_and_propagates() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool, failure="cancel")
    session = _CleanupSession(connection, rollback="hang")
    before = _pending_tasks()

    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert connection.failure_executions == 1
    assert session.rollback_cancelled.is_set()
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_successful_rollback_with_hanging_close_uses_physical_quarantine() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool)
    session = _CleanupSession(connection, close="hang")
    before = _pending_tasks()

    with pytest.raises(JobOwnershipLost):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert session.transaction_active is False
    assert session.close_cancelled.is_set()
    assert connection.invalidate_started.is_set()
    assert not connection.reusable
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_failed_rollback_uses_physical_invalidation_before_close() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool)
    session = _CleanupSession(connection, rollback="error")
    before = _pending_tasks()

    with pytest.raises(JobOwnershipLost):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert connection.invalidate_started.is_set()
    assert session.invalidations == 0
    assert session.closes == 1
    assert not connection.reusable
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_session_invalidation_follows_failed_physical_invalidation() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool, invalidate="error")
    session = _CleanupSession(connection, rollback="error")
    before = _pending_tasks()

    with pytest.raises(JobOwnershipLost):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert connection.invalidate_started.is_set()
    assert session.invalidate_started.is_set()
    assert not connection.reusable
    assert pool.replacements == 0
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_pool_replacement_follows_failed_rollback_and_invalidations() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool, invalidate="error")
    session = _CleanupSession(
        connection,
        rollback="error",
        invalidate="error",
    )
    before = _pending_tasks()

    with pytest.raises(JobOwnershipLost):
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert pool.dispose_started.is_set()
    assert pool.replacements == 1
    assert session.closes == 0
    assert not connection.reusable
    with pytest.raises(RuntimeError, match="UNSAFE-PHYSICAL-CONNECTION"):
        connection.checkout()
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_failed_quarantine_is_bounded_skips_close_and_uses_safe_error(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    pool = _CleanupPool(replacement="error")
    connection = _CleanupConnection(pool, invalidate="error")
    session = _CleanupSession(
        connection,
        rollback="error",
        invalidate="error",
        close="error",
    )
    before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobFailureDatabaseOperationFailure) as failure:
        await asyncio.wait_for(_cleanup_store(session).fail(_request()), timeout=1)

    assert monotonic() - started < 0.5
    assert session.closes == 0
    assert connection.failure_executions == 1
    assert connection.reconciliation_executions == 0
    serialized = _safe_output(failure.value, caplog, capsys)
    for sentinel in (
        _OWNER,
        str(_JOB_ID),
        "ROLLBACK-PRIVATE",
        "PHYSICAL-INVALIDATION-PRIVATE",
        "SESSION-INVALIDATION-PRIVATE",
        "POOL-REPLACEMENT-PRIVATE",
    ):
        assert sentinel not in serialized
    await _assert_cleanup_settled(
        before=before,
        session=session,
        terminal_confirmed=False,
    )


@pytest.mark.asyncio
async def test_cleanup_deadline_exhaustion_cancels_and_observes_every_task() -> None:
    pool = _CleanupPool(replacement="hang")
    connection = _CleanupConnection(pool, invalidate="hang")
    session = _CleanupSession(
        connection,
        rollback="hang",
        invalidate="hang",
        close="hang",
    )
    before = _pending_tasks()
    started = monotonic()

    with pytest.raises(JobFailureDatabaseOperationFailure):
        await asyncio.wait_for(
            _cleanup_store(session, timeout_ms=100).fail(_request()),
            timeout=1,
        )

    assert monotonic() - started < 0.5
    assert session.rollback_cancelled.is_set()
    assert connection.invalidate_cancelled.is_set()
    assert session.invalidate_cancelled.is_set()
    assert pool.dispose_cancelled.is_set()
    assert session.closes == 0
    await _assert_cleanup_settled(
        before=before,
        session=session,
        terminal_confirmed=False,
    )


@pytest.mark.asyncio
async def test_cancelled_acquisition_uses_bounded_cleanup_and_observes_task() -> None:
    pool = _CleanupPool()
    connection = _CleanupConnection(pool)
    session = _CleanupSession(connection, acquisition="hang", rollback="hang")
    before = _pending_tasks()
    operation = asyncio.create_task(_cleanup_store(session).fail(_request()))
    await asyncio.wait_for(session.acquisition_started.wait(), timeout=1)

    operation.cancel()
    with pytest.raises(asyncio.CancelledError):
        await asyncio.wait_for(operation, timeout=1)

    assert session.acquisition_cancelled.is_set()
    assert session.rollback_cancelled.is_set()
    assert session.invalidate_started.is_set()
    assert connection.failure_executions == 0
    await _assert_cleanup_settled(before=before, session=session)


@pytest.mark.asyncio
async def test_enum_mutation_during_await_cannot_change_sql_bindings(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    reason = FailureReason.HANDLER_RETRYABLE
    original = object.__getattribute__(reason, "_value_")
    pool = _CleanupPool()
    connection = _CleanupConnection(pool, suspend_timeout=True)
    session = _CleanupSession(connection)
    operation = asyncio.create_task(_cleanup_store(session).fail(_request(reason)))
    await asyncio.wait_for(connection.timeout_started.wait(), timeout=1)
    try:
        object.__setattr__(
            reason,
            "_value_",
            (
                "job.forged_secret",
                "FORGED-SQL-BINDING-SECRET",
                "recovery_only",
            ),
        )
        connection.allow_timeout.set()
        with pytest.raises(JobOwnershipLost) as failure:
            await asyncio.wait_for(operation, timeout=1)

        failure_bindings = [
            parameters
            for statement, parameters in connection.executions
            if statement == _FAIL_SQL.text
        ]
        assert len(failure_bindings) == 1
        bindings = cast(dict[str, object], failure_bindings[0])
        assert bindings["error_code"] == "job.handler_retryable"
        assert bindings["error_message"] == "Job handler reported a retryable failure."
        assert bindings["retryable"] is True
        assert bindings["delay_seconds"] == 4
        serialized = _safe_output(failure.value, caplog, capsys)
        assert "FORGED-SQL-BINDING-SECRET" not in serialized
        assert "job.forged_secret" not in serialized
    finally:
        connection.allow_timeout.set()
        object.__setattr__(reason, "_value_", original)
        if not operation.done():
            operation.cancel()
            with pytest.raises(asyncio.CancelledError):
                await operation


@pytest.mark.asyncio
async def test_enum_mutation_after_request_before_store_cannot_change_sql_bindings() -> None:
    reason = FailureReason.HANDLER_RETRYABLE
    original = object.__getattribute__(reason, "_value_")
    request = _request(reason)
    pool = _CleanupPool()
    connection = _CleanupConnection(pool)
    session = _CleanupSession(connection)
    try:
        object.__setattr__(
            reason,
            "_value_",
            (
                "job.forged_secret",
                "FORGED-BEFORE-STORE-SECRET",
                "terminal_recovery",
            ),
        )
        with pytest.raises(JobOwnershipLost):
            await _cleanup_store(session).fail(request)

        failure_bindings = [
            parameters
            for statement, parameters in connection.executions
            if statement == _FAIL_SQL.text
        ]
        assert len(failure_bindings) == 1
        bindings = cast(dict[str, object], failure_bindings[0])
        assert bindings["error_code"] == "job.handler_retryable"
        assert bindings["error_message"] == "Job handler reported a retryable failure."
        assert bindings["retryable"] is True
        assert bindings["delay_seconds"] == 4
    finally:
        object.__setattr__(reason, "_value_", original)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("_code", "job.forged_secret"),
        ("_message", "FORGED-SNAPSHOT-SECRET"),
        ("_classification", FailureClassification.NON_RETRYABLE),
        ("_retryable", False),
        ("_c1_eligible", False),
        ("_retry_delay_seconds", 31),
    ],
)
async def test_forged_request_snapshots_never_reach_a_session(
    field: str,
    value: object,
) -> None:
    request = _request()
    object.__setattr__(request, field, value)
    factory = _NeverFactory()
    store = PostgreSqlFailureJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )

    with pytest.raises(JobFailureValidationError):
        await store.fail(request)

    assert factory.calls == 0
