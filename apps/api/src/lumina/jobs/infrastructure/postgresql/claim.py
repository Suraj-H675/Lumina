"""PostgreSQL implementation of passive queued-job claiming."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
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

from lumina.jobs.domain.models import (
    ClaimedJob,
    ClaimJobOutcome,
    JobClaimContention,
    JobClaimDatabaseOperationFailure,
    JobClaimDatabaseProgrammingFailure,
    JobClaimDatabaseStateFailure,
    JobClaimOutcomeUnknown,
    JobClaimStorageUnavailable,
    NoEligibleJob,
    PersistedJobTypeName,
)
from lumina.jobs.domain.payload import PersistedJobPayload, PersistedJobPayloadInvalid

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
_CLAIM_SQL = text(
    "WITH candidate AS ("
    "SELECT id FROM public.job "
    "WHERE status = 'queued' "
    "AND available_at <= transaction_timestamp() "
    "AND attempts < max_attempts "
    "ORDER BY priority DESC, available_at ASC, created_at ASC, id ASC "
    "FOR UPDATE SKIP LOCKED LIMIT 1"
    ") "
    "UPDATE public.job AS claimed "
    "SET status = 'running', "
    "attempts = claimed.attempts + 1, "
    "claimed_by = :claimed_by, "
    "claimed_at = transaction_timestamp(), "
    "heartbeat_at = transaction_timestamp() "
    "FROM candidate WHERE claimed.id = candidate.id "
    "RETURNING claimed.id, claimed.job_type, claimed.payload, claimed.attempts, "
    "claimed.max_attempts, claimed.claimed_at, claimed.heartbeat_at"
)
_RECONCILE_SQL = text(
    "SELECT status, claimed_by, attempts, claimed_at, heartbeat_at FROM public.job WHERE id = :id"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


class _ReconciliationOutcome(Enum):
    EXACT_CLAIM = auto()
    QUEUED_UNCHANGED = auto()
    FOREIGN_OWNER = auto()
    UNKNOWN = auto()


@dataclass(frozen=True, repr=False, slots=True)
class _ClaimEvidence:
    identifier: UUID
    owner: str
    attempt: int
    claimed_at: datetime
    heartbeat_at: datetime
    primary_backend_pid: int


@dataclass(frozen=True, repr=False, slots=True)
class _DeferredResult[Result]:
    value: Result | None = None
    error: BaseException | None = None


class _FreshReconciliationConnectionUnavailable(RuntimeError):
    """Internal marker for exhaustion of distinct reconciliation connections."""


class PostgreSqlClaimJobStore:
    """Atomically claim one eligible row using the least-privilege runtime role."""

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

    async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
        """Claim one row with explicit commit acknowledgement and reconciliation."""
        session = self._session_factory()
        phase = _DatabasePhase.CONNECTION
        timeout_installed = False
        safe_failure: type[RuntimeError] | None = None
        try:
            await session.begin()
            connection = await session.connection()
            phase = _DatabasePhase.OPERATION
            await self._install_timeouts(connection)
            timeout_installed = True
            primary_backend_pid = await self._backend_pid(connection)
            outcome = await self._claim_with_connection(connection, claimed_by=claimed_by)
        except _PROCESS_CONTROL_ERRORS:
            await self._cleanup_before_mutation(session)
            raise
        except (JobClaimDatabaseStateFailure, PersistedJobPayloadInvalid):
            safe_failure = JobClaimDatabaseStateFailure
        except OSError:
            safe_failure = (
                JobClaimStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else JobClaimDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                phase,
                timeout_installed=timeout_installed,
            )

        if safe_failure is not None:
            await self._cleanup_before_mutation(session)
            raise safe_failure() from None

        if isinstance(outcome, NoEligibleJob):
            return await self._finish_no_candidate(session, outcome)

        evidence = _ClaimEvidence(
            identifier=outcome.id,
            owner=claimed_by,
            attempt=outcome.attempts,
            claimed_at=outcome.claimed_at,
            heartbeat_at=outcome.heartbeat_at,
            primary_backend_pid=primary_backend_pid,
        )
        commit = await _run_deferring_process_control(session.commit())
        if commit.error is None:
            await self._close_after_confirmed_commit(session)
            return outcome

        await self._discard_failed_session(session)
        reconciliation = await _run_deferring_process_control(self._reconcile(evidence))
        if reconciliation.error is not None or reconciliation.value is None:
            raise JobClaimOutcomeUnknown() from None
        if reconciliation.value is _ReconciliationOutcome.EXACT_CLAIM:
            return outcome
        if reconciliation.value is _ReconciliationOutcome.QUEUED_UNCHANGED:
            raise JobClaimDatabaseOperationFailure() from None
        if reconciliation.value is _ReconciliationOutcome.FOREIGN_OWNER:
            raise JobClaimDatabaseStateFailure() from None
        raise JobClaimOutcomeUnknown() from None

    async def _finish_no_candidate(
        self,
        session: AsyncSession,
        outcome: NoEligibleJob,
    ) -> NoEligibleJob:
        safe_failure: type[RuntimeError] | None = None
        try:
            await session.commit()
            await session.close()
        except _PROCESS_CONTROL_ERRORS:
            await self._cleanup_before_mutation(session)
            raise
        except OSError:
            safe_failure = JobClaimDatabaseOperationFailure
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                _DatabasePhase.EXIT,
                timeout_installed=True,
            )
        if safe_failure is not None:
            await self._discard_failed_session(session)
            raise safe_failure() from None
        return outcome

    async def _install_timeouts(self, connection: AsyncConnection) -> None:
        timeout = f"{self._operation_wait_timeout_ms}ms"
        await connection.execute(_TIMEOUT_SQL, {"timeout": timeout})

    async def _backend_pid(self, connection: AsyncConnection) -> int:
        backend_pid = (await connection.execute(_BACKEND_PID_SQL)).scalar_one()
        if isinstance(backend_pid, bool) or not isinstance(backend_pid, int) or backend_pid <= 0:
            raise JobClaimDatabaseStateFailure()
        return backend_pid

    async def _claim_with_connection(
        self,
        connection: AsyncConnection,
        *,
        claimed_by: str,
    ) -> ClaimJobOutcome:
        returned = (
            (await connection.execute(_CLAIM_SQL, {"claimed_by": claimed_by}))
            .mappings()
            .one_or_none()
        )
        if returned is None:
            return NoEligibleJob()
        return _claimed_job(returned)

    async def _reconcile(self, evidence: _ClaimEvidence) -> _ReconciliationOutcome:
        timeout_seconds = self._operation_wait_timeout_ms / 1_000
        async with asyncio.timeout(timeout_seconds):
            for _ in range(_MAX_RECONCILIATION_CONNECTION_ATTEMPTS):
                session = self._session_factory()
                try:
                    await session.begin()
                    connection = await session.connection()
                    await self._install_timeouts(connection)
                    reconciliation_backend_pid = await self._backend_pid(connection)
                    if reconciliation_backend_pid == evidence.primary_backend_pid:
                        await self._discard_failed_session(session)
                        continue
                    row = (
                        (
                            await connection.execute(
                                _RECONCILE_SQL,
                                {"id": evidence.identifier},
                            )
                        )
                        .mappings()
                        .one_or_none()
                    )
                    outcome = _reconciliation_outcome(row, evidence)
                    await session.rollback()
                    await session.close()
                    return outcome
                except BaseException:
                    await self._discard_failed_session(session)
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

    async def _close_after_confirmed_commit(self, session: AsyncSession) -> None:
        close = await _run_deferring_process_control(session.close())
        if close.error is not None:
            await self._discard_failed_session(session)

    async def _discard_failed_session(self, session: AsyncSession) -> None:
        invalidated = await _run_deferring_process_control(session.invalidate())
        if invalidated.error is not None:
            await _run_deferring_process_control(session.close())


async def _run_deferring_process_control[Result](
    operation: Coroutine[Any, Any, Result],
) -> _DeferredResult[Result]:
    """Let an in-flight lifecycle operation settle despite caller cancellation."""
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


def _claimed_job(row: RowMapping) -> ClaimedJob:
    mapping_failed = False
    try:
        identifier = row["id"]
        persisted_type = row["job_type"]
        attempts = row["attempts"]
        max_attempts = row["max_attempts"]
        claimed_at = row["claimed_at"]
        heartbeat_at = row["heartbeat_at"]
        if (
            not isinstance(identifier, UUID)
            or not isinstance(persisted_type, str)
            or isinstance(attempts, bool)
            or not isinstance(attempts, int)
            or isinstance(max_attempts, bool)
            or not isinstance(max_attempts, int)
            or not isinstance(claimed_at, datetime)
            or not isinstance(heartbeat_at, datetime)
            or not 1 <= attempts <= max_attempts <= 5
            or claimed_at.tzinfo is None
            or heartbeat_at.tzinfo is None
            or heartbeat_at < claimed_at
        ):
            mapping_failed = True
        else:
            payload = PersistedJobPayload.from_decoded(row["payload"])
    except (KeyError, TypeError, ValueError, RecursionError, PersistedJobPayloadInvalid):
        mapping_failed = True

    if mapping_failed:
        raise JobClaimDatabaseStateFailure()
    return ClaimedJob(
        id=identifier,
        job_type=PersistedJobTypeName(persisted_type),
        payload=payload,
        attempts=attempts,
        max_attempts=max_attempts,
        claimed_at=claimed_at,
        heartbeat_at=heartbeat_at,
    )


def _reconciliation_outcome(
    row: RowMapping | None,
    evidence: _ClaimEvidence,
) -> _ReconciliationOutcome:
    if row is None:
        return _ReconciliationOutcome.UNKNOWN
    try:
        status = row["status"]
        owner = row["claimed_by"]
        attempts = row["attempts"]
        claimed_at = row["claimed_at"]
        heartbeat_at = row["heartbeat_at"]
    except (KeyError, TypeError, ValueError):
        return _ReconciliationOutcome.UNKNOWN
    if (
        status == "running"
        and owner == evidence.owner
        and attempts == evidence.attempt
        and claimed_at == evidence.claimed_at
        and heartbeat_at == evidence.heartbeat_at
    ):
        return _ReconciliationOutcome.EXACT_CLAIM
    if (
        status == "queued"
        and owner is None
        and attempts == evidence.attempt - 1
        and claimed_at is None
        and heartbeat_at is None
    ):
        return _ReconciliationOutcome.QUEUED_UNCHANGED
    if status == "running" and owner != evidence.owner:
        return _ReconciliationOutcome.FOREIGN_OWNER
    return _ReconciliationOutcome.UNKNOWN


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
        return JobClaimStorageUnavailable
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and (
            sqlstate == _LOCK_TIMEOUT_SQLSTATE
            or (sqlstate == _QUERY_CANCELLED_SQLSTATE and _is_configured_statement_timeout(error))
        )
    ):
        return JobClaimContention
    if isinstance(error, IntegrityError):
        return JobClaimDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return JobClaimDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return JobClaimDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return JobClaimDatabaseProgrammingFailure
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return JobClaimStorageUnavailable
    return JobClaimDatabaseOperationFailure


def _is_configured_statement_timeout(error: DBAPIError) -> bool:
    message = str(error.orig).lower()
    return "statement timeout" in message


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
