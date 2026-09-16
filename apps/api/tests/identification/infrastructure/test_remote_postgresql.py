from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import pytest
from lumina.identification.domain.nova import NovaSubmissionId
from lumina.identification.domain.remote_state import (
    RemoteFinalizationOutcome,
    RemoteLeaseToken,
    RemoteSolveClaim,
    RemoteSolveRecord,
    RemoteSolveState,
    RemoteTransitionReason,
)
from lumina.identification.infrastructure.remote_postgresql import PostgreSqlRemoteSolveRepository
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

_NOW = datetime(2026, 9, 15, 16, 0, tzinfo=UTC)
_SUBMISSION_ID = UUID("72000000-0000-4000-8000-000000000001")
_TOKEN = RemoteLeaseToken("a" * 64)


class _Result:
    def __init__(self, row: dict[str, object] | None = None) -> None:
        self._row = row

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> dict[str, object] | None:
        return self._row


class _Connection:
    def __init__(self, rows: list[dict[str, object] | None]) -> None:
        self.rows = list(rows)
        self.statements: list[tuple[str, dict[str, object] | None]] = []

    async def execute(
        self, statement: object, parameters: dict[str, object] | None = None
    ) -> _Result:
        sql = str(statement)
        self.statements.append((sql, parameters))
        if "set_config('statement_timeout'" in sql:
            return _Result()
        return _Result(self.rows.pop(0) if self.rows else None)


class _Transaction:
    async def __aenter__(self) -> _Transaction:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:  # type: ignore[no-untyped-def]
        del exc_type, exc, traceback


class _Session:
    def __init__(self, connection: _Connection) -> None:
        self.connection_value = connection

    async def __aenter__(self) -> _Session:
        return self

    async def __aexit__(self, exc_type, exc, traceback) -> None:  # type: ignore[no-untyped-def]
        del exc_type, exc, traceback

    def begin(self) -> _Transaction:
        return _Transaction()

    async def connection(self) -> AsyncConnection:
        return cast(AsyncConnection, self.connection_value)


def _repository(connection: _Connection) -> PostgreSqlRemoteSolveRepository:
    return PostgreSqlRemoteSolveRepository(
        cast(async_sessionmaker[AsyncSession], lambda: _Session(connection))
    )


def _row(
    state: RemoteSolveState = RemoteSolveState.SUBMITTING,
    *,
    upload_attempted_at: datetime | None = None,
    external_submission_id: int | None = None,
    external_job_id: int | None = None,
    safe_reason: RemoteTransitionReason | None = None,
) -> dict[str, object]:
    return {
        "submission_id": _SUBMISSION_ID,
        "state": state.value,
        "external_submission_id": external_submission_id,
        "external_job_id": external_job_id,
        "next_poll_at": _NOW,
        "deadline_at": _NOW + timedelta(minutes=15),
        "last_polled_at": None,
        "upload_attempted_at": upload_attempted_at,
        "terminal_at": None,
        "safe_reason": None if safe_reason is None else safe_reason.value,
        "created_at": _NOW,
        "updated_at": _NOW,
        "database_claimed_at": _NOW,
    }


def _base_record() -> RemoteSolveRecord:
    return RemoteSolveRecord(
        submission_id=_SUBMISSION_ID,
        state=RemoteSolveState.SUBMITTING,
        external_submission_id=None,
        external_job_id=None,
        next_poll_at=_NOW,
        deadline_at=_NOW + timedelta(minutes=15),
        last_polled_at=None,
        upload_attempted_at=None,
        terminal_at=None,
        safe_reason=None,
        created_at=_NOW,
        updated_at=_NOW,
    )


def _claim(record: RemoteSolveRecord | None = None) -> RemoteSolveClaim:
    return RemoteSolveClaim(
        record=record or _base_record(),
        lease_token=_TOKEN,
        database_claimed_at=_NOW,
        lease_expires_at=_NOW + timedelta(seconds=30),
    )


@pytest.mark.asyncio
async def test_create_requires_nova_consent_parent_and_appends_initial_transition() -> None:
    connection = _Connection([_row(), None])
    result = await _repository(connection).create(_SUBMISSION_ID, timeout_seconds=900)

    assert result.state is RemoteSolveState.SUBMITTING
    create_sql, create_parameters = connection.statements[1]
    assert "submission.solver_type = 'nova'" in create_sql
    assert "submission.consent_remote_processing = true" in create_sql
    assert create_parameters == {"submission_id": _SUBMISSION_ID, "timeout_seconds": 900}
    transition_sql, transition_parameters = connection.statements[2]
    assert "remote_processing_consented" in transition_sql
    assert transition_parameters is not None
    assert transition_parameters["submission_id"] == _SUBMISSION_ID
    assert transition_parameters["recorded_at"] == _NOW


@pytest.mark.asyncio
async def test_claim_due_uses_skip_locked_and_fixed_pollable_remote_states() -> None:
    row = _row()
    row["active_lease_expires_at"] = _NOW + timedelta(seconds=30)
    connection = _Connection([row])
    claim = await _repository(connection).claim_due(lease_token=_TOKEN, lease_seconds=30)

    assert claim is not None and claim.record.state is RemoteSolveState.SUBMITTING
    sql, parameters = connection.statements[1]
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert "state IN ('submitting', 'waiting_for_solver', 'solving', 'fetching_results')" in sql
    assert parameters == {"lease_token": "a" * 64, "lease_seconds": 30}


@pytest.mark.asyncio
async def test_mark_upload_attempt_is_lease_fenced_and_one_way() -> None:
    connection = _Connection([{"submission_id": _SUBMISSION_ID}])
    outcome = await _repository(connection).mark_upload_attempt(_claim())

    assert outcome is RemoteFinalizationOutcome.APPLIED
    sql, parameters = connection.statements[1]
    assert "upload_attempted_at IS NULL" in sql
    assert "active_lease_expires_at > CURRENT_TIMESTAMP" in sql
    assert parameters == {"submission_id": _SUBMISSION_ID, "lease_token": "a" * 64}


@pytest.mark.asyncio
async def test_transition_waiting_for_solver_updates_ids_and_appends_history_atomically() -> None:
    locked = _row(upload_attempted_at=_NOW)
    updated = _row(
        RemoteSolveState.WAITING_FOR_SOLVER,
        upload_attempted_at=_NOW,
        external_submission_id=4321,
    )
    connection = _Connection([locked, updated, None])
    outcome = await _repository(connection).transition(
        _claim(),
        to_state=RemoteSolveState.WAITING_FOR_SOLVER,
        reason=RemoteTransitionReason.REMOTE_UPLOAD_ACCEPTED,
        poll_seconds=5,
        external_submission_id=NovaSubmissionId(4321),
    )

    assert outcome is RemoteFinalizationOutcome.APPLIED
    update_sql, parameters = connection.statements[2]
    assert "active_lease_token = NULL" in update_sql
    assert parameters is not None
    assert parameters["external_submission_id"] == 4321
    assert parameters["external_job_id"] is None
    assert parameters["to_state"] == "waiting_for_solver"
    history_sql, history_parameters = connection.statements[3]
    assert "identification_remote_transition" in history_sql
    assert history_parameters is not None
    assert history_parameters["from_state"] == "submitting"
    assert history_parameters["to_state"] == "waiting_for_solver"
    assert history_parameters["reason"] == "remote_upload_accepted"


@pytest.mark.asyncio
async def test_read_returns_exact_remote_record_without_claiming_it() -> None:
    connection = _Connection([_row()])

    record = await _repository(connection).read(_SUBMISSION_ID)

    assert record == _base_record()
    sql, parameters = connection.statements[1]
    assert "FROM public.identification_remote_solve" in sql
    assert "FOR UPDATE" not in sql
    assert parameters == {"submission_id": _SUBMISSION_ID}


@pytest.mark.asyncio
async def test_read_missing_remote_state_fails_closed() -> None:
    from lumina.identification.domain.remote_state import RemoteStateStorageFailure

    with pytest.raises(RemoteStateStorageFailure):
        await _repository(_Connection([None])).read(_SUBMISSION_ID)


@pytest.mark.asyncio
async def test_reschedule_binds_only_public_safe_transient_provider_condition() -> None:
    connection = _Connection([{"submission_id": _SUBMISSION_ID}])
    outcome = await _repository(connection).reschedule(
        _claim(),
        poll_seconds=5,
        polled=False,
        safe_reason=RemoteTransitionReason.PROVIDER_BUSY,
    )

    assert outcome is RemoteFinalizationOutcome.APPLIED
    sql, parameters = connection.statements[1]
    assert "safe_reason = :safe_reason" in sql
    assert parameters == {
        "submission_id": _SUBMISSION_ID,
        "state": "submitting",
        "lease_token": "a" * 64,
        "poll_seconds": 5,
        "polled": False,
        "safe_reason": "provider_busy",
    }

    clear_connection = _Connection([{"submission_id": _SUBMISSION_ID}])
    assert (
        await _repository(clear_connection).reschedule(
            _claim(), poll_seconds=5, polled=True, safe_reason=None
        )
        is RemoteFinalizationOutcome.APPLIED
    )
    assert clear_connection.statements[1][1] is not None
    assert clear_connection.statements[1][1]["safe_reason"] is None

    from lumina.identification.domain.remote_state import RemoteStateStorageFailure

    with pytest.raises(RemoteStateStorageFailure):
        await _repository(_Connection([])).reschedule(
            _claim(),
            poll_seconds=5,
            polled=False,
            safe_reason=RemoteTransitionReason.PROVIDER_REJECTED,
        )
