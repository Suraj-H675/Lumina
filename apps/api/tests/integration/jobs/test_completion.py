"""Guarded real-PostgreSQL tests for Phase 0B3B3 successful completion."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from datetime import datetime, timedelta
from time import monotonic
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.domain.completion import (
    CompleteJobRequest,
    JobCompletionContention,
    JobCompletionDatabaseOperationFailure,
    JobCompletionDatabaseStateFailure,
    JobCompletionOutcomeUnknown,
    SuccessfulJobCompletion,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
from lumina.jobs.domain.models import ExpectedJobAttempt
from lumina.jobs.domain.result import JobResultTooLarge, validate_job_result
from lumina.jobs.infrastructure.postgresql.completion import (
    _BACKEND_PID_SQL,
    _COMPLETE_SQL,
    _MAX_RECONCILIATION_CONNECTION_ATTEMPTS,
    _RECONCILE_SQL,
    PostgreSqlJobCompletionStore,
    _successful_completion,
)
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import Connection, RowMapping, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from ..database_safety import require_local_test_database
from ..migration_lifecycle import open_migration_connection, run_migration_operation

_FIXTURE_OWNER = "worker.completion.fixture"
_FOREIGN_OWNER = "worker.completion.foreign"
_FIXTURE_TYPE = "system.completion_fixture"
_FIXTURE_PAYLOAD = '{"fixture":"COMPLETION-PAYLOAD-EVIDENCE"}'
_EXISTING_RESULT = '{"fixture":"COMPLETION-EXISTING-RESULT-EVIDENCE"}'
_NEW_RESULT = {
    "summary": "COMPLETION-NEW-RESULT-EVIDENCE",
    "nested": [True, None, {"unicode": "प्रकाश"}],
}
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
    """Insert one visibly test-only row through the guarded migration role."""
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
            "idempotency_key": f"completion-fixture-{identifier}",
            "priority": 17,
            "payload": _FIXTURE_PAYLOAD,
            "result": _EXISTING_RESULT if terminal else None,
            "progress": 1 if status == "succeeded" else 0.625,
            "attempts": 2,
            "max_attempts": 5,
            "available_at": anchor - timedelta(minutes=4),
            "claimed_by": owner if claimed else None,
            "claimed_at": anchor - timedelta(minutes=3) if claimed else None,
            "heartbeat_at": anchor - timedelta(minutes=2) if claimed else None,
            "completed_at": anchor - timedelta(minutes=1) if terminal else None,
            "error_code": "fixture.completion_failure" if error_state else None,
            "error_message": "COMPLETION-ACTUAL-STATE-EVIDENCE" if error_state else None,
            "created_at": anchor - timedelta(minutes=5),
        },
    )
    return identifier


def _guarded_cleanup(settings: IntegrationTestSettings) -> None:
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
def clean_completion_rows(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    _guarded_cleanup(integration_settings)
    try:
        yield
    finally:
        _guarded_cleanup(integration_settings)


@pytest_asyncio.fixture
async def completion_runtime(
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
    factory: async_sessionmaker[AsyncSession] | None = None,
) -> PostgreSqlJobCompletionStore:
    return PostgreSqlJobCompletionStore(
        factory or runtime.session_factory,
        operation_wait_timeout_ms=timeout_ms,
    )


def _service(
    runtime: DatabaseRuntime,
    *,
    timeout_ms: int = 5_000,
    result_max_bytes: int = 61_440,
    factory: async_sessionmaker[AsyncSession] | None = None,
) -> CompleteJobService:
    return CompleteJobService(
        _store(runtime, timeout_ms=timeout_ms, factory=factory),
        result_max_bytes=result_max_bytes,
    )


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
async def test_correct_owner_completes_with_postgresql_time_and_exact_field_changes(
    completion_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, identifier)
    server_before = cast(
        datetime,
        _guarded_execute(integration_settings, "SELECT transaction_timestamp()")[0][0],
    )
    baseline = _pool_checked_out(completion_runtime)

    completed = await _service(completion_runtime).complete(
        job_id=identifier,
        owner=_FIXTURE_OWNER,
        expected_attempt=2,
        result=_NEW_RESULT,
    )

    server_after = cast(
        datetime,
        _guarded_execute(integration_settings, "SELECT transaction_timestamp()")[0][0],
    )
    after = _row_snapshot(integration_settings, identifier)
    await _assert_pool_released(completion_runtime, baseline)
    assert isinstance(completed, SuccessfulJobCompletion)
    assert completed.job_id == identifier
    assert completed.completed_at == after[14]
    assert server_before <= completed.completed_at <= server_after
    assert completed.completed_at.tzinfo is not None
    assert after[2] == "succeeded"
    assert after[6] == _NEW_RESULT
    assert after[7] == 1
    assert after[14] is not None
    assert after[15:17] == (None, None)
    assert after[11:14] == before[11:14]
    for index in (0, 1, 3, 4, 5, 8, 9, 10, 17):
        assert after[index] == before[index]


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
    completion_runtime: DatabaseRuntime,
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
    baseline = _pool_checked_out(completion_runtime)

    with pytest.raises(JobOwnershipLost) as failure:
        await _service(completion_runtime).complete(
            job_id=identifier,
            owner=request_owner,
            expected_attempt=2,
            result=_NEW_RESULT,
        )

    assert _row_snapshot(integration_settings, identifier) == before
    await _assert_pool_released(completion_runtime, baseline)
    assert failure.value.args == ("Job heartbeat ownership was lost.",)
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    serialized = _serialized_error(failure.value, caplog, capsys)
    for evidence in (
        str(identifier),
        request_owner,
        seed_owner,
        status,
        "COMPLETION-ACTUAL-STATE-EVIDENCE",
        "COMPLETION-NEW-RESULT-EVIDENCE",
    ):
        assert evidence not in serialized


@pytest.mark.asyncio
async def test_missing_and_second_completion_are_the_same_ownership_loss(
    completion_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, status="running")
    missing = uuid4()
    sentinel_before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(completion_runtime)

    with pytest.raises(JobOwnershipLost):
        await _service(completion_runtime).complete(
            job_id=missing,
            owner=_FIXTURE_OWNER,
            expected_attempt=2,
            result=_NEW_RESULT,
        )
    assert _row_snapshot(integration_settings, identifier) == sentinel_before

    await _service(completion_runtime).complete(
        job_id=identifier,
        owner=_FIXTURE_OWNER,
        expected_attempt=2,
        result=_NEW_RESULT,
    )
    completed_snapshot = _row_snapshot(integration_settings, identifier)
    with pytest.raises(JobOwnershipLost):
        await _service(completion_runtime).complete(
            job_id=identifier,
            owner=_FIXTURE_OWNER,
            expected_attempt=2,
            result={"different": "SECOND-COMPLETION-EVIDENCE"},
        )

    assert _row_snapshot(integration_settings, identifier) == completed_snapshot
    await _assert_pool_released(completion_runtime, baseline)


@pytest.mark.asyncio
async def test_runtime_acl_and_adapter_capability_are_completion_scoped(
    completion_runtime: DatabaseRuntime,
) -> None:
    async with completion_runtime.engine.connect() as connection:
        privileges = (
            await connection.execute(
                text(
                    "SELECT "
                    "has_column_privilege(current_user, 'public.job', 'status', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'result', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'progress', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', "
                    "'completed_at', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'job_type', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'payload', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', "
                    "'idempotency_key', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'priority', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', "
                    "'max_attempts', 'UPDATE')"
                )
            )
        ).one()
        await connection.rollback()

    assert tuple(privileges) == (True, True, True, True, False, False, False, False, False)
    assert list(inspect.signature(CompleteJobService.complete).parameters) == [
        "self",
        "job_id",
        "owner",
        "expected_attempt",
        "result",
    ]
    assert [name for name in dir(PostgreSqlJobCompletionStore) if not name.startswith("_")] == [
        "complete"
    ]
    assert _COMPLETE_SQL.text.count("UPDATE public.job") == 1
    assert "AND attempts = :expected_attempt" in _COMPLETE_SQL.text


@pytest.mark.asyncio
async def test_postgresql_textually_oversized_result_is_rejected_before_update(
    completion_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(completion_runtime)
    result = {f"k{index:04}": 0 for index in range(5_600)}
    validated = validate_job_result(result, max_bytes=65_536)
    assert validated.utf8_size <= 65_536
    observed_updates = 0

    def record_update(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        nonlocal observed_updates
        if str(clause_element) == _COMPLETE_SQL.text:
            observed_updates += 1

    event.listen(completion_runtime.engine.sync_engine, "before_execute", record_update)
    try:
        with pytest.raises(JobResultTooLarge) as failure:
            await _service(
                completion_runtime,
                result_max_bytes=65_536,
            ).complete(
                job_id=identifier,
                owner=_FIXTURE_OWNER,
                expected_attempt=2,
                result=result,
            )
    finally:
        event.remove(completion_runtime.engine.sync_engine, "before_execute", record_update)

    assert failure.value.args == ("Job result exceeds the database size limit.",)
    assert observed_updates == 0
    assert _row_snapshot(integration_settings, identifier) == before
    await _assert_pool_released(completion_runtime, baseline)


@pytest.mark.asyncio
async def test_row_lock_timeout_resets_settings_and_fresh_completion_succeeds(
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
        if str(clause_element) == _COMPLETE_SQL.text:
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
                    _service(runtime, timeout_ms=150).complete(
                        job_id=identifier,
                        owner=_FIXTURE_OWNER,
                        expected_attempt=2,
                        result=_NEW_RESULT,
                    )
                )
                await asyncio.wait_for(reached_update.wait(), timeout=1)
                with pytest.raises(JobCompletionContention):
                    await asyncio.wait_for(task, timeout=2)
                assert monotonic() - started < 2
                await _assert_pool_released(runtime, baseline)
                assert _row_snapshot(integration_settings, identifier) == before
            finally:
                blocking_transaction.rollback()

        completed = await _service(runtime, timeout_ms=500).complete(
            job_id=identifier,
            owner=_FIXTURE_OWNER,
            expected_attempt=2,
            result=_NEW_RESULT,
        )
        assert completed.job_id == identifier
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


class _MalformedRowCompletionStore(PostgreSqlJobCompletionStore):
    async def _complete_with_connection(
        self,
        connection: AsyncConnection,
        request: CompleteJobRequest,
    ) -> SuccessfulJobCompletion:
        await connection.execute(
            _COMPLETE_SQL,
            {
                "job_id": request.job_id,
                "owner": request.owner.value,
                "expected_attempt": request.expected_attempt.value,
                "result": request.result.database_json,
            },
        )
        return _successful_completion(
            cast(
                RowMapping,
                {
                    "id": request.job_id,
                    "completed_at": "COMPLETION-MALFORMED-TIMESTAMP-EVIDENCE",
                },
            ),
            request,
        )


@pytest.mark.asyncio
async def test_malformed_returned_mapping_rolls_back_and_releases_pool(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    before = _row_snapshot(integration_settings, identifier)
    baseline = _pool_checked_out(runtime)
    request = CompleteJobRequest(
        job_id=identifier,
        owner=JobOwnerToken(_FIXTURE_OWNER),
        expected_attempt=ExpectedJobAttempt(2),
        result=validate_job_result(_NEW_RESULT, max_bytes=1_024),
    )
    try:
        store = _MalformedRowCompletionStore(
            runtime.session_factory,
            operation_wait_timeout_ms=500,
        )
        with pytest.raises(JobCompletionDatabaseStateFailure):
            await store.complete(request)
        assert _row_snapshot(integration_settings, identifier) == before
        await _assert_pool_released(runtime, baseline)
    finally:
        await runtime.engine.dispose()


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
            "COMPLETION COMMIT ACKNOWLEDGEMENT SENTINEL",
            {"secret": "COMPLETION COMMIT PARAMETER SENTINEL"},
            Exception("COMPLETION COMMIT DRIVER SENTINEL"),
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


class _FirstCommitAckLossFactory:
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
async def test_lost_commit_acknowledgement_reconciles_exact_persisted_completion_once(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    baseline = _pool_checked_out(runtime)
    factory = _FirstCommitAckLossFactory(runtime.session_factory)
    updates = 0
    reconciliations = 0
    checkout_backend_pids: list[int] = []

    def record_statement(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        nonlocal updates, reconciliations
        if str(clause_element) == _COMPLETE_SQL.text:
            updates += 1
        elif str(clause_element) == _RECONCILE_SQL.text:
            reconciliations += 1

    def record_checkout(
        database_connection: object,
        connection_record: object,
        connection_proxy: object,
    ) -> None:
        del connection_record, connection_proxy
        driver_connection = cast(Any, database_connection).driver_connection
        checkout_backend_pids.append(cast(int, driver_connection.get_server_pid()))

    event.listen(runtime.engine.sync_engine, "before_execute", record_statement)
    event.listen(runtime.engine.sync_engine, "checkout", record_checkout)
    try:
        completed = await _service(
            runtime,
            timeout_ms=500,
            factory=cast(async_sessionmaker[AsyncSession], factory),
        ).complete(
            job_id=identifier,
            owner=_FIXTURE_OWNER,
            expected_attempt=2,
            result=_NEW_RESULT,
        )
        row = _row_snapshot(integration_settings, identifier)
        assert completed.completed_at == row[14]
        assert row[2] == "succeeded"
        assert row[6] == _NEW_RESULT
        assert updates == 1
        assert reconciliations == 1
        assert len(set(checkout_backend_pids)) >= 2
        await _assert_pool_released(runtime, baseline)
    finally:
        if event.contains(runtime.engine.sync_engine, "before_execute", record_statement):
            event.remove(runtime.engine.sync_engine, "before_execute", record_statement)
        if event.contains(runtime.engine.sync_engine, "checkout", record_checkout):
            event.remove(runtime.engine.sync_engine, "checkout", record_checkout)
        await runtime.engine.dispose()


class _ScalarResult:
    def __init__(self, value: int) -> None:
        self._value = value

    def scalar_one(self) -> int:
        return self._value


class _BackendExhaustionState:
    def __init__(self) -> None:
        self.primary_backend_pid: int | None = None
        self.actual_backend_pids: list[int] = []
        self.primary_pid_queries = 0
        self.reconciliation_pid_queries = 0


class _BackendExhaustionConnection:
    def __init__(
        self,
        connection: AsyncConnection,
        state: _BackendExhaustionState,
        *,
        primary: bool,
    ) -> None:
        self._connection = connection
        self._state = state
        self._primary = primary

    async def execute(
        self,
        statement: Any,
        parameters: dict[str, object] | None = None,
    ) -> Any:
        result = await self._connection.execute(statement, parameters)
        if str(statement) != _BACKEND_PID_SQL.text:
            return result
        actual_backend_pid = cast(int, result.scalar_one())
        self._state.actual_backend_pids.append(actual_backend_pid)
        if self._primary:
            self._state.primary_backend_pid = actual_backend_pid
            self._state.primary_pid_queries += 1
            return _ScalarResult(actual_backend_pid)
        self._state.reconciliation_pid_queries += 1
        assert self._state.primary_backend_pid is not None
        return _ScalarResult(self._state.primary_backend_pid)


class _BackendExhaustionSession:
    def __init__(
        self,
        session: AsyncSession,
        state: _BackendExhaustionState,
        *,
        primary: bool,
    ) -> None:
        self._session = session
        self._state = state
        self._primary = primary
        self._connection: _BackendExhaustionConnection | None = None

    async def begin(self) -> object:
        return await self._session.begin()

    async def connection(self) -> AsyncConnection:
        if self._connection is None:
            self._connection = _BackendExhaustionConnection(
                await self._session.connection(),
                self._state,
                primary=self._primary,
            )
        return cast(AsyncConnection, self._connection)

    async def commit(self) -> None:
        await self._session.commit()
        if self._primary:
            raise _CommitAcknowledgementLost(
                "COMPLETION EXHAUSTION ACKNOWLEDGEMENT SENTINEL",
                {"secret": "COMPLETION EXHAUSTION PARAMETER SENTINEL"},
                Exception("COMPLETION EXHAUSTION DRIVER SENTINEL"),
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


class _BackendExhaustionFactory:
    def __init__(
        self,
        base: async_sessionmaker[AsyncSession],
        state: _BackendExhaustionState,
    ) -> None:
        self._base = base
        self._state = state
        self.calls = 0

    def __call__(self) -> _BackendExhaustionSession:
        self.calls += 1
        return _BackendExhaustionSession(
            self._base(),
            self._state,
            primary=self.calls == 1,
        )


@pytest.mark.asyncio
async def test_fresh_backend_exhaustion_is_unknown_without_second_mutation(
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    baseline = _pool_checked_out(runtime)
    state = _BackendExhaustionState()
    factory = _BackendExhaustionFactory(runtime.session_factory, state)
    updates = 0
    reconciliation_reads = 0
    current = asyncio.current_task()
    pending_before = {
        task for task in asyncio.all_tasks() if task is not current and not task.done()
    }

    def record_lifecycle(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        nonlocal updates, reconciliation_reads
        if str(clause_element) == _COMPLETE_SQL.text:
            updates += 1
        elif str(clause_element) == _RECONCILE_SQL.text:
            reconciliation_reads += 1

    event.listen(runtime.engine.sync_engine, "before_execute", record_lifecycle)
    try:
        with pytest.raises(JobCompletionOutcomeUnknown) as failure:
            await _service(
                runtime,
                timeout_ms=500,
                factory=cast(async_sessionmaker[AsyncSession], factory),
            ).complete(
                job_id=identifier,
                owner=_FIXTURE_OWNER,
                expected_attempt=2,
                result=_NEW_RESULT,
            )

        row = _row_snapshot(integration_settings, identifier)
        assert row[2] == "succeeded"
        assert row[6] == _NEW_RESULT
        assert updates == 1
        assert reconciliation_reads == 0
        assert factory.calls == 1 + _MAX_RECONCILIATION_CONNECTION_ATTEMPTS
        assert state.primary_pid_queries == 1
        assert state.reconciliation_pid_queries == _MAX_RECONCILIATION_CONNECTION_ATTEMPTS
        await _assert_pool_released(runtime, baseline)
        serialized = _serialized_error(failure.value, caplog, capsys)
        for evidence in (
            str(identifier),
            _FIXTURE_OWNER,
            "COMPLETION-NEW-RESULT-EVIDENCE",
            str(row[14]),
            *(str(pid) for pid in state.actual_backend_pids),
            "COMPLETION EXHAUSTION ACKNOWLEDGEMENT SENTINEL",
            "COMPLETION EXHAUSTION PARAMETER SENTINEL",
            "COMPLETION EXHAUSTION DRIVER SENTINEL",
        ):
            assert evidence not in serialized
        pending_after = {
            task for task in asyncio.all_tasks() if task is not current and not task.done()
        }
        assert pending_after <= pending_before
    finally:
        if event.contains(runtime.engine.sync_engine, "before_execute", record_lifecycle):
            event.remove(runtime.engine.sync_engine, "before_execute", record_lifecycle)
        await runtime.engine.dispose()


class _ControlledCommitSession:
    def __init__(
        self,
        session: AsyncSession,
        commit_started: asyncio.Event,
        allow_commit: asyncio.Event,
    ) -> None:
        self._session = session
        self._commit_started = commit_started
        self._allow_commit = allow_commit

    async def begin(self) -> object:
        return await self._session.begin()

    async def connection(self) -> AsyncConnection:
        return await self._session.connection()

    async def commit(self) -> None:
        self._commit_started.set()
        await self._allow_commit.wait()
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()

    async def close(self) -> None:
        await self._session.close()

    async def invalidate(self) -> None:
        await self._session.invalidate()

    def in_transaction(self) -> object:
        return self._session.in_transaction()


class _ControlledCommitFactory:
    def __init__(
        self,
        base: async_sessionmaker[AsyncSession],
        commit_started: asyncio.Event,
        allow_commit: asyncio.Event,
    ) -> None:
        self._base = base
        self._commit_started = commit_started
        self._allow_commit = allow_commit

    def __call__(self) -> _ControlledCommitSession:
        return _ControlledCommitSession(
            self._base(),
            self._commit_started,
            self._allow_commit,
        )


@pytest.mark.asyncio
async def test_post_update_cancellation_settles_commit_without_unobserved_task(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    baseline = _pool_checked_out(runtime)
    commit_started = asyncio.Event()
    allow_commit = asyncio.Event()
    factory = _ControlledCommitFactory(
        runtime.session_factory,
        commit_started,
        allow_commit,
    )
    current = asyncio.current_task()
    pending_before = {
        task for task in asyncio.all_tasks() if task is not current and not task.done()
    }
    task = asyncio.create_task(
        _service(
            runtime,
            factory=cast(async_sessionmaker[AsyncSession], factory),
        ).complete(
            job_id=identifier,
            owner=_FIXTURE_OWNER,
            expected_attempt=2,
            result=_NEW_RESULT,
        )
    )
    try:
        await asyncio.wait_for(commit_started.wait(), timeout=2)
        task.cancel()
        allow_commit.set()
        completed = await asyncio.wait_for(task, timeout=2)
        assert completed.job_id == identifier
        assert _row_snapshot(integration_settings, identifier)[2] == "succeeded"
        await _assert_pool_released(runtime, baseline)
        pending_after = {
            pending
            for pending in asyncio.all_tasks()
            if pending is not current and not pending.done()
        }
        assert pending_after <= pending_before
    finally:
        if not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_ambiguous_commit_definitely_running_becomes_operation_failure(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _guarded_setup(integration_settings, status="running")
    baseline = _pool_checked_out(runtime)

    async def undo_persisted_completion() -> None:
        _guarded_execute(
            integration_settings,
            "UPDATE public.job SET status = 'running', result = NULL, progress = 0.625, "
            "completed_at = NULL WHERE id = :id",
            {"id": identifier},
        )

    factory = _FirstCommitAckLossFactory(
        runtime.session_factory,
        undo_persisted_completion,
    )
    try:
        with pytest.raises(JobCompletionDatabaseOperationFailure):
            await _service(
                runtime,
                timeout_ms=500,
                factory=cast(async_sessionmaker[AsyncSession], factory),
            ).complete(
                job_id=identifier,
                owner=_FIXTURE_OWNER,
                expected_attempt=2,
                result=_NEW_RESULT,
            )
        row = _row_snapshot(integration_settings, identifier)
        assert row[2] == "running"
        assert row[6] is None
        assert row[14] is None
        await _assert_pool_released(runtime, baseline)
    finally:
        await runtime.engine.dispose()
