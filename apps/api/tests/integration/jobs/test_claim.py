"""Guarded real-PostgreSQL tests for passive Phase 0B3B1 claims."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator, Mapping
from datetime import datetime, timedelta
from time import monotonic
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.application.enqueue import EnqueueJobService
from lumina.jobs.domain.models import (
    ClaimedJob,
    JobClaimContention,
    JobClaimDatabaseProgrammingFailure,
    JobClaimDatabaseStateFailure,
    JobClaimOutcomeUnknown,
    JobClaimStorageUnavailable,
    NoEligibleJob,
)
from lumina.jobs.domain.payload import (
    PERSISTED_JSON_NULL,
    JobPayloadTooLarge,
    PersistedJobPayload,
    validate_json_object,
)
from lumina.jobs.infrastructure.postgresql.claim import (
    _BACKEND_PID_SQL,
    _CLAIM_SQL,
    _MAX_RECONCILIATION_CONNECTION_ATTEMPTS,
    _RECONCILE_SQL,
    PostgreSqlClaimJobStore,
)
from lumina.jobs.infrastructure.postgresql.enqueue import PostgreSqlEnqueueJobStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from sqlalchemy import Connection, event, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from ..database_safety import require_local_test_database
from ..migration_lifecycle import open_migration_connection, run_migration_operation


@pytest.fixture(autouse=True)
def clean_claim_job_rows(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Isolate claim fixtures using only the guarded lumina_test migration role."""
    _execute(integration_settings, "DELETE FROM public.job")
    try:
        yield
    finally:
        _execute(integration_settings, "DELETE FROM public.job")


@pytest_asyncio.fixture
async def claim_database_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _execute(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object] | None = None,
) -> list[tuple[object, ...]]:
    """Execute fixture DML only through the guarded local lumina_test helper."""
    sync_url = make_url(settings.test_database_sync_url.get_secret_value())

    def operation(connection: Connection) -> list[tuple[object, ...]]:
        result = connection.execute(text(statement), parameters or {})
        rows = [tuple(row) for row in result.all()] if result.returns_rows else []
        connection.commit()
        return rows

    return run_migration_operation(sync_url, operation)


def _seed_queued_fixture(
    settings: IntegrationTestSettings,
    *,
    payload_json: str,
    job_type: str = "system.fixture",
    priority: int = 0,
) -> UUID:
    """Insert a visibly test-only row using the guarded migration role."""
    identifier = uuid4()
    _execute(
        settings,
        "INSERT INTO public.job "
        "(id, job_type, priority, payload, max_attempts) "
        "VALUES (:id, :job_type, :priority, CAST(:payload AS jsonb), 5)",
        {
            "id": identifier,
            "job_type": job_type,
            "priority": priority,
            "payload": payload_json,
        },
    )
    return identifier


def _claim_store(
    runtime: DatabaseRuntime,
    *,
    timeout_ms: int = 5_000,
) -> PostgreSqlClaimJobStore:
    return PostgreSqlClaimJobStore(
        runtime.session_factory,
        operation_wait_timeout_ms=timeout_ms,
    )


def _claim_service(
    runtime: DatabaseRuntime,
    *,
    timeout_ms: int = 5_000,
) -> ClaimJobService:
    return ClaimJobService(_claim_store(runtime, timeout_ms=timeout_ms))


def _database_anchor(settings: IntegrationTestSettings) -> datetime:
    row = _execute(settings, "SELECT transaction_timestamp()")
    return cast(datetime, row[0][0])


def _seed_queued_with_fields(
    settings: IntegrationTestSettings,
    *,
    identifier: UUID,
    priority: int,
    available_at: datetime,
    created_at: datetime,
    attempts: int = 0,
    max_attempts: int = 5,
) -> None:
    _execute(
        settings,
        "INSERT INTO public.job "
        "(id, job_type, status, priority, payload, attempts, max_attempts, "
        "available_at, created_at) "
        "VALUES (:id, 'system.fixture', 'queued', :priority, "
        "CAST('{}' AS jsonb), :attempts, :max_attempts, :available_at, :created_at)",
        {
            "id": identifier,
            "priority": priority,
            "attempts": attempts,
            "max_attempts": max_attempts,
            "available_at": available_at,
            "created_at": created_at,
        },
    )


def _pool_checked_out(runtime: DatabaseRuntime) -> int:
    pool = cast(Any, runtime.engine.sync_engine.pool)
    return cast(int, pool.checkedout())


async def _assert_runtime_released(runtime: DatabaseRuntime, baseline: int) -> None:
    assert _pool_checked_out(runtime) == baseline
    async with runtime.engine.connect() as connection:
        assert not connection.in_transaction()
    assert _pool_checked_out(runtime) == baseline


def _connection_backend_pid(connection: Connection) -> int:
    driver_connection = cast(Any, connection.connection).driver_connection
    return cast(int, driver_connection.get_server_pid())


async def _synchronized_claims(
    runtime: DatabaseRuntime,
    settings: IntegrationTestSettings,
    *,
    owners: list[str],
) -> tuple[list[ClaimedJob | NoEligibleJob], set[int]]:
    """Release claim SQL only after every separate backend reaches its boundary."""
    sync_url = make_url(settings.test_database_sync_url.get_secret_value())
    require_local_test_database(sync_url)
    loop = asyncio.get_running_loop()
    all_claims_reached = asyncio.Event()
    reached_backend_pids: set[int] = set()
    claim_executions = 0
    tasks: list[asyncio.Task[ClaimedJob | NoEligibleJob]] = []

    def record_claim_boundary(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del multiparams, params, execution_options
        nonlocal claim_executions
        if str(clause_element) != _CLAIM_SQL.text:
            return
        claim_executions += 1
        reached_backend_pids.add(_connection_backend_pid(connection))
        if claim_executions == len(owners):
            loop.call_soon_threadsafe(all_claims_reached.set)

    event.listen(runtime.engine.sync_engine, "before_execute", record_claim_boundary)
    try:
        with open_migration_connection(sync_url) as blocker:
            blocking_transaction = blocker.begin()
            try:
                blocker.execute(text("LOCK TABLE public.job IN ACCESS EXCLUSIVE MODE"))
                tasks = [
                    asyncio.create_task(
                        _claim_service(runtime, timeout_ms=10_000).claim(claimed_by=owner)
                    )
                    for owner in owners
                ]
                await asyncio.wait_for(all_claims_reached.wait(), timeout=5)
                assert claim_executions == len(owners)
                assert len(reached_backend_pids) == len(owners)
            finally:
                blocking_transaction.rollback()
        outcomes = await asyncio.wait_for(asyncio.gather(*tasks), timeout=10)
    finally:
        event.remove(runtime.engine.sync_engine, "before_execute", record_claim_boundary)
        for task in tasks:
            if not task.done():
                task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    return outcomes, reached_backend_pids


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload_json", "expected", "sentinel"),
    [
        (
            '{"form":"OBJECT-POSTGRES-SENTINEL","nested":[{"read_only":true}]}',
            {"form": "OBJECT-POSTGRES-SENTINEL", "nested": ({"read_only": True},)},
            "OBJECT-POSTGRES-SENTINEL",
        ),
        (
            '["ARRAY-POSTGRES-SENTINEL",{"nested":true}]',
            ("ARRAY-POSTGRES-SENTINEL", {"nested": True}),
            "ARRAY-POSTGRES-SENTINEL",
        ),
        (
            '"STRING-POSTGRES-SENTINEL"',
            "STRING-POSTGRES-SENTINEL",
            "STRING-POSTGRES-SENTINEL",
        ),
        (
            "9223372036854775808",
            9_223_372_036_854_775_808,
            "9223372036854775808",
        ),
        ("true", True, "true"),
        ("null", PERSISTED_JSON_NULL, "null"),
    ],
)
async def test_each_postgresql_jsonb_form_is_claimed_passively_and_redacted(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    payload_json: str,
    expected: object,
    sentinel: str,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    identifier = _seed_queued_fixture(
        integration_settings,
        payload_json=payload_json,
    )

    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.fixture")

    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == identifier
    assert claimed.job_type.value == "system.fixture"
    assert claimed.payload.value == expected
    assert claimed.attempts == 1
    assert claimed.max_attempts == 5
    assert claimed.claimed_at == claimed.heartbeat_at
    assert claimed.claimed_at.tzinfo is not None
    captured = capsys.readouterr()
    serialized = repr(claimed.payload) + repr(claimed) + captured.out + captured.err + caplog.text
    if sentinel not in {"true", "null"}:
        assert sentinel not in serialized
    assert not hasattr(claimed.payload, "database_json")
    assert not hasattr(claimed, "handler")


@pytest.mark.asyncio
async def test_jsonb_null_is_sql_non_null_and_not_an_absent_claim(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_queued_fixture(integration_settings, payload_json="null")
    assert _execute(
        integration_settings,
        "SELECT payload IS NOT NULL, jsonb_typeof(payload) FROM public.job WHERE id = :id",
        {"id": identifier},
    ) == [(True, "null")]

    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.null")
    no_job = await _claim_service(claim_database_runtime).claim(claimed_by="worker.empty")

    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == identifier
    assert claimed.payload.value is PERSISTED_JSON_NULL
    assert isinstance(no_job, NoEligibleJob)


@pytest.mark.asyncio
async def test_payload_above_reduced_enqueue_limit_remains_claimable(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    decoded_payload = {"message": "LARGE-PERSISTED-SENTINEL-" + "x" * 512}
    with pytest.raises(JobPayloadTooLarge):
        validate_json_object(decoded_payload, max_bytes=32)
    identifier = _seed_queued_fixture(
        integration_settings,
        payload_json='{"message":"' + decoded_payload["message"] + '"}',
    )
    monkeypatch.setenv("LUMINA_JOB_PAYLOAD_MAX_BYTES", "1")

    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.large")

    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == identifier
    assert isinstance(claimed.payload.value, Mapping)
    assert claimed.payload.value["message"] == decoded_payload["message"]


@pytest.mark.asyncio
async def test_postgresql_integer_outside_signed_64_bit_remains_claimable(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_queued_fixture(
        integration_settings,
        payload_json="9223372036854775808",
    )

    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.integer")

    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == identifier
    assert claimed.payload.value == 9_223_372_036_854_775_808


@pytest.mark.asyncio
async def test_equivalent_jsonb_object_texts_map_without_enqueue_representation(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    first_id = _seed_queued_fixture(
        integration_settings,
        payload_json='{"z":1,"a":{"value":2}}',
        priority=2,
    )
    second_id = _seed_queued_fixture(
        integration_settings,
        payload_json='{ "a": { "value": 2.0 }, "z": 1.0 }',
        priority=1,
    )

    first = await _claim_service(claim_database_runtime).claim(claimed_by="worker.first")
    second = await _claim_service(claim_database_runtime).claim(claimed_by="worker.second")

    assert isinstance(first, ClaimedJob)
    assert isinstance(second, ClaimedJob)
    assert (first.id, second.id) == (first_id, second_id)
    assert first.payload.value == second.payload.value
    assert not hasattr(first.payload, "database_json")
    assert not hasattr(second.payload, "database_json")


@pytest.mark.asyncio
async def test_application_enqueued_noop_object_claims_unchanged(
    claim_database_runtime: DatabaseRuntime,
) -> None:
    enqueue = EnqueueJobService(
        PostgreSqlEnqueueJobStore(
            claim_database_runtime.session_factory,
            wait_timeout_ms=5_000,
        ),
        payload_max_bytes=61_440,
        default_max_attempts=5,
    )
    outcome = await enqueue.enqueue(
        job_type="system.noop",
        payload={"message": "application-noop"},
        idempotency_key="claim:application-noop",
        max_attempts=3,
    )

    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.application")

    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == outcome.id
    assert claimed.job_type.value == "system.noop"
    assert claimed.payload.value == {"message": "application-noop"}
    assert claimed.attempts == 1
    assert claimed.max_attempts == 3


@pytest.mark.asyncio
async def test_claim_dml_does_not_change_constraints(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    constraint_query = (
        "SELECT conname, pg_get_constraintdef(oid, true) "
        "FROM pg_constraint WHERE conrelid = 'public.job'::regclass ORDER BY conname"
    )
    before = _execute(integration_settings, constraint_query)
    _seed_queued_fixture(
        integration_settings,
        payload_json='["guarded-lumina-test-fixture"]',
    )

    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.constraints")

    assert isinstance(claimed, ClaimedJob)
    assert _execute(integration_settings, constraint_query) == before


@pytest.mark.asyncio
async def test_one_job_has_one_concurrent_winner_and_one_typed_empty_outcome(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed_queued_fixture(integration_settings, payload_json="{}")
    baseline = _pool_checked_out(claim_database_runtime)

    outcomes, backend_pids = await _synchronized_claims(
        claim_database_runtime,
        integration_settings,
        owners=["worker.concurrent.a", "worker.concurrent.b"],
    )

    claims = [outcome for outcome in outcomes if isinstance(outcome, ClaimedJob)]
    empty = [outcome for outcome in outcomes if isinstance(outcome, NoEligibleJob)]
    assert len(backend_pids) == 2
    assert [claim.id for claim in claims] == [identifier]
    assert len(empty) == 1
    assert _execute(
        integration_settings,
        "SELECT status, attempts FROM public.job WHERE id = :id",
        {"id": identifier},
    ) == [("running", 1)]
    await _assert_runtime_released(claim_database_runtime, baseline)


@pytest.mark.asyncio
async def test_multiple_concurrent_claimers_receive_distinct_once_incremented_rows(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    baseline = _pool_checked_out(claim_database_runtime)
    identifiers = {
        _seed_queued_fixture(
            integration_settings,
            payload_json="{}",
            priority=index,
        )
        for index in range(4)
    }

    outcomes, backend_pids = await _synchronized_claims(
        claim_database_runtime,
        integration_settings,
        owners=[f"worker.multiple.{index}" for index in range(4)],
    )

    claims = [cast(ClaimedJob, outcome) for outcome in outcomes]
    returned_ids = [claim.id for claim in claims]
    assert len(backend_pids) == 4
    assert all(isinstance(outcome, ClaimedJob) for outcome in outcomes)
    assert set(returned_ids) == identifiers
    assert len(returned_ids) == len(set(returned_ids))
    assert _execute(
        integration_settings,
        "SELECT id, attempts FROM public.job ORDER BY id",
    ) == sorted((identifier, 1) for identifier in identifiers)
    await _assert_runtime_released(claim_database_runtime, baseline)


@pytest.mark.asyncio
async def test_skip_locked_claims_next_candidate_without_waiting(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    first = _seed_queued_fixture(
        integration_settings,
        payload_json="{}",
        priority=2,
    )
    second = _seed_queued_fixture(
        integration_settings,
        payload_json="{}",
        priority=1,
    )
    async with claim_database_runtime.engine.connect() as locking_connection:
        transaction = await locking_connection.begin()
        try:
            locked = (
                await locking_connection.execute(
                    text("SELECT id FROM public.job WHERE id = :id FOR UPDATE"),
                    {"id": first},
                )
            ).scalar_one()
            assert locked == first
            started = monotonic()
            outcome = await asyncio.wait_for(
                _claim_service(claim_database_runtime, timeout_ms=500).claim(
                    claimed_by="worker.skip-locked"
                ),
                timeout=2,
            )
            elapsed = monotonic() - started
        finally:
            await transaction.rollback()

    assert isinstance(outcome, ClaimedJob)
    assert outcome.id == second
    assert elapsed < 2
    later = await _claim_service(claim_database_runtime).claim(claimed_by="worker.after-lock")
    assert isinstance(later, ClaimedJob)
    assert later.id == first


@pytest.mark.asyncio
async def test_ineligible_rows_and_attempt_boundaries(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    future = UUID("00000000-0000-4000-8000-000000000010")
    exhausted = UUID("00000000-0000-4000-8000-000000000020")
    boundary = UUID("00000000-0000-4000-8000-000000000030")
    _seed_queued_with_fields(
        integration_settings,
        identifier=future,
        priority=10,
        available_at=anchor + timedelta(hours=1),
        created_at=anchor - timedelta(hours=1),
    )
    _seed_queued_with_fields(
        integration_settings,
        identifier=exhausted,
        priority=9,
        available_at=anchor - timedelta(seconds=1),
        created_at=anchor - timedelta(hours=1),
        attempts=5,
    )
    _seed_queued_with_fields(
        integration_settings,
        identifier=boundary,
        priority=1,
        available_at=anchor - timedelta(seconds=1),
        created_at=anchor - timedelta(hours=1),
        attempts=4,
    )

    outcome = await _claim_service(claim_database_runtime).claim(claimed_by="worker.boundary")
    no_more = await _claim_service(claim_database_runtime).claim(claimed_by="worker.ineligible")

    assert isinstance(outcome, ClaimedJob)
    assert outcome.id == boundary
    assert outcome.attempts == outcome.max_attempts == 5
    assert isinstance(no_more, NoEligibleJob)
    assert _execute(
        integration_settings,
        "SELECT id, status, attempts FROM public.job ORDER BY id",
    ) == [
        (future, "queued", 0),
        (exhausted, "queued", 5),
        (boundary, "running", 5),
    ]


@pytest.mark.asyncio
async def test_seeded_attempt_increments_exactly_once(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    identifier = uuid4()
    _seed_queued_with_fields(
        integration_settings,
        identifier=identifier,
        priority=0,
        available_at=anchor - timedelta(seconds=1),
        created_at=anchor - timedelta(seconds=1),
        attempts=2,
    )

    outcome = await _claim_service(claim_database_runtime).claim(claimed_by="worker.attempt")

    assert isinstance(outcome, ClaimedJob)
    assert outcome.attempts == 3
    assert _execute(
        integration_settings,
        "SELECT attempts FROM public.job WHERE id = :id",
        {"id": identifier},
    ) == [(3,)]


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["future", "max_attempts"])
async def test_only_future_or_max_attempt_rows_returns_typed_no_eligible(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    reason: str,
) -> None:
    anchor = _database_anchor(integration_settings)
    _seed_queued_with_fields(
        integration_settings,
        identifier=uuid4(),
        priority=0,
        available_at=(
            anchor + timedelta(hours=1) if reason == "future" else anchor - timedelta(seconds=1)
        ),
        created_at=anchor - timedelta(seconds=1),
        attempts=5 if reason == "max_attempts" else 0,
    )

    outcome = await _claim_service(claim_database_runtime).claim(claimed_by=f"worker.only-{reason}")

    assert isinstance(outcome, NoEligibleJob)


@pytest.mark.asyncio
async def test_non_queued_rows_are_ineligible(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    _execute(
        integration_settings,
        "INSERT INTO public.job "
        "(id, job_type, status, payload, attempts, max_attempts, claimed_by, "
        "claimed_at, heartbeat_at) "
        "VALUES (:id, 'system.fixture', 'running', CAST('{}' AS jsonb), "
        "1, 5, 'worker.seed', :anchor, :anchor)",
        {"id": uuid4(), "anchor": anchor},
    )

    outcome = await _claim_service(claim_database_runtime).claim(claimed_by="worker.nonqueued")

    assert isinstance(outcome, NoEligibleJob)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("variant", "expected"),
    [
        ("priority", UUID("00000000-0000-4000-8000-000000000002")),
        ("available", UUID("00000000-0000-4000-8000-000000000002")),
        ("created", UUID("00000000-0000-4000-8000-000000000002")),
        ("uuid", UUID("00000000-0000-4000-8000-000000000001")),
    ],
)
async def test_each_claim_ordering_tie_break_independently(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    variant: str,
    expected: UUID,
) -> None:
    anchor = _database_anchor(integration_settings)
    first = UUID("00000000-0000-4000-8000-000000000001")
    second = UUID("00000000-0000-4000-8000-000000000002")
    shared_available = anchor - timedelta(minutes=5)
    shared_created = anchor - timedelta(minutes=10)
    fields: dict[UUID, tuple[int, datetime, datetime]] = {
        first: (1, shared_available, shared_created),
        second: (1, shared_available, shared_created),
    }
    if variant == "priority":
        fields[second] = (2, shared_available, shared_created)
    elif variant == "available":
        fields[first] = (1, shared_available + timedelta(seconds=1), shared_created)
    elif variant == "created":
        fields[first] = (1, shared_available, shared_created + timedelta(seconds=1))
    for identifier, (priority, available_at, created_at) in fields.items():
        _seed_queued_with_fields(
            integration_settings,
            identifier=identifier,
            priority=priority,
            available_at=available_at,
            created_at=created_at,
        )

    outcome = await _claim_service(claim_database_runtime).claim(
        claimed_by=f"worker.order.{variant}"
    )

    assert isinstance(outcome, ClaimedJob)
    assert outcome.id == expected


@pytest.mark.asyncio
async def test_internal_claim_rollback_restores_row_and_leaves_it_claimable(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    identifier = uuid4()
    baseline = _pool_checked_out(claim_database_runtime)
    _seed_queued_with_fields(
        integration_settings,
        identifier=identifier,
        priority=0,
        available_at=anchor - timedelta(seconds=1),
        created_at=anchor - timedelta(seconds=1),
        attempts=2,
    )
    store = _claim_store(claim_database_runtime)
    async with claim_database_runtime.engine.connect() as connection:
        transaction = await connection.begin()
        await store._install_timeouts(connection)
        provisional = await store._claim_with_connection(
            connection,
            claimed_by="worker.rollback",
        )
        assert isinstance(provisional, ClaimedJob)
        await transaction.rollback()
    await _assert_runtime_released(claim_database_runtime, baseline)

    assert _execute(
        integration_settings,
        "SELECT status, claimed_by, claimed_at, heartbeat_at, attempts "
        "FROM public.job WHERE id = :id",
        {"id": identifier},
    ) == [("queued", None, None, None, 2)]
    claimed = await _claim_service(claim_database_runtime).claim(claimed_by="worker.after-rollback")
    assert isinstance(claimed, ClaimedJob)
    assert claimed.id == identifier
    assert claimed.attempts == 3
    await _assert_runtime_released(claim_database_runtime, baseline)


@pytest.mark.asyncio
async def test_relation_lock_timeout_rolls_back_releases_pool_and_resets_settings(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    identifier = _seed_queued_fixture(integration_settings, payload_json="{}")
    baseline = _pool_checked_out(runtime)
    sync_url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    require_local_test_database(sync_url)
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
                blocker.execute(text("LOCK TABLE public.job IN ACCESS EXCLUSIVE MODE"))
                started = monotonic()
                with pytest.raises(JobClaimContention):
                    await asyncio.wait_for(
                        _claim_service(runtime, timeout_ms=150).claim(
                            claimed_by="worker.relation-timeout"
                        ),
                        timeout=2,
                    )
                elapsed = monotonic() - started
                assert elapsed < 2
                await _assert_runtime_released(runtime, baseline)
            finally:
                blocking_transaction.rollback()

        assert _execute(
            integration_settings,
            "SELECT status, claimed_by, claimed_at, heartbeat_at, attempts "
            "FROM public.job WHERE id = :id",
            {"id": identifier},
        ) == [("queued", None, None, None, 0)]
        claimed = await _claim_service(runtime, timeout_ms=500).claim(
            claimed_by="worker.after-timeout"
        )
        assert isinstance(claimed, ClaimedJob)
        assert claimed.id == identifier
        await _assert_runtime_released(runtime, baseline)
        async with runtime.engine.connect() as later_connection:
            assert (
                await later_connection.execute(text("SHOW statement_timeout"))
            ).scalar_one() == statement_before
            assert (
                await later_connection.execute(text("SHOW lock_timeout"))
            ).scalar_one() == lock_before
            await later_connection.rollback()
        await _assert_runtime_released(runtime, baseline)
    finally:
        await runtime.engine.dispose()


class _CommitAcknowledgementLost(OperationalError):
    pass


class _AckLossSession:
    def __init__(
        self,
        session: AsyncSession,
        after_commit: Callable[[], Awaitable[None]] | None,
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
            "COMMIT ACKNOWLEDGEMENT SENTINEL",
            {"secret": "COMMIT PARAMETER SENTINEL"},
            Exception("COMMIT DRIVER SENTINEL"),
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
                "COMMIT EXHAUSTION ACKNOWLEDGEMENT SENTINEL",
                {"secret": "COMMIT EXHAUSTION PARAMETER SENTINEL"},
                Exception("COMMIT EXHAUSTION DRIVER SENTINEL"),
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


class _PreMutationFailureStore(PostgreSqlClaimJobStore):
    async def _claim_with_connection(
        self,
        connection: AsyncConnection,
        *,
        claimed_by: str,
    ) -> ClaimedJob | NoEligibleJob:
        del connection, claimed_by
        raise ProgrammingError(
            "CLAIM PRE-MUTATION SQL SENTINEL",
            {"secret": "CLAIM PRE-MUTATION PARAMETER SENTINEL"},
            Exception("CLAIM PRE-MUTATION DRIVER SENTINEL"),
        )


class _SqlstateFailure(Exception):
    def __init__(self, sqlstate: str) -> None:
        super().__init__("CLAIM INVALIDATED TIMEOUT DRIVER SENTINEL")
        self.sqlstate = sqlstate


class _InvalidatedTimeoutFailureStore(PostgreSqlClaimJobStore):
    async def _claim_with_connection(
        self,
        connection: AsyncConnection,
        *,
        claimed_by: str,
    ) -> ClaimedJob | NoEligibleJob:
        del connection, claimed_by
        raise OperationalError(
            "CLAIM INVALIDATED TIMEOUT SQL SENTINEL",
            {"secret": "CLAIM INVALIDATED TIMEOUT PARAMETER SENTINEL"},
            _SqlstateFailure("55P03"),
            connection_invalidated=True,
        )


@pytest.mark.asyncio
async def test_real_recursion_mapping_failure_rolls_back_and_releases_the_claim(
    integration_settings: IntegrationTestSettings,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    baseline = _pool_checked_out(runtime)
    payload_sentinel = "POSTGRES-DEEP-PAYLOAD-SENTINEL"
    mapper_sentinel = "POSTGRES-MAPPER-RECURSION-SENTINEL"
    identifier = _seed_queued_fixture(
        integration_settings,
        payload_json=f'{{"nested":"{payload_sentinel}"}}',
    )

    def force_recursion(cls: type[PersistedJobPayload], value: object) -> PersistedJobPayload:
        del cls, value
        raise RecursionError(mapper_sentinel)

    try:
        with monkeypatch.context() as mapping_patch:
            mapping_patch.setattr(
                PersistedJobPayload,
                "from_decoded",
                classmethod(force_recursion),
            )
            with pytest.raises(JobClaimDatabaseStateFailure) as failure:
                await _claim_store(runtime).claim(claimed_by="worker.mapping.rollback")
        assert failure.value.__cause__ is None
        assert failure.value.__context__ is None
        await _assert_runtime_released(runtime, baseline)
        assert _execute(
            integration_settings,
            "SELECT status, claimed_by, claimed_at, heartbeat_at, attempts "
            "FROM public.job WHERE id = :id",
            {"id": identifier},
        ) == [("queued", None, None, None, 0)]

        claimed = await _claim_store(runtime).claim(claimed_by="worker.mapping.after")
        assert isinstance(claimed, ClaimedJob)
        assert claimed.id == identifier
        assert claimed.attempts == 1
        await _assert_runtime_released(runtime, baseline)
        captured = capsys.readouterr()
        serialized = (
            str(failure.value)
            + repr(failure.value)
            + repr(failure.value.args)
            + repr(failure.value.__cause__)
            + repr(failure.value.__context__)
            + captured.out
            + captured.err
            + caplog.text
        )
        assert mapper_sentinel not in serialized
        assert payload_sentinel not in serialized
    finally:
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_isolated_pool_release_for_success_empty_safe_error_and_post_return_work(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    baseline = _pool_checked_out(runtime)
    try:
        _seed_queued_fixture(integration_settings, payload_json="{}")
        claimed = await _claim_service(runtime).claim(claimed_by="worker.pool.success")
        assert isinstance(claimed, ClaimedJob)
        await _assert_runtime_released(runtime, baseline)

        empty = await _claim_service(runtime).claim(claimed_by="worker.pool.empty")
        assert isinstance(empty, NoEligibleJob)
        await _assert_runtime_released(runtime, baseline)

        failing = _PreMutationFailureStore(
            runtime.session_factory,
            operation_wait_timeout_ms=500,
        )
        with pytest.raises(JobClaimDatabaseProgrammingFailure):
            await failing.claim(claimed_by="worker.pool.failure")
        await _assert_runtime_released(runtime, baseline)

        invalidated_timeout = _InvalidatedTimeoutFailureStore(
            runtime.session_factory,
            operation_wait_timeout_ms=500,
        )
        with pytest.raises(JobClaimStorageUnavailable):
            await invalidated_timeout.claim(claimed_by="worker.pool.invalidated")
        await _assert_runtime_released(runtime, baseline)

        application_work_completed = asyncio.Event()
        application_work_completed.set()
        await application_work_completed.wait()
        await _assert_runtime_released(runtime, baseline)
    finally:
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_isolated_pool_release_for_reconciled_success_and_unknown(
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    baseline = _pool_checked_out(runtime)
    checkout_backend_pids: list[int] = []

    def record_checkout(
        database_connection: object,
        connection_record: object,
        connection_proxy: object,
    ) -> None:
        del connection_record, connection_proxy
        driver_connection = cast(Any, database_connection).driver_connection
        checkout_backend_pids.append(cast(int, driver_connection.get_server_pid()))

    try:
        first = _seed_queued_fixture(
            integration_settings,
            payload_json="{}",
            priority=2,
        )
        event.listen(runtime.engine.sync_engine, "checkout", record_checkout)
        success_factory = _FirstCommitAckLossFactory(runtime.session_factory)
        success_store = PostgreSqlClaimJobStore(
            cast(async_sessionmaker[AsyncSession], success_factory),
            operation_wait_timeout_ms=500,
        )
        reconciled = await success_store.claim(claimed_by="worker.pool.reconciled")
        assert isinstance(reconciled, ClaimedJob)
        assert reconciled.id == first
        assert success_factory.calls == 3
        assert len(checkout_backend_pids) == 3
        primary_backend_pid, rejected_backend_pid, reconciliation_backend_pid = (
            checkout_backend_pids
        )
        assert rejected_backend_pid == primary_backend_pid
        assert reconciliation_backend_pid != primary_backend_pid
        event.remove(runtime.engine.sync_engine, "checkout", record_checkout)
        await _assert_runtime_released(runtime, baseline)
        captured = capsys.readouterr()
        serialized = captured.out + captured.err + caplog.text
        for backend_pid in checkout_backend_pids:
            assert str(backend_pid) not in serialized

        second = _seed_queued_fixture(
            integration_settings,
            payload_json="{}",
            priority=1,
        )

        async def make_evidence_mismatch() -> None:
            async with runtime.engine.begin() as connection:
                await connection.execute(
                    text(
                        "UPDATE public.job "
                        "SET heartbeat_at = heartbeat_at + interval '1 second' "
                        "WHERE id = :id"
                    ),
                    {"id": second},
                )

        unknown_factory = _FirstCommitAckLossFactory(
            runtime.session_factory,
            make_evidence_mismatch,
        )
        unknown_store = PostgreSqlClaimJobStore(
            cast(async_sessionmaker[AsyncSession], unknown_factory),
            operation_wait_timeout_ms=500,
        )
        with pytest.raises(JobClaimOutcomeUnknown):
            await unknown_store.claim(claimed_by="worker.pool.unknown")
        assert unknown_factory.calls == 3
        await _assert_runtime_released(runtime, baseline)
    finally:
        if event.contains(runtime.engine.sync_engine, "checkout", record_checkout):
            event.remove(runtime.engine.sync_engine, "checkout", record_checkout)
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_guarded_distinct_backend_exhaustion_never_attempts_a_second_claim(
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    runtime = create_database_runtime(integration_settings.test_database_url)
    baseline = _pool_checked_out(runtime)
    owner = "worker.backend-exhaustion"
    target = _seed_queued_fixture(
        integration_settings,
        payload_json="{}",
        priority=10,
    )
    sentinel = _seed_queued_fixture(
        integration_settings,
        payload_json="{}",
        priority=0,
    )
    state = _BackendExhaustionState()
    factory = _BackendExhaustionFactory(runtime.session_factory, state)
    store = PostgreSqlClaimJobStore(
        cast(async_sessionmaker[AsyncSession], factory),
        operation_wait_timeout_ms=500,
    )
    atomic_claim_executions = 0
    reconciliation_reads = 0
    current_task = asyncio.current_task()
    pending_before = {
        task for task in asyncio.all_tasks() if task is not current_task and not task.done()
    }

    def record_claim_lifecycle(
        connection: Connection,
        clause_element: object,
        multiparams: object,
        params: object,
        execution_options: object,
    ) -> None:
        del connection, multiparams, params, execution_options
        nonlocal atomic_claim_executions, reconciliation_reads
        statement = str(clause_element)
        if statement == _CLAIM_SQL.text:
            atomic_claim_executions += 1
        elif statement == _RECONCILE_SQL.text:
            reconciliation_reads += 1

    event.listen(runtime.engine.sync_engine, "before_execute", record_claim_lifecycle)
    try:
        with pytest.raises(JobClaimOutcomeUnknown) as failure:
            await store.claim(claimed_by=owner)

        assert atomic_claim_executions == 1
        assert reconciliation_reads == 0
        assert factory.calls == 1 + _MAX_RECONCILIATION_CONNECTION_ATTEMPTS
        assert state.primary_pid_queries == 1
        assert state.reconciliation_pid_queries == _MAX_RECONCILIATION_CONNECTION_ATTEMPTS
        assert len(state.actual_backend_pids) == 1 + _MAX_RECONCILIATION_CONNECTION_ATTEMPTS
        await _assert_runtime_released(runtime, baseline)

        target_row = _execute(
            integration_settings,
            "SELECT status, attempts, claimed_by, claimed_at, heartbeat_at "
            "FROM public.job WHERE id = :id",
            {"id": target},
        )[0]
        sentinel_row = _execute(
            integration_settings,
            "SELECT status, attempts, claimed_by, claimed_at, heartbeat_at "
            "FROM public.job WHERE id = :id",
            {"id": sentinel},
        )[0]
        assert target_row[0:3] == ("running", 1, owner)
        assert target_row[3] is not None
        assert target_row[4] == target_row[3]
        assert sentinel_row == ("queued", 0, None, None, None)

        error = failure.value
        captured = capsys.readouterr()
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
        assert error.args == ("Job claim outcome is unknown.",)
        assert error.__cause__ is None
        assert error.__context__ is None
        for secret in (
            str(target),
            str(sentinel),
            owner,
            str(target_row[3]),
            str(target_row[4]),
            *(str(backend_pid) for backend_pid in state.actual_backend_pids),
            "COMMIT EXHAUSTION ACKNOWLEDGEMENT SENTINEL",
            "COMMIT EXHAUSTION PARAMETER SENTINEL",
            "COMMIT EXHAUSTION DRIVER SENTINEL",
        ):
            assert secret not in serialized

        pending_after = {
            task for task in asyncio.all_tasks() if task is not current_task and not task.done()
        }
        assert pending_after <= pending_before
    finally:
        if event.contains(runtime.engine.sync_engine, "before_execute", record_claim_lifecycle):
            event.remove(runtime.engine.sync_engine, "before_execute", record_claim_lifecycle)
        await runtime.engine.dispose()


def _planner_nodes(node: Mapping[str, Any]) -> Iterator[Mapping[str, Any]]:
    yield node
    for child in cast(list[Mapping[str, Any]], node.get("Plans", [])):
        yield from _planner_nodes(child)


@pytest.mark.asyncio
async def test_explain_representative_queue_index_evidence_and_cleanup(
    claim_database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    anchor = _database_anchor(integration_settings)
    baseline = _pool_checked_out(claim_database_runtime)
    try:
        _execute(
            integration_settings,
            "INSERT INTO public.job "
            "(id, job_type, status, priority, payload, attempts, max_attempts, "
            "available_at, created_at) "
            "SELECT md5('eligible-' || item::text)::uuid, 'system.fixture', "
            "'queued', (item % 20)::smallint, CAST('{}' AS jsonb), 0, 5, "
            ":anchor - ((item % 60) * interval '1 second'), "
            ":anchor - ((item % 3600) * interval '1 second') "
            "FROM generate_series(1, 3000) AS item",
            {"anchor": anchor},
        )
        _execute(
            integration_settings,
            "INSERT INTO public.job "
            "(id, job_type, status, priority, payload, attempts, max_attempts, "
            "available_at, created_at) "
            "SELECT md5('future-' || item::text)::uuid, 'system.fixture', "
            "'queued', 0, CAST('{}' AS jsonb), 0, 5, "
            ":anchor + interval '1 hour', :anchor "
            "FROM generate_series(1, 750) AS item",
            {"anchor": anchor},
        )
        _execute(
            integration_settings,
            "INSERT INTO public.job "
            "(id, job_type, status, priority, payload, attempts, max_attempts, "
            "available_at, created_at) "
            "SELECT md5('max-' || item::text)::uuid, 'system.fixture', "
            "'queued', 0, CAST('{}' AS jsonb), 5, 5, :anchor, :anchor "
            "FROM generate_series(1, 250) AS item",
            {"anchor": anchor},
        )
        for status in ("running", "succeeded", "failed", "dead_letter"):
            terminal = status != "running"
            error_state = status in {"failed", "dead_letter"}
            _execute(
                integration_settings,
                "INSERT INTO public.job "
                "(id, job_type, status, priority, payload, attempts, max_attempts, "
                "available_at, claimed_by, claimed_at, heartbeat_at, completed_at, "
                "error_code, created_at) "
                "SELECT md5(:prefix || item::text)::uuid, 'system.fixture', :status, "
                "0, CAST('{}' AS jsonb), 1, 5, :anchor, 'worker.fixture', :anchor, "
                ":anchor, CASE WHEN :terminal THEN :anchor ELSE NULL END, "
                "CASE WHEN :error_state THEN 'fixture.error' ELSE NULL END, :anchor "
                "FROM generate_series(1, 250) AS item",
                {
                    "prefix": f"{status}-",
                    "status": status,
                    "anchor": anchor,
                    "terminal": terminal,
                    "error_state": error_state,
                },
            )
        _execute(integration_settings, "ANALYZE public.job")

        store = _claim_store(claim_database_runtime)
        explain = text("EXPLAIN (ANALYZE, BUFFERS, COSTS OFF, FORMAT JSON) " + _CLAIM_SQL.text)
        async with claim_database_runtime.engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await store._install_timeouts(connection)
                document = (
                    await connection.execute(
                        explain,
                        {"claimed_by": "worker.explain"},
                    )
                ).scalar_one()
            finally:
                await transaction.rollback()

        plan = cast(Mapping[str, Any], cast(list[Mapping[str, Any]], document)[0]["Plan"])
        nodes = list(_planner_nodes(plan))
        actual_rows = sum(int(node.get("Actual Rows", 0)) for node in nodes)
        evidence: dict[str, Any] = {
            "index_names": sorted(
                {cast(str, node["Index Name"]) for node in nodes if "Index Name" in node}
            ),
            "filter_nodes": sum(
                "Filter" in node or "Rows Removed by Filter" in node for node in nodes
            ),
            "sort_nodes": sum(
                node.get("Node Type") in {"Sort", "Incremental Sort"} for node in nodes
            ),
            "actual_rows": actual_rows,
            "shared_hit_blocks": sum(int(node.get("Shared Hit Blocks", 0)) for node in nodes),
            "shared_read_blocks": sum(int(node.get("Shared Read Blocks", 0)) for node in nodes),
        }
        print(f"sanitized claim planner evidence: {evidence}")
        assert actual_rows > 0
        assert "ix_job_queue_poll" in evidence["index_names"]
        assert "filter_nodes" in evidence
        assert "sort_nodes" in evidence
        assert "shared_hit_blocks" in evidence
    finally:
        _execute(integration_settings, "DELETE FROM public.job")
        _execute(integration_settings, "ANALYZE public.job")
    assert _execute(integration_settings, "SELECT count(*) FROM public.job") == [(0,)]
    await _assert_runtime_released(claim_database_runtime, baseline)
