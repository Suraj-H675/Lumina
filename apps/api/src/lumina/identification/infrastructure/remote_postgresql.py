"""Lease-fenced PostgreSQL state for remote identification polling."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker
from sqlalchemy.sql.base import Executable

from lumina.identification.domain.nova import NovaJobId, NovaSubmissionId
from lumina.identification.domain.remote_state import (
    RemoteFinalizationOutcome,
    RemoteLeaseToken,
    RemoteSolveClaim,
    RemoteSolveRecord,
    RemoteSolveState,
    RemoteStateStorageFailure,
    RemoteStateValidationError,
    RemoteTransitionReason,
    validate_remote_transition,
)

_TIMEOUT_SQL = text(
    "SELECT set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_RECORD_COLUMNS = (
    "submission_id, state, external_submission_id, external_job_id, next_poll_at, deadline_at, "
    "last_polled_at, upload_attempted_at, terminal_at, safe_reason, created_at, updated_at"
)
_READ_SQL = text(
    "SELECT " + _RECORD_COLUMNS + " FROM public.identification_remote_solve "
    "WHERE submission_id = :submission_id"
)
_CREATE_SQL = text(
    "INSERT INTO public.identification_remote_solve "
    "(submission_id, provider, state, next_poll_at, deadline_at) "
    "SELECT submission.id, 'nova', 'submitting', CURRENT_TIMESTAMP, "
    "CURRENT_TIMESTAMP + make_interval(secs => :timeout_seconds) "
    "FROM public.identification_submission AS submission "
    "WHERE submission.id = :submission_id AND submission.solver_type = 'nova' "
    "AND submission.consent_remote_processing = true AND submission.deleted_at IS NULL "
    "ON CONFLICT (submission_id) DO NOTHING RETURNING " + _RECORD_COLUMNS
)
_INSERT_INITIAL_TRANSITION_SQL = text(
    "INSERT INTO public.identification_remote_transition "
    "(event_id, submission_id, from_state, to_state, reason, recorded_at) VALUES "
    "(:event_id, :submission_id, NULL, 'submitting', 'remote_processing_consented', :recorded_at)"
)
_CLAIM_SQL = text(
    "WITH candidate AS ("
    "SELECT submission_id FROM public.identification_remote_solve "
    "WHERE state IN ('submitting', 'waiting_for_solver', 'solving', 'fetching_results') "
    "AND next_poll_at <= CURRENT_TIMESTAMP AND terminal_at IS NULL "
    "AND (active_lease_token IS NULL OR active_lease_expires_at <= CURRENT_TIMESTAMP) "
    "ORDER BY next_poll_at ASC, submission_id ASC FOR UPDATE SKIP LOCKED LIMIT 1"
    ") UPDATE public.identification_remote_solve AS solve SET "
    "active_lease_token = :lease_token, "
    "active_lease_expires_at = CURRENT_TIMESTAMP + make_interval(secs => :lease_seconds), "
    "updated_at = CURRENT_TIMESTAMP FROM candidate "
    "WHERE solve.submission_id = candidate.submission_id RETURNING "
    + ", ".join(f"solve.{column.strip()}" for column in _RECORD_COLUMNS.split(","))
    + ", CURRENT_TIMESTAMP AS database_claimed_at, solve.active_lease_expires_at"
)
_MARK_UPLOAD_SQL = text(
    "UPDATE public.identification_remote_solve SET upload_attempted_at = CURRENT_TIMESTAMP, "
    "updated_at = CURRENT_TIMESTAMP WHERE submission_id = :submission_id "
    "AND state = 'submitting' AND upload_attempted_at IS NULL "
    "AND active_lease_token = :lease_token AND active_lease_expires_at > CURRENT_TIMESTAMP "
    "RETURNING submission_id"
)
_RESCHEDULE_SQL = text(
    "UPDATE public.identification_remote_solve SET "
    "next_poll_at = CURRENT_TIMESTAMP + make_interval(secs => :poll_seconds), "
    "last_polled_at = CASE WHEN :polled THEN CURRENT_TIMESTAMP ELSE last_polled_at END, "
    "safe_reason = :safe_reason, "
    "active_lease_token = NULL, active_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP "
    "WHERE submission_id = :submission_id AND state = :state "
    "AND active_lease_token = :lease_token AND active_lease_expires_at > CURRENT_TIMESTAMP "
    "AND (state <> 'submitting' OR upload_attempted_at IS NULL) RETURNING submission_id"
)
_LOCK_CLAIM_SQL = text(
    "SELECT " + _RECORD_COLUMNS + " FROM public.identification_remote_solve "
    "WHERE submission_id = :submission_id AND state = :state "
    "AND active_lease_token = :lease_token AND active_lease_expires_at > CURRENT_TIMESTAMP "
    "FOR UPDATE"
)
_TRANSITION_UPDATE_SQL = text(
    "UPDATE public.identification_remote_solve SET state = :to_state, "
    "external_submission_id = :external_submission_id, external_job_id = :external_job_id, "
    "next_poll_at = CASE WHEN :poll_seconds IS NULL THEN NULL "
    "ELSE CURRENT_TIMESTAMP + make_interval(secs => :poll_seconds) END, "
    "last_polled_at = CASE WHEN :polled THEN CURRENT_TIMESTAMP ELSE last_polled_at END, "
    "terminal_at = CASE WHEN :terminal THEN CURRENT_TIMESTAMP ELSE NULL END, "
    "safe_reason = CASE WHEN :terminal THEN :reason ELSE NULL END, "
    "active_lease_token = NULL, active_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP "
    "WHERE submission_id = :submission_id AND state = :from_state "
    "AND active_lease_token = :lease_token RETURNING " + _RECORD_COLUMNS
)
_INSERT_TRANSITION_SQL = text(
    "INSERT INTO public.identification_remote_transition "
    "(event_id, submission_id, from_state, to_state, reason, recorded_at) VALUES "
    "(:event_id, :submission_id, :from_state, :to_state, :reason, CURRENT_TIMESTAMP)"
)


class PostgreSqlRemoteSolveRepository:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        operation_wait_timeout_ms: int = 5_000,
    ) -> None:
        if (
            type(operation_wait_timeout_ms) is not int
            or not 100 <= operation_wait_timeout_ms <= 30_000
        ):
            raise ValueError("Remote identification database timeout is invalid.")
        self._session_factory = session_factory
        self._timeout = f"{operation_wait_timeout_ms}ms"

    async def create(self, submission_id: UUID, *, timeout_seconds: int) -> RemoteSolveRecord:
        _uuid4(submission_id)
        if type(timeout_seconds) is not int or not 60 <= timeout_seconds <= 3_600:
            raise RemoteStateStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (
                        await connection.execute(
                            _CREATE_SQL,
                            {"submission_id": submission_id, "timeout_seconds": timeout_seconds},
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    raise RemoteStateStorageFailure()
                record = _record(row)
                await connection.execute(
                    _INSERT_INITIAL_TRANSITION_SQL,
                    {
                        "event_id": uuid4(),
                        "submission_id": submission_id,
                        "recorded_at": record.created_at,
                    },
                )
                return record
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (RemoteStateStorageFailure, RemoteStateValidationError):
            raise RemoteStateStorageFailure() from None
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise RemoteStateStorageFailure() from None

    async def read(self, submission_id: UUID) -> RemoteSolveRecord:
        _uuid4(submission_id)
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (await connection.execute(_READ_SQL, {"submission_id": submission_id}))
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    raise RemoteStateStorageFailure()
                return _record(row)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except RemoteStateStorageFailure:
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError, RemoteStateValidationError):
            raise RemoteStateStorageFailure() from None

    async def claim_due(
        self,
        *,
        lease_token: RemoteLeaseToken,
        lease_seconds: int,
    ) -> RemoteSolveClaim | None:
        if (
            type(lease_token) is not RemoteLeaseToken
            or type(lease_seconds) is not int
            or not 5 <= lease_seconds <= 300
        ):
            raise RemoteStateStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (
                        await connection.execute(
                            _CLAIM_SQL,
                            {"lease_token": lease_token.value, "lease_seconds": lease_seconds},
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    return None
                return RemoteSolveClaim(
                    record=_record(row),
                    lease_token=lease_token,
                    database_claimed_at=_timestamp(row["database_claimed_at"]),
                    lease_expires_at=_timestamp(row["active_lease_expires_at"]),
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except RemoteStateStorageFailure:
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError, RemoteStateValidationError):
            raise RemoteStateStorageFailure() from None

    async def mark_upload_attempt(self, claim: RemoteSolveClaim) -> RemoteFinalizationOutcome:
        _claim(claim, expected=RemoteSolveState.SUBMITTING)
        if claim.record.upload_attempted_at is not None:
            return RemoteFinalizationOutcome.FENCED
        return await self._guarded_update(
            _MARK_UPLOAD_SQL,
            {
                "submission_id": claim.record.submission_id,
                "lease_token": claim.lease_token.value,
            },
        )

    async def reschedule(
        self,
        claim: RemoteSolveClaim,
        *,
        poll_seconds: int,
        polled: bool,
        safe_reason: RemoteTransitionReason | None = None,
    ) -> RemoteFinalizationOutcome:
        _claim(claim)
        _poll_seconds(poll_seconds)
        if type(polled) is not bool or safe_reason not in {
            None,
            RemoteTransitionReason.PROVIDER_BUSY,
            RemoteTransitionReason.PROVIDER_UNAVAILABLE,
        }:
            raise RemoteStateStorageFailure()
        return await self._guarded_update(
            _RESCHEDULE_SQL,
            {
                "submission_id": claim.record.submission_id,
                "state": claim.record.state.value,
                "lease_token": claim.lease_token.value,
                "poll_seconds": poll_seconds,
                "polled": polled,
                "safe_reason": None if safe_reason is None else safe_reason.value,
            },
        )

    async def transition(
        self,
        claim: RemoteSolveClaim,
        *,
        to_state: RemoteSolveState,
        reason: RemoteTransitionReason,
        poll_seconds: int | None = None,
        external_submission_id: NovaSubmissionId | None = None,
        external_job_id: NovaJobId | None = None,
    ) -> RemoteFinalizationOutcome:
        _claim(claim)
        validate_remote_transition(claim.record.state, to_state, reason)
        terminal = to_state in {
            RemoteSolveState.SUCCEEDED,
            RemoteSolveState.UNSOLVED,
            RemoteSolveState.FAILED,
            RemoteSolveState.EXPIRED,
            RemoteSolveState.DELETED,
        }
        if terminal:
            if poll_seconds is not None:
                raise RemoteStateStorageFailure()
        else:
            _poll_seconds(poll_seconds)
        if (
            external_submission_id is not None
            and type(external_submission_id) is not NovaSubmissionId
        ):
            raise RemoteStateStorageFailure()
        if external_job_id is not None and type(external_job_id) is not NovaJobId:
            raise RemoteStateStorageFailure()

        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                locked = (
                    (
                        await connection.execute(
                            _LOCK_CLAIM_SQL,
                            {
                                "submission_id": claim.record.submission_id,
                                "state": claim.record.state.value,
                                "lease_token": claim.lease_token.value,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if locked is None:
                    return RemoteFinalizationOutcome.FENCED
                current = _record(locked)
                if current.state is not claim.record.state:
                    return RemoteFinalizationOutcome.FENCED
                next_submission = external_submission_id or current.external_submission_id
                next_job = external_job_id or current.external_job_id
                parameters: dict[str, object] = {
                    "submission_id": current.submission_id,
                    "from_state": current.state.value,
                    "to_state": to_state.value,
                    "reason": reason.value,
                    "external_submission_id": None
                    if next_submission is None
                    else next_submission.value,
                    "external_job_id": None if next_job is None else next_job.value,
                    "poll_seconds": poll_seconds,
                    "polled": current.state
                    in {RemoteSolveState.WAITING_FOR_SOLVER, RemoteSolveState.SOLVING},
                    "terminal": terminal,
                    "lease_token": claim.lease_token.value,
                }
                updated = (
                    (await connection.execute(_TRANSITION_UPDATE_SQL, parameters))
                    .mappings()
                    .one_or_none()
                )
                if updated is None:
                    return RemoteFinalizationOutcome.FENCED
                _record(updated)
                await connection.execute(
                    _INSERT_TRANSITION_SQL,
                    {
                        "event_id": uuid4(),
                        "submission_id": current.submission_id,
                        "from_state": current.state.value,
                        "to_state": to_state.value,
                        "reason": reason.value,
                    },
                )
                return RemoteFinalizationOutcome.APPLIED
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except RemoteStateStorageFailure:
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError, RemoteStateValidationError):
            raise RemoteStateStorageFailure() from None

    async def _guarded_update(
        self, statement: Executable, parameters: dict[str, object]
    ) -> RemoteFinalizationOutcome:
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (await connection.execute(statement, parameters)).mappings().one_or_none()
                return (
                    RemoteFinalizationOutcome.APPLIED
                    if row is not None
                    else RemoteFinalizationOutcome.FENCED
                )
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise RemoteStateStorageFailure() from None

    async def _set_timeouts(self, connection: AsyncConnection) -> None:
        await connection.execute(_TIMEOUT_SQL, {"timeout": self._timeout})


def _record(row: RowMapping) -> RemoteSolveRecord:
    try:
        raw_submission = row["external_submission_id"]
        raw_job = row["external_job_id"]
        raw_reason = row["safe_reason"]
        return RemoteSolveRecord(
            submission_id=_uuid4(row["submission_id"]),
            state=RemoteSolveState(str(row["state"])),
            external_submission_id=None
            if raw_submission is None
            else NovaSubmissionId(int(raw_submission)),
            external_job_id=None if raw_job is None else NovaJobId(int(raw_job)),
            next_poll_at=None if row["next_poll_at"] is None else _timestamp(row["next_poll_at"]),
            deadline_at=_timestamp(row["deadline_at"]),
            last_polled_at=None
            if row["last_polled_at"] is None
            else _timestamp(row["last_polled_at"]),
            upload_attempted_at=None
            if row["upload_attempted_at"] is None
            else _timestamp(row["upload_attempted_at"]),
            terminal_at=None if row["terminal_at"] is None else _timestamp(row["terminal_at"]),
            safe_reason=None if raw_reason is None else RemoteTransitionReason(str(raw_reason)),
            created_at=_timestamp(row["created_at"]),
            updated_at=_timestamp(row["updated_at"]),
        )
    except (KeyError, TypeError, ValueError, RemoteStateValidationError):
        raise RemoteStateStorageFailure() from None


def _claim(value: object, *, expected: RemoteSolveState | None = None) -> RemoteSolveClaim:
    if type(value) is not RemoteSolveClaim:
        raise RemoteStateStorageFailure()
    if expected is not None and value.record.state is not expected:
        raise RemoteStateStorageFailure()
    return value


def _uuid4(value: object) -> UUID:
    if not isinstance(value, UUID) or value.version != 4:
        raise RemoteStateStorageFailure()
    return value


def _timestamp(value: object) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise RemoteStateStorageFailure()
    return value.astimezone(UTC)


def _poll_seconds(value: object) -> int:
    if type(value) is not int or not 1 <= value <= 300:
        raise RemoteStateStorageFailure()
    return value


__all__ = ["PostgreSqlRemoteSolveRepository"]
