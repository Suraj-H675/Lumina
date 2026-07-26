"""Passive claim mapping and secret-safe database-boundary tests."""

from __future__ import annotations

import inspect
from datetime import UTC, datetime
from typing import cast
from uuid import UUID

import pytest
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.domain.models import (
    ClaimedJob,
    JobClaimDatabaseProgrammingFailure,
    JobClaimDatabaseStateFailure,
    NoEligibleJob,
)
from lumina.jobs.domain.payload import PERSISTED_JSON_NULL, PersistedJobPayload
from lumina.jobs.infrastructure.postgresql.claim import (
    PostgreSqlClaimJobStore,
    _claimed_job,
)
from sqlalchemy import RowMapping
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_ID = UUID("12345678-1234-4234-9234-123456789abc")
_TIMESTAMP = datetime(2026, 7, 26, 12, tzinfo=UTC)


def _row(payload: object, *, job_type: str = "system.legacy") -> RowMapping:
    return cast(
        RowMapping,
        {
            "id": _ID,
            "job_type": job_type,
            "payload": payload,
            "attempts": 1,
            "max_attempts": 5,
            "claimed_at": _TIMESTAMP,
            "heartbeat_at": _TIMESTAMP,
        },
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"secret": "OBJECT-CLAIM-SENTINEL"},
        ["ARRAY-CLAIM-SENTINEL"],
        "STRING-CLAIM-SENTINEL",
        9_223_372_036_854_775_808,
        True,
        None,
    ],
)
def test_claim_mapping_accepts_every_jsonb_form_without_handler_behavior(
    payload: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, object]] = []

    def forbidden_import(*args: object, **kwargs: object) -> None:
        calls.append(("import", (args, kwargs)))
        raise AssertionError("dynamic import invoked")

    monkeypatch.setattr("importlib.import_module", forbidden_import)
    claimed = _claimed_job(_row(payload, job_type="future.unsupported"))

    assert claimed.job_type.value == "future.unsupported"
    assert calls == []
    assert not hasattr(claimed.payload, "database_json")
    assert not hasattr(claimed, "handler")
    assert not hasattr(claimed, "dispatch_result")
    assert not hasattr(claimed, "validation_error")


def test_jsonb_null_maps_to_explicit_value() -> None:
    claimed = _claimed_job(_row(None))

    assert claimed.payload.value is PERSISTED_JSON_NULL


def test_claim_mapping_retains_integer_outside_signed_64_bit() -> None:
    value = 9_223_372_036_854_775_808

    assert _claimed_job(_row(value)).payload.value == value


def test_claim_constructors_accept_no_payload_size_setting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LUMINA_JOB_PAYLOAD_MAX_BYTES", "1")

    assert "payload_max_bytes" not in inspect.signature(PersistedJobPayload.from_decoded).parameters
    assert "payload_max_bytes" not in inspect.signature(PostgreSqlClaimJobStore).parameters
    assert "payload_max_bytes" not in inspect.signature(ClaimJobService).parameters
    assert PersistedJobPayload.from_decoded("x" * 10_000).value == "x" * 10_000


class _Result:
    def __init__(self, row: RowMapping | None, scalar: object | None = None) -> None:
        self._row = row
        self._scalar = scalar

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> RowMapping | None:
        return self._row

    def scalar_one(self) -> object:
        return self._scalar


class _Connection:
    def __init__(self, row: RowMapping | None) -> None:
        self._row = row

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> _Result:
        del parameters
        if "pg_backend_pid" in str(statement):
            return _Result(None, 101)
        return _Result(self._row)


@pytest.mark.asyncio
async def test_returned_row_presence_distinguishes_jsonb_null_from_no_job() -> None:
    store = object.__new__(PostgreSqlClaimJobStore)

    absent = await store._claim_with_connection(
        cast(AsyncConnection, _Connection(None)),
        claimed_by="worker.test",
    )
    json_null = await store._claim_with_connection(
        cast(AsyncConnection, _Connection(_row(None))),
        claimed_by="worker.test",
    )

    assert isinstance(absent, NoEligibleJob)
    assert isinstance(json_null, ClaimedJob)
    assert json_null.payload.value is PERSISTED_JSON_NULL


class _DriverFailure(Exception):
    def __init__(self) -> None:
        super().__init__("RAW-CLAIM-DRIVER-SENTINEL")
        self.sqlstate = "42501"


class _Session:
    def __init__(self) -> None:
        self._active = False
        self._connection = _Connection(None)
        self.rollbacks = 0
        self.closes = 0

    async def begin(self) -> None:
        self._active = True

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self._connection)

    def in_transaction(self) -> bool:
        return self._active

    async def rollback(self) -> None:
        self.rollbacks += 1
        self._active = False

    async def close(self) -> None:
        self.closes += 1
        self._active = False

    async def invalidate(self) -> None:
        self._active = False


class _Factory:
    def __init__(self, session: _Session | None = None) -> None:
        self.session = session or _Session()

    def __call__(self) -> _Session:
        return self.session


class _FailingClaimStore(PostgreSqlClaimJobStore):
    async def _claim_with_connection(
        self,
        connection: AsyncConnection,
        *,
        claimed_by: str,
    ) -> ClaimedJob | NoEligibleJob:
        del connection
        raise ProgrammingError(
            "SELECT RAW-CLAIM-SQL-SENTINEL",
            {"payload": claimed_by},
            _DriverFailure(),
        )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"secret": "OBJECT-ERROR-SENTINEL"},
        ["ARRAY-ERROR-SENTINEL"],
        "STRING-ERROR-SENTINEL",
        8_765_432_109_876_543_210,
        True,
        None,
    ],
)
async def test_every_json_form_is_redacted_from_repr_errors_and_output(
    payload: object,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    form_sentinel = f"CLAIM-FORM-{type(payload).__name__}-SENTINEL"
    claimed = _claimed_job(_row(payload))
    store = _FailingClaimStore(
        cast(async_sessionmaker[AsyncSession], _Factory()),
        operation_wait_timeout_ms=500,
    )

    with pytest.raises(JobClaimDatabaseProgrammingFailure) as failure:
        await store.claim(claimed_by=form_sentinel)

    captured = capsys.readouterr()
    error = failure.value
    serialized = (
        repr(claimed.payload)
        + repr(claimed)
        + str(error)
        + repr(error)
        + repr(error.args)
        + repr(error.__cause__)
        + repr(error.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert repr(payload) not in repr(claimed.payload)
    assert repr(payload) not in repr(claimed)
    assert form_sentinel not in serialized
    assert "RAW-CLAIM-SQL-SENTINEL" not in serialized
    assert "RAW-CLAIM-DRIVER-SENTINEL" not in serialized
    assert error.__cause__ is None
    assert error.__context__ is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "row",
    [
        {**dict(_row({})), "payload": object()},
        {**dict(_row({})), "job_type": 7},
        {**dict(_row({})), "id": "not-a-uuid"},
        {**dict(_row({})), "attempts": 0},
        {**dict(_row({})), "attempts": 6},
        {**dict(_row({})), "claimed_at": _TIMESTAMP.replace(tzinfo=None)},
        {
            **dict(_row({})),
            "heartbeat_at": datetime(2026, 7, 26, 11, tzinfo=UTC),
        },
    ],
    ids=[
        "payload",
        "type",
        "uuid",
        "attempt-lower-bound",
        "attempt-upper-bound",
        "naive-timestamp",
        "timestamp-order",
    ],
)
async def test_malformed_returned_row_rolls_back_and_exposes_only_safe_state_failure(
    row: dict[str, object],
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    session = _Session()
    session._connection = _Connection(cast(RowMapping, row))
    factory = _Factory(session)
    store = PostgreSqlClaimJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )

    with pytest.raises(JobClaimDatabaseStateFailure) as failure:
        await store.claim(claimed_by="worker.mapping")

    captured = capsys.readouterr()
    error = failure.value
    serialized = (
        str(error)
        + repr(error)
        + repr(error.args)
        + repr(error.__cause__)
        + repr(error.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert session.rollbacks == 1
    assert session.closes == 1
    assert not session.in_transaction()
    assert error.args == ("Job claim failed because database state is inconsistent.",)
    assert error.__cause__ is None
    assert error.__context__ is None
    for sentinel in (
        str(_ID),
        "worker.mapping",
        "system.legacy",
        str(_TIMESTAMP),
    ):
        assert sentinel not in serialized


@pytest.mark.asyncio
async def test_recursive_payload_mapping_failure_rolls_back_without_exception_context(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    mapper_sentinel = "DEEP-MAPPER-RECURSION-SENTINEL"
    payload_sentinel = "DEEP-MAPPER-PAYLOAD-SENTINEL"
    session = _Session()
    session._connection = _Connection(_row({"nested": payload_sentinel}))
    store = PostgreSqlClaimJobStore(
        cast(async_sessionmaker[AsyncSession], _Factory(session)),
        operation_wait_timeout_ms=500,
    )

    def force_recursion(cls: type[PersistedJobPayload], value: object) -> PersistedJobPayload:
        del cls, value
        raise RecursionError(mapper_sentinel)

    monkeypatch.setattr(
        PersistedJobPayload,
        "from_decoded",
        classmethod(force_recursion),
    )
    with pytest.raises(JobClaimDatabaseStateFailure) as failure:
        await store.claim(claimed_by="worker.deep-mapping")

    captured = capsys.readouterr()
    error = failure.value
    serialized = (
        str(error)
        + repr(error)
        + repr(error.args)
        + repr(error.__cause__)
        + repr(error.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert str(error) == "Job claim failed because database state is inconsistent."
    assert repr(error) == (
        "JobClaimDatabaseStateFailure('Job claim failed because database state is inconsistent.')"
    )
    assert error.args == ("Job claim failed because database state is inconsistent.",)
    assert error.__cause__ is None
    assert error.__context__ is None
    assert session.rollbacks == 1
    assert session.closes == 1
    assert not session.in_transaction()
    for sentinel in (
        mapper_sentinel,
        payload_sentinel,
        "worker.deep-mapping",
        str(_ID),
        str(_TIMESTAMP),
    ):
        assert sentinel not in serialized
