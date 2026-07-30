"""Guarded real-PostgreSQL evidence for Phase 0B3C2 stale recovery."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator
from datetime import datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.application.failure import FailJobService
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.application.recovery import RecoverStaleJobsService
from lumina.jobs.domain.failure import FailureReason, RetryScheduled
from lumina.jobs.domain.heartbeat import JobOwnershipLost
from lumina.jobs.domain.models import ClaimedJob, NoEligibleJob
from lumina.jobs.domain.recovery import RecoverStaleJobsResult
from lumina.jobs.infrastructure.postgresql.claim import PostgreSqlClaimJobStore
from lumina.jobs.infrastructure.postgresql.completion import (
    _COMPLETE_SQL,
    PostgreSqlJobCompletionStore,
)
from lumina.jobs.infrastructure.postgresql.failure import (
    _FAIL_SQL,
    PostgreSqlFailureJobStore,
)
from lumina.jobs.infrastructure.postgresql.heartbeat import (
    _HEARTBEAT_SQL,
    PostgreSqlHeartbeatJobStore,
)
from lumina.jobs.infrastructure.postgresql.recovery import (
    _RECOVER_SQL,
    _TIMEOUT_SQL,
    PostgreSqlRecoverStaleJobsStore,
)
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import (
    DatabaseRuntime,
    create_database_runtime,
)
from sqlalchemy import Connection, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
)

from ..migration_lifecycle import run_migration_operation

_OWNER = "worker.recovery.fixture"
_FOREIGN_OWNER = "worker.recovery.foreign"
_FIXTURE_TYPE = "system.recovery_fixture"
_PAYLOAD = '{"fixture":"RECOVERY-PAYLOAD-PRIVATE"}'
_RESULT = '{"fixture":"RECOVERY-RESULT-PRIVATE"}'
_STALE_SECONDS = 120
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


def _database_anchor(settings: IntegrationTestSettings) -> datetime:
    return cast(
        datetime,
        _guarded_execute(settings, "SELECT transaction_timestamp()")[0][0],
    )


def _seed_running(
    settings: IntegrationTestSettings,
    *,
    identifier: UUID | None = None,
    attempts: int = 1,
    max_attempts: int = 3,
    owner: str = _OWNER,
    claimed_at: datetime | None = None,
    heartbeat_at: datetime | None = None,
    available_at: datetime | None = None,
    created_at: datetime | None = None,
    progress: float = 0.625,
    result: str | None = _RESULT,
    priority: int = 17,
) -> UUID:
    job_id = identifier or uuid4()
    anchor = _database_anchor(settings)
    default_claimed = anchor - timedelta(minutes=6)
    if heartbeat_at is not None:
        default_claimed = min(default_claimed, heartbeat_at - timedelta(minutes=1))
    claimed = claimed_at or default_claimed
    heartbeat = heartbeat_at if heartbeat_at is not None else anchor - timedelta(minutes=5)
    _guarded_execute(
        settings,
        "INSERT INTO public.job "
        "(id, job_type, status, idempotency_key, priority, payload, result, progress, "
        "attempts, max_attempts, available_at, claimed_by, claimed_at, heartbeat_at, "
        "completed_at, error_code, error_message, created_at) "
        "VALUES (:id, :job_type, 'running', :idempotency_key, :priority, "
        "CAST(:payload AS jsonb), CAST(:result AS jsonb), :progress, :attempts, "
        ":max_attempts, :available_at, :owner, :claimed_at, :heartbeat_at, "
        "NULL, NULL, NULL, :created_at)",
        {
            "id": job_id,
            "job_type": _FIXTURE_TYPE,
            "idempotency_key": f"recovery-fixture-{job_id}",
            "priority": priority,
            "payload": _PAYLOAD,
            "result": result,
            "progress": progress,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "available_at": available_at or anchor - timedelta(minutes=8),
            "owner": owner,
            "claimed_at": claimed,
            "heartbeat_at": heartbeat,
            "created_at": created_at or anchor - timedelta(minutes=10),
        },
    )
    return job_id


def _seed_queued(
    settings: IntegrationTestSettings,
    *,
    max_attempts: int = 3,
) -> UUID:
    identifier = uuid4()
    anchor = _database_anchor(settings)
    _guarded_execute(
        settings,
        "INSERT INTO public.job "
        "(id, job_type, status, idempotency_key, priority, payload, result, progress, "
        "attempts, max_attempts, available_at, claimed_by, claimed_at, heartbeat_at, "
        "completed_at, error_code, error_message, created_at) "
        "VALUES (:id, :job_type, 'queued', :idempotency_key, 17, "
        "CAST(:payload AS jsonb), NULL, 0, 0, :max_attempts, :available_at, "
        "NULL, NULL, NULL, NULL, NULL, NULL, :created_at)",
        {
            "id": identifier,
            "job_type": _FIXTURE_TYPE,
            "idempotency_key": f"recovery-claim-fixture-{identifier}",
            "payload": _PAYLOAD,
            "max_attempts": max_attempts,
            "available_at": anchor - timedelta(minutes=1),
            "created_at": anchor - timedelta(minutes=2),
        },
    )
    return identifier


def _seed_running_without_heartbeat(
    settings: IntegrationTestSettings,
    *,
    attempts: int = 1,
    max_attempts: int = 3,
) -> UUID:
    identifier = _seed_running(
        settings,
        attempts=attempts,
        max_attempts=max_attempts,
    )
    _guarded_execute(
        settings,
        "UPDATE public.job SET heartbeat_at = NULL WHERE id = :id",
        {"id": identifier},
    )
    return identifier


def _row(
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


def _cleanup(settings: IntegrationTestSettings) -> None:
    _guarded_execute(settings, "DELETE FROM public.job")


@pytest.fixture(autouse=True)
def clean_recovery_rows(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    _cleanup(integration_settings)
    try:
        yield
    finally:
        _cleanup(integration_settings)


@pytest_asyncio.fixture
async def recovery_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _recovery_service(
    runtime: DatabaseRuntime,
    *,
    factory: async_sessionmaker[AsyncSession] | None = None,
    timeout_ms: int = 5_000,
) -> RecoverStaleJobsService:
    return RecoverStaleJobsService(
        PostgreSqlRecoverStaleJobsStore(
            factory or runtime.session_factory,
            operation_wait_timeout_ms=timeout_ms,
        ),
        stale_seconds=_STALE_SECONDS,
    )


def _claim_service(runtime: DatabaseRuntime) -> ClaimJobService:
    return ClaimJobService(
        PostgreSqlClaimJobStore(
            runtime.session_factory,
            operation_wait_timeout_ms=5_000,
        )
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


def _failure_service(runtime: DatabaseRuntime) -> FailJobService:
    return FailJobService(
        PostgreSqlFailureJobStore(
            runtime.session_factory,
            operation_wait_timeout_ms=5_000,
        )
    )


@pytest.mark.asyncio
async def test_non_exhausted_stale_attempt_requeues_with_exact_field_policy(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_running(integration_settings, attempts=2, max_attempts=5)
    before = _row(integration_settings, identifier)
    server_before = _database_anchor(integration_settings)

    result = await _recovery_service(recovery_runtime).recover()

    server_after = _database_anchor(integration_settings)
    row = _row(integration_settings, identifier)
    assert result == RecoverStaleJobsResult(requeued_count=1, dead_lettered_count=0)
    assert row[2] == "queued"
    assert row[6] is None
    assert row[7] == 0
    assert row[8:10] == before[8:10]
    assert server_before <= cast(datetime, row[10]) <= server_after
    assert row[11:17] == (None, None, None, None, None, None)
    assert row[0:2] == before[0:2]
    assert row[3:6] == before[3:6]
    assert row[17] == before[17]


@pytest.mark.asyncio
async def test_exhausted_stale_attempt_dead_letters_and_preserves_history(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_running(integration_settings, attempts=3, max_attempts=3)
    before = _row(integration_settings, identifier)
    server_before = _database_anchor(integration_settings)

    result = await _recovery_service(recovery_runtime).recover()

    server_after = _database_anchor(integration_settings)
    row = _row(integration_settings, identifier)
    assert result == RecoverStaleJobsResult(requeued_count=0, dead_lettered_count=1)
    assert row[2] == "dead_letter"
    assert row[6] is None
    assert row[7:14] == before[7:14]
    assert server_before <= cast(datetime, row[14]) <= server_after
    assert row[15:17] == (
        "job.stale_attempts_exhausted",
        "Stale job exhausted its maximum attempts.",
    )
    assert row[0:2] == before[0:2]
    assert row[3:6] == before[3:6]
    assert row[17] == before[17]

    for operation in (
        _heartbeat_service(recovery_runtime).heartbeat(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=3,
        ),
        _completion_service(recovery_runtime).complete(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=3,
            result={},
        ),
        _failure_service(recovery_runtime).fail(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=3,
            reason=FailureReason.HANDLER_NON_RETRYABLE,
        ),
    ):
        with pytest.raises(JobOwnershipLost):
            await operation
    assert isinstance(
        await _claim_service(recovery_runtime).claim(claimed_by=_FOREIGN_OWNER),
        NoEligibleJob,
    )
    assert _row(integration_settings, identifier) == row


@pytest.mark.asyncio
async def test_recent_heartbeat_prevents_recovery_but_null_heartbeat_uses_claim_time(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    recent = _seed_running(
        integration_settings,
        heartbeat_at=anchor,
        claimed_at=anchor - timedelta(minutes=10),
    )
    null_heartbeat = _seed_running_without_heartbeat(integration_settings)

    result = await _recovery_service(recovery_runtime).recover()

    assert result == RecoverStaleJobsResult(requeued_count=1, dead_lettered_count=0)
    assert _row(integration_settings, recent)[2] == "running"
    assert _row(integration_settings, null_heartbeat)[2] == "queued"


@pytest.mark.asyncio
async def test_exact_postgresql_cutoff_equality_is_eligible(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_running(integration_settings)
    async with recovery_runtime.engine.connect() as connection:
        transaction = await connection.begin()
        await connection.execute(_TIMEOUT_SQL, {"timeout": "5000ms"})
        await connection.execute(
            text(
                "UPDATE public.job "
                "SET heartbeat_at = transaction_timestamp() "
                "- make_interval(secs => :stale_seconds) "
                "WHERE id = :id"
            ),
            {"id": identifier, "stale_seconds": _STALE_SECONDS},
        )
        evidence = (
            (
                await connection.execute(
                    _RECOVER_SQL,
                    {
                        "stale_seconds": _STALE_SECONDS,
                        "stale_error_code": FailureReason.STALE_ATTEMPTS_EXHAUSTED.code,
                        "stale_error_message": (FailureReason.STALE_ATTEMPTS_EXHAUSTED.message),
                    },
                )
            )
            .mappings()
            .one()
        )
        await transaction.commit()

    assert evidence == {
        "selected_count": 1,
        "requeued_count": 1,
        "dead_lettered_count": 0,
    }
    assert _row(integration_settings, identifier)[2] == "queued"


class _StatementBarrier:
    def __init__(self, parties: int) -> None:
        self._parties = parties
        self._arrivals = 0
        self._ready = asyncio.Event()

    async def arrive(self) -> None:
        self._arrivals += 1
        if self._arrivals == self._parties:
            self._ready.set()
        await self._ready.wait()


class _BarrierConnection:
    def __init__(
        self,
        connection: AsyncConnection,
        barrier: _StatementBarrier,
    ) -> None:
        self._connection = connection
        self._barrier = barrier
        self.engine = connection.engine

    async def execute(
        self,
        statement: object,
        parameters: object | None = None,
    ) -> object:
        if str(statement) == _RECOVER_SQL.text:
            await self._barrier.arrive()
        return await self._connection.execute(
            cast(Any, statement),
            cast(Any, parameters),
        )

    async def invalidate(self) -> None:
        await self._connection.invalidate()


class _BarrierSession:
    def __init__(
        self,
        session: AsyncSession,
        barrier: _StatementBarrier,
    ) -> None:
        self._session = session
        self._barrier = barrier
        self.bind = session.bind

    async def begin(self) -> object:
        return await self._session.begin()

    async def connection(self) -> AsyncConnection:
        connection = await self._session.connection()
        return cast(AsyncConnection, _BarrierConnection(connection, self._barrier))

    async def commit(self) -> None:
        await self._session.commit()

    async def rollback(self) -> None:
        await self._session.rollback()

    async def close(self) -> None:
        await self._session.close()

    async def invalidate(self) -> None:
        await self._session.invalidate()

    def in_transaction(self) -> object:
        return self._session.in_transaction()

    def get_bind(self) -> object:
        return self._session.get_bind()


class _BarrierFactory:
    def __init__(
        self,
        base: async_sessionmaker[AsyncSession],
        *,
        parties: int,
    ) -> None:
        self._base = base
        self._barrier = _StatementBarrier(parties)

    def __call__(self) -> _BarrierSession:
        return _BarrierSession(self._base(), self._barrier)


@pytest.mark.asyncio
@pytest.mark.parametrize("row_count", [1, 150])
async def test_concurrent_recoverers_never_recover_a_row_twice_and_skip_locked_work(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    row_count: int,
) -> None:
    identifiers = {_seed_running(integration_settings) for _ in range(row_count)}
    factory = _BarrierFactory(recovery_runtime.session_factory, parties=2)
    service = _recovery_service(
        recovery_runtime,
        factory=cast(async_sessionmaker[AsyncSession], factory),
    )

    first, second = await asyncio.gather(service.recover(), service.recover())

    totals = [first.total_count, second.total_count]
    assert sum(totals) == row_count
    if row_count == 1:
        assert sorted(totals) == [0, 1]
    else:
        assert all(total > 0 for total in totals)
        assert all(total <= 100 for total in totals)
    rows = _guarded_execute(
        integration_settings,
        "SELECT id, status, attempts FROM public.job ORDER BY id",
    )
    assert {cast(UUID, row[0]) for row in rows} == identifiers
    assert all(row[1:] == ("queued", 1) for row in rows)


@pytest.mark.asyncio
async def test_explicitly_locked_stale_row_is_skipped_for_next_stale_row(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    oldest = _seed_running(
        integration_settings,
        heartbeat_at=anchor - timedelta(minutes=20),
    )
    next_oldest = _seed_running(
        integration_settings,
        heartbeat_at=anchor - timedelta(minutes=10),
    )
    async with recovery_runtime.engine.connect() as locking_connection:
        transaction = await locking_connection.begin()
        await locking_connection.execute(
            text("SELECT id FROM public.job WHERE id = :id FOR UPDATE"),
            {"id": oldest},
        )
        result = await asyncio.wait_for(
            _recovery_service(recovery_runtime, timeout_ms=500).recover(),
            timeout=2,
        )
        assert result.total_count == 1
        assert _row(integration_settings, next_oldest)[2] == "queued"
        assert _row(integration_settings, oldest)[2] == "running"
        await transaction.rollback()

    later = await _recovery_service(recovery_runtime).recover()
    assert later.total_count == 1
    assert _row(integration_settings, oldest)[2] == "queued"


@pytest.mark.asyncio
async def test_fixed_batch_100_then_one_and_full_ordering_contract(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    for index in range(98):
        _seed_running(
            integration_settings,
            heartbeat_at=anchor - timedelta(minutes=400 - index),
        )
    shared_lease = anchor - timedelta(minutes=200)
    earlier_claim = UUID("00000000-0000-4000-8000-000000000001")
    smaller_id = UUID("00000000-0000-4000-8000-000000000002")
    largest_id = UUID("00000000-0000-4000-8000-000000000003")
    _seed_running(
        integration_settings,
        identifier=earlier_claim,
        claimed_at=anchor - timedelta(minutes=220),
        heartbeat_at=shared_lease,
    )
    for identifier in (smaller_id, largest_id):
        _seed_running(
            integration_settings,
            identifier=identifier,
            claimed_at=anchor - timedelta(minutes=210),
            heartbeat_at=shared_lease,
        )

    first = await _recovery_service(recovery_runtime).recover()

    assert first.total_count == 100
    assert _guarded_execute(
        integration_settings,
        "SELECT id FROM public.job WHERE status = 'running'",
    ) == [(largest_id,)]
    assert _guarded_execute(
        integration_settings,
        "SELECT count(*), min(attempts), max(attempts) FROM public.job WHERE status = 'queued'",
    ) == [(100, 1, 1)]

    second = await _recovery_service(recovery_runtime).recover()
    assert second.total_count == 1
    assert _row(integration_settings, largest_id)[2] == "queued"


@pytest.mark.asyncio
async def test_heartbeat_wins_first_refreshes_lease_and_recovery_skips_locked_row(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_running(integration_settings)
    reached_recovery = asyncio.Event()
    loop = asyncio.get_running_loop()

    def record_recovery(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        if str(clause_element) == _RECOVER_SQL.text:
            loop.call_soon_threadsafe(reached_recovery.set)

    event.listen(recovery_runtime.engine.sync_engine, "before_execute", record_recovery)
    try:
        async with recovery_runtime.engine.connect() as heartbeat_connection:
            transaction = await heartbeat_connection.begin()
            refreshed = (
                await heartbeat_connection.execute(
                    text(
                        "UPDATE public.job SET heartbeat_at = transaction_timestamp() "
                        "WHERE id = :id AND status = 'running' "
                        "AND claimed_by = :owner AND attempts = 1 "
                        "RETURNING heartbeat_at"
                    ),
                    {"id": identifier, "owner": _OWNER},
                )
            ).scalar_one()
            recovery = asyncio.create_task(_recovery_service(recovery_runtime).recover())
            await asyncio.wait_for(reached_recovery.wait(), timeout=1)
            result = await asyncio.wait_for(recovery, timeout=2)
            assert result.total_count == 0
            await transaction.commit()
    finally:
        event.remove(recovery_runtime.engine.sync_engine, "before_execute", record_recovery)

    row = _row(integration_settings, identifier)
    assert row[2] == "running"
    assert row[13] == refreshed


class _PausedCommitSession:
    def __init__(
        self,
        session: AsyncSession,
        commit_started: asyncio.Event,
        allow_commit: asyncio.Event,
    ) -> None:
        self._session = session
        self._commit_started = commit_started
        self._allow_commit = allow_commit
        self.bind = session.bind

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

    def get_bind(self) -> object:
        return self._session.get_bind()


class _PausedCommitFactory:
    def __init__(
        self,
        base: async_sessionmaker[AsyncSession],
        commit_started: asyncio.Event,
        allow_commit: asyncio.Event,
    ) -> None:
        self._base = base
        self._commit_started = commit_started
        self._allow_commit = allow_commit

    def __call__(self) -> _PausedCommitSession:
        return _PausedCommitSession(
            self._base(),
            self._commit_started,
            self._allow_commit,
        )


@pytest.mark.asyncio
async def test_recovery_wins_first_and_delayed_heartbeat_loses_indistinguishably(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_running(integration_settings)
    commit_started = asyncio.Event()
    allow_commit = asyncio.Event()
    heartbeat_statement_started = asyncio.Event()
    loop = asyncio.get_running_loop()

    def record_heartbeat(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        if "SET heartbeat_at = transaction_timestamp()" in str(clause_element):
            loop.call_soon_threadsafe(heartbeat_statement_started.set)

    factory = _PausedCommitFactory(
        recovery_runtime.session_factory,
        commit_started,
        allow_commit,
    )
    event.listen(recovery_runtime.engine.sync_engine, "before_execute", record_heartbeat)
    try:
        recovery = asyncio.create_task(
            _recovery_service(
                recovery_runtime,
                factory=cast(async_sessionmaker[AsyncSession], factory),
            ).recover()
        )
        await asyncio.wait_for(commit_started.wait(), timeout=1)
        heartbeat = asyncio.create_task(
            _heartbeat_service(recovery_runtime).heartbeat(
                job_id=identifier,
                owner=_OWNER,
                expected_attempt=1,
            )
        )
        await asyncio.wait_for(heartbeat_statement_started.wait(), timeout=1)
        allow_commit.set()
        recovered = await asyncio.wait_for(recovery, timeout=2)
        with pytest.raises(JobOwnershipLost):
            await asyncio.wait_for(heartbeat, timeout=2)
    finally:
        allow_commit.set()
        event.remove(recovery_runtime.engine.sync_engine, "before_execute", record_heartbeat)

    assert recovered.total_count == 1
    assert _row(integration_settings, identifier)[2] == "queued"


async def _claim_stale_recover_and_reclaim_same_owner(
    runtime: DatabaseRuntime,
    settings: IntegrationTestSettings,
    *,
    max_attempts: int = 3,
) -> tuple[UUID, ClaimedJob, ClaimedJob]:
    identifier = _seed_queued(settings, max_attempts=max_attempts)
    first_claim = await _claim_service(runtime).claim(claimed_by=_OWNER)
    assert isinstance(first_claim, ClaimedJob)
    assert first_claim.id == identifier
    assert first_claim.attempts == 1
    first_running = _row(settings, identifier)
    assert first_running[2] == "running"
    assert first_running[8] == 1
    assert first_running[9] == max_attempts
    assert first_running[11] == _OWNER

    _guarded_execute(
        settings,
        "UPDATE public.job "
        "SET claimed_at = transaction_timestamp() - make_interval(mins => 10), "
        "heartbeat_at = transaction_timestamp() - make_interval(mins => 9) "
        "WHERE id = :id",
        {"id": identifier},
    )
    stale_attempt_one = _row(settings, identifier)
    assert stale_attempt_one[0:12] == first_running[0:12]
    assert stale_attempt_one[14:18] == first_running[14:18]
    assert cast(datetime, stale_attempt_one[12]) < cast(datetime, stale_attempt_one[13])

    recovered = await _recovery_service(runtime).recover()
    assert recovered == RecoverStaleJobsResult(requeued_count=1, dead_lettered_count=0)
    requeued_attempt_one = _row(settings, identifier)
    assert requeued_attempt_one[2] == "queued"
    assert requeued_attempt_one[8] == 1
    assert requeued_attempt_one[11:14] == (None, None, None)

    second_claim = await _claim_service(runtime).claim(claimed_by=_OWNER)
    assert isinstance(second_claim, ClaimedJob)
    assert second_claim.id == identifier
    assert second_claim.attempts == 2
    second_running = _row(settings, identifier)
    assert second_running[2] == "running"
    assert second_running[8] == 2
    assert second_running[11] == _OWNER
    return identifier, first_claim, second_claim


@pytest.mark.asyncio
async def test_same_owner_delayed_attempt_one_operations_cannot_mutate_attempt_two(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    identifier, first_claim, second_claim = await _claim_stale_recover_and_reclaim_same_owner(
        recovery_runtime,
        integration_settings,
    )
    assert first_claim.attempts == 1
    assert second_claim.attempts == 2
    before = _row(integration_settings, identifier)
    statements: list[str] = []

    def record_lifecycle_statement(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        statements.append(str(clause_element))

    operations = (
        (
            _heartbeat_service(recovery_runtime).heartbeat(
                job_id=identifier,
                owner=_OWNER,
                expected_attempt=1,
            ),
            _HEARTBEAT_SQL.text,
        ),
        (
            _completion_service(recovery_runtime).complete(
                job_id=identifier,
                owner=_OWNER,
                expected_attempt=1,
                result={},
            ),
            _COMPLETE_SQL.text,
        ),
        (
            _failure_service(recovery_runtime).fail(
                job_id=identifier,
                owner=_OWNER,
                expected_attempt=1,
                reason=FailureReason.HANDLER_NON_RETRYABLE,
            ),
            _FAIL_SQL.text,
        ),
    )
    failures: list[JobOwnershipLost] = []
    event.listen(
        recovery_runtime.engine.sync_engine,
        "before_execute",
        record_lifecycle_statement,
    )
    try:
        for operation, expected_last_statement in operations:
            statements.clear()
            with pytest.raises(JobOwnershipLost) as failure:
                await operation
            failures.append(failure.value)
            assert statements[-1] == expected_last_statement
    finally:
        event.remove(
            recovery_runtime.engine.sync_engine,
            "before_execute",
            record_lifecycle_statement,
        )

    assert _row(integration_settings, identifier) == before
    captured = capsys.readouterr()
    serialized = (
        "".join(str(error) + repr(error) for error in failures)
        + captured.out
        + captured.err
        + caplog.text
    )
    for evidence in (
        str(identifier),
        _OWNER,
        _FIXTURE_TYPE,
        _PAYLOAD,
        str(before[12]),
        str(before[13]),
        "attempt 1",
        "attempt 2",
    ):
        assert evidence not in serialized


@pytest.mark.asyncio
@pytest.mark.parametrize("operation_name", ["heartbeat", "completion", "failure"])
async def test_same_owner_current_attempt_two_lifecycle_operations_succeed(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    operation_name: str,
) -> None:
    identifier, first_claim, second_claim = await _claim_stale_recover_and_reclaim_same_owner(
        recovery_runtime,
        integration_settings,
    )
    assert first_claim.attempts == 1
    assert second_claim.attempts == 2

    if operation_name == "heartbeat":
        heartbeat_outcome = await _heartbeat_service(recovery_runtime).heartbeat(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=second_claim.attempts,
        )
        assert heartbeat_outcome.job_id == identifier
        assert _row(integration_settings, identifier)[2] == "running"
    elif operation_name == "completion":
        completion_outcome = await _completion_service(recovery_runtime).complete(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=second_claim.attempts,
            result={},
        )
        assert completion_outcome.job_id == identifier
        assert _row(integration_settings, identifier)[2] == "succeeded"
    else:
        failure_outcome = await _failure_service(recovery_runtime).fail(
            job_id=identifier,
            owner=_OWNER,
            expected_attempt=second_claim.attempts,
            reason=FailureReason.HANDLER_RETRYABLE,
        )
        assert isinstance(failure_outcome, RetryScheduled)
        assert _row(integration_settings, identifier)[2] == "queued"


@pytest.mark.asyncio
async def test_runtime_recovery_uses_existing_acl_and_preserves_prohibited_columns(
    recovery_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_running(integration_settings)
    before = _row(integration_settings, identifier)

    result = await _recovery_service(recovery_runtime).recover()

    after = _row(integration_settings, identifier)
    assert result.total_count == 1
    assert after[0:2] == before[0:2]
    assert after[3:6] == before[3:6]
    assert after[8:10] == before[8:10]
    assert after[17] == before[17]
    async with recovery_runtime.engine.connect() as connection:
        privileges = (
            await connection.execute(
                text(
                    "SELECT "
                    "has_column_privilege(current_user, 'public.job', 'status', 'UPDATE'), "
                    "has_column_privilege(current_user, 'public.job', 'priority', 'UPDATE'), "
                    "has_table_privilege(current_user, 'public.job', 'DELETE'), "
                    "has_table_privilege(current_user, 'public.job', 'TRUNCATE')"
                )
            )
        ).one()
        await connection.rollback()
    assert tuple(privileges) == (True, False, False, False)
