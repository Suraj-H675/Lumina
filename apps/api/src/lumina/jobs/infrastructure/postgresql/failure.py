"""PostgreSQL owner/status/attempt-guarded job failure transitions."""

from __future__ import annotations

import asyncio
import inspect
import math
from collections.abc import Awaitable, Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from enum import Enum, auto
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

from lumina.jobs.domain.failure import (
    FailJobOutcome,
    FailJobRequest,
    FailureClassification,
    JobFailureContention,
    JobFailureDatabaseOperationFailure,
    JobFailureDatabaseProgrammingFailure,
    JobFailureDatabaseStateFailure,
    JobFailureOutcomeUnknown,
    JobFailureStorageUnavailable,
    JobFailureValidationError,
    RetryScheduled,
    TerminalFailureRecorded,
    ValidatedFailJobRequest,
    validate_fail_job_request,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost
from lumina.jobs.domain.models import JobStatus

_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_STATE_SQLSTATE_CLASSES = frozenset({"23"})
_PROGRAMMING_SQLSTATE_CLASSES = frozenset({"0A", "2F", "3F", "42"})
_CONNECTION_SQLSTATE_CLASS = "08"
_PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)
_MAX_RECONCILIATION_CONNECTION_ATTEMPTS = 3
_NON_RETRYABLE_DELAY_PLACEHOLDER = 0

_BACKEND_PID_SQL = text("SELECT pg_backend_pid()")
_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_FAIL_SQL = text(
    "WITH owned AS MATERIALIZED ("
    "SELECT id, available_at AS prior_available_at, "
    "claimed_at AS prior_claimed_at, "
    "heartbeat_at AS prior_heartbeat_at, "
    "progress AS prior_progress "
    "FROM public.job "
    "WHERE id = :job_id "
    "AND status = 'running' "
    "AND claimed_by = :owner "
    "AND attempts = :expected_attempt "
    "FOR UPDATE"
    ") "
    "UPDATE public.job AS job "
    "SET status = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN 'queued' "
    "WHEN :retryable THEN 'dead_letter' "
    "ELSE 'failed' END, "
    "available_at = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts "
    "THEN transaction_timestamp() + make_interval(secs => :delay_seconds) "
    "ELSE job.available_at END, "
    "claimed_by = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN NULL "
    "ELSE job.claimed_by END, "
    "claimed_at = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN NULL "
    "ELSE job.claimed_at END, "
    "heartbeat_at = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN NULL "
    "ELSE job.heartbeat_at END, "
    "completed_at = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN NULL "
    "ELSE transaction_timestamp() END, "
    "result = NULL, "
    "progress = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN 0 "
    "ELSE job.progress END, "
    "error_code = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN NULL "
    "ELSE :error_code END, "
    "error_message = CASE "
    "WHEN :retryable AND job.attempts < job.max_attempts THEN NULL "
    "ELSE :error_message END "
    "FROM owned "
    "WHERE job.id = owned.id "
    "AND job.status = 'running' "
    "AND job.claimed_by = :owner "
    "AND job.attempts = :expected_attempt "
    "RETURNING job.status, job.attempts, job.available_at, job.completed_at, "
    "owned.prior_available_at, owned.prior_claimed_at, "
    "owned.prior_heartbeat_at, owned.prior_progress"
)
_RECONCILE_SQL = text(
    "SELECT "
    "CASE WHEN :expected_status = 'queued' THEN ("
    "status = 'queued' "
    "AND attempts = :expected_attempt "
    "AND claimed_by IS NULL "
    "AND claimed_at IS NULL "
    "AND heartbeat_at IS NULL "
    "AND completed_at IS NULL "
    "AND result IS NULL "
    "AND progress = 0 "
    "AND error_code IS NULL "
    "AND error_message IS NULL "
    "AND available_at IS NOT DISTINCT FROM :expected_available_at"
    ") ELSE ("
    "status = :expected_status "
    "AND attempts = :expected_attempt "
    "AND claimed_by = :owner "
    "AND claimed_at IS NOT DISTINCT FROM :prior_claimed_at "
    "AND heartbeat_at IS NOT DISTINCT FROM :prior_heartbeat_at "
    "AND available_at IS NOT DISTINCT FROM :prior_available_at "
    "AND completed_at IS NOT DISTINCT FROM :expected_completed_at "
    "AND result IS NULL "
    "AND progress IS NOT DISTINCT FROM :prior_progress "
    "AND error_code = :error_code "
    "AND error_message = :error_message"
    ") END AS exact_transition, "
    "("
    "status = 'running' "
    "AND attempts = :expected_attempt "
    "AND claimed_by = :owner "
    "AND claimed_at IS NOT DISTINCT FROM :prior_claimed_at "
    "AND heartbeat_at IS NOT DISTINCT FROM :prior_heartbeat_at "
    "AND available_at IS NOT DISTINCT FROM :prior_available_at "
    "AND progress IS NOT DISTINCT FROM :prior_progress "
    "AND completed_at IS NULL "
    "AND result IS NULL "
    "AND error_code IS NULL "
    "AND error_message IS NULL"
    ") AS exact_unchanged_running "
    "FROM public.job WHERE id = :job_id"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()


class _ReconciliationOutcome(Enum):
    EXACT_TRANSITION = auto()
    EXACT_UNCHANGED_RUNNING = auto()
    UNKNOWN = auto()


@dataclass(frozen=True, repr=False, slots=True)
class _FailureCommitEvidence:
    identifier: UUID
    owner: str
    expected_attempt: int
    error_code: str
    error_message: str
    expected_status: JobStatus
    expected_available_at: datetime
    expected_completed_at: datetime | None
    prior_available_at: datetime
    prior_claimed_at: datetime
    prior_heartbeat_at: datetime | None
    prior_progress: float
    primary_backend_pid: int


@dataclass(frozen=True, repr=False, slots=True)
class _MutationResult:
    outcome: FailJobOutcome
    evidence: _FailureCommitEvidence


@dataclass(frozen=True, repr=False, slots=True)
class _DeferredResult[Result]:
    value: Result | None = None
    error: BaseException | None = None


class _FreshReconciliationConnectionUnavailable(RuntimeError):
    """Internal marker for exhaustion of distinct reconciliation connections."""


class _PostUpdateDeadlineExpired(RuntimeError):
    """Internal marker for work that did not settle before the shared deadline."""


class PostgreSqlFailureJobStore:
    """Persist one closed failure transition and resolve its commit outcome."""

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

    async def fail(self, request: FailJobRequest) -> FailJobOutcome:
        """Apply exactly one guarded mutation and never retry an unknown outcome."""
        validated = validate_fail_job_request(request)

        session = self._session_factory()
        connection: AsyncConnection | None = None
        phase = _DatabasePhase.CONNECTION
        timeout_installed = False
        ownership_lost = False
        safe_failure: type[RuntimeError] | None = None
        try:
            await session.begin()
            connection = await session.connection()
            phase = _DatabasePhase.OPERATION
            await self._install_timeouts(connection)
            timeout_installed = True
            primary_backend_pid = await self._backend_pid(connection)
            mutation = await self._fail_with_connection(
                connection,
                validated,
                primary_backend_pid=primary_backend_pid,
            )
        except _PROCESS_CONTROL_ERRORS:
            if not await self._cleanup_before_mutation(session, connection):
                raise JobFailureDatabaseOperationFailure() from None
            raise
        except JobOwnershipLost:
            ownership_lost = True
        except (JobFailureDatabaseStateFailure, JobFailureValidationError):
            safe_failure = JobFailureDatabaseStateFailure
        except OSError:
            safe_failure = (
                JobFailureStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else JobFailureDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                phase,
                timeout_installed=timeout_installed,
            )
        except Exception:
            safe_failure = JobFailureDatabaseOperationFailure

        if ownership_lost or safe_failure is not None:
            if not await self._cleanup_before_mutation(session, connection):
                raise JobFailureDatabaseOperationFailure() from None
            if ownership_lost:
                raise JobOwnershipLost() from None
            if safe_failure is not None:
                raise safe_failure() from None
            raise JobFailureDatabaseOperationFailure() from None

        post_update_deadline = _new_post_update_deadline(self._operation_wait_timeout_ms)
        work_deadline = _post_update_work_deadline(
            post_update_deadline,
            self._operation_wait_timeout_ms,
        )
        commit_deadline, commit_settlement_deadline = _commit_deadlines(work_deadline)
        commit = await _run_until_deadline(
            session.commit(),
            deadline=commit_deadline,
            settlement_deadline=commit_settlement_deadline,
        )
        if commit.error is None:
            closed = await _run_until_deadline(
                session.close(),
                deadline=work_deadline,
                settlement_deadline=post_update_deadline,
            )
            if closed.error is not None:
                await self._quarantine_post_update_session(
                    session,
                    connection,
                    deadline=post_update_deadline,
                    settlement_deadline=post_update_deadline,
                )
                raise JobFailureOutcomeUnknown() from None
            return mutation.outcome

        quarantined = await self._quarantine_post_update_session(
            session,
            connection,
            deadline=work_deadline,
            settlement_deadline=post_update_deadline,
        )
        if not quarantined:
            raise JobFailureOutcomeUnknown() from None
        reconciliation = await _run_until_deadline(
            self._reconcile(
                mutation.evidence,
                deadline=work_deadline,
                settlement_deadline=post_update_deadline,
            ),
            deadline=work_deadline,
            settlement_deadline=post_update_deadline,
        )
        if reconciliation.error is not None or reconciliation.value is None:
            raise JobFailureOutcomeUnknown() from None
        if reconciliation.value is _ReconciliationOutcome.EXACT_TRANSITION:
            return mutation.outcome
        if reconciliation.value is _ReconciliationOutcome.EXACT_UNCHANGED_RUNNING:
            raise JobFailureDatabaseOperationFailure() from None
        raise JobFailureOutcomeUnknown() from None

    async def _install_timeouts(self, connection: AsyncConnection) -> None:
        timeout = f"{self._operation_wait_timeout_ms}ms"
        await connection.execute(_TIMEOUT_SQL, {"timeout": timeout})

    async def _backend_pid(self, connection: AsyncConnection) -> int:
        backend_pid = (await connection.execute(_BACKEND_PID_SQL)).scalar_one()
        if type(backend_pid) is not int or backend_pid <= 0:
            raise JobFailureDatabaseStateFailure()
        return backend_pid

    async def _fail_with_connection(
        self,
        connection: AsyncConnection,
        request: ValidatedFailJobRequest,
        *,
        primary_backend_pid: int,
    ) -> _MutationResult:
        retryable = request.retryable
        delay = (
            request.retry_delay_seconds
            if request.retry_delay_seconds is not None
            else _NON_RETRYABLE_DELAY_PLACEHOLDER
        )
        returned = (
            (
                await connection.execute(
                    _FAIL_SQL,
                    {
                        "job_id": request.job_id,
                        "owner": request.owner,
                        "expected_attempt": request.expected_attempt.value,
                        "retryable": retryable,
                        "delay_seconds": delay,
                        "error_code": request.code,
                        "error_message": request.message,
                    },
                )
            )
            .mappings()
            .all()
        )
        if not returned:
            raise JobOwnershipLost()
        if len(returned) != 1:
            raise JobFailureDatabaseStateFailure()
        return _mutation_result(
            returned[0],
            request,
            primary_backend_pid=primary_backend_pid,
        )

    async def _reconcile(
        self,
        evidence: _FailureCommitEvidence,
        *,
        deadline: float,
        settlement_deadline: float,
    ) -> _ReconciliationOutcome:
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
                        _reconciliation_parameters(evidence),
                    ),
                    deadline=deadline,
                    settlement_deadline=settlement_deadline,
                )
                if queried.error is not None or queried.value is None:
                    raise _PostUpdateDeadlineExpired
                outcome = _reconciliation_outcome(queried.value.mappings().all())
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

    async def _cleanup_before_mutation(
        self,
        session: AsyncSession,
        connection: AsyncConnection | None,
    ) -> bool:
        """Bound all cleanup under one deadline and quarantine uncertain resources."""
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

        return await self._quarantine_pre_return_session(
            session,
            connection,
            deadline=deadline,
        )

    async def _quarantine_pre_return_session(
        self,
        session: AsyncSession,
        connection: AsyncConnection | None,
        *,
        deadline: float,
    ) -> bool:
        connection_deadline, connection_settlement = _cleanup_step_deadlines(deadline)
        connection_invalidated = await _run_until_deadline(
            _invalidate_connection(connection),
            deadline=connection_deadline,
            settlement_deadline=connection_settlement,
        )
        if connection_invalidated.error is None and connection_invalidated.value is True:
            await _bounded_close_after_quarantine(session, deadline=deadline)
            return True

        session_deadline, session_settlement = _cleanup_step_deadlines(deadline)
        session_invalidated = await _run_until_deadline(
            session.invalidate(),
            deadline=session_deadline,
            settlement_deadline=session_settlement,
        )
        if session_invalidated.error is None:
            await _bounded_close_after_quarantine(session, deadline=deadline)
            return True

        pool_deadline, pool_settlement = _cleanup_step_deadlines(deadline)
        pool_replaced = await _run_until_deadline(
            _detach_connection_pool(session, connection),
            deadline=pool_deadline,
            settlement_deadline=pool_settlement,
        )
        return pool_replaced.error is None and pool_replaced.value is True

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


def _mutation_result(
    row: RowMapping,
    request: ValidatedFailJobRequest,
    *,
    primary_backend_pid: int,
) -> _MutationResult:
    try:
        status = JobStatus(row["status"])
        attempts = row["attempts"]
        available_at = row["available_at"]
        completed_at = row["completed_at"]
        prior_available_at = row["prior_available_at"]
        prior_claimed_at = row["prior_claimed_at"]
        prior_heartbeat_at = row["prior_heartbeat_at"]
        prior_progress = row["prior_progress"]
        if (
            type(attempts) is not int
            or attempts != request.expected_attempt.value
            or not _timestamp_is_aware(available_at)
            or not _timestamp_is_aware(prior_available_at)
            or not _timestamp_is_aware(prior_claimed_at)
            or not _optional_timestamp_is_aware(prior_heartbeat_at)
            or not _bounded_progress(prior_progress)
        ):
            raise JobFailureDatabaseStateFailure()
        progress = float(prior_progress)
        if request.classification is FailureClassification.RETRYABLE:
            if status is JobStatus.QUEUED:
                if completed_at is not None:
                    raise JobFailureDatabaseStateFailure()
                outcome: FailJobOutcome = RetryScheduled(
                    job_id=request.job_id,
                    expected_attempt=request.expected_attempt,
                    available_at=available_at,
                )
            elif status is JobStatus.DEAD_LETTER:
                if not _timestamp_is_aware(completed_at) or available_at != prior_available_at:
                    raise JobFailureDatabaseStateFailure()
                outcome = TerminalFailureRecorded(
                    job_id=request.job_id,
                    expected_attempt=request.expected_attempt,
                    status=status,
                    completed_at=completed_at,
                )
            else:
                raise JobFailureDatabaseStateFailure()
        elif (
            request.classification is FailureClassification.NON_RETRYABLE
            and status is JobStatus.FAILED
            and _timestamp_is_aware(completed_at)
            and available_at == prior_available_at
        ):
            outcome = TerminalFailureRecorded(
                job_id=request.job_id,
                expected_attempt=request.expected_attempt,
                status=status,
                completed_at=completed_at,
            )
        else:
            raise JobFailureDatabaseStateFailure()
        evidence = _FailureCommitEvidence(
            identifier=request.job_id,
            owner=request.owner,
            expected_attempt=request.expected_attempt.value,
            error_code=request.code,
            error_message=request.message,
            expected_status=status,
            expected_available_at=available_at,
            expected_completed_at=completed_at,
            prior_available_at=prior_available_at,
            prior_claimed_at=prior_claimed_at,
            prior_heartbeat_at=prior_heartbeat_at,
            prior_progress=progress,
            primary_backend_pid=primary_backend_pid,
        )
        return _MutationResult(outcome=outcome, evidence=evidence)
    except (
        KeyError,
        TypeError,
        ValueError,
        OverflowError,
        JobFailureValidationError,
    ):
        raise JobFailureDatabaseStateFailure() from None


def _reconciliation_parameters(evidence: _FailureCommitEvidence) -> dict[str, object]:
    return {
        "job_id": evidence.identifier,
        "owner": evidence.owner,
        "expected_attempt": evidence.expected_attempt,
        "expected_status": evidence.expected_status.value,
        "expected_available_at": evidence.expected_available_at,
        "expected_completed_at": evidence.expected_completed_at,
        "prior_available_at": evidence.prior_available_at,
        "prior_claimed_at": evidence.prior_claimed_at,
        "prior_heartbeat_at": evidence.prior_heartbeat_at,
        "prior_progress": evidence.prior_progress,
        "error_code": evidence.error_code,
        "error_message": evidence.error_message,
    }


def _reconciliation_outcome(rows: Sequence[RowMapping]) -> _ReconciliationOutcome:
    if len(rows) != 1:
        return _ReconciliationOutcome.UNKNOWN
    try:
        exact_transition = rows[0]["exact_transition"]
        exact_unchanged = rows[0]["exact_unchanged_running"]
    except (KeyError, TypeError, ValueError):
        return _ReconciliationOutcome.UNKNOWN
    if type(exact_transition) is not bool or type(exact_unchanged) is not bool:
        return _ReconciliationOutcome.UNKNOWN
    if exact_transition is exact_unchanged:
        return _ReconciliationOutcome.UNKNOWN
    if exact_transition:
        return _ReconciliationOutcome.EXACT_TRANSITION
    return _ReconciliationOutcome.EXACT_UNCHANGED_RUNNING


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


async def _bounded_close_after_quarantine(
    session: AsyncSession,
    *,
    deadline: float,
) -> None:
    close_deadline, close_settlement = _cleanup_step_deadlines(deadline)
    await _run_until_deadline(
        session.close(),
        deadline=close_deadline,
        settlement_deadline=close_settlement,
    )


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


def _new_post_update_deadline(operation_wait_timeout_ms: int) -> float:
    return asyncio.get_running_loop().time() + operation_wait_timeout_ms / 1_000


def _post_update_work_deadline(
    post_update_deadline: float,
    operation_wait_timeout_ms: int,
) -> float:
    total_seconds = operation_wait_timeout_ms / 1_000
    settlement_reserve = min(0.05, total_seconds / 10)
    return post_update_deadline - settlement_reserve


def _commit_deadlines(post_update_work_deadline: float) -> tuple[float, float]:
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
            outcome = dispose(close=False)
            await outcome
        except BaseException:
            continue
        return True
    return False


def _next_cleanup_step_deadline(deadline: float) -> float:
    now = asyncio.get_running_loop().time()
    return now + max(0.0, deadline - now) / 2


def _timestamp_is_aware(value: object) -> bool:
    try:
        return (
            isinstance(value, datetime)
            and value.tzinfo is not None
            and value.utcoffset() is not None
        )
    except (OverflowError, ValueError):
        return False


def _optional_timestamp_is_aware(value: object) -> bool:
    return value is None or _timestamp_is_aware(value)


def _bounded_progress(value: object) -> bool:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return False
    numeric = float(value)
    return math.isfinite(numeric) and 0 <= numeric <= 1


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
        return JobFailureStorageUnavailable
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and (
            sqlstate == _LOCK_TIMEOUT_SQLSTATE
            or (sqlstate == _QUERY_CANCELLED_SQLSTATE and _is_configured_statement_timeout(error))
        )
    ):
        return JobFailureContention
    if isinstance(error, IntegrityError):
        return JobFailureDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return JobFailureDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return JobFailureDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return JobFailureDatabaseProgrammingFailure
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return JobFailureStorageUnavailable
    return JobFailureDatabaseOperationFailure


def _is_configured_statement_timeout(error: DBAPIError) -> bool:
    return "statement timeout" in str(error.orig).lower()


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
