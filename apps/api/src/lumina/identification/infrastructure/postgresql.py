"""PostgreSQL repository for private temporary identification submissions."""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from lumina.identification.domain.storage import PrivateObjectKey
from lumina.identification.domain.submissions import (
    CreateIdentificationSubmission,
    FakeSolverResult,
    IdentificationSubmission,
    IdentificationSubmissionState,
    IdentificationSubmissionStatus,
    SubmissionNotFound,
    SubmissionStateConflict,
    SubmissionStorageFailure,
)
from lumina.identification.domain.uploads import UploadMediaType

_TIMEOUT_SQL = text(
    "SELECT set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
_SELECT_COLUMNS = (
    "id, job_id, storage_object_key, original_filename, mime_type, byte_size, width, height, "
    "sha256, retention_until, deleted_at, created_at"
)
_SELECT = f"SELECT {_SELECT_COLUMNS} FROM public.identification_submission"
_INSERT_SQL = text(
    "INSERT INTO public.identification_submission "
    "(id, storage_object_key, original_filename, mime_type, byte_size, width, height, sha256, "
    "solver_type, consent_remote_processing, retention_until) VALUES "
    "(:id, :storage_object_key, :original_filename, :mime_type, :byte_size, :width, :height, "
    ":sha256, 'fake', false, :retention_until) RETURNING "
    "id, job_id, storage_object_key, original_filename, mime_type, byte_size, width, height, "
    "sha256, retention_until, deleted_at, created_at"
)
_READ_SQL = text(f"{_SELECT} WHERE id = :id")
_STATUS_SQL = text(
    "SELECT submission.id, submission.job_id, submission.created_at, submission.deleted_at, "
    "job.status AS job_status, job.progress AS job_progress, job.result AS job_result, "
    "job.error_code AS job_error_code, job.completed_at AS job_completed_at "
    "FROM public.identification_submission AS submission "
    "LEFT JOIN public.job AS job ON job.id = submission.job_id WHERE submission.id = :id"
)
_FAILURE_CODE = re.compile(r"[a-z][a-z0-9_.-]{0,127}", re.ASCII)
_FAKE_RESULT = {
    "outcome": "fixture_solved",
    "solver_type": "fake",
    "solver_version": "phase6a-fixture-v1",
    "synthetic": True,
}
_ATTACH_SQL = text(
    "UPDATE public.identification_submission SET job_id = :job_id "
    "WHERE id = :id AND deleted_at IS NULL AND job_id IS NULL RETURNING "
    "id, job_id, storage_object_key, original_filename, mime_type, byte_size, width, height, "
    "sha256, retention_until, deleted_at, created_at"
)
_SCRUB_SQL = text(
    "UPDATE public.identification_submission SET storage_object_key = NULL, "
    "original_filename = NULL, sha256 = NULL, deleted_at = :deleted_at "
    "WHERE id = :id AND deleted_at IS NULL AND storage_object_key = :storage_object_key "
    "RETURNING id, job_id, storage_object_key, original_filename, mime_type, byte_size, width, "
    "height, sha256, retention_until, deleted_at, created_at"
)
_RETENTION_SQL = text(
    "SELECT submission.id, submission.job_id, submission.storage_object_key, "
    "submission.original_filename, submission.mime_type, submission.byte_size, "
    "submission.width, submission.height, submission.sha256, submission.retention_until, "
    "submission.deleted_at, submission.created_at FROM public.identification_submission "
    "AS submission LEFT JOIN public.job AS job ON job.id = submission.job_id "
    "WHERE submission.deleted_at IS NULL "
    "AND ((submission.job_id IS NULL AND submission.retention_until <= :now) "
    "OR (job.status IN ('succeeded', 'failed', 'dead_letter') "
    "AND GREATEST(submission.retention_until, job.completed_at + "
    "make_interval(secs => :terminal_retention_seconds)) <= :now)) "
    "ORDER BY submission.retention_until ASC, submission.id ASC LIMIT :limit"
)


class PostgreSqlIdentificationSubmissionRepository:
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
            raise ValueError("Identification database timeout is invalid.")
        self._session_factory = session_factory
        self._timeout = f"{operation_wait_timeout_ms}ms"

    async def create(self, command: CreateIdentificationSubmission) -> IdentificationSubmission:
        if type(command) is not CreateIdentificationSubmission:
            raise SubmissionStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (
                        await connection.execute(
                            _INSERT_SQL,
                            {
                                "id": command.id,
                                "storage_object_key": command.storage_object_key.value,
                                "original_filename": command.original_filename,
                                "mime_type": command.media_type.value,
                                "byte_size": command.byte_size,
                                "width": command.width,
                                "height": command.height,
                                "sha256": command.sha256,
                                "retention_until": command.retention_until,
                            },
                        )
                    )
                    .mappings()
                    .one()
                )
                return _submission(row)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except SubmissionStorageFailure:
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SubmissionStorageFailure() from None

    async def read(self, submission_id: UUID) -> IdentificationSubmission:
        _validate_uuid(submission_id)
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (await connection.execute(_READ_SQL, {"id": submission_id}))
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    raise SubmissionNotFound()
                return _submission(row)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (SubmissionNotFound, SubmissionStorageFailure):
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SubmissionStorageFailure() from None

    async def read_status(self, submission_id: UUID) -> IdentificationSubmissionStatus:
        _validate_uuid(submission_id)
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (await connection.execute(_STATUS_SQL, {"id": submission_id}))
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    raise SubmissionNotFound()
                return _status(row)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (SubmissionNotFound, SubmissionStorageFailure):
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SubmissionStorageFailure() from None

    async def attach_job(self, submission_id: UUID, job_id: UUID) -> IdentificationSubmission:
        _validate_uuid(submission_id)
        _validate_uuid(job_id)
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (
                        await connection.execute(
                            _ATTACH_SQL,
                            {"id": submission_id, "job_id": job_id},
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    await self._raise_missing_or_conflict(connection, submission_id)
                assert row is not None
                return _submission(row)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (SubmissionNotFound, SubmissionStateConflict, SubmissionStorageFailure):
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SubmissionStorageFailure() from None

    async def scrub_deleted(
        self,
        submission_id: UUID,
        *,
        expected_key: PrivateObjectKey,
        deleted_at: datetime,
    ) -> IdentificationSubmission:
        _validate_uuid(submission_id)
        if type(expected_key) is not PrivateObjectKey:
            raise SubmissionStorageFailure()
        deleted_at = _timestamp(deleted_at)
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                row = (
                    (
                        await connection.execute(
                            _SCRUB_SQL,
                            {
                                "id": submission_id,
                                "storage_object_key": expected_key.value,
                                "deleted_at": deleted_at,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if row is None:
                    await self._raise_missing_or_conflict(connection, submission_id)
                assert row is not None
                return _submission(row)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (SubmissionNotFound, SubmissionStateConflict, SubmissionStorageFailure):
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SubmissionStorageFailure() from None

    async def retention_due(
        self,
        *,
        now: datetime,
        limit: int,
        terminal_retention: timedelta,
    ) -> tuple[IdentificationSubmission, ...]:
        now = _timestamp(now)
        if type(limit) is not int or not 1 <= limit <= 100:
            raise SubmissionStorageFailure()
        if not isinstance(terminal_retention, timedelta):
            raise SubmissionStorageFailure()
        terminal_retention_seconds = terminal_retention.total_seconds()
        if (
            terminal_retention <= timedelta(0)
            or terminal_retention > timedelta(days=7)
            or not terminal_retention_seconds.is_integer()
        ):
            raise SubmissionStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeouts(connection)
                rows = (
                    await connection.execute(
                        _RETENTION_SQL,
                        {
                            "now": now,
                            "limit": limit,
                            "terminal_retention_seconds": int(terminal_retention_seconds),
                        },
                    )
                ).mappings()
                return tuple(_submission(row) for row in rows)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except SubmissionStorageFailure:
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SubmissionStorageFailure() from None

    async def _set_timeouts(self, connection: AsyncConnection) -> None:
        await connection.execute(_TIMEOUT_SQL, {"timeout": self._timeout})

    async def _raise_missing_or_conflict(
        self,
        connection: AsyncConnection,
        submission_id: UUID,
    ) -> None:
        present = (
            await connection.execute(
                text("SELECT 1 FROM public.identification_submission WHERE id = :id"),
                {"id": submission_id},
            )
        ).scalar_one_or_none()
        if present is None:
            raise SubmissionNotFound()
        raise SubmissionStateConflict()


def _validate_uuid(value: object) -> UUID:
    if not isinstance(value, UUID) or value.version != 4:
        raise SubmissionStorageFailure()
    return value


def _timestamp(value: object) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise SubmissionStorageFailure()
    return value.astimezone(UTC)


def _submission(row: RowMapping) -> IdentificationSubmission:
    try:
        submission_id = _validate_uuid(row["id"])
        raw_job_id = row["job_id"]
        job_id = None if raw_job_id is None else _validate_uuid(raw_job_id)
        raw_key = row["storage_object_key"]
        key = None if raw_key is None else PrivateObjectKey(str(raw_key))
        raw_filename = row["original_filename"]
        filename = None if raw_filename is None else str(raw_filename)
        media_type = UploadMediaType(str(row["mime_type"]))
        raw_sha256 = row["sha256"]
        sha256 = None if raw_sha256 is None else str(raw_sha256)
        deleted_at = None if row["deleted_at"] is None else _timestamp(row["deleted_at"])
        result = IdentificationSubmission(
            id=submission_id,
            job_id=job_id,
            storage_object_key=key,
            original_filename=filename,
            media_type=media_type,
            byte_size=int(row["byte_size"]),
            width=int(row["width"]),
            height=int(row["height"]),
            sha256=sha256,
            retention_until=_timestamp(row["retention_until"]),
            deleted_at=deleted_at,
            created_at=_timestamp(row["created_at"]),
        )
    except (KeyError, TypeError, ValueError):
        raise SubmissionStorageFailure() from None
    if result.deleted != (key is None and filename is None and sha256 is None):
        raise SubmissionStorageFailure()
    return result


def _status(row: RowMapping) -> IdentificationSubmissionStatus:
    try:
        submission_id = _validate_uuid(row["id"])
        raw_job_id = row["job_id"]
        job_id = None if raw_job_id is None else _validate_uuid(raw_job_id)
        created_at = _timestamp(row["created_at"])
        deleted_at = None if row["deleted_at"] is None else _timestamp(row["deleted_at"])
        if deleted_at is not None:
            return IdentificationSubmissionStatus(
                submission_id=submission_id,
                job_id=job_id,
                state=IdentificationSubmissionState.DELETED,
                progress=0.0,
                result=None,
                error_code=None,
                created_at=created_at,
                completed_at=None,
                deleted_at=deleted_at,
            )
        if job_id is None:
            if any(
                row[name] is not None
                for name in (
                    "job_status",
                    "job_progress",
                    "job_result",
                    "job_error_code",
                    "job_completed_at",
                )
            ):
                raise SubmissionStorageFailure()
            return IdentificationSubmissionStatus(
                submission_id=submission_id,
                job_id=None,
                state=IdentificationSubmissionState.CREATED,
                progress=0.0,
                result=None,
                error_code=None,
                created_at=created_at,
                completed_at=None,
                deleted_at=None,
            )

        state = IdentificationSubmissionState(str(row["job_status"]))
        if state not in {
            IdentificationSubmissionState.QUEUED,
            IdentificationSubmissionState.RUNNING,
            IdentificationSubmissionState.SUCCEEDED,
            IdentificationSubmissionState.FAILED,
            IdentificationSubmissionState.DEAD_LETTER,
        }:
            raise SubmissionStorageFailure()
        progress = float(row["job_progress"])
        if not 0.0 <= progress <= 1.0:
            raise SubmissionStorageFailure()
        completed_at = (
            None if row["job_completed_at"] is None else _timestamp(row["job_completed_at"])
        )
        raw_error = row["job_error_code"]
        error_code = None if raw_error is None else str(raw_error)
        raw_result = row["job_result"]
        result: FakeSolverResult | None = None

        if state is IdentificationSubmissionState.SUCCEEDED:
            if completed_at is None or error_code is not None or raw_result != _FAKE_RESULT:
                raise SubmissionStorageFailure()
            result = FakeSolverResult()
        elif state in {
            IdentificationSubmissionState.FAILED,
            IdentificationSubmissionState.DEAD_LETTER,
        }:
            if (
                completed_at is None
                or raw_result is not None
                or error_code is None
                or _FAILURE_CODE.fullmatch(error_code) is None
            ):
                raise SubmissionStorageFailure()
        elif completed_at is not None or raw_result is not None or error_code is not None:
            raise SubmissionStorageFailure()

        return IdentificationSubmissionStatus(
            submission_id=submission_id,
            job_id=job_id,
            state=state,
            progress=progress,
            result=result,
            error_code=error_code,
            created_at=created_at,
            completed_at=completed_at,
            deleted_at=None,
        )
    except (KeyError, TypeError, ValueError):
        raise SubmissionStorageFailure() from None


__all__ = ["PostgreSqlIdentificationSubmissionRepository"]
