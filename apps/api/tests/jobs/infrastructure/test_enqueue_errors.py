"""Secret-safe enqueue database lifecycle error tests."""

from __future__ import annotations

import asyncio
from types import TracebackType
from typing import cast
from uuid import uuid4

import pytest
from lumina.jobs.domain.models import (
    EnqueueJob,
    EnqueueJobOutcome,
    JobDatabaseOperationFailure,
    JobDatabaseProgrammingFailure,
    JobDatabaseStateFailure,
    JobEnqueueContention,
    JobStatus,
    JobStorageUnavailable,
    JobType,
)
from lumina.jobs.domain.payload import validate_json_object
from lumina.jobs.infrastructure.postgresql.enqueue import PostgreSqlEnqueueJobStore
from sqlalchemy.exc import (
    CompileError,
    DBAPIError,
    IntegrityError,
    InvalidRequestError,
    OperationalError,
    ProgrammingError,
    SQLAlchemyError,
    StatementError,
)
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_PAYLOAD_SENTINEL = "ERROR-PAYLOAD-SENTINEL"
_KEY_SENTINEL = "error:key-sentinel"
_SQL_SENTINEL = "SELECT ERROR-SQL-SENTINEL"


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str | None = None) -> None:
        super().__init__("RAW-DRIVER-SENTINEL")
        self.sqlstate = sqlstate


class _Transaction:
    def __init__(
        self,
        *,
        enter_error: BaseException | None = None,
        exit_error: BaseException | None = None,
    ) -> None:
        self._enter_error = enter_error
        self._exit_error = exit_error

    async def __aenter__(self) -> None:
        if self._enter_error is not None:
            raise self._enter_error
        return None

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exception_type, exception, traceback
        if self._exit_error is not None:
            raise self._exit_error


class _Session:
    def __init__(
        self,
        *,
        session_enter_error: BaseException | None = None,
        begin_error: BaseException | None = None,
        transaction_enter_error: BaseException | None = None,
        connection_error: BaseException | None = None,
        transaction_exit_error: BaseException | None = None,
        session_exit_error: BaseException | None = None,
    ) -> None:
        self._session_enter_error = session_enter_error
        self._begin_error = begin_error
        self._transaction = _Transaction(
            enter_error=transaction_enter_error,
            exit_error=transaction_exit_error,
        )
        self._connection_error = connection_error
        self._session_exit_error = session_exit_error

    async def __aenter__(self) -> _Session:
        if self._session_enter_error is not None:
            raise self._session_enter_error
        return self

    async def __aexit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exception_type, exception, traceback
        if self._session_exit_error is not None:
            raise self._session_exit_error

    def begin(self) -> _Transaction:
        if self._begin_error is not None:
            raise self._begin_error
        return self._transaction

    async def connection(self) -> AsyncConnection:
        if self._connection_error is not None:
            raise self._connection_error
        return cast(AsyncConnection, object())


class _Factory:
    def __init__(
        self,
        session: _Session,
        call_error: BaseException | None = None,
    ) -> None:
        self._session = session
        self._call_error = call_error

    def __call__(self) -> _Session:
        if self._call_error is not None:
            raise self._call_error
        return self._session


class _BodyStore(PostgreSqlEnqueueJobStore):
    def __init__(
        self,
        session: _Session,
        body_error: BaseException | None = None,
        *,
        factory_error: BaseException | None = None,
    ) -> None:
        super().__init__(
            cast(async_sessionmaker[AsyncSession], _Factory(session, factory_error)),
            wait_timeout_ms=500,
        )
        self._body_error = body_error

    async def _enqueue_with_connection(
        self,
        connection: AsyncConnection,
        job: EnqueueJob,
    ) -> EnqueueJobOutcome:
        del connection, job
        if self._body_error is not None:
            raise self._body_error
        return EnqueueJobOutcome(uuid4(), JobStatus.QUEUED, replayed=False)


def _job() -> EnqueueJob:
    return EnqueueJob(
        id=uuid4(),
        job_type=JobType.SYSTEM_NOOP,
        payload=validate_json_object({"message": _PAYLOAD_SENTINEL}, max_bytes=1024),
        idempotency_key=_KEY_SENTINEL,
        priority=0,
        max_attempts=5,
    )


def _invalidated_error() -> OperationalError:
    return OperationalError(
        _SQL_SENTINEL,
        {"payload": _PAYLOAD_SENTINEL, "key": _KEY_SENTINEL},
        _DriverFailure(),
        connection_invalidated=True,
    )


def _assert_safe(
    failure: pytest.ExceptionInfo[BaseException],
    expected_type: type[RuntimeError],
    expected_message: str,
) -> None:
    error = failure.value
    assert type(error) is expected_type
    assert str(error) == expected_message
    assert error.args == (expected_message,)
    assert error.__cause__ is None
    assert error.__context__ is None
    serialized = str(error) + repr(error) + repr(error.args)
    for hidden in (
        _PAYLOAD_SENTINEL,
        _KEY_SENTINEL,
        _SQL_SENTINEL,
        "RAW-DRIVER-SENTINEL",
        "RAW-STATEMENT-SENTINEL",
        "RAW-COMPILE-SENTINEL",
        "RAW-REQUEST-SENTINEL",
        "RAW-UNEXPECTED-DATABASE-SENTINEL",
    ):
        assert hidden not in serialized


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("database_error", "safe_type", "message"),
    [
        (
            ProgrammingError(
                _SQL_SENTINEL,
                {"payload": _PAYLOAD_SENTINEL, "key": _KEY_SENTINEL},
                _DriverFailure(),
            ),
            JobDatabaseProgrammingFailure,
            "Job enqueue failed because database operations are incompatible.",
        ),
        (
            StatementError(
                "RAW-STATEMENT-SENTINEL",
                _SQL_SENTINEL,
                {"payload": _PAYLOAD_SENTINEL, "key": _KEY_SENTINEL},
                _DriverFailure(),
            ),
            JobDatabaseOperationFailure,
            "Job enqueue database operation failed.",
        ),
        (
            CompileError("RAW-COMPILE-SENTINEL"),
            JobDatabaseOperationFailure,
            "Job enqueue database operation failed.",
        ),
        (
            InvalidRequestError("RAW-REQUEST-SENTINEL"),
            JobDatabaseOperationFailure,
            "Job enqueue database operation failed.",
        ),
        (
            IntegrityError(
                _SQL_SENTINEL,
                {"payload": _PAYLOAD_SENTINEL, "key": _KEY_SENTINEL},
                _DriverFailure(),
            ),
            JobDatabaseStateFailure,
            "Job enqueue failed because database state is inconsistent.",
        ),
        (
            DBAPIError(
                _SQL_SENTINEL,
                {"payload": _PAYLOAD_SENTINEL, "key": _KEY_SENTINEL},
                _DriverFailure(),
                False,
            ),
            JobDatabaseOperationFailure,
            "Job enqueue database operation failed.",
        ),
        (
            SQLAlchemyError("RAW-UNEXPECTED-DATABASE-SENTINEL"),
            JobDatabaseOperationFailure,
            "Job enqueue database operation failed.",
        ),
        (
            OperationalError(
                _SQL_SENTINEL,
                {"payload": _PAYLOAD_SENTINEL, "key": _KEY_SENTINEL},
                _DriverFailure("57014"),
            ),
            JobEnqueueContention,
            "Job enqueue timed out while waiting for database contention.",
        ),
    ],
)
async def test_database_failures_are_classified_without_request_data(
    database_error: SQLAlchemyError,
    safe_type: type[RuntimeError],
    message: str,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    store = _BodyStore(_Session(), database_error)

    with pytest.raises(safe_type) as failure:
        await store.enqueue(_job())

    _assert_safe(failure, safe_type, message)
    captured = capsys.readouterr()
    serialized = captured.out + captured.err + caplog.text
    for hidden in (
        _PAYLOAD_SENTINEL,
        _KEY_SENTINEL,
        _SQL_SENTINEL,
        "RAW-DRIVER-SENTINEL",
        "RAW-STATEMENT-SENTINEL",
        "RAW-COMPILE-SENTINEL",
        "RAW-REQUEST-SENTINEL",
        "RAW-UNEXPECTED-DATABASE-SENTINEL",
    ):
        assert hidden not in serialized


@pytest.mark.asyncio
@pytest.mark.parametrize("exit_location", ["transaction", "session"])
async def test_invalidated_transport_during_context_exit_is_sanitized(
    exit_location: str,
) -> None:
    session = _Session(
        transaction_exit_error=_invalidated_error() if exit_location == "transaction" else None,
        session_exit_error=_invalidated_error() if exit_location == "session" else None,
    )

    with pytest.raises(JobStorageUnavailable) as failure:
        await _BodyStore(session).enqueue(_job())

    _assert_safe(
        failure,
        JobStorageUnavailable,
        "Job storage is temporarily unavailable.",
    )


@pytest.mark.asyncio
async def test_invalidated_transport_replacing_rollback_failure_is_sanitized() -> None:
    session = _Session(transaction_exit_error=_invalidated_error())
    body_error = ProgrammingError(_SQL_SENTINEL, {}, _DriverFailure())

    with pytest.raises(JobStorageUnavailable) as failure:
        await _BodyStore(session, body_error).enqueue(_job())

    _assert_safe(
        failure,
        JobStorageUnavailable,
        "Job storage is temporarily unavailable.",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("location", ["factory", "session_enter"])
async def test_programming_error_during_session_acquisition_stays_programming(
    location: str,
) -> None:
    error = ProgrammingError(_SQL_SENTINEL, {}, _DriverFailure("42501"))
    session = _Session(session_enter_error=error if location == "session_enter" else None)
    store = _BodyStore(
        session,
        factory_error=error if location == "factory" else None,
    )

    with pytest.raises(JobDatabaseProgrammingFailure) as failure:
        await store.enqueue(_job())

    _assert_safe(
        failure,
        JobDatabaseProgrammingFailure,
        "Job enqueue failed because database operations are incompatible.",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("session", "safe_type", "message"),
    [
        (
            _Session(
                transaction_enter_error=ProgrammingError(
                    _SQL_SENTINEL,
                    {},
                    _DriverFailure("42601"),
                )
            ),
            JobDatabaseProgrammingFailure,
            "Job enqueue failed because database operations are incompatible.",
        ),
        (
            _Session(
                begin_error=ProgrammingError(
                    _SQL_SENTINEL,
                    {},
                    _DriverFailure("42501"),
                )
            ),
            JobDatabaseProgrammingFailure,
            "Job enqueue failed because database operations are incompatible.",
        ),
        (
            _Session(
                transaction_enter_error=IntegrityError(
                    _SQL_SENTINEL,
                    {},
                    _DriverFailure("23505"),
                )
            ),
            JobDatabaseStateFailure,
            "Job enqueue failed because database state is inconsistent.",
        ),
        (
            _Session(
                transaction_enter_error=OperationalError(
                    _SQL_SENTINEL,
                    {},
                    _DriverFailure("57014"),
                )
            ),
            JobEnqueueContention,
            "Job enqueue timed out while waiting for database contention.",
        ),
        (
            _Session(
                transaction_enter_error=OperationalError(
                    _SQL_SENTINEL,
                    {},
                    _DriverFailure("08006"),
                )
            ),
            JobStorageUnavailable,
            "Job storage is temporarily unavailable.",
        ),
        (
            _Session(
                transaction_enter_error=DBAPIError(
                    _SQL_SENTINEL,
                    {},
                    _DriverFailure("XX000"),
                    False,
                )
            ),
            JobDatabaseOperationFailure,
            "Job enqueue database operation failed.",
        ),
    ],
)
async def test_transaction_phase_uses_concrete_database_evidence_first(
    session: _Session,
    safe_type: type[RuntimeError],
    message: str,
) -> None:
    with pytest.raises(safe_type) as failure:
        await _BodyStore(session).enqueue(_job())

    _assert_safe(failure, safe_type, message)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "cancellation",
    [asyncio.CancelledError(), KeyboardInterrupt(), SystemExit()],
)
async def test_process_control_exceptions_are_never_converted(
    cancellation: BaseException,
) -> None:
    with pytest.raises(type(cancellation)):
        await _BodyStore(_Session(), cancellation).enqueue(_job())
