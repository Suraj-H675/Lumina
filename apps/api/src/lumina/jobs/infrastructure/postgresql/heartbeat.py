"""PostgreSQL owner-guarded job heartbeat implementation."""

from __future__ import annotations

import asyncio
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

from lumina.jobs.domain.heartbeat import (
    HeartbeatJobRequest,
    HeartbeatRecorded,
    JobHeartbeatContention,
    JobHeartbeatDatabaseOperationFailure,
    JobHeartbeatDatabaseProgrammingFailure,
    JobHeartbeatDatabaseStateFailure,
    JobHeartbeatStorageUnavailable,
    JobHeartbeatValidationError,
    JobOwnershipLost,
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
_HEARTBEAT_SQL = text(
    "UPDATE public.job "
    "SET heartbeat_at = transaction_timestamp() "
    "WHERE id = :job_id "
    "AND status = 'running' "
    "AND claimed_by = :owner "
    "AND attempts = :expected_attempt "
    "RETURNING heartbeat_at"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


class PostgreSqlHeartbeatJobStore:
    """Record one guarded heartbeat in a fresh, short transaction."""

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

    async def heartbeat(self, request: HeartbeatJobRequest) -> HeartbeatRecorded:
        """Commit one owner/status-guarded update and release its session before returning."""
        session = self._session_factory()
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
            recorded = await self._heartbeat_with_connection(connection, request)
            phase = _DatabasePhase.EXIT
            await session.commit()
            await session.close()
            return recorded
        except _PROCESS_CONTROL_ERRORS:
            await _rollback_close_or_invalidate(session)
            raise
        except JobOwnershipLost:
            ownership_lost = True
        except (JobHeartbeatDatabaseStateFailure, JobHeartbeatValidationError):
            safe_failure = JobHeartbeatDatabaseStateFailure
        except OSError:
            safe_failure = (
                JobHeartbeatStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else JobHeartbeatDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(
                error,
                phase,
                timeout_installed=timeout_installed,
            )

        await _rollback_close_or_invalidate(session)
        if ownership_lost:
            raise JobOwnershipLost() from None
        if safe_failure is not None:
            raise safe_failure() from None
        raise JobHeartbeatDatabaseOperationFailure() from None

    async def _install_timeouts(self, connection: AsyncConnection) -> None:
        timeout = f"{self._operation_wait_timeout_ms}ms"
        await connection.execute(_TIMEOUT_SQL, {"timeout": timeout})

    async def _heartbeat_with_connection(
        self,
        connection: AsyncConnection,
        request: HeartbeatJobRequest,
    ) -> HeartbeatRecorded:
        returned = (
            (
                await connection.execute(
                    _HEARTBEAT_SQL,
                    {
                        "job_id": request.job_id,
                        "owner": request.owner.value,
                        "expected_attempt": request.expected_attempt.value,
                    },
                )
            )
            .mappings()
            .all()
        )
        if not returned:
            raise JobOwnershipLost()
        if len(returned) != 1:
            raise JobHeartbeatDatabaseStateFailure()
        return _heartbeat_recorded(returned[0], request)


async def _rollback_close_or_invalidate(session: AsyncSession) -> None:
    """Finish cleanup synchronously with the caller and discard uncertain connections."""
    cleanup_failed = False
    process_control: BaseException | None = None
    try:
        if session.in_transaction():
            await session.rollback()
    except _PROCESS_CONTROL_ERRORS as error:
        cleanup_failed = True
        process_control = error
    except BaseException:
        cleanup_failed = True

    try:
        await session.close()
    except _PROCESS_CONTROL_ERRORS as error:
        cleanup_failed = True
        process_control = process_control or error
    except BaseException:
        cleanup_failed = True

    if cleanup_failed:
        try:
            await session.invalidate()
        except _PROCESS_CONTROL_ERRORS as error:
            process_control = process_control or error
        except BaseException:
            pass
        try:
            await session.close()
        except _PROCESS_CONTROL_ERRORS as error:
            process_control = process_control or error
        except BaseException:
            pass

    if process_control is not None:
        raise process_control


def _heartbeat_recorded(
    row: RowMapping,
    request: HeartbeatJobRequest,
) -> HeartbeatRecorded:
    try:
        heartbeat_at = row["heartbeat_at"]
        return HeartbeatRecorded(
            job_id=request.job_id,
            heartbeat_at=heartbeat_at,
        )
    except (KeyError, TypeError, ValueError, OverflowError, JobHeartbeatValidationError):
        raise JobHeartbeatDatabaseStateFailure() from None


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
        return JobHeartbeatStorageUnavailable
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and (
            sqlstate == _LOCK_TIMEOUT_SQLSTATE
            or (sqlstate == _QUERY_CANCELLED_SQLSTATE and _is_configured_statement_timeout(error))
        )
    ):
        return JobHeartbeatContention
    if isinstance(error, IntegrityError):
        return JobHeartbeatDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return JobHeartbeatDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return JobHeartbeatDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return JobHeartbeatDatabaseProgrammingFailure
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return JobHeartbeatStorageUnavailable
    return JobHeartbeatDatabaseOperationFailure


def _is_configured_statement_timeout(error: DBAPIError) -> bool:
    return "statement timeout" in str(error.orig).lower()


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
