"""Guarded real-PostgreSQL evidence for Phase 0B3C1 failure transitions."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from datetime import datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.application.failure import FailJobService
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.domain.failure import (
    FailureReason,
    JobFailureContention,
    JobFailureDatabaseOperationFailure,
    JobFailureOutcomeUnknown,
    RetryScheduled,
    TerminalFailureRecorded,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost
from lumina.jobs.domain.models import ClaimedJob, JobStatus
from lumina.jobs.infrastructure.postgresql.claim import PostgreSqlClaimJobStore
from lumina.jobs.infrastructure.postgresql.completion import PostgreSqlJobCompletionStore
from lumina.jobs.infrastructure.postgresql.failure import (
    _FAIL_SQL,
    _RECONCILE_SQL,
    PostgreSqlFailureJobStore,
)
from lumina.jobs.infrastructure.postgresql.heartbeat import PostgreSqlHeartbeatJobStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import (
    DatabaseRuntime,
    create_database_runtime,
)
from sqlalchemy import Connection, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from ..database_safety import require_local_test_database
from ..migration_lifecycle import open_migration_connection, run_migration_operation

_OWNER = "worker.failure.fixture"
_FOREIGN_OWNER = "worker.failure.foreign"
_FIXTURE_TYPE = "system.failure_fixture"
_PAYLOAD = '{"fixture":"FAILURE-PAYLOAD-EVIDENCE"}'
_RESULT = '{"fixture":"FAILURE-RESULT-EVIDENCE"}'
_ROW_COLUMNS = (
    "id, job_type, status, idempotency_key, priority, payload, result, progress, "
    "attempts, max_attempts, available_at, claimed_by, claimed_at, heartbeat_at, "
    "completed_at, error_code, error_message, created_at"
)


def _guarded_execute(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object] | None = None,
) -> list[tuple[object, ...]]:
    sync_url = make_url(settings.test_database_sync_url.get_secret_value())

    def operation(connection: Connection) -> list[tuple[object, ...]]:
        result = connection.execute(text(statement), parameters or {})
        rows = [tuple(row) for row in result.all()] if result.returns_rows else []
        connection.commit()
        return rows

    return run_migration_operation(sync_url, operation)


def _guarded_setup(
    settings: IntegrationTestSettings,
    *,
    attempts: int = 2,
    max_attempts: int = 5,
    owner: str = _OWNER,
    progress: float = 0.625,
    result: str | None = None,
) -> UUID:
    identifier = uuid4()
    anchor = cast(
        datetime,
        _guarded_execute(settings, "SELECT transaction_timestamp()")[0][0],
    )
    _guarded_execute(
        settings,
        "INSERT INTO public.job "
        "(id, job_type, status, idempotency_key, priority, payload, result, progress, "
        "attempts, max_attempts, available_at, claimed_by, claimed_at, heartbeat_at, "
        "completed_at, error_code, error_message, created_at) "
        "VALUES (:id, :job_type, 'running', :idempotency_key, 17, CAST(:payload AS jsonb), "
        "CAST(:result AS jsonb), :progress, :attempts, :max_attempts, :available_at, "
        ":owner, :claimed_at, :heartbeat_at, NULL, NULL, NULL, :created_at)",
        {
            "id": identifier,
            "job_type": _FIXTURE_TYPE,
            "idempotency_key": f"failure-fixture-{identifier}",
            "payload": _PAYLOAD,
            "result": result,
            "progress": progress,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "available_at": anchor - timedelta(minutes=4),
            "owner": owner,
            "claimed_at": anchor - timedelta(minutes=3),
            "heartbeat_at": anchor - timedelta(minutes=2),
            "created_at": anchor - timedelta(minutes=5),
        },
    )
    return identifier


def _row(settings: IntegrationTestSettings, identifier: UUID) -> tuple[object, ...]:
    rows = _guarded_execute(
        settings,
        f"SELECT {_ROW_COLUMNS} FROM public.job WHERE id = :id",
        {"id": identifier},
    )
    assert len(rows) == 1
    return rows[0]


def _cleanup(settings: IntegrationTestSettings) -> None:
    _guarded_execute(settings, "DELETE FROM public.job")


@pytest.fixture(autouse=True)
def clean_failure_rows(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    _cleanup(integration_settings)
    try:
        yield
    finally:
        _cleanup(integration_settings)


@pytest_asyncio.fixture
async def failure_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _failure_store(
    runtime: DatabaseRuntime,
    *,
    factory: async_sessionmaker[AsyncSession] | None = None,
    timeout_ms: int = 5_000,
) -> PostgreSqlFailureJobStore:
    return PostgreSqlFailureJobStore(
        factory or runtime.session_factory,
        operation_wait_timeout_ms=timeout_ms,
    )


def _failure_service(
    runtime: DatabaseRuntime,
    *,
    factory: async_sessionmaker[AsyncSession] | None = None,
    timeout_ms: int = 5_000,
) -> FailJobService:
    return FailJobService(
        _failure_store(runtime, factory=factory, timeout_ms=timeout_ms),
    )


def _heartbeat_service(runtime: DatabaseRuntime) -> HeartbeatJobService:
    return HeartbeatJobService(
        PostgreSqlHeartbeatJobStore(
            runtime.session_factory,
            operation_wait_timeout_ms=5_000,
        )
    )


def _completion_service(runtime: DatabaseRuntime) -> CompleteJobService:
    return CompleteJobService(
        PostgreSqlJobCompletionStore(
            runtime.session_factory,
            operation_wait_timeout_ms=5_000,
        ),
        result_max_bytes=1_024,
    )


def _claim_service(runtime: DatabaseRuntime) -> ClaimJobService:
    return ClaimJobService(
        PostgreSqlClaimJobStore(
            runtime.session_factory,
            operation_wait_timeout_ms=5_000,
        )
    )


@pytest.mark.asyncio
async def test_retryable_failure_requeues_with_exact_fields_and_postgresql_schedule(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, attempts=2, max_attempts=5)
    before = _row(integration_settings, identifier)
    server_before = cast(
        datetime,
        _guarded_execute(integration_settings, "SELECT transaction_timestamp()")[0][0],
    )

    outcome = await _failure_service(failure_runtime).fail(
        job_id=identifier,
        owner=_OWNER,
        expected_attempt=2,
        reason=FailureReason.HANDLER_RETRYABLE,
    )

    server_after = cast(
        datetime,
        _guarded_execute(integration_settings, "SELECT transaction_timestamp()")[0][0],
    )
    row = _row(integration_settings, identifier)
    assert isinstance(outcome, RetryScheduled)
    assert outcome.available_at == row[10]
    assert server_before + timedelta(seconds=4) <= outcome.available_at
    assert outcome.available_at <= server_after + timedelta(seconds=4)
    assert row[2] == "queued"
    assert row[6] is None
    assert row[7] == 0
    assert row[8:10] == before[8:10]
    assert row[11:17] == (None, None, None, None, None, None)
    assert row[0:2] == before[0:2]
    assert row[3:6] == before[3:6]
    assert row[17] == before[17]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("attempts", "max_attempts", "reason", "expected_status"),
    [
        (2, 2, FailureReason.HANDLER_TIMEOUT, JobStatus.DEAD_LETTER),
        (2, 5, FailureReason.UNSUPPORTED_TYPE, JobStatus.FAILED),
    ],
)
async def test_terminal_failures_preserve_exact_historical_fields(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    attempts: int,
    max_attempts: int,
    reason: FailureReason,
    expected_status: JobStatus,
) -> None:
    identifier = _guarded_setup(
        integration_settings,
        attempts=attempts,
        max_attempts=max_attempts,
    )
    before = _row(integration_settings, identifier)

    outcome = await _failure_service(failure_runtime).fail(
        job_id=identifier,
        owner=_OWNER,
        expected_attempt=attempts,
        reason=reason,
    )

    row = _row(integration_settings, identifier)
    assert isinstance(outcome, TerminalFailureRecorded)
    assert outcome.status is expected_status
    assert outcome.completed_at == row[14]
    assert row[2] == expected_status.value
    assert row[6] is None
    assert row[7:14] == before[7:14]
    assert row[15:17] == (reason.code, reason.message)
    assert row[0:2] == before[0:2]
    assert row[3:6] == before[3:6]
    assert row[17] == before[17]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("owner", "attempt"),
    [(_FOREIGN_OWNER, 2), (_OWNER, 1), (_OWNER, 3)],
)
async def test_owner_or_attempt_mismatch_is_indistinguishable_and_writes_nothing(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    owner: str,
    attempt: int,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    identifier = _guarded_setup(integration_settings, attempts=2)
    before = _row(integration_settings, identifier)

    with pytest.raises(JobOwnershipLost) as failure:
        await _failure_service(failure_runtime).fail(
            job_id=identifier,
            owner=owner,
            expected_attempt=attempt,
            reason=FailureReason.HANDLER_RETRYABLE,
        )

    assert _row(integration_settings, identifier) == before
    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )
    assert failure.value.args == ("Job heartbeat ownership was lost.",)
    for evidence in (str(identifier), owner, str(attempt), str(before[12]), str(before[13])):
        assert evidence not in serialized


async def _requeue_and_reclaim_same_owner(
    runtime: DatabaseRuntime,
    settings: IntegrationTestSettings,
    identifier: UUID,
) -> ClaimedJob:
    await _failure_service(runtime).fail(
        job_id=identifier,
        owner=_OWNER,
        expected_attempt=1,
        reason=FailureReason.HANDLER_RETRYABLE,
    )
    _guarded_execute(
        settings,
        "UPDATE public.job SET available_at = transaction_timestamp() WHERE id = :id",
        {"id": identifier},
    )
    claimed = await _claim_service(runtime).claim(claimed_by=_OWNER)
    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == identifier
    assert claimed.attempts == 2
    return claimed


@pytest.mark.asyncio
async def test_same_owner_old_attempt_operations_cannot_mutate_attempt_two(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, attempts=1, max_attempts=3)
    claimed = await _requeue_and_reclaim_same_owner(
        failure_runtime,
        integration_settings,
        identifier,
    )
    before = _row(integration_settings, identifier)

    with pytest.raises(JobOwnershipLost):
        await _heartbeat_service(failure_runtime).heartbeat(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=1,
        )
    with pytest.raises(JobOwnershipLost):
        await _completion_service(failure_runtime).complete(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=1,
            result={},
        )
    with pytest.raises(JobOwnershipLost):
        await _failure_service(failure_runtime).fail(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=1,
            reason=FailureReason.HANDLER_NON_RETRYABLE,
        )
    assert _row(integration_settings, identifier) == before

    heartbeat = await _heartbeat_service(failure_runtime).heartbeat(
        job_id=identifier,
        owner=_OWNER,
        expected_attempt=claimed.attempts,
    )
    assert heartbeat.job_id == identifier
    current_failure = await _failure_service(failure_runtime).fail(
        job_id=identifier,
        owner=_OWNER,
        expected_attempt=claimed.attempts,
        reason=FailureReason.HANDLER_RETRYABLE,
    )
    assert isinstance(current_failure, RetryScheduled)


@pytest.mark.asyncio
async def test_same_owner_current_attempt_completion_succeeds_after_reclaim(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, attempts=1, max_attempts=3)
    claimed = await _requeue_and_reclaim_same_owner(
        failure_runtime,
        integration_settings,
        identifier,
    )

    completed = await _completion_service(failure_runtime).complete(
        job_id=identifier,
        owner=_OWNER,
        expected_attempt=claimed.attempts,
        result={},
    )

    assert completed.job_id == identifier
    assert _row(integration_settings, identifier)[2] == "succeeded"


class _CommitAcknowledgementLost(OperationalError):
    pass


class _AckLossSession:
    def __init__(
        self,
        session: AsyncSession,
        after_commit: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._session = session
        self._after_commit = after_commit

    async def begin(self) -> object:
        return await self._session.begin()

    async def connection(self) -> AsyncConnection:
        return await self._session.connection()

    async def commit(self) -> None:
        await self._session.commit()
        if self._after_commit is not None:
            await self._after_commit()
        raise _CommitAcknowledgementLost(
            "FAILURE-COMMIT-ACK-EVIDENCE",
            {"secret": "FAILURE-COMMIT-PARAMETER-EVIDENCE"},
            Exception("FAILURE-COMMIT-DRIVER-EVIDENCE"),
            connection_invalidated=True,
        )

    async def rollback(self) -> None:
        await self._session.rollback()

    async def close(self) -> None:
        await self._session.close()

    async def invalidate(self) -> None:
        await self._session.invalidate()

    def in_transaction(self) -> object:
        return self._session.in_transaction()


class _FirstAckLossFactory:
    def __init__(
        self,
        base: async_sessionmaker[AsyncSession],
        after_commit: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._base = base
        self._after_commit = after_commit
        self.calls = 0

    def __call__(self) -> AsyncSession | _AckLossSession:
        self.calls += 1
        session = self._base()
        if self.calls == 1:
            return _AckLossSession(session, self._after_commit)
        return session


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("attempts", "max_attempts", "reason", "expected_status"),
    [
        (2, 5, FailureReason.HANDLER_RETRYABLE, "queued"),
        (2, 2, FailureReason.HANDLER_TIMEOUT, "dead_letter"),
        (2, 5, FailureReason.UNSUPPORTED_TYPE, "failed"),
    ],
)
async def test_lost_commit_acknowledgement_reconciles_exact_transition_once(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    attempts: int,
    max_attempts: int,
    reason: FailureReason,
    expected_status: str,
) -> None:
    identifier = _guarded_setup(
        integration_settings,
        attempts=attempts,
        max_attempts=max_attempts,
    )
    factory = _FirstAckLossFactory(failure_runtime.session_factory)
    updates = 0
    reconciliations = 0

    def record_statement(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        nonlocal updates, reconciliations
        if str(clause_element) == _FAIL_SQL.text:
            updates += 1
        elif str(clause_element) == _RECONCILE_SQL.text:
            reconciliations += 1

    event.listen(failure_runtime.engine.sync_engine, "before_execute", record_statement)
    try:
        outcome = await _failure_service(
            failure_runtime,
            factory=cast(async_sessionmaker[AsyncSession], factory),
            timeout_ms=500,
        ).fail(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=attempts,
            reason=reason,
        )
        if expected_status == "queued":
            assert isinstance(outcome, RetryScheduled)
        else:
            assert isinstance(outcome, TerminalFailureRecorded)
        assert _row(integration_settings, identifier)[2] == expected_status
        assert updates == 1
        assert reconciliations == 1
    finally:
        event.remove(failure_runtime.engine.sync_engine, "before_execute", record_statement)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("restored_result", "expected_error"),
    [
        (None, JobFailureDatabaseOperationFailure),
        (_RESULT, JobFailureOutcomeUnknown),
    ],
)
async def test_reconciliation_distinguishes_exact_unchanged_from_private_result_mismatch(
    failure_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    restored_result: str | None,
    expected_error: type[RuntimeError],
) -> None:
    identifier = _guarded_setup(integration_settings, attempts=2)
    before = _row(integration_settings, identifier)

    async def restore_running() -> None:
        _guarded_execute(
            integration_settings,
            "UPDATE public.job SET status = 'running', available_at = :available_at, "
            "claimed_by = :owner, claimed_at = :claimed_at, heartbeat_at = :heartbeat_at, "
            "completed_at = NULL, result = CAST(:result AS jsonb), progress = :progress, "
            "error_code = NULL, error_message = NULL WHERE id = :id",
            {
                "id": identifier,
                "available_at": before[10],
                "owner": before[11],
                "claimed_at": before[12],
                "heartbeat_at": before[13],
                "result": restored_result,
                "progress": before[7],
            },
        )

    factory = _FirstAckLossFactory(failure_runtime.session_factory, restore_running)
    with pytest.raises(expected_error):
        await _failure_service(
            failure_runtime,
            factory=cast(async_sessionmaker[AsyncSession], factory),
            timeout_ms=500,
        ).fail(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=2,
            reason=FailureReason.HANDLER_RETRYABLE,
        )

    assert _row(integration_settings, identifier)[2] == "running"


@pytest.mark.asyncio
async def test_row_lock_timeout_is_bounded_and_rolls_back(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, attempts=2)
    before = _row(integration_settings, identifier)
    sync_url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    require_local_test_database(sync_url)
    reached_update = asyncio.Event()
    loop = asyncio.get_running_loop()

    def record_update(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        if str(clause_element) == _FAIL_SQL.text:
            loop.call_soon_threadsafe(reached_update.set)

    event.listen(runtime.engine.sync_engine, "before_execute", record_update)
    try:
        async with runtime.engine.connect() as baseline_connection:
            statement_before = (
                await baseline_connection.execute(text("SHOW statement_timeout"))
            ).scalar_one()
            lock_before = (
                await baseline_connection.execute(text("SHOW lock_timeout"))
            ).scalar_one()
            await baseline_connection.rollback()
        with open_migration_connection(sync_url) as blocker:
            transaction = blocker.begin()
            try:
                blocker.execute(
                    text("SELECT id FROM public.job WHERE id = :id FOR UPDATE"),
                    {"id": identifier},
                ).scalar_one()
                task = asyncio.create_task(
                    _failure_service(runtime, timeout_ms=150).fail(
                        job_id=identifier,
                        owner=_OWNER,
                        expected_attempt=2,
                        reason=FailureReason.HANDLER_RETRYABLE,
                    )
                )
                await asyncio.wait_for(reached_update.wait(), timeout=1)
                with pytest.raises(JobFailureContention):
                    await asyncio.wait_for(task, timeout=2)
                assert _row(integration_settings, identifier) == before
            finally:
                transaction.rollback()

        outcome = await _failure_service(runtime, timeout_ms=500).fail(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=2,
            reason=FailureReason.HANDLER_RETRYABLE,
        )
        assert isinstance(outcome, RetryScheduled)
        async with runtime.engine.connect() as later_connection:
            assert (
                await later_connection.execute(text("SHOW statement_timeout"))
            ).scalar_one() == statement_before
            assert (
                await later_connection.execute(text("SHOW lock_timeout"))
            ).scalar_one() == lock_before
            await later_connection.rollback()
    finally:
        if event.contains(runtime.engine.sync_engine, "before_execute", record_update):
            event.remove(runtime.engine.sync_engine, "before_execute", record_update)
        await runtime.engine.dispose()
