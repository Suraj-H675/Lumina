"""PostgreSQL owner-guarded successful job completion."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Coroutine, Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from enum import Enum, auto
from typing import Any
from uuid import UUID

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

from lumina.jobs.domain.completion import (
    CompleteJobRequest,
    JobCompletionContention,
    JobCompletionDatabaseOperationFailure,
    JobCompletionDatabaseProgrammingFailure,
    JobCompletionDatabaseStateFailure,
    JobCompletionOutcomeUnknown,
    JobCompletionStorageUnavailable,
    JobCompletionValidationError,
    SuccessfulJobCompletion,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost
from lumina.jobs.domain.result import (
    JobResultTooLarge,
    database_result_too_large,
)

_DATABASE_RESULT_LIMIT = 65_536
_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_STATE_SQLSTATE_CLASSES = frozenset({"23"})
_PROGRAMMING_SQLSTATE_CLASSES = frozenset({"0A", "2F", "3F", "42"})
_CONNECTION_SQLSTATE_CLASS = "08"
_PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)
_MAX_RECONCILIATION_CONNECTION_ATTEMPTS = 3

_BACKEND_PID_SQL = text("SELECT pg_backend_pid()")
_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_RESULT_SIZE_SQL = text("SELECT octet_length(convert_to(CAST(:result AS jsonb)::text, 'UTF8'))")
_COMPLETE_SQL = text(
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
_RECONCILE_SQL = text(
    "SELECT status, claimed_by, completed_at, "
    "result = CAST(:result AS jsonb) AS result_equal, "
    "progress, error_code, error_message "
    "FROM public.job WHERE id = :job_id"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()


class _ReconciliationOutcome(Enum):
    EXACT_COMPLETION = auto()
    RUNNING_UNCHANGED = auto()
    UNKNOWN = auto()


@dataclass(frozen=True, repr=False, slots=True)
class _CompletionEvidence:
    identifier: UUID
    owner: str
    result_json: str
    primary_backend_pid: int


@dataclass(frozen=True, repr=False, slots=True)
class _ReconciliationResult:
    outcome: _ReconciliationOutcome
    completed_at: datetime | None = None


@dataclass(frozen=True, repr=False, slots=True)
class _DeferredResult[Result]:
    value: Result | None = None
    error: BaseException | None = None


class _FreshReconciliationConnectionUnavailable(RuntimeError):
    """Internal marker for exhaustion of distinct reconciliation connections."""


class _PostUpdateDeadlineExpired(RuntimeError):
    """Internal marker for an operation that did not settle before the deadline."""


class PostgreSqlJobCompletionStore:
    """Complete one owned running job in a fresh, short transaction."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        operation_wait_timeout_ms: int,
    ) -> None:
        if not 100 <= operation_wait_timeout_ms <= 30_000:
            raise ValueError("Job operation wait timeout is invalid.")
        self._session_factory = session_factory
        self._operation_wait_timeout_ms = operation_wait_timeout_ms

    async def complete(
        self,
        request: CompleteJobRequest,
    ) -> SuccessfulJobCompletion:
        """Resolve commit outcome and release every resource before returning."""
        session = self._session_factory()
        phase = _DatabasePhase.CONNECTION
        timeout_installed = False
        ownership_lost = False
        result_too_large = False
        safe_failure: type[RuntimeError] | None = None
        try:
            await session.begin()
            connection = await session.connection()
            phase = _DatabasePhase.OPERATION
            await self._install_timeouts(connection)
            timeout_installed = True
            primary_backend_pid = await self._backend_pid(connection)
            await self._verify_database_result_size(connection, request)
            completion = await self._complete_with_connection(connection, request)
        except _PROCESS_CONTROL_ERRORS:
            await self._cleanup_before_mutation(session)
            raise
        except JobOwnershipLost:
            ownership_lost = True
        except JobResultTooLarge:
            result_too_large = True
        except (JobCompletionDatabaseStateFailure, JobCompletionValidationError):
            safe_failure = JobCompletionDatabaseStateFailure
        except OSError:
            safe_failure = (
                JobCompletionStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else JobCompletionDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                phase,
                timeout_installed=timeout_installed,
            )
        except Exception:
            safe_failure = JobCompletionDatabaseOperationFailure

        if ownership_lost or result_too_large or safe_failure is not None:
            await self._cleanup_before_mutation(session)
            if ownership_lost:
                raise JobOwnershipLost() from None
            if result_too_large:
                raise database_result_too_large() from None
            if safe_failure is not None:
                raise safe_failure() from None
            raise JobCompletionDatabaseOperationFailure() from None

        evidence = _CompletionEvidence(
            identifier=request.job_id,
            owner=request.owner.value,
            result_json=request.result.database_json,
            primary_backend_pid=primary_backend_pid,
        )
        post_update_deadline = _new_post_update_deadline(self._operation_wait_timeout_ms)
        post_update_work_deadline = _post_update_work_deadline(
            post_update_deadline,
            self._operation_wait_timeout_ms,
        )
        commit_deadline, commit_settlement_deadline = _commit_deadlines(post_update_work_deadline)
        commit = await _run_until_deadline(
            session.commit(),
            deadline=commit_deadline,
            settlement_deadline=commit_settlement_deadline,
        )
        if commit.error is None:
            closed = await _run_until_deadline(
                session.close(),
                deadline=post_update_work_deadline,
                settlement_deadline=post_update_deadline,
            )
            if closed.error is not None:
                await self._quarantine_post_update_session(
                    session,
                    connection,
                    deadline=post_update_deadline,
                    settlement_deadline=post_update_deadline,
                )
                raise JobCompletionOutcomeUnknown() from None
            return completion

        quarantined = await self._quarantine_post_update_session(
            session,
            connection,
            deadline=post_update_work_deadline,
            settlement_deadline=post_update_deadline,
        )
        if not quarantined:
            raise JobCompletionOutcomeUnknown() from None
        reconciliation = await _run_until_deadline(
            self._reconcile(
                evidence,
                deadline=post_update_work_deadline,
                settlement_deadline=post_update_deadline,
            ),
            deadline=post_update_work_deadline,
            settlement_deadline=post_update_deadline,
        )
        if reconciliation.error is not None or reconciliation.value is None:
            raise JobCompletionOutcomeUnknown() from None
        if reconciliation.value.outcome is _ReconciliationOutcome.EXACT_COMPLETION:
            reconciled_at = reconciliation.value.completed_at
            if reconciled_at is None:
                raise JobCompletionOutcomeUnknown() from None
            return SuccessfulJobCompletion(
                job_id=request.job_id,
                completed_at=reconciled_at,
            )
        if reconciliation.value.outcome is _ReconciliationOutcome.RUNNING_UNCHANGED:
            raise JobCompletionDatabaseOperationFailure() from None
        raise JobCompletionOutcomeUnknown() from None

    async def _install_timeouts(self, connection: AsyncConnection) -> None:
        timeout = f"{self._operation_wait_timeout_ms}ms"
        await connection.execute(_TIMEOUT_SQL, {"timeout": timeout})

    async def _backend_pid(self, connection: AsyncConnection) -> int:
        backend_pid = (await connection.execute(_BACKEND_PID_SQL)).scalar_one()
        if isinstance(backend_pid, bool) or not isinstance(backend_pid, int) or backend_pid <= 0:
            raise JobCompletionDatabaseStateFailure()
        return backend_pid

    async def _verify_database_result_size(
        self,
        connection: AsyncConnection,
        request: CompleteJobRequest,
    ) -> None:
        size = (
            await connection.execute(
                _RESULT_SIZE_SQL,
                {"result": request.result.database_json},
            )
        ).scalar_one()
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise JobCompletionDatabaseStateFailure()
        if size > _DATABASE_RESULT_LIMIT:
            raise database_result_too_large()

    async def _complete_with_connection(
        self,
        connection: AsyncConnection,
        request: CompleteJobRequest,
    ) -> SuccessfulJobCompletion:
        returned = (
            (
                await connection.execute(
                    _COMPLETE_SQL,
                    {
                        "job_id": request.job_id,
                        "owner": request.owner.value,
                        "result": request.result.database_json,
                    },
                )
            )
            .mappings()
            .all()
        )
        if not returned:
            raise JobOwnershipLost()
        if len(returned) != 1:
            raise JobCompletionDatabaseStateFailure()
        return _successful_completion(returned[0], request)

    async def _reconcile(
        self,
        evidence: _CompletionEvidence,
        *,
        deadline: float,
        settlement_deadline: float,
    ) -> _ReconciliationResult:
        for _ in range(_MAX_RECONCILIATION_CONNECTION_ATTEMPTS):
            if _deadline_expired(deadline):
                raise _PostUpdateDeadlineExpired
            session = self._session_factory()
            connection: AsyncConnection | None = None
            try:
                begun = await _run_until_deadline(
                    session.begin(),
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                )
                if begun.error is not None:
                    raise _PostUpdateDeadlineExpired
                acquired = await _run_until_deadline(
                    session.connection(),
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                )
                if acquired.error is not None or acquired.value is None:
                    raise _PostUpdateDeadlineExpired
                connection = acquired.value
                timeouts = await _run_until_deadline(
                    self._install_timeouts(connection),
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                )
                if timeouts.error is not None:
                    raise _PostUpdateDeadlineExpired
                backend = await _run_until_deadline(
                    self._backend_pid(connection),
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                )
                if backend.error is not None or backend.value is None:
                    raise _PostUpdateDeadlineExpired
                if backend.value == evidence.primary_backend_pid:
                    quarantined = await self._quarantine_post_update_session(
                        session,
                        connection,
                        deadline=deadline,
                        settlement_deadline=settlement_deadline,
                    )
                    if not quarantined:
                        raise _PostUpdateDeadlineExpired
                    continue
                queried = await _run_until_deadline(
                    connection.execute(
                        _RECONCILE_SQL,
                        {
                            "job_id": evidence.identifier,
                            "result": evidence.result_json,
                        },
                    ),
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                )
                if queried.error is not None or queried.value is None:
                    raise _PostUpdateDeadlineExpired
                rows = queried.value.mappings().all()
                outcome = _reconciliation_result(rows, evidence)
                if not await self._finish_reconciliation_session(
                    session,
                    connection,
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                ):
                    raise _PostUpdateDeadlineExpired
                return outcome
            except BaseException:
                await self._quarantine_post_update_session(
                    session,
                    connection,
                    deadline=settlement_deadline,
                    settlement_deadline=settlement_deadline,
                )
                raise
        raise _FreshReconciliationConnectionUnavailable

    async def _cleanup_before_mutation(self, session: AsyncSession) -> None:
        cleanup = await _run_deferring_process_control(self._rollback_and_close(session))
        if cleanup.error is not None:
            await self._discard_failed_session(session)

    async def _rollback_and_close(self, session: AsyncSession) -> None:
        if session.in_transaction():
            await session.rollback()
        await session.close()

    async def _discard_failed_session(self, session: AsyncSession) -> None:
        invalidated = await _run_deferring_process_control(session.invalidate())
        if invalidated.error is not None:
            await _run_deferring_process_control(session.close())

    async def _finish_reconciliation_session(
        self,
        session: AsyncSession,
        connection: AsyncConnection,
        *,
        deadline: float,
        settlement_deadline: float,
    ) -> bool:
        rolled_back = await _run_until_deadline(
            session.rollback(),
            deadline=deadline,
            settlement_deadline=settlement_deadline,
        )
        if rolled_back.error is not None:
            await self._quarantine_post_update_session(
                session,
                connection,
                deadline=deadline,
                settlement_deadline=settlement_deadline,
            )
            return False
        closed = await _run_until_deadline(
            session.close(),
            deadline=deadline,
            settlement_deadline=settlement_deadline,
        )
        if closed.error is not None:
            await self._quarantine_post_update_session(
                session,
                connection,
                deadline=deadline,
                settlement_deadline=settlement_deadline,
            )
            return False
        return True

    async def _quarantine_post_update_session(
        self,
        session: AsyncSession,
        connection: AsyncConnection | None,
        *,
        deadline: float,
        settlement_deadline: float,
    ) -> bool:
        """Discard a post-update connection without exceeding the total deadline."""
        connection_deadline = _next_cleanup_step_deadline(deadline)
        connection_invalidated = await _run_until_deadline(
            _invalidate_connection(connection),
            deadline=connection_deadline,
            settlement_deadline=connection_deadline,
        )
        session_deadline = _next_cleanup_step_deadline(deadline)
        invalidated = await _run_until_deadline(
            session.invalidate(),
            deadline=session_deadline,
            settlement_deadline=session_deadline,
        )
        invalidation_confirmed = (
            connection_invalidated.error is None and connection_invalidated.value is True
        ) or invalidated.error is None
        pool_detached = False
        if not invalidation_confirmed:
            detachment_deadline = _next_cleanup_step_deadline(deadline)
            detached = await _run_until_deadline(
                _detach_connection_pool(session, connection),
                deadline=detachment_deadline,
                settlement_deadline=detachment_deadline,
            )
            pool_detached = detached.error is None and detached.value is True
        if not invalidation_confirmed and not pool_detached:
            return False
        closed = await _run_until_deadline(
            session.close(),
            deadline=deadline,
            settlement_deadline=settlement_deadline,
        )
        return invalidation_confirmed and closed.error is None


async def _run_deferring_process_control[Result](
    operation: Coroutine[Any, Any, Result],
) -> _DeferredResult[Result]:
    """Let a lifecycle operation settle despite caller cancellation."""
    task = asyncio.create_task(operation)
    while True:
        try:
            return _DeferredResult(value=await asyncio.shield(task))
        except _PROCESS_CONTROL_ERRORS as interruption:
            if not task.done():
                continue
            if task.cancelled():
                return _DeferredResult(error=interruption)
            try:
                return _DeferredResult(value=task.result())
            except BaseException as error:
                return _DeferredResult(error=error)
        except BaseException as error:
            return _DeferredResult(error=error)


async def _run_until_deadline[Result](
    operation: Awaitable[Result],
    *,
    deadline: float,
    settlement_deadline: float,
) -> _DeferredResult[Result]:
    """Settle, cancel, and observe one post-update operation by an absolute deadline."""
    if _deadline_expired(deadline):
        _close_unstarted_awaitable(operation)
        return _DeferredResult(error=_PostUpdateDeadlineExpired())
    task = asyncio.create_task(_await_operation(operation))
    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            await _cancel_and_observe(task, deadline=settlement_deadline)
            return _DeferredResult(error=_PostUpdateDeadlineExpired())
        try:
            value = await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
            return _DeferredResult(value=value)
        except TimeoutError:
            await _cancel_and_observe(task, deadline=settlement_deadline)
            return _DeferredResult(error=_PostUpdateDeadlineExpired())
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
    """Request cancellation and consume the task now or through a done callback."""
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


def _new_post_update_deadline(operation_wait_timeout_ms: int) -> float:
    return asyncio.get_running_loop().time() + operation_wait_timeout_ms / 1_000


def _post_update_work_deadline(
    post_update_deadline: float,
    operation_wait_timeout_ms: int,
) -> float:
    """Reserve part of the one total budget for cancellation and exception observation."""
    total_seconds = operation_wait_timeout_ms / 1_000
    settlement_reserve = min(0.05, total_seconds / 10)
    return post_update_deadline - settlement_reserve


def _commit_deadlines(post_update_work_deadline: float) -> tuple[float, float]:
    """Bound commit settlement while reserving half the shared budget for reconciliation."""
    now = asyncio.get_running_loop().time()
    remaining = max(0.0, post_update_work_deadline - now)
    return now + remaining / 3, now + remaining / 2


def _deadline_expired(deadline: float) -> bool:
    return asyncio.get_running_loop().time() >= deadline


def _close_unstarted_awaitable(operation: Awaitable[object]) -> None:
    close = getattr(operation, "close", None)
    if callable(close):
        with suppress(BaseException):
            close()


async def _invalidate_connection(connection: AsyncConnection | None) -> bool:
    """Discard a connection through its bounded async or test-double capability."""
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
    """Replace the active pool without touching a possibly stalled driver connection."""
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
        if not callable(dispose):
            continue
        try:
            outcome = dispose(close=False)
            if inspect.isawaitable(outcome):
                await outcome
        except BaseException:
            continue
        return True
    return False


def _next_cleanup_step_deadline(deadline: float) -> float:
    """Give one cleanup step half the remaining shared lifecycle budget."""
    now = asyncio.get_running_loop().time()
    return now + max(0.0, deadline - now) / 2


def _successful_completion(
    row: RowMapping,
    request: CompleteJobRequest,
) -> SuccessfulJobCompletion:
    try:
        identifier = row["id"]
        completed_at = row["completed_at"]
        if identifier != request.job_id:
            raise JobCompletionDatabaseStateFailure()
        return SuccessfulJobCompletion(
            job_id=identifier,
            completed_at=completed_at,
        )
    except (
        KeyError,
        TypeError,
        ValueError,
        OverflowError,
        JobCompletionValidationError,
    ):
        raise JobCompletionDatabaseStateFailure() from None


def _reconciliation_result(
    rows: Sequence[RowMapping],
    evidence: _CompletionEvidence,
) -> _ReconciliationResult:
    if len(rows) != 1:
        return _ReconciliationResult(_ReconciliationOutcome.UNKNOWN)
    row = rows[0]
    try:
        status = row["status"]
        owner = row["claimed_by"]
        completed_at = row["completed_at"]
        result_equal = row["result_equal"]
        progress = row["progress"]
        error_code = row["error_code"]
        error_message = row["error_message"]
    except (KeyError, TypeError, ValueError):
        return _ReconciliationResult(_ReconciliationOutcome.UNKNOWN)
    if (
        status == "succeeded"
        and owner == evidence.owner
        and _timestamp_is_aware(completed_at)
        and result_equal is True
        and progress == 1
        and error_code is None
        and error_message is None
    ):
        return _ReconciliationResult(
            _ReconciliationOutcome.EXACT_COMPLETION,
            completed_at,
        )
    if (
        status == "running"
        and owner == evidence.owner
        and completed_at is None
        and result_equal is None
        and error_code is None
        and error_message is None
    ):
        return _ReconciliationResult(_ReconciliationOutcome.RUNNING_UNCHANGED)
    return _ReconciliationResult(_ReconciliationOutcome.UNKNOWN)


def _timestamp_is_aware(value: object) -> bool:
    try:
        return (
            isinstance(value, datetime)
            and value.tzinfo is not None
            and value.utcoffset() is not None
        )
    except (OverflowError, ValueError):
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
        return JobCompletionStorageUnavailable
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and (
            sqlstate == _LOCK_TIMEOUT_SQLSTATE
            or (sqlstate == _QUERY_CANCELLED_SQLSTATE and _is_configured_statement_timeout(error))
        )
    ):
        return JobCompletionContention
    if isinstance(error, IntegrityError):
        return JobCompletionDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return JobCompletionDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return JobCompletionDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return JobCompletionDatabaseProgrammingFailure
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return JobCompletionStorageUnavailable
    return JobCompletionDatabaseOperationFailure


def _is_configured_statement_timeout(error: DBAPIError) -> bool:
    return "statement timeout" in str(error.orig).lower()


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
