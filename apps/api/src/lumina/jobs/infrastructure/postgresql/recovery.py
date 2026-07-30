"""PostgreSQL atomic stale-running-job recovery."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Sequence
from contextlib import suppress
from dataclasses import dataclass
from enum import Enum, auto

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
    SQLAlchemyError,
)
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from lumina.jobs.domain.failure import FailureReason
from lumina.jobs.domain.recovery import (
    RECOVERY_BATCH_SIZE,
    JobRecoveryContention,
    JobRecoveryDatabaseOperationFailure,
    JobRecoveryDatabaseProgrammingFailure,
    JobRecoveryDatabaseStateFailure,
    JobRecoveryOutcomeUnknown,
    JobRecoveryStorageUnavailable,
    JobRecoveryValidationError,
    RecoverStaleJobsRequest,
    RecoverStaleJobsResult,
    validate_recover_stale_jobs_request,
)

_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_STATE_SQLSTATE_CLASSES = frozenset({"23"})
_PROGRAMMING_SQLSTATE_CLASSES = frozenset({"0A", "2F", "3F", "42"})
_CONNECTION_SQLSTATE_CLASS = "08"
_PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)

_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_RECOVER_SQL = text(
    "WITH stale AS MATERIALIZED ("
    "SELECT id, attempts, max_attempts "
    "FROM public.job "
    "WHERE status = 'running' "
    "AND COALESCE(heartbeat_at, claimed_at) "
    "<= transaction_timestamp() - make_interval(secs => :stale_seconds) "
    "ORDER BY COALESCE(heartbeat_at, claimed_at) ASC, claimed_at ASC, id ASC "
    "FOR UPDATE SKIP LOCKED "
    f"LIMIT {RECOVERY_BATCH_SIZE}"
    "), updated AS ("
    "UPDATE public.job AS job "
    "SET status = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN 'queued' "
    "ELSE 'dead_letter' END, "
    "available_at = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN transaction_timestamp() "
    "ELSE job.available_at END, "
    "claimed_by = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN NULL "
    "ELSE job.claimed_by END, "
    "claimed_at = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN NULL "
    "ELSE job.claimed_at END, "
    "heartbeat_at = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN NULL "
    "ELSE job.heartbeat_at END, "
    "completed_at = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN NULL "
    "ELSE transaction_timestamp() END, "
    "result = NULL, "
    "progress = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN 0 "
    "ELSE job.progress END, "
    "error_code = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN NULL "
    "ELSE :stale_error_code END, "
    "error_message = CASE "
    "WHEN stale.attempts < stale.max_attempts THEN NULL "
    "ELSE :stale_error_message END "
    "FROM stale "
    "WHERE job.id = stale.id "
    "AND job.status = 'running' "
    "AND job.attempts = stale.attempts "
    "AND job.max_attempts = stale.max_attempts "
    "RETURNING job.status"
    ") "
    "SELECT "
    "(SELECT count(*) FROM stale) AS selected_count, "
    "count(*) FILTER (WHERE status = 'queued') AS requeued_count, "
    "count(*) FILTER (WHERE status = 'dead_letter') AS dead_lettered_count "
    "FROM updated"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()


@dataclass(frozen=True, repr=False, slots=True)
class _DeferredResult[Result]:
    value: Result | None = None
    error: BaseException | None = None


class _LifecycleDeadlineExpired(RuntimeError):
    """Internal marker for work that did not settle before a shared deadline."""


class PostgreSqlRecoverStaleJobsStore:
    """Recover one fixed-size batch in one fresh bounded transaction."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        operation_wait_timeout_ms: int,
    ) -> None:
        if (
            type(operation_wait_timeout_ms) is not int
            or not 100 <= operation_wait_timeout_ms <= 30_000
        ):
            raise ValueError("Job operation wait timeout is invalid.")
        self._session_factory = session_factory
        self._operation_wait_timeout_ms = operation_wait_timeout_ms

    async def recover(
        self,
        request: RecoverStaleJobsRequest,
    ) -> RecoverStaleJobsResult:
        """Apply at most one recovery mutation and never retry an unknown batch."""
        threshold = validate_recover_stale_jobs_request(request)
        stale_reason = FailureReason.STALE_ATTEMPTS_EXHAUSTED
        stale_error_code = stale_reason.code
        stale_error_message = stale_reason.message

        session = self._session_factory()
        connection: AsyncConnection | None = None
        phase = _DatabasePhase.CONNECTION
        timeout_installed = False
        safe_failure: type[RuntimeError] | None = None
        result: RecoverStaleJobsResult | None = None
        try:
            await session.begin()
            connection = await session.connection()
            phase = _DatabasePhase.OPERATION
            await self._install_timeouts(connection)
            timeout_installed = True
            result = await self._recover_with_connection(
                connection,
                stale_seconds=threshold.value,
                stale_error_code=stale_error_code,
                stale_error_message=stale_error_message,
            )
        except _PROCESS_CONTROL_ERRORS:
            if not await self._cleanup_without_durable_mutation(session, connection):
                raise JobRecoveryDatabaseOperationFailure() from None
            raise
        except (JobRecoveryDatabaseStateFailure, JobRecoveryValidationError):
            safe_failure = JobRecoveryDatabaseStateFailure
        except OSError:
            safe_failure = (
                JobRecoveryStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else JobRecoveryDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                phase,
                timeout_installed=timeout_installed,
            )
        except Exception:
            safe_failure = JobRecoveryDatabaseOperationFailure

        if safe_failure is not None:
            if not await self._cleanup_without_durable_mutation(session, connection):
                raise JobRecoveryDatabaseOperationFailure() from None
            raise safe_failure() from None

        if result is None:
            if not await self._cleanup_without_durable_mutation(session, connection):
                raise JobRecoveryDatabaseOperationFailure() from None
            raise JobRecoveryDatabaseOperationFailure() from None

        if result.total_count == 0:
            if not await self._cleanup_without_durable_mutation(session, connection):
                raise JobRecoveryDatabaseOperationFailure() from None
            return result

        post_mutation_deadline = _new_lifecycle_deadline(self._operation_wait_timeout_ms)
        work_deadline = _work_deadline(
            post_mutation_deadline,
            self._operation_wait_timeout_ms,
        )
        commit_deadline, commit_settlement_deadline = _commit_deadlines(work_deadline)
        committed = await _run_until_deadline(
            session.commit(),
            deadline=commit_deadline,
            settlement_deadline=commit_settlement_deadline,
        )
        if committed.error is not None:
            await self._quarantine_session(
                session,
                connection,
                deadline=work_deadline,
                settlement_deadline=post_mutation_deadline,
            )
            raise JobRecoveryOutcomeUnknown() from None

        if not _transaction_is_inactive(session):
            await self._quarantine_session(
                session,
                connection,
                deadline=work_deadline,
                settlement_deadline=post_mutation_deadline,
            )
            raise JobRecoveryDatabaseOperationFailure() from None

        closed = await _run_until_deadline(
            session.close(),
            deadline=work_deadline,
            settlement_deadline=post_mutation_deadline,
        )
        if closed.error is not None:
            await self._quarantine_session(
                session,
                connection,
                deadline=post_mutation_deadline,
                settlement_deadline=post_mutation_deadline,
            )
            raise JobRecoveryDatabaseOperationFailure() from None
        return result

    async def _install_timeouts(self, connection: AsyncConnection) -> None:
        timeout = f"{self._operation_wait_timeout_ms}ms"
        await connection.execute(_TIMEOUT_SQL, {"timeout": timeout})

    async def _recover_with_connection(
        self,
        connection: AsyncConnection,
        *,
        stale_seconds: int,
        stale_error_code: str,
        stale_error_message: str,
    ) -> RecoverStaleJobsResult:
        returned = (
            (
                await connection.execute(
                    _RECOVER_SQL,
                    {
                        "stale_seconds": stale_seconds,
                        "stale_error_code": stale_error_code,
                        "stale_error_message": stale_error_message,
                    },
                )
            )
            .mappings()
            .all()
        )
        return _aggregate_result(returned)

    async def _cleanup_without_durable_mutation(
        self,
        session: AsyncSession,
        connection: AsyncConnection | None,
    ) -> bool:
        """Bound rollback, state confirmation, quarantine, and close together."""
        deadline = _new_lifecycle_deadline(self._operation_wait_timeout_ms)
        transaction_inactive = _transaction_is_inactive(session)
        if not transaction_inactive:
            rollback_deadline, rollback_settlement = _cleanup_step_deadlines(deadline)
            rollback = await _run_until_deadline(
                session.rollback(),
                deadline=rollback_deadline,
                settlement_deadline=rollback_settlement,
            )
            transaction_inactive = rollback.error is None and _transaction_is_inactive(session)

        if transaction_inactive:
            close_deadline, close_settlement = _cleanup_step_deadlines(deadline)
            closed = await _run_until_deadline(
                session.close(),
                deadline=close_deadline,
                settlement_deadline=close_settlement,
            )
            if closed.error is None:
                return True

        return await self._quarantine_session(
            session,
            connection,
            deadline=deadline,
            settlement_deadline=deadline,
        )

    async def _quarantine_session(
        self,
        session: AsyncSession,
        connection: AsyncConnection | None,
        *,
        deadline: float,
        settlement_deadline: float,
    ) -> bool:
        """Discard an uncertain connection or replace its pool within one budget."""
        connection_deadline = _next_cleanup_step_deadline(deadline)
        connection_invalidated = await _run_until_deadline(
            _invalidate_connection(connection),
            deadline=connection_deadline,
            settlement_deadline=connection_deadline,
        )
        connection_invalidation_confirmed = (
            connection_invalidated.error is None and connection_invalidated.value is True
        )

        session_invalidation_confirmed = False
        if not connection_invalidation_confirmed:
            session_deadline = _next_cleanup_step_deadline(deadline)
            session_invalidated = await _run_until_deadline(
                session.invalidate(),
                deadline=session_deadline,
                settlement_deadline=session_deadline,
            )
            session_invalidation_confirmed = session_invalidated.error is None

        quarantine_confirmed = connection_invalidation_confirmed or session_invalidation_confirmed
        pool_replaced = False
        if not quarantine_confirmed:
            pool_deadline = _next_cleanup_step_deadline(deadline)
            replaced = await _run_until_deadline(
                _detach_connection_pool(session, connection),
                deadline=pool_deadline,
                settlement_deadline=pool_deadline,
            )
            pool_replaced = replaced.error is None and replaced.value is True
            quarantine_confirmed = pool_replaced

        if not quarantine_confirmed:
            return False

        await _run_until_deadline(
            session.close(),
            deadline=deadline,
            settlement_deadline=settlement_deadline,
        )
        return True


def _aggregate_result(rows: Sequence[RowMapping]) -> RecoverStaleJobsResult:
    if len(rows) != 1:
        raise JobRecoveryDatabaseStateFailure()
    try:
        selected_count = rows[0]["selected_count"]
        requeued_count = rows[0]["requeued_count"]
        dead_lettered_count = rows[0]["dead_lettered_count"]
        if (
            type(selected_count) is not int
            or type(requeued_count) is not int
            or type(dead_lettered_count) is not int
            or selected_count < 0
            or requeued_count < 0
            or dead_lettered_count < 0
            or selected_count > RECOVERY_BATCH_SIZE
            or selected_count != requeued_count + dead_lettered_count
        ):
            raise JobRecoveryDatabaseStateFailure()
        return RecoverStaleJobsResult(
            requeued_count=requeued_count,
            dead_lettered_count=dead_lettered_count,
        )
    except (
        KeyError,
        TypeError,
        ValueError,
        OverflowError,
        JobRecoveryValidationError,
    ):
        raise JobRecoveryDatabaseStateFailure() from None


async def _run_until_deadline[Result](
    operation: Awaitable[Result],
    *,
    deadline: float,
    settlement_deadline: float,
) -> _DeferredResult[Result]:
    """Settle, cancel, and observe one lifecycle task by an absolute deadline."""
    if _deadline_expired(deadline):
        _close_unstarted_awaitable(operation)
        return _DeferredResult(error=_LifecycleDeadlineExpired())
    task = asyncio.create_task(_await_operation(operation))
    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            await _cancel_and_observe(task, deadline=settlement_deadline)
            return _DeferredResult(error=_LifecycleDeadlineExpired())
        try:
            value = await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
            return _DeferredResult(value=value)
        except TimeoutError:
            await _cancel_and_observe(task, deadline=settlement_deadline)
            return _DeferredResult(error=_LifecycleDeadlineExpired())
        except _PROCESS_CONTROL_ERRORS as interruption:
            if not task.done():
                continue
            return _completed_task_result(task, fallback=interruption)
        except BaseException as error:
            return _DeferredResult(error=error)


async def _cancel_and_observe(
    task: asyncio.Task[object],
    *,
    deadline: float,
) -> None:
    task.cancel()
    while not task.done():
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            task.add_done_callback(_consume_task_exception)
            return
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
        except TimeoutError:
            task.add_done_callback(_consume_task_exception)
            return
        except _PROCESS_CONTROL_ERRORS:
            continue
        except BaseException:
            break
    _consume_task_exception(task)


def _completed_task_result[Result](
    task: asyncio.Task[Result],
    *,
    fallback: BaseException,
) -> _DeferredResult[Result]:
    if task.cancelled():
        return _DeferredResult(error=fallback)
    try:
        return _DeferredResult(value=task.result())
    except BaseException as error:
        return _DeferredResult(error=error)


def _consume_task_exception(task: asyncio.Task[object]) -> None:
    with suppress(BaseException):
        task.exception()


async def _await_operation[Result](operation: Awaitable[Result]) -> Result:
    return await operation


def _transaction_is_inactive(session: AsyncSession) -> bool:
    try:
        transaction = session.in_transaction()
        return transaction is None or transaction is False
    except BaseException:
        return False


def _new_lifecycle_deadline(operation_wait_timeout_ms: int) -> float:
    return asyncio.get_running_loop().time() + operation_wait_timeout_ms / 1_000


def _cleanup_step_deadlines(lifecycle_deadline: float) -> tuple[float, float]:
    now = asyncio.get_running_loop().time()
    remaining = max(0.0, lifecycle_deadline - now)
    return now + remaining / 3, now + (remaining * 2) / 3


def _work_deadline(
    lifecycle_deadline: float,
    operation_wait_timeout_ms: int,
) -> float:
    total_seconds = operation_wait_timeout_ms / 1_000
    settlement_reserve = min(0.05, total_seconds / 10)
    return lifecycle_deadline - settlement_reserve


def _commit_deadlines(work_deadline: float) -> tuple[float, float]:
    now = asyncio.get_running_loop().time()
    remaining = max(0.0, work_deadline - now)
    return now + remaining / 3, now + remaining / 2


def _next_cleanup_step_deadline(deadline: float) -> float:
    now = asyncio.get_running_loop().time()
    return now + max(0.0, deadline - now) / 2


def _deadline_expired(deadline: float) -> bool:
    return asyncio.get_running_loop().time() >= deadline


def _close_unstarted_awaitable(operation: Awaitable[object]) -> None:
    close = getattr(operation, "close", None)
    if callable(close):
        with suppress(BaseException):
            close()


async def _invalidate_connection(connection: AsyncConnection | None) -> bool:
    if connection is None:
        return False
    invalidate = getattr(connection, "invalidate", None)
    if not callable(invalidate):
        return False
    outcome = invalidate()
    if inspect.isawaitable(outcome):
        await outcome
    return True


async def _detach_connection_pool(
    session: AsyncSession,
    connection: AsyncConnection | None,
) -> bool:
    targets: list[object] = []
    if connection is not None:
        targets.append(getattr(connection, "engine", None))
    targets.append(getattr(session, "bind", None))
    get_bind = getattr(session, "get_bind", None)
    if callable(get_bind):
        with suppress(BaseException):
            targets.append(get_bind())

    attempted: set[int] = set()
    for target in targets:
        if target is None or id(target) in attempted:
            continue
        attempted.add(id(target))
        dispose = getattr(target, "dispose", None)
        if not callable(dispose) or not inspect.iscoroutinefunction(dispose):
            continue
        try:
            await dispose(close=False)
        except _PROCESS_CONTROL_ERRORS:
            raise
        except BaseException:
            continue
        return True
    return False


def _classify_database_failure(
    error: SQLAlchemyError,
    phase: _DatabasePhase,
    *,
    timeout_installed: bool,
) -> type[RuntimeError]:
    sqlstate = _database_sqlstate(error) if isinstance(error, DBAPIError) else None
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated
        or (sqlstate is not None and sqlstate.startswith(_CONNECTION_SQLSTATE_CLASS))
    ):
        return JobRecoveryStorageUnavailable
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and (
            sqlstate == _LOCK_TIMEOUT_SQLSTATE
            or (sqlstate == _QUERY_CANCELLED_SQLSTATE and _is_configured_statement_timeout(error))
        )
    ):
        return JobRecoveryContention
    if isinstance(error, IntegrityError):
        return JobRecoveryDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return JobRecoveryDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return JobRecoveryDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return JobRecoveryDatabaseProgrammingFailure
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return JobRecoveryStorageUnavailable
    return JobRecoveryDatabaseOperationFailure


def _is_configured_statement_timeout(error: DBAPIError) -> bool:
    return "statement timeout" in str(error.orig).lower()


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
