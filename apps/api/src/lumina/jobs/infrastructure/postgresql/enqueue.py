"""PostgreSQL implementation of idempotent job enqueue."""

from __future__ import annotations

import re
from enum import Enum, auto
from typing import Any

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
    EnqueueJob,
    EnqueueJobOutcome,
    JobDatabaseOperationFailure,
    JobDatabaseProgrammingFailure,
    JobDatabaseStateFailure,
    JobEnqueueContention,
    JobIdempotencyConflict,
    JobStatus,
    JobStorageUnavailable,
    JobType,
)
from lumina.jobs.domain.payload import JobPayloadTooLarge

_PERSISTED_TYPE_PATTERN = re.compile(r"[a-z][a-z0-9_.-]{0,127}", re.ASCII)
_DATABASE_PAYLOAD_LIMIT = 65_536
_DATABASE_PAYLOAD_ERROR = "Job payload exceeds the database size limit."
_CONTENTION_SQLSTATES = frozenset({"55P03", "57014"})
_STATE_SQLSTATE_CLASSES = frozenset({"23"})
_PROGRAMMING_SQLSTATE_CLASSES = frozenset({"0A", "2F", "3F", "42"})
_CONNECTION_SQLSTATE_CLASS = "08"

_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_PAYLOAD_SIZE_SQL = text("SELECT octet_length(convert_to(CAST(:payload AS jsonb)::text, 'UTF8'))")
_INSERT_SQL = text(
    "INSERT INTO public.job "
    "(id, job_type, idempotency_key, priority, payload, max_attempts) "
    "VALUES (:id, :job_type, :idempotency_key, :priority, "
    "CAST(:payload AS jsonb), :max_attempts) "
    "RETURNING id, job_type, status"
)
_IDEMPOTENT_INSERT_SQL = text(
    "INSERT INTO public.job "
    "(id, job_type, idempotency_key, priority, payload, max_attempts) "
    "VALUES (:id, :job_type, :idempotency_key, :priority, "
    "CAST(:payload AS jsonb), :max_attempts) "
    "ON CONFLICT (idempotency_key) DO NOTHING "
    "RETURNING id, job_type, status"
)
_REPLAY_SQL = text(
    "SELECT id, job_type, status, priority, max_attempts, "
    "payload = CAST(:payload AS jsonb) AS payload_equal "
    "FROM public.job WHERE idempotency_key = :idempotency_key"
)


class _DatabasePhase(Enum):
    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


class PostgreSqlEnqueueJobStore:
    """Persist one enqueue in a short transaction using the runtime role."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        wait_timeout_ms: int,
    ) -> None:
        if not 100 <= wait_timeout_ms <= 30_000:
            raise ValueError("Job enqueue wait timeout is invalid.")
        self._session_factory = session_factory
        self._wait_timeout_ms = wait_timeout_ms

    async def enqueue(self, job: EnqueueJob) -> EnqueueJobOutcome:
        """Insert or replay a job while replacing every raw database exception."""
        phase = _DatabasePhase.CONNECTION
        safe_failure: type[RuntimeError] | None = None
        try:
            async with self._session_factory() as session:
                async with session.begin():
                    phase = _DatabasePhase.CONNECTION
                    connection = await session.connection()
                    phase = _DatabasePhase.OPERATION
                    outcome = await self._enqueue_with_connection(connection, job)
                    phase = _DatabasePhase.EXIT
                phase = _DatabasePhase.EXIT
                return outcome
        except OSError:
            safe_failure = (
                JobStorageUnavailable
                if phase is _DatabasePhase.CONNECTION
                else JobDatabaseOperationFailure
            )
        except SQLAlchemyError as error:
            safe_failure = _classify_database_failure(error, phase)

        if safe_failure is not None:
            raise safe_failure() from None
        raise JobDatabaseOperationFailure() from None

    async def _enqueue_with_connection(
        self,
        connection: AsyncConnection,
        job: EnqueueJob,
    ) -> EnqueueJobOutcome:
        timeout = f"{self._wait_timeout_ms}ms"
        await connection.execute(_TIMEOUT_SQL, {"timeout": timeout})
        payload_size = (
            await connection.execute(_PAYLOAD_SIZE_SQL, {"payload": job.payload.database_json})
        ).scalar_one()
        if not isinstance(payload_size, int) or payload_size > _DATABASE_PAYLOAD_LIMIT:
            raise JobPayloadTooLarge(_DATABASE_PAYLOAD_ERROR)

        parameters: dict[str, Any] = {
            "id": job.id,
            "job_type": job.job_type.value,
            "idempotency_key": job.idempotency_key,
            "priority": job.priority,
            "payload": job.payload.database_json,
            "max_attempts": job.max_attempts,
        }
        statement = _INSERT_SQL if job.idempotency_key is None else _IDEMPOTENT_INSERT_SQL
        inserted = (await connection.execute(statement, parameters)).mappings().one_or_none()
        if inserted is not None:
            return _outcome(inserted, replayed=False)
        if job.idempotency_key is None:
            raise RuntimeError("Job insert returned no persisted row.")

        existing = (
            (
                await connection.execute(
                    _REPLAY_SQL,
                    {
                        "payload": job.payload.database_json,
                        "idempotency_key": job.idempotency_key,
                    },
                )
            )
            .mappings()
            .one_or_none()
        )
        if existing is None:
            raise RuntimeError("Idempotency conflict row was not found.")

        persisted_type = existing["job_type"]
        if (
            not isinstance(persisted_type, str)
            or _PERSISTED_TYPE_PATTERN.fullmatch(persisted_type) is None
            or persisted_type != JobType.SYSTEM_NOOP.value
        ):
            raise JobIdempotencyConflict()
        if (
            persisted_type != job.job_type.value
            or existing["priority"] != job.priority
            or existing["max_attempts"] != job.max_attempts
            or existing["payload_equal"] is not True
        ):
            raise JobIdempotencyConflict()
        return _outcome(existing, replayed=True)


def _classify_database_failure(
    error: SQLAlchemyError,
    phase: _DatabasePhase,
) -> type[RuntimeError]:
    sqlstate = _database_sqlstate(error) if isinstance(error, DBAPIError) else None
    if isinstance(error, DBAPIError) and sqlstate in _CONTENTION_SQLSTATES:
        return JobEnqueueContention
    if isinstance(error, IntegrityError):
        return JobDatabaseStateFailure
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return JobDatabaseStateFailure
    if isinstance(error, ProgrammingError):
        return JobDatabaseProgrammingFailure
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return JobDatabaseProgrammingFailure
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated
        or (sqlstate is not None and sqlstate.startswith(_CONNECTION_SQLSTATE_CLASS))
    ):
        return JobStorageUnavailable
    if phase is _DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return JobStorageUnavailable
    if isinstance(error, DBAPIError):
        return JobDatabaseOperationFailure
    return JobDatabaseOperationFailure


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None


def _outcome(row: RowMapping, *, replayed: bool) -> EnqueueJobOutcome:
    persisted_type = row["job_type"]
    if persisted_type != JobType.SYSTEM_NOOP.value:
        raise JobIdempotencyConflict()
    return EnqueueJobOutcome(
        id=row["id"],
        status=JobStatus(row["status"]),
        replayed=replayed,
    )
