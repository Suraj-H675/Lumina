"""Guarded PostgreSQL evidence for Phase 0B3C3 one-job execution."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator
from datetime import datetime, timedelta
from typing import cast
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.application.enqueue import EnqueueJobService
from lumina.jobs.application.execution import ExecuteOneJobService, JobProcessed
from lumina.jobs.application.failure import FailJobService
from lumina.jobs.application.handlers import (
    StaticHandlerRegistry,
    production_handler_registry,
)
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.domain.handler import (
    NonRetryableHandlerFailure,
    RetryableHandlerFailure,
)
from lumina.jobs.domain.heartbeat import JobOwnershipLost, JobOwnerToken
from lumina.jobs.domain.payload import PersistedJobPayload
from lumina.jobs.infrastructure.postgresql.claim import PostgreSqlClaimJobStore
from lumina.jobs.infrastructure.postgresql.completion import PostgreSqlJobCompletionStore
from lumina.jobs.infrastructure.postgresql.enqueue import PostgreSqlEnqueueJobStore
from lumina.jobs.infrastructure.postgresql.failure import PostgreSqlFailureJobStore
from lumina.jobs.infrastructure.postgresql.heartbeat import PostgreSqlHeartbeatJobStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from lumina.worker.timing import EventLoopExecutionTiming, ExecutionTask
from sqlalchemy import Connection, text
from sqlalchemy.engine import make_url

from ..migration_lifecycle import run_migration_operation

_OWNER = "worker.integration.12345678-1234-4234-9234-123456789abc"
_FOREIGN_OWNER = "worker.integration.foreign"


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


@pytest.fixture(autouse=True)
def clean_execution_rows(
    integration_settings: IntegrationTestSettings,
) -> Iterator[None]:
    _guarded_execute(integration_settings, "DELETE FROM public.job")
    try:
        yield
    finally:
        _guarded_execute(integration_settings, "DELETE FROM public.job")


@pytest_asyncio.fixture
async def execution_runtime(
    integration_settings: IntegrationTestSettings,
) -> AsyncIterator[DatabaseRuntime]:
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        yield runtime
    finally:
        await runtime.engine.dispose()


def _seed(
    settings: IntegrationTestSettings,
    *,
    job_type: str,
    payload_json: str,
    max_attempts: int = 5,
) -> UUID:
    identifier = uuid4()
    _guarded_execute(
        settings,
        "INSERT INTO public.job (id, job_type, payload, max_attempts) "
        "VALUES (:id, :job_type, CAST(:payload AS jsonb), :max_attempts)",
        {
            "id": identifier,
            "job_type": job_type,
            "payload": payload_json,
            "max_attempts": max_attempts,
        },
    )
    return identifier


def _row(
    settings: IntegrationTestSettings,
    identifier: UUID,
) -> tuple[object, ...]:
    return _guarded_execute(
        settings,
        "SELECT status, payload, result, attempts, max_attempts, claimed_by, claimed_at, "
        "heartbeat_at, completed_at, error_code, error_message, available_at "
        "FROM public.job WHERE id = :id",
        {"id": identifier},
    )[0]


def _capabilities(
    runtime: DatabaseRuntime,
) -> tuple[ClaimJobService, HeartbeatJobService, CompleteJobService, FailJobService]:
    timeout = 5_000
    return (
        ClaimJobService(
            PostgreSqlClaimJobStore(
                runtime.session_factory,
                operation_wait_timeout_ms=timeout,
            )
        ),
        HeartbeatJobService(
            PostgreSqlHeartbeatJobStore(
                runtime.session_factory,
                operation_wait_timeout_ms=timeout,
            )
        ),
        CompleteJobService(
            PostgreSqlJobCompletionStore(
                runtime.session_factory,
                operation_wait_timeout_ms=timeout,
            ),
            result_max_bytes=61_440,
        ),
        FailJobService(
            PostgreSqlFailureJobStore(
                runtime.session_factory,
                operation_wait_timeout_ms=timeout,
            )
        ),
    )


def _executor(
    runtime: DatabaseRuntime,
    *,
    registry: StaticHandlerRegistry,
    heartbeat: object | None = None,
    timing: object | None = None,
) -> ExecuteOneJobService:
    claim, accepted_heartbeat, completion, failure = _capabilities(runtime)
    return ExecuteOneJobService(
        owner=JobOwnerToken(_OWNER),
        registry=registry,
        claim=claim,
        heartbeat=heartbeat or accepted_heartbeat,  # type: ignore[arg-type]
        completion=completion,
        failure=failure,
        heartbeat_seconds=1,
        handler_timeout_seconds=10,
        cancellation_grace_seconds=1,
        timing=timing or EventLoopExecutionTiming(),  # type: ignore[arg-type]
    )


class FixtureHandler:
    def __init__(self, *, result: object = None, error: BaseException | None = None) -> None:
        self.result = {} if result is None else result
        self.error = error

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        if self.error is not None:
            raise self.error
        return self.result


class BlockingFixtureHandler:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.cancelled = asyncio.Event()

    def validate_payload(self, payload: PersistedJobPayload) -> None:
        del payload

    async def handle(self, payload: PersistedJobPayload) -> object:
        del payload
        self.started.set()
        try:
            await self.release.wait()
            return {}
        except asyncio.CancelledError:
            self.cancelled.set()
            raise


class ControlledTiming:
    def __init__(self) -> None:
        self.now = 100.0
        self.wait_started = asyncio.Event()
        self.wait_release = asyncio.Event()
        self.sleep_started = asyncio.Event()
        self._sleep_release = asyncio.Event()

    def monotonic(self) -> float:
        return self.now

    async def sleep_until(self, deadline: float) -> None:
        self.sleep_started.set()
        await self._sleep_release.wait()
        self._sleep_release.clear()
        self.now = max(self.now, deadline)

    async def wait_first(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        del deadline
        self.wait_started.set()
        await self.wait_release.wait()
        return frozenset(task for task in tasks if task.done())

    async def settle(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        del deadline
        await asyncio.wait(tasks)
        return frozenset(tasks)

    def release_heartbeat(self) -> None:
        self._sleep_release.set()


class RecordingHeartbeat:
    def __init__(self, service: HeartbeatJobService) -> None:
        self.service = service
        self.calls: list[tuple[UUID, str, int]] = []
        self.finished = asyncio.Event()
        self.max_active = 0
        self._active = 0

    async def heartbeat(
        self,
        *,
        job_id: UUID,
        owner: str,
        expected_attempt: int,
    ) -> object:
        self.calls.append((job_id, owner, expected_attempt))
        self._active += 1
        self.max_active = max(self.max_active, self._active)
        try:
            return await self.service.heartbeat(
                job_id=job_id,
                owner=owner,
                expected_attempt=expected_attempt,
            )
        finally:
            self._active -= 1
            self.finished.set()


@pytest.mark.asyncio
async def test_successful_noop_claims_and_completes_without_payload_echo(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    enqueue = EnqueueJobService(
        PostgreSqlEnqueueJobStore(
            execution_runtime.session_factory,
            wait_timeout_ms=5_000,
        ),
        payload_max_bytes=61_440,
        default_max_attempts=5,
    )
    enqueued = await enqueue.enqueue(
        job_type="system.noop",
        payload={"private": "NOOP-PAYLOAD-SECRET"},
        max_attempts=3,
    )

    outcome = await _executor(
        execution_runtime,
        registry=production_handler_registry(),
    ).execute()
    row = _row(integration_settings, enqueued.id)

    assert outcome == JobProcessed()
    assert row[0] == "succeeded"
    assert row[1] == {"private": "NOOP-PAYLOAD-SECRET"}
    assert row[2] == {}
    assert row[3:5] == (1, 3)
    assert row[5] == _OWNER
    assert row[6] == row[7]
    assert row[8] is not None
    assert row[9:11] == (None, None)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("job_type", "payload", "error_code"),
    [
        ("fixture.unsupported.secret_value", "{}", "job.unsupported_type"),
        ("system.noop", '["INCOMPATIBLE-PAYLOAD-SECRET"]', "job.incompatible_payload"),
    ],
)
async def test_unsupported_and_incompatible_claims_use_canonical_terminal_failures(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    job_type: str,
    payload: str,
    error_code: str,
) -> None:
    identifier = _seed(
        integration_settings,
        job_type=job_type,
        payload_json=payload,
        max_attempts=1,
    )

    await _executor(
        execution_runtime,
        registry=production_handler_registry(),
    ).execute()
    row = _row(integration_settings, identifier)

    assert row[0] == "failed"
    assert row[2] is None
    assert row[3] == 1
    assert row[9] == error_code
    assert "SECRET" not in cast(str, row[10])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("error", "code"),
    [
        (NonRetryableHandlerFailure(), "job.handler_non_retryable"),
        (RuntimeError("UNEXPECTED-HANDLER-SECRET"), "job.handler_unexpected"),
    ],
)
async def test_fixture_handler_terminal_failures_persist_only_fixed_catalog(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
    error: BaseException,
    code: str,
) -> None:
    identifier = _seed(
        integration_settings,
        job_type="fixture.handler",
        payload_json='{"fixture":true}',
        max_attempts=5,
    )
    registry = StaticHandlerRegistry({"fixture.handler": FixtureHandler(error=error)})

    await _executor(execution_runtime, registry=registry).execute()
    row = _row(integration_settings, identifier)

    assert row[0] == "failed"
    assert row[9] == code
    assert "SECRET" not in cast(str, row[10])


@pytest.mark.asyncio
async def test_retryable_handler_requeues_with_accepted_deterministic_backoff(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed(
        integration_settings,
        job_type="fixture.handler",
        payload_json="{}",
        max_attempts=2,
    )
    before = cast(
        datetime,
        _guarded_execute(
            integration_settings,
            "SELECT transaction_timestamp()",
        )[0][0],
    )
    registry = StaticHandlerRegistry(
        {"fixture.handler": FixtureHandler(error=RetryableHandlerFailure())}
    )

    await _executor(execution_runtime, registry=registry).execute()
    after = cast(
        datetime,
        _guarded_execute(
            integration_settings,
            "SELECT transaction_timestamp()",
        )[0][0],
    )
    row = _row(integration_settings, identifier)

    assert row[0] == "queued"
    assert row[3] == 1
    assert row[5:11] == (None, None, None, None, None, None)
    available_at = cast(datetime, row[11])
    assert before + timedelta(seconds=2) <= available_at <= after + timedelta(seconds=2)


@pytest.mark.asyncio
async def test_invalid_result_persists_only_fixed_invalid_result_failure(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed(
        integration_settings,
        job_type="fixture.handler",
        payload_json="{}",
        max_attempts=5,
    )
    invalid = {"secret": object()}
    registry = StaticHandlerRegistry({"fixture.handler": FixtureHandler(result=invalid)})

    await _executor(execution_runtime, registry=registry).execute()
    row = _row(integration_settings, identifier)

    assert row[0] == "failed"
    assert row[9] == "job.handler_invalid_result"
    assert "object at" not in cast(str, row[10])


@pytest.mark.asyncio
async def test_blocked_handler_heartbeats_then_times_out_with_exact_attempt(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed(
        integration_settings,
        job_type="fixture.handler",
        payload_json="{}",
        max_attempts=1,
    )
    handler = BlockingFixtureHandler()
    timing = ControlledTiming()
    _, accepted_heartbeat, _, _ = _capabilities(execution_runtime)
    heartbeat = RecordingHeartbeat(accepted_heartbeat)
    executor = _executor(
        execution_runtime,
        registry=StaticHandlerRegistry({"fixture.handler": handler}),
        heartbeat=heartbeat,
        timing=timing,
    )
    task = asyncio.create_task(executor.execute())
    await handler.started.wait()
    claimed_row = _row(integration_settings, identifier)
    await timing.sleep_started.wait()
    timing.release_heartbeat()
    await heartbeat.finished.wait()
    timing.wait_release.set()

    assert await task == JobProcessed()
    row = _row(integration_settings, identifier)
    assert heartbeat.calls == [(identifier, _OWNER, 1)]
    assert heartbeat.max_active == 1
    assert cast(datetime, row[7]) >= cast(datetime, claimed_row[7])
    assert handler.cancelled.is_set()
    assert row[0] == "dead_letter"
    assert row[9] == "job.handler_timeout"


@pytest.mark.asyncio
async def test_real_heartbeat_ownership_loss_cancels_without_terminal_mutation(
    execution_runtime: DatabaseRuntime,
    integration_settings: IntegrationTestSettings,
) -> None:
    identifier = _seed(
        integration_settings,
        job_type="fixture.handler",
        payload_json="{}",
    )
    handler = BlockingFixtureHandler()
    timing = ControlledTiming()
    _, accepted_heartbeat, _, _ = _capabilities(execution_runtime)
    heartbeat = RecordingHeartbeat(accepted_heartbeat)
    executor = _executor(
        execution_runtime,
        registry=StaticHandlerRegistry({"fixture.handler": handler}),
        heartbeat=heartbeat,
        timing=timing,
    )
    task = asyncio.create_task(executor.execute())
    await handler.started.wait()
    _guarded_execute(
        integration_settings,
        "UPDATE public.job SET claimed_by = :owner WHERE id = :id",
        {"owner": _FOREIGN_OWNER, "id": identifier},
    )
    timing.release_heartbeat()
    await heartbeat.finished.wait()
    timing.wait_release.set()

    with pytest.raises(JobOwnershipLost):
        await task
    row = _row(integration_settings, identifier)
    assert heartbeat.calls == [(identifier, _OWNER, 1)]
    assert handler.cancelled.is_set()
    assert row[0] == "running"
    assert row[5] == _FOREIGN_OWNER
    assert row[8:11] == (None, None, None)
