"""Real PostgreSQL enqueue, idempotency, defaults, and error-boundary tests."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator
from uuid import uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.enqueue import EnqueueJobService
from lumina.jobs.domain.models import (
    EnqueueJob,
    EnqueueJobOutcome,
    JobDatabaseProgrammingFailure,
    JobDatabaseStateFailure,
    JobEnqueueContention,
    JobIdempotencyConflict,
    JobStatus,
    JobStorageUnavailable,
)
from lumina.jobs.infrastructure.postgresql.enqueue import PostgreSqlEnqueueJobStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from pydantic import SecretStr
from sqlalchemy import URL, Connection, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.ext.asyncio import AsyncConnection

from ..migration_lifecycle import run_migration_operation


@pytest.fixture(autouse=True)
def clean_job_rows(integration_settings: IntegrationTestSettings) -> Iterator[None]:
    """Keep enqueue fixtures isolated using only the guarded migration role."""
    sync_url = make_url(integration_settings.test_database_sync_url.get_secret_value())

    def clean(connection: Connection) -> None:
        connection.execute(text("DELETE FROM public.job"))
        connection.commit()

    run_migration_operation(sync_url, clean)
    try:
        yield
    finally:
        run_migration_operation(sync_url, clean)


@pytest_asyncio.fixture
async def database_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _service(runtime: DatabaseRuntime, *, wait_timeout_ms: int = 5_000) -> EnqueueJobService:
    return EnqueueJobService(
        PostgreSqlEnqueueJobStore(
            runtime.session_factory,
            wait_timeout_ms=wait_timeout_ms,
        ),
        payload_max_bytes=61_440,
        default_max_attempts=5,
    )


def _rows(
    settings: IntegrationTestSettings,
    statement: str,
    parameters: dict[str, object] | None = None,
) -> list[tuple[object, ...]]:
    sync_url = make_url(settings.test_database_sync_url.get_secret_value())

    def query(connection: Connection) -> list[tuple[object, ...]]:
        result = connection.execute(text(statement), parameters or {})
        rows = [tuple(row) for row in result.all()] if result.returns_rows else []
        connection.commit()
        return rows

    return run_migration_operation(sync_url, query)


@pytest.mark.asyncio
async def test_restricted_insert_uses_exact_server_defaults(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    outcome = await _service(database_runtime).enqueue(
        job_type="system.noop",
        payload={"message": "phase0b"},
        idempotency_key="defaults:phase0b",
        priority=0,
        max_attempts=3,
    )

    rows = _rows(
        integration_settings,
        "SELECT id, job_type, status, idempotency_key, priority, payload, result, "
        "progress, attempts, max_attempts, available_at, claimed_by, claimed_at, "
        "heartbeat_at, completed_at, error_code, error_message, created_at, "
        "available_at = created_at, available_at <= transaction_timestamp() "
        "FROM public.job WHERE id = :id",
        {"id": outcome.id},
    )
    assert rows == [
        (
            outcome.id,
            "system.noop",
            "queued",
            "defaults:phase0b",
            0,
            {"message": "phase0b"},
            None,
            0.0,
            0,
            3,
            rows[0][10],
            None,
            None,
            None,
            None,
            None,
            None,
            rows[0][17],
            True,
            True,
        )
    ]
    assert rows[0][10] is not None
    assert rows[0][17] is not None
    assert outcome.id.version == 4
    assert outcome == type(outcome)(outcome.id, JobStatus.QUEUED, replayed=False)


@pytest.mark.asyncio
@pytest.mark.parametrize("priority", [-32_768, -1, 0, 1, 32_767])
async def test_priority_and_idempotency_key_boundaries_persist(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    priority: int,
) -> None:
    key = "A" if priority == -32_768 else f"A._:-{priority}"
    if priority == 32_767:
        key = "A" * 255
    outcome = await _service(database_runtime).enqueue(
        job_type="system.noop",
        payload={},
        idempotency_key=key,
        priority=priority,
    )

    assert _rows(
        integration_settings,
        "SELECT priority, idempotency_key FROM public.job WHERE id = :id",
        {"id": outcome.id},
    ) == [(priority, key)]


@pytest.mark.asyncio
async def test_equal_replay_uses_jsonb_equality_and_terminal_keys_remain_reserved(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    service = _service(database_runtime)
    first = await service.enqueue(
        job_type="system.noop",
        payload={"a": 1, "b": {"x": True}},
        idempotency_key="replay:jsonb",
        priority=2,
        max_attempts=4,
    )
    replay = await service.enqueue(
        job_type="system.noop",
        payload={"b": {"x": True}, "a": 1.0},
        idempotency_key="replay:jsonb",
        priority=2,
        max_attempts=4,
    )
    assert replay.id == first.id
    assert replay.replayed

    terminal_id = uuid4()
    _rows(
        integration_settings,
        "INSERT INTO public.job "
        "(id, job_type, status, idempotency_key, priority, payload, attempts, "
        "max_attempts, claimed_by, claimed_at, completed_at) "
        "VALUES (:id, 'system.noop', 'succeeded', 'terminal:key', 0, "
        "CAST(:seed_payload AS jsonb), 1, 5, 'test.seed', "
        "transaction_timestamp(), transaction_timestamp())",
        {"id": terminal_id, "seed_payload": '{"done":true}'},
    )
    terminal_replay = await service.enqueue(
        job_type="system.noop",
        payload={"done": True},
        idempotency_key="terminal:key",
    )
    assert terminal_replay.id == terminal_id
    assert terminal_replay.status is JobStatus.SUCCEEDED
    assert terminal_replay.replayed


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "changes",
    [
        {"payload": {"value": 2}},
        {"priority": 1},
        {"max_attempts": 4},
    ],
)
async def test_each_different_logical_field_conflicts(
    database_runtime: DatabaseRuntime,
    changes: dict[str, object],
) -> None:
    service = _service(database_runtime)
    request: dict[str, object] = {
        "job_type": "system.noop",
        "payload": {"value": 1},
        "idempotency_key": "conflict:field",
        "priority": 0,
        "max_attempts": 5,
    }
    await service.enqueue(**request)  # type: ignore[arg-type]
    request.update(changes)

    with pytest.raises(JobIdempotencyConflict) as failure:
        await service.enqueue(**request)  # type: ignore[arg-type]
    assert str(failure.value) == "Job idempotency conflict."


@pytest.mark.asyncio
async def test_safe_conflict_never_logs_or_exposes_payload_and_key(
    database_runtime: DatabaseRuntime,
    caplog: pytest.LogCaptureFixture,
) -> None:
    service = _service(database_runtime)
    payload_sentinel = "CONFLICT-PAYLOAD-SENTINEL"
    key_sentinel = "conflict:key-sentinel"
    await service.enqueue(
        job_type="system.noop",
        payload={"message": payload_sentinel},
        idempotency_key=key_sentinel,
        priority=0,
    )

    with pytest.raises(JobIdempotencyConflict) as failure:
        await service.enqueue(
            job_type="system.noop",
            payload={"message": payload_sentinel},
            idempotency_key=key_sentinel,
            priority=1,
        )

    serialized = str(failure.value) + repr(failure.value) + caplog.text
    assert payload_sentinel not in serialized
    assert key_sentinel not in serialized


@pytest.mark.asyncio
async def test_unsupported_persisted_type_returns_only_safe_conflict(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    _rows(
        integration_settings,
        "INSERT INTO public.job "
        "(id, job_type, idempotency_key, priority, payload, max_attempts) "
        "VALUES (:id, 'system.legacy', 'legacy:type', 0, "
        "CAST(:seed_payload AS jsonb), 5)",
        {"id": uuid4(), "seed_payload": '{"message":"phase0b"}'},
    )

    with pytest.raises(JobIdempotencyConflict) as failure:
        await _service(database_runtime).enqueue(
            job_type="system.noop",
            payload={"message": "phase0b"},
            idempotency_key="legacy:type",
        )
    assert str(failure.value) == "Job idempotency conflict."
    assert "legacy" not in repr(failure.value)


@pytest.mark.asyncio
async def test_null_keys_always_create_independent_jobs(
    database_runtime: DatabaseRuntime,
) -> None:
    service = _service(database_runtime)
    first = await service.enqueue(job_type="system.noop", payload={})
    second = await service.enqueue(job_type="system.noop", payload={})

    assert first.id != second.id
    assert not first.replayed
    assert not second.replayed


@pytest.mark.asyncio
async def test_concurrent_equal_enqueues_converge_on_one_row(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    service = _service(database_runtime)

    outcomes = await asyncio.gather(
        *(
            service.enqueue(
                job_type="system.noop",
                payload={"message": "same"},
                idempotency_key="concurrent:equal",
                priority=-2,
                max_attempts=3,
            )
            for _ in range(2)
        )
    )

    assert outcomes[0].id == outcomes[1].id
    assert sorted(outcome.replayed for outcome in outcomes) == [False, True]
    assert _rows(
        integration_settings,
        "SELECT count(*) FROM public.job WHERE idempotency_key = 'concurrent:equal'",
    ) == [(1,)]


@pytest.mark.asyncio
async def test_concurrent_different_enqueues_produce_insert_and_conflict(
    database_runtime: DatabaseRuntime,
) -> None:
    service = _service(database_runtime)
    outcomes = await asyncio.gather(
        service.enqueue(
            job_type="system.noop",
            payload={"message": "same"},
            idempotency_key="concurrent:different",
            priority=-1,
        ),
        service.enqueue(
            job_type="system.noop",
            payload={"message": "same"},
            idempotency_key="concurrent:different",
            priority=1,
        ),
        return_exceptions=True,
    )

    assert sum(not isinstance(outcome, BaseException) for outcome in outcomes) == 1
    assert sum(isinstance(outcome, JobIdempotencyConflict) for outcome in outcomes) == 1


class _ProgrammingFailureStore(PostgreSqlEnqueueJobStore):
    async def _enqueue_with_connection(
        self,
        connection: AsyncConnection,
        job: EnqueueJob,
    ) -> EnqueueJobOutcome:
        del connection, job
        raise ProgrammingError("programming sentinel", None, Exception("bad SQL"))


class _IntegrityFailureStore(PostgreSqlEnqueueJobStore):
    async def _enqueue_with_connection(
        self,
        connection: AsyncConnection,
        job: EnqueueJob,
    ) -> EnqueueJobOutcome:
        del connection, job
        raise IntegrityError("integrity sentinel", None, Exception("bad data"))


@pytest.mark.asyncio
async def test_programming_and_unexpected_integrity_errors_are_safely_classified(
    database_runtime: DatabaseRuntime,
) -> None:
    for store_type, error_type, message in (
        (
            _ProgrammingFailureStore,
            JobDatabaseProgrammingFailure,
            "Job enqueue failed because database operations are incompatible.",
        ),
        (
            _IntegrityFailureStore,
            JobDatabaseStateFailure,
            "Job enqueue failed because database state is inconsistent.",
        ),
    ):
        service = EnqueueJobService(
            store_type(database_runtime.session_factory, wait_timeout_ms=5_000),
            payload_max_bytes=1_024,
            default_max_attempts=5,
        )
        with pytest.raises(error_type) as failure:
            await service.enqueue(job_type="system.noop", payload={})
        assert str(failure.value) == message
        assert failure.value.__cause__ is None
        assert failure.value.__context__ is None


@pytest.mark.asyncio
async def test_permission_failure_is_safe_and_restored(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    payload_sentinel = "ACL-PAYLOAD-SENTINEL"
    key_sentinel = "acl:key-sentinel"
    revoke_sql = (
        "REVOKE INSERT (id, job_type, idempotency_key, priority, payload, max_attempts) "
        "ON TABLE public.job FROM lumina_test_app"
    )
    grant_sql = (
        "GRANT INSERT (id, job_type, idempotency_key, priority, payload, max_attempts) "
        "ON TABLE public.job TO lumina_test_app"
    )
    _rows(integration_settings, revoke_sql)
    try:
        with pytest.raises(JobDatabaseProgrammingFailure) as failure:
            await _service(database_runtime).enqueue(
                job_type="system.noop",
                payload={"message": payload_sentinel},
                idempotency_key=key_sentinel,
            )
    finally:
        _rows(integration_settings, grant_sql)

    captured = capsys.readouterr()
    serialized = (
        str(failure.value)
        + repr(failure.value)
        + repr(failure.value.args)
        + captured.out
        + captured.err
        + caplog.text
    )
    assert str(failure.value) == (
        "Job enqueue failed because database operations are incompatible."
    )
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    assert payload_sentinel not in serialized
    assert key_sentinel not in serialized


@pytest.mark.asyncio
async def test_idempotency_conflict_wait_is_bounded_and_secret_safe(
    database_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    key_sentinel = "contention:key-sentinel"
    payload_sentinel = "CONTENTION-PAYLOAD-SENTINEL"
    holder_ready = asyncio.Event()
    holder_release = asyncio.Event()

    async def hold_conflicting_insert() -> None:
        async with database_runtime.engine.connect() as connection:
            transaction = await connection.begin()
            try:
                await connection.execute(
                    text(
                        "INSERT INTO public.job "
                        "(id, job_type, idempotency_key, priority, payload, max_attempts) "
                        "VALUES (:id, 'system.noop', :key, 0, CAST(:payload AS jsonb), 5)"
                    ),
                    {
                        "id": uuid4(),
                        "key": key_sentinel,
                        "payload": '{"holder":true}',
                    },
                )
                holder_ready.set()
                await holder_release.wait()
            finally:
                await transaction.rollback()

    holder = asyncio.create_task(hold_conflicting_insert())
    try:
        await asyncio.wait_for(holder_ready.wait(), timeout=2)
        started = asyncio.get_running_loop().time()
        with pytest.raises(JobEnqueueContention) as failure:
            await asyncio.wait_for(
                _service(database_runtime, wait_timeout_ms=150).enqueue(
                    job_type="system.noop",
                    payload={"message": payload_sentinel},
                    idempotency_key=key_sentinel,
                ),
                timeout=2,
            )
        elapsed = asyncio.get_running_loop().time() - started
    finally:
        holder_release.set()
        await holder

    assert elapsed < 2
    assert str(failure.value) == ("Job enqueue timed out while waiting for database contention.")
    assert failure.value.__cause__ is None
    assert failure.value.__context__ is None
    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )
    assert payload_sentinel not in serialized
    assert key_sentinel not in serialized

    later = await _service(database_runtime).enqueue(
        job_type="system.noop",
        payload={"message": "later"},
        idempotency_key=key_sentinel,
    )
    assert not later.replayed
    assert _rows(
        integration_settings,
        "SELECT count(*) FROM public.job WHERE idempotency_key = :key",
        {"key": key_sentinel},
    ) == [(1,)]


@pytest.mark.asyncio
async def test_connection_failure_is_sanitized_without_payload_or_key_leak(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    password = "ENQUEUE-PASSWORD-SENTINEL"
    username = "enqueue-user-sentinel"
    host = "127.0.0.1"
    port = 1
    database = "enqueue-database-sentinel"
    payload_sentinel = "ENQUEUE-PAYLOAD-SENTINEL"
    key_sentinel = "enqueue:key-sentinel"
    url = URL.create(
        "postgresql+asyncpg",
        username=username,
        password=password,
        host=host,
        port=port,
        database=database,
    )
    runtime = create_database_runtime(SecretStr(url.render_as_string(hide_password=False)))
    service = _service(runtime)
    try:
        with pytest.raises(JobStorageUnavailable) as failure:
            await service.enqueue(
                job_type="system.noop",
                payload={"message": payload_sentinel},
                idempotency_key=key_sentinel,
            )
    finally:
        await runtime.engine.dispose()

    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )
    assert serialized.count("Job storage is temporarily unavailable.") == 2
    for hidden in (
        password,
        username,
        host,
        str(port),
        database,
        payload_sentinel,
        key_sentinel,
        url.render_as_string(hide_password=False),
    ):
        assert hidden not in serialized
    assert failure.value.__cause__ is None
    assert failure.value.__suppress_context__
