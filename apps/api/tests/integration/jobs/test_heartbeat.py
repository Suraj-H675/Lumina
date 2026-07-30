"""Guarded real-PostgreSQL tests for Phase 0B3B2 owner heartbeats."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import AsyncIterator, Iterator
from datetime import datetime, timedelta
from time import monotonic
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.domain.heartbeat import (
    HeartbeatJobRequest,
    HeartbeatRecorded,
    JobHeartbeatContention,
    JobHeartbeatDatabaseProgrammingFailure,
    JobHeartbeatDatabaseStateFailure,
    JobOwnershipLost,
    JobOwnerToken,
)
from lumina.jobs.domain.models import ExpectedJobAttempt
from lumina.jobs.infrastructure.postgresql.heartbeat import (
    _HEARTBEAT_SQL,
    PostgreSqlHeartbeatJobStore,
    _heartbeat_recorded,
)
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import Connection, RowMapping, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection

from ..database_safety import require_local_test_database
from ..migration_lifecycle import open_migration_connection, run_migration_operation

_FIXTURE_OWNER = "worker.heartbeat.fixture"
_FOREIGN_OWNER = "worker.heartbeat.foreign"
_FIXTURE_TYPE = "system.heartbeat_fixture"
_FIXTURE_IDEMPOTENCY = "heartbeat-fixture-key"
_FIXTURE_PAYLOAD = '{"fixture":"HEARTBEAT-PAYLOAD-EVIDENCE"}'
_FIXTURE_RESULT = '{"fixture":"HEARTBEAT-RESULT-EVIDENCE"}'
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
    """Execute fixture SQL only through the guarded local test migration role."""
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
    status: str,
    owner: str = _FIXTURE_OWNER,
) -> UUID:
    """Insert one visibly test-only row without using a runtime mutation capability."""
    identifier = uuid4()
    anchor = cast(
        datetime,
        _guarded_execute(settings, "SELECT transaction_timestamp()")[0][0],
    )
    claimed = status != "queued"
    terminal = status in {"succeeded", "failed", "dead_letter"}
    error_state = status in {"failed", "dead_letter"}
    _guarded_execute(
        settings,
        "INSERT INTO public.job "
        "(id, job_type, status, idempotency_key, priority, payload, result, progress, "
        "attempts, max_attempts, available_at, claimed_by, claimed_at, heartbeat_at, "
        "completed_at, error_code, error_message, created_at) "
        "VALUES (:id, :job_type, :status, :idempotency_key, :priority, "
        "CAST(:payload AS jsonb), CAST(:result AS jsonb), :progress, :attempts, "
        ":max_attempts, :available_at, :claimed_by, :claimed_at, :heartbeat_at, "
        ":completed_at, :error_code, :error_message, :created_at)",
        {
            "id": identifier,
            "job_type": _FIXTURE_TYPE,
            "status": status,
            "idempotency_key": f"{_FIXTURE_IDEMPOTENCY}-{identifier}",
            "priority": 17,
            "payload": _FIXTURE_PAYLOAD,
            "result": _FIXTURE_RESULT if terminal else None,
            "progress": 0.625,
            "attempts": 2,
            "max_attempts": 5,
            "available_at": anchor - timedelta(minutes=4),
            "claimed_by": owner if claimed else None,
            "claimed_at": anchor - timedelta(minutes=3) if claimed else None,
            "heartbeat_at": anchor - timedelta(minutes=2) if claimed else None,
            "completed_at": anchor - timedelta(minutes=1) if terminal else None,
            "error_code": "fixture.heartbeat_failure" if error_state else None,
            "error_message": "HEARTBEAT-ACTUAL-STATE-EVIDENCE" if error_state else None,
            "created_at": anchor - timedelta(minutes=5),
        },
    )
    return identifier


def _guarded_cleanup(settings: IntegrationTestSettings) -> None:
    """Remove only heartbeat test fixtures through the guarded migration role."""
    _guarded_execute(settings, "DELETE FROM public.job")


def _row_snapshot(
    settings: IntegrationTestSettings,
    identifier: UUID,
) -> tuple[object, ...]:
    rows = _guarded_execute(
        settings,
        f"SELECT {_ROW_COLUMNS} FROM public.job WHERE id = :id",
        {"id": identifier},
    )
    assert len(rows) == 1
    return rows[0]


@pytest.fixture(autouse=True)
def clean_heartbeat_rows(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    """Keep setup and cleanup isolated to the guarded test database."""
    _guarded_cleanup(integration_settings)
    try:
        yield
    finally:
        _guarded_cleanup(integration_settings)


@pytest_asyncio.fixture
async def heartbeat_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _store(
    runtime: DatabaseRuntime,
    *,
    timeout_ms: int = 5_000,
) -> PostgreSqlHeartbeatJobStore:
    return PostgreSqlHeartbeatJobStore(
        runtime.session_factory,
        operation_wait_timeout_ms=timeout_ms,
    )


def _service(
    runtime: DatabaseRuntime,
    *,
    timeout_ms: int = 5_000,
) -> HeartbeatJobService:
    return HeartbeatJobService(_store(runtime, timeout_ms=timeout_ms))


def _pool_checked_out(runtime: DatabaseRuntime) -> int:
    pool = cast(Any, runtime.engine.sync_engine.pool)
    return cast(int, pool.checkedout())


async def _assert_pool_released(runtime: DatabaseRuntime, baseline: int) -> None:
    assert _pool_checked_out(runtime) == baseline
    async with runtime.engine.connect() as connection:
        assert not connection.in_transaction()
    assert _pool_checked_out(runtime) == baseline


def _serialized_error(
    error: BaseException,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> str:
    captured = capsys.readouterr()
    return (
        str(error)
        + repr(error)
        + repr(error.args)
        + repr(error.__cause__)
        + repr(error.__context__)
        + captured.out
        + captured.err
        + caplog.text
    )


@pytest.mark.asyncio
async def test_correct_owner_uses_postgresql_time_and_changes_only_heartbeat(
    heartbeat_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, status="running")
    before_row = _row_snapshot(integration_settings, identifier)
    server_before = cast(
        datetime,
        _guarded_execute(integration_settings, "SELECT transaction_timestamp()")[0][0],
    )
    baseline = _pool_checked_out(heartbeat_runtime)

    recorded = await _service(heartbeat_runtime).heartbeat(
        job_id=identifier,
        owner=_FIXTURE_OWNER,
        expected_attempt=2,
    )

    server_after = cast(
        datetime,
        _guarded_execute(integration_settings, "SELECT transaction_timestamp()")[0][0],
    )
    after_row = _row_snapshot(integration_settings, identifier)
    await _assert_pool_released(heartbeat_runtime, baseline)
    heartbeat_index = 13
    assert isinstance(recorded, HeartbeatRecorded)
    assert recorded.job_id == identifier
    assert recorded.heartbeat_at == after_row[heartbeat_index]
    assert server_before <= recorded.heartbeat_at <= server_after
    assert recorded.heartbeat_at.tzinfo is not None
    assert before_row[:heartbeat_index] == after_row[:heartbeat_index]
    assert before_row[heartbeat_index + 1 :] == after_row[heartbeat_index + 1 :]
    assert after_row[2] == "running"
    assert after_row[8] == 2
    assert after_row[11] == _FIXTURE_OWNER
    assert after_row[12] == before_row[12]


@pytest.mark.asyncio
async def test_repeated_correct_owner_heartbeat_succeeds_in_fresh_transactions(
    heartbeat_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, status="running")
    baseline = _pool_checked_out(heartbeat_runtime)

    first = await _service(heartbeat_runtime).heartbeat(
        job_id=identifier,
        owner=_FIXTURE_OWNER,
        expected_attempt=2,
    )
    await _assert_pool_released(heartbeat_runtime, baseline)
    second = await _service(heartbeat_runtime).heartbeat(
        job_id=identifier,
        owner=_FIXTURE_OWNER,
        expected_attempt=2,
    )

    await _assert_pool_released(heartbeat_runtime, baseline)
    assert first.job_id == second.job_id == identifier
    assert second.heartbeat_at >= first.heartbeat_at
    assert _row_snapshot(integration_settings, identifier)[13] == second.heartbeat_at


@pytest.mark.asyncio
async def test_equal_postgresql_transaction_timestamp_is_accepted_deliberately(
    heartbeat_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, status="running")
    request = HeartbeatJobRequest(
        job_id=identifier,
        owner=JobOwnerToken(_FIXTURE_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
    )
    store = _store(heartbeat_runtime)
    baseline = _pool_checked_out(heartbeat_runtime)

    async with heartbeat_runtime.engine.connect() as connection:
        transaction = await connection.begin()
        await store._install_timeouts(connection)
        first = await store._heartbeat_with_connection(connection, request)
        second = await store._heartbeat_with_connection(connection, request)
        assert first.heartbeat_at == second.heartbeat_at
        await transaction.rollback()

    await _assert_pool_released(heartbeat_runtime, baseline)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("case", "status", "seed_owner", "request_owner"),
    [
        ("foreign-owner", "running", _FIXTURE_OWNER, _FOREIGN_OWNER),
        ("queued", "queued", _FIXTURE_OWNER, _FIXTURE_OWNER),
        ("succeeded", "succeeded", _FIXTURE_OWNER, _FIXTURE_OWNER),
        ("failed", "failed", _FIXTURE_OWNER, _FIXTURE_OWNER),
        ("dead-letter", "dead_letter", _FIXTURE_OWNER, _FIXTURE_OWNER),
    ],
)
async def test_existing_rejections_are_indistinguishable_and_write_nothing(
    heartbeat_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    case: str,
    status: str,
    seed_owner: str,
    request_owner: str,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    del case
    identifier = _guarded_setup(
        integration_settings,
        status=status,
        owner=seed_owner,
    )
    before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(heartbeat_runtime)

    with pytest.raises(JobOwnershipLost) as failure:
        await _service(heartbeat_runtime).heartbeat(
            job_id=identifier,
            owner=request_owner,
            expected_attempt=2,
        )

    after = _row_snapshot(integration_settings, identifier)
    await _assert_pool_released(heartbeat_runtime, baseline)
    assert after == before
    assert failure.value.args == ("Job heartbeat ownership was lost.",)
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    serialized = _serialized_error(failure.value, caplog, capsys)
    evidence_values = [
        str(identifier),
        request_owner,
        seed_owner,
        status,
        "HEARTBEAT-ACTUAL-STATE-EVIDENCE",
    ]
    if before[13] is not None:
        evidence_values.append(str(before[13]))
    for evidence in evidence_values:
        assert evidence not in serialized


@pytest.mark.asyncio
async def test_missing_identifier_is_the_same_ownership_loss_and_writes_nothing(
    heartbeat_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    sentinel = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, sentinel)
    missing = uuid4()
    baseline = _pool_checked_out(heartbeat_runtime)

    with pytest.raises(JobOwnershipLost) as failure:
        await _service(heartbeat_runtime).heartbeat(
            job_id=missing,
            owner=_FOREIGN_OWNER,
            expected_attempt=2,
        )

    assert _row_snapshot(integration_settings, sentinel) == before
    await _assert_pool_released(heartbeat_runtime, baseline)
    serialized = _serialized_error(failure.value, caplog, capsys)
    for evidence in (
        str(missing),
        str(sentinel),
        _FOREIGN_OWNER,
        _FIXTURE_OWNER,
        str(before[13]),
    ):
        assert evidence not in serialized


@pytest.mark.asyncio
async def test_runtime_acl_and_public_capability_are_heartbeat_only_for_this_operation(
    heartbeat_runtime: DatabaseRuntime,
) -> None:
    async with heartbeat_runtime.engine.connect() as connection:
        privileges = (
            await connection.execute(
                text(
                    "SELECT "
                    "has_column_privilege(current_user, 'public.job', "
                    "'heartbeat_at', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'job_type', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'payload', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'priority', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', "
                    "'max_attempts', 'UPDATE')"
                )
            )
        ).one()
        await connection.rollback()

    assert tuple(privileges) == (True, False, False, False, False)
    assert list(inspect.signature(HeartbeatJobService.heartbeat).parameters) == [
        "self",
        "job_id",
        "owner",
        "expected_attempt",
    ]
    assert _HEARTBEAT_SQL.text.count("SET ") == 1
    assert "SET heartbeat_at = transaction_timestamp()" in _HEARTBEAT_SQL.text
    assert "AND status = 'running'" in _HEARTBEAT_SQL.text
    assert "AND claimed_by = :owner" in _HEARTBEAT_SQL.text
    assert "AND attempts = :expected_attempt" in _HEARTBEAT_SQL.text


@pytest.mark.asyncio
async def test_row_lock_timeout_is_bounded_resets_settings_and_fresh_call_succeeds(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(runtime)
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
        if str(clause_element) == _HEARTBEAT_SQL.text:
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
            blocking_transaction = blocker.begin()
            try:
                blocker.execute(
                    text("SELECT id FROM public.job WHERE id = :id FOR UPDATE"),
                    {"id": identifier},
                ).scalar_one()
                started = monotonic()
                task = asyncio.create_task(
                    _service(runtime, timeout_ms=150).heartbeat(
                        job_id=identifier,
                        owner=_FIXTURE_OWNER,
                        expected_attempt=2,
                    )
                )
                await asyncio.wait_for(reached_update.wait(), timeout=1)
                with pytest.raises(JobHeartbeatContention):
                    await asyncio.wait_for(task, timeout=2)
                assert monotonic() - started < 2
                await _assert_pool_released(runtime, baseline)
                assert _row_snapshot(integration_settings, identifier) == before
            finally:
                blocking_transaction.rollback()

        recorded = await _service(runtime, timeout_ms=500).heartbeat(
            job_id=identifier,
            owner=_FIXTURE_OWNER,
            expected_attempt=2,
        )
        assert recorded.job_id == identifier
        await _assert_pool_released(runtime, baseline)
        async with runtime.engine.connect() as later_connection:
            assert (
                await later_connection.execute(text("SHOW statement_timeout"))
            ).scalar_one() == statement_before
            assert (
                await later_connection.execute(text("SHOW lock_timeout"))
            ).scalar_one() == lock_before
            await later_connection.rollback()
        await _assert_pool_released(runtime, baseline)
    finally:
        if event.contains(runtime.engine.sync_engine, "before_execute", record_update):
            event.remove(runtime.engine.sync_engine, "before_execute", record_update)
        await runtime.engine.dispose()


class _MalformedRowHeartbeatStore(PostgreSqlHeartbeatJobStore):
    async def _heartbeat_with_connection(
        self,
        connection: AsyncConnection,
        request: HeartbeatJobRequest,
    ) -> HeartbeatRecorded:
        await connection.execute(
            _HEARTBEAT_SQL,
            {
                "job_id": request.job_id,
                "owner": request.owner.value,
                "expected_attempt": request.expected_attempt.value,
            },
        )
        return _heartbeat_recorded(
            cast(RowMapping, {"heartbeat_at": "HEARTBEAT-MALFORMED-TIMESTAMP-EVIDENCE"}),
            request,
        )


class _RawDriverFailure(Exception):
    def __init__(self) -> None:
        super().__init__(
            "HEARTBEAT-DRIVER-EVIDENCE host=heartbeat-host-evidence "
            "database=heartbeat-database-evidence user=heartbeat-username-evidence "
            "password=heartbeat-password-evidence"
        )
        self.sqlstate = "42501"


class _SafeDatabaseFailureStore(PostgreSqlHeartbeatJobStore):
    async def _heartbeat_with_connection(
        self,
        connection: AsyncConnection,
        request: HeartbeatJobRequest,
    ) -> HeartbeatRecorded:
        del connection
        raise ProgrammingError(
            "HEARTBEAT-SQL-EVIDENCE",
            {
                "job_id": request.job_id,
                "owner": request.owner.value,
                "url": "postgresql://heartbeat-url-evidence",
            },
            _RawDriverFailure(),
        )


@pytest.mark.asyncio
async def test_pool_release_for_malformed_mapping_and_safe_database_failure(
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(runtime)
    request = HeartbeatJobRequest(
        job_id=identifier,
        owner=JobOwnerToken(_FIXTURE_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
    )
    try:
        malformed = _MalformedRowHeartbeatStore(
            runtime.session_factory,
            operation_wait_timeout_ms=500,
        )
        with pytest.raises(JobHeartbeatDatabaseStateFailure) as mapping_failure:
            await malformed.heartbeat(request)
        await _assert_pool_released(runtime, baseline)
        assert _row_snapshot(integration_settings, identifier) == before

        failing = _SafeDatabaseFailureStore(
            runtime.session_factory,
            operation_wait_timeout_ms=500,
        )
        with pytest.raises(JobHeartbeatDatabaseProgrammingFailure) as database_failure:
            await failing.heartbeat(request)
        await _assert_pool_released(runtime, baseline)
        assert _row_snapshot(integration_settings, identifier) == before

        serialized = _serialized_error(mapping_failure.value, caplog, capsys)
        serialized += _serialized_error(database_failure.value, caplog, capsys)
        assert mapping_failure.value.__cause__ is None
        assert mapping_failure.value.__context__ is None
        assert database_failure.value.__cause__ is None
        assert database_failure.value.__context__ is None
        for evidence in (
            str(identifier),
            _FIXTURE_OWNER,
            str(before[13]),
            "HEARTBEAT-MALFORMED-TIMESTAMP-EVIDENCE",
            "HEARTBEAT-SQL-EVIDENCE",
            "HEARTBEAT-DRIVER-EVIDENCE",
            "heartbeat-host-evidence",
            "heartbeat-database-evidence",
            "heartbeat-username-evidence",
            "heartbeat-password-evidence",
            "postgresql://heartbeat-url-evidence",
            "42501",
        ):
            assert evidence not in serialized
    finally:
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_cancellation_cleans_up_without_unobserved_task_or_checkout(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(runtime)
    sync_url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    require_local_test_database(sync_url)
    reached_update = asyncio.Event()
    loop = asyncio.get_running_loop()
    current = asyncio.current_task()
    pending_before = {
        task for task in asyncio.all_tasks() if task is not current and not task.done()
    }

    def record_update(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        if str(clause_element) == _HEARTBEAT_SQL.text:
            loop.call_soon_threadsafe(reached_update.set)

    event.listen(runtime.engine.sync_engine, "before_execute", record_update)
    task: asyncio.Task[HeartbeatRecorded] | None = None
    try:
        with open_migration_connection(sync_url) as blocker:
            blocking_transaction = blocker.begin()
            try:
                blocker.execute(
                    text("SELECT id FROM public.job WHERE id = :id FOR UPDATE"),
                    {"id": identifier},
                ).scalar_one()
                task = asyncio.create_task(
                    _service(runtime, timeout_ms=10_000).heartbeat(
                        job_id=identifier,
                        owner=_FIXTURE_OWNER,
                        expected_attempt=2,
                    )
                )
                await asyncio.wait_for(reached_update.wait(), timeout=1)
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await asyncio.wait_for(task, timeout=2)
                await _assert_pool_released(runtime, baseline)
                assert _row_snapshot(integration_settings, identifier) == before
            finally:
                blocking_transaction.rollback()

        pending_after = {
            pending
            for pending in asyncio.all_tasks()
            if pending is not current and not pending.done()
        }
        assert pending_after <= pending_before
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        if event.contains(runtime.engine.sync_engine, "before_execute", record_update):
            event.remove(runtime.engine.sync_engine, "before_execute", record_update)
        await runtime.engine.dispose()
