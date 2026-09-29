"""PostgreSQL owner-guarded successful job completion."""

from __future__ import annotations

import inspect
from collections.abc import Awaitable, Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime
from enum import Enum, auto
from uuid import UUID

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
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
from lumina.jobs.infrastructure.postgresql.database_errors import (
    DatabaseFailureKind,
    DatabasePhase,
    classify_database_failure,
)
from lumina.jobs.infrastructure.postgresql.lifecycle import (
    BACKEND_PID_SQL,
    OPERATION_TIMEOUT_SQL,
    PROCESS_CONTROL_ERRORS,
    DeferredResult,
    commit_deadlines,
    deadline_after_ms,
    deadline_expired,
    invalidate_connection,
    next_cleanup_step_deadline,
    run_deferring_process_control,
    run_until_deadline,
    work_deadline,
)

_DATABASE_RESULT_LIMIT = 65_536

_DatabasePhase = DatabasePhase

_BACKEND_PID_SQL = BACKEND_PID_SQL

_TIMEOUT_SQL = OPERATION_TIMEOUT_SQL

_DATABASE_FAILURES = {
    DatabaseFailureKind.STORAGE_UNAVAILABLE: JobCompletionStorageUnavailable,
    DatabaseFailureKind.CONTENTION: JobCompletionContention,
    DatabaseFailureKind.STATE: JobCompletionDatabaseStateFailure,
    DatabaseFailureKind.PROGRAMMING: JobCompletionDatabaseProgrammingFailure,
    DatabaseFailureKind.OPERATION: JobCompletionDatabaseOperationFailure,
}
_MAX_RECONCILIATION_CONNECTION_ATTEMPTS = 3

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
    "AND attempts = :expected_attempt "
    "RETURNING id, completed_at"
)
_RECONCILE_SQL = text(
    "SELECT status, claimed_by, completed_at, "
    "attempts = :expected_attempt AS attempt_equal, "
    "result = CAST(:result AS jsonb) AS result_equal, "
    "progress, error_code, error_message "
    "FROM public.job WHERE id = :job_id"
)


class _ReconciliationOutcome(Enum):
    EXACT_COMPLETION = auto()
    RUNNING_UNCHANGED = auto()
    UNKNOWN = auto()


@dataclass(frozen=True, repr=False, slots=True)
class _CompletionEvidence:
    identifier: UUID
    owner: str
    expected_attempt: int
    result_json: str
    primary_backend_pid: int


@dataclass(frozen=True, repr=False, slots=True)
class _ReconciliationResult:
    outcome: _ReconciliationOutcome
    completed_at: datetime | None = None


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
        except PROCESS_CONTROL_ERRORS:
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
            expected_attempt=request.expected_attempt.value,
            result_json=request.result.database_json,
            primary_backend_pid=primary_backend_pid,
        )
        post_update_deadline = deadline_after_ms(self._operation_wait_timeout_ms)
        post_update_work_deadline = work_deadline(
            post_update_deadline,
            self._operation_wait_timeout_ms,
        )
        commit_deadline, commit_settlement_deadline = commit_deadlines(post_update_work_deadline)
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
                        "expected_attempt": request.expected_attempt.value,
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
            if deadline_expired(deadline):
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
                            "expected_attempt": evidence.expected_attempt,
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
        cleanup = await run_deferring_process_control(self._rollback_and_close(session))
        if cleanup.error is not None:
            await self._discard_failed_session(session)

    async def _rollback_and_close(self, session: AsyncSession) -> None:
        if session.in_transaction():
            await session.rollback()
        await session.close()

    async def _discard_failed_session(self, session: AsyncSession) -> None:
        invalidated = await run_deferring_process_control(session.invalidate())
        if invalidated.error is not None:
            await run_deferring_process_control(session.close())

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
        connection_deadline = next_cleanup_step_deadline(deadline)
        connection_invalidated = await _run_until_deadline(
            invalidate_connection(connection),
            deadline=connection_deadline,
            settlement_deadline=connection_deadline,
        )
        session_deadline = next_cleanup_step_deadline(deadline)
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
            detachment_deadline = next_cleanup_step_deadline(deadline)
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


async def _run_until_deadline[Result](
    operation: Awaitable[Result],
    *,
    deadline: float,
    settlement_deadline: float,
) -> DeferredResult[Result]:
    return await run_until_deadline(
        operation,
        deadline=deadline,
        settlement_deadline=settlement_deadline,
        deadline_error=_PostUpdateDeadlineExpired,
    )


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
        attempt_equal = row["attempt_equal"]
        progress = row["progress"]
        error_code = row["error_code"]
        error_message = row["error_message"]
    except (KeyError, TypeError, ValueError):
        return _ReconciliationResult(_ReconciliationOutcome.UNKNOWN)
    if (
        status == "succeeded"
        and owner == evidence.owner
        and attempt_equal is True
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
        and attempt_equal is True
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
    return _DATABASE_FAILURES[
        classify_database_failure(
            error,
            phase,
            timeout_installed=timeout_installed,
        )
    ]
