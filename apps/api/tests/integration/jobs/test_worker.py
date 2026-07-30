"""Guarded real-PostgreSQL and subprocess evidence for the C4 worker."""

from __future__ import annotations

import asyncio
import os
import shutil
import signal
import sys
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from typing import NoReturn, Protocol, cast
from uuid import UUID

import pytest
from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.application.execution import ExecuteOneJobOutcome, ExecuteOneJobService
from lumina.jobs.application.failure import FailJobService
from lumina.jobs.application.handlers import production_handler_registry
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.application.recovery import RecoverStaleJobsService
from lumina.jobs.domain.heartbeat import JobOwnerToken
from lumina.jobs.domain.models import ClaimedJob, ClaimJobOutcome
from lumina.jobs.domain.recovery import RecoverStaleJobsResult
from lumina.jobs.infrastructure.postgresql.claim import PostgreSqlClaimJobStore
from lumina.jobs.infrastructure.postgresql.completion import PostgreSqlJobCompletionStore
from lumina.jobs.infrastructure.postgresql.failure import PostgreSqlFailureJobStore
from lumina.jobs.infrastructure.postgresql.heartbeat import PostgreSqlHeartbeatJobStore
from lumina.jobs.infrastructure.postgresql.recovery import PostgreSqlRecoverStaleJobsStore
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import (
    DatabaseRuntime,
    create_database_runtime,
)
from lumina.worker.output import WORKER_STARTED, WORKER_STARTUP_FAILED
from lumina.worker.runtime import (
    ObservedCompletion,
    ObservedFailure,
    RuntimeExecutionObserver,
    ShutdownAwareClaim,
    ShutdownAwareRegistry,
    WorkerRuntime,
)
from lumina.worker.startup import check_startup_compatibility
from lumina.worker.timing import EventLoopExecutionTiming
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url

from ..database_safety import require_local_test_database

_OWNER = "worker.integration.12345678-1234-4234-9234-123456789abc"
_JOB_IDS = (
    UUID("10000000-0000-4000-8000-000000000001"),
    UUID("10000000-0000-4000-8000-000000000002"),
)
_SUBPROCESS_GRACE_SECONDS = 2


class _CheckoutPool(Protocol):
    def checkedout(self) -> int:
        """Return the current number of checked-out connections."""
        ...


def _checkedout(runtime: DatabaseRuntime) -> int:
    return cast(_CheckoutPool, runtime.engine.sync_engine.pool).checkedout()


@contextmanager
def _fixture_engine(settings: IntegrationTestSettings) -> Iterator[Engine]:
    raw_url = settings.test_database_sync_url.get_secret_value()
    require_local_test_database(raw_url)
    engine = create_engine(raw_url)
    try:
        yield engine
    finally:
        engine.dispose()


def _delete_fixtures(engine: Engine) -> None:
    with engine.begin() as connection:
        connection.execute(
            text("DELETE FROM public.job WHERE id = ANY(:ids)"),
            {"ids": list(_JOB_IDS)},
        )


def _insert_noop(engine: Engine, job_id: UUID) -> None:
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO public.job (id, job_type, payload, max_attempts) "
                "VALUES (:id, 'system.noop', CAST(:payload AS jsonb), 5)"
            ),
            {"id": job_id, "payload": "{}"},
        )


def _age_running_job_for_recovery_fixture(engine: Engine, job_id: UUID) -> None:
    """Test-only migration-role DML that changes lease time, never lifecycle state."""
    with engine.begin() as connection:
        result = connection.execute(
            text(
                "UPDATE public.job "
                "SET claimed_at = transaction_timestamp() - make_interval(secs => 121), "
                "heartbeat_at = transaction_timestamp() - make_interval(secs => 121) "
                "WHERE id = :id AND status = 'running'"
            ),
            {"id": job_id},
        )
    assert result.rowcount == 1


@pytest.fixture
def clean_worker_rows(
    integration_settings: IntegrationTestSettings,
) -> Iterator[Engine]:
    with _fixture_engine(integration_settings) as engine:
        _delete_fixtures(engine)
        yield engine
        _delete_fixtures(engine)


def _services(
    settings: IntegrationTestSettings,
) -> tuple[
    DatabaseRuntime,
    ClaimJobService,
    HeartbeatJobService,
    CompleteJobService,
    FailJobService,
    RecoverStaleJobsService,
]:
    runtime = create_database_runtime(SecretStr(settings.test_database_url.get_secret_value()))
    timeout = 5_000
    factory = runtime.session_factory
    claim = ClaimJobService(PostgreSqlClaimJobStore(factory, operation_wait_timeout_ms=timeout))
    heartbeat = HeartbeatJobService(
        PostgreSqlHeartbeatJobStore(factory, operation_wait_timeout_ms=timeout)
    )
    completion = CompleteJobService(
        PostgreSqlJobCompletionStore(factory, operation_wait_timeout_ms=timeout),
        result_max_bytes=61_440,
    )
    failure = FailJobService(PostgreSqlFailureJobStore(factory, operation_wait_timeout_ms=timeout))
    recovery = RecoverStaleJobsService(
        PostgreSqlRecoverStaleJobsStore(factory, operation_wait_timeout_ms=timeout),
        stale_seconds=120,
    )
    return runtime, claim, heartbeat, completion, failure, recovery


class ForbiddenFatal:
    async def terminate(self, event: bytes | None) -> NoReturn:
        raise AssertionError(event)


@pytest.mark.asyncio
async def test_startup_compatibility_succeeds_and_returns_pool_checkout(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime = create_database_runtime(
        SecretStr(integration_settings.test_database_url.get_secret_value())
    )
    try:
        await check_startup_compatibility(
            runtime.engine,
            operation_wait_timeout_ms=5_000,
        )
        assert _checkedout(runtime) == 0
    finally:
        await runtime.engine.dispose()


@pytest.mark.asyncio
async def test_initial_recovery_requeues_genuinely_stale_running_job_before_claim(
    integration_settings: IntegrationTestSettings,
    clean_worker_rows: Engine,
) -> None:
    job_id = _JOB_IDS[0]
    _insert_noop(clean_worker_rows, job_id)
    runtime_db, claim, heartbeat, completion, failure, recovery = _services(integration_settings)
    first_claim = await claim.claim(claimed_by=_OWNER)
    assert type(first_claim) is ClaimedJob
    assert first_claim.id == job_id
    assert first_claim.attempts == 1
    with clean_worker_rows.connect() as connection:
        claimed_row = connection.execute(
            text("SELECT status, claimed_by, attempts FROM public.job WHERE id = :id"),
            {"id": job_id},
        ).one()
    assert tuple(claimed_row) == ("running", _OWNER, 1)

    _age_running_job_for_recovery_fixture(clean_worker_rows, job_id)
    shutdown = asyncio.Event()
    observer = RuntimeExecutionObserver()
    observed_failure = ObservedFailure(failure, observer)
    ordering: list[str] = []

    class ObservedInitialRecovery:
        async def recover(self) -> RecoverStaleJobsResult:
            ordering.append("recovery.begin")
            result = await recovery.recover()
            async with runtime_db.engine.connect() as connection:
                row = (
                    await connection.execute(
                        text(
                            "SELECT status, attempts, claimed_by, claimed_at, heartbeat_at "
                            "FROM public.job WHERE id = :id"
                        ),
                        {"id": job_id},
                    )
                ).one()
            assert tuple(row) == ("queued", 1, None, None, None)
            ordering.append("recovery.confirmed_queued")
            return result

    class OrderedRuntimeClaim:
        async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
            assert ordering == ["recovery.begin", "recovery.confirmed_queued"]
            ordering.append("runtime.claim")
            outcome = await claim.claim(claimed_by=claimed_by)
            assert type(outcome) is ClaimedJob
            assert outcome.id == job_id
            assert outcome.attempts == 2
            async with runtime_db.engine.connect() as connection:
                row = (
                    await connection.execute(
                        text("SELECT status, claimed_by, attempts FROM public.job WHERE id = :id"),
                        {"id": job_id},
                    )
                ).one()
            assert tuple(row) == ("running", _OWNER, 2)
            ordering.append("runtime.claim_confirmed")
            return outcome

    executor = ExecuteOneJobService(
        owner=JobOwnerToken(_OWNER),
        registry=ShutdownAwareRegistry(
            production_handler_registry(),
            shutdown_event=shutdown,
            observer=observer,
        ),
        claim=ShutdownAwareClaim(
            OrderedRuntimeClaim(),
            heartbeat=heartbeat,
            failure=observed_failure,
            shutdown_event=shutdown,
            observer=observer,
        ),
        heartbeat=heartbeat,
        completion=ObservedCompletion(completion, observer),
        failure=observed_failure,
        heartbeat_seconds=30,
        handler_timeout_seconds=30,
        cancellation_grace_seconds=1,
        timing=EventLoopExecutionTiming(),
    )

    class StopAfterRecoveredJob:
        async def execute(self) -> ExecuteOneJobOutcome:
            result = await executor.execute()
            ordering.append("runtime.execute_confirmed")
            shutdown.set()
            return result

    worker = WorkerRuntime(
        recovery=ObservedInitialRecovery(),
        executor=StopAfterRecoveredJob(),
        shutdown_event=shutdown,
        observer=observer,
        fatal_termination=ForbiddenFatal(),
        poll_seconds=1,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )
    try:
        assert await worker.run() == 0
        assert _checkedout(runtime_db) == 0
    finally:
        await runtime_db.engine.dispose()

    with clean_worker_rows.connect() as connection:
        row = connection.execute(
            text(
                "SELECT status, result, attempts, claimed_by, claimed_at, "
                "heartbeat_at, completed_at, error_code, error_message "
                "FROM public.job WHERE id = :id"
            ),
            {"id": job_id},
        ).one()
    assert row.status == "succeeded"
    assert row.result == {}
    assert row.attempts == 2
    assert row.claimed_by == _OWNER
    assert row.claimed_at <= row.heartbeat_at <= row.completed_at
    assert row.error_code is None
    assert row.error_message is None
    assert ordering == [
        "recovery.begin",
        "recovery.confirmed_queued",
        "runtime.claim",
        "runtime.claim_confirmed",
        "runtime.execute_confirmed",
    ]


@pytest.mark.asyncio
async def test_multiple_noops_complete_sequentially(
    integration_settings: IntegrationTestSettings,
    clean_worker_rows: Engine,
) -> None:
    for job_id in _JOB_IDS:
        _insert_noop(clean_worker_rows, job_id)
    runtime_db, claim, heartbeat, completion, failure, recovery = _services(integration_settings)
    shutdown = asyncio.Event()
    observer = RuntimeExecutionObserver()
    observed_failure = ObservedFailure(failure, observer)
    executor = ExecuteOneJobService(
        owner=JobOwnerToken(_OWNER),
        registry=ShutdownAwareRegistry(
            production_handler_registry(),
            shutdown_event=shutdown,
            observer=observer,
        ),
        claim=ShutdownAwareClaim(
            claim,
            heartbeat=heartbeat,
            failure=observed_failure,
            shutdown_event=shutdown,
            observer=observer,
        ),
        heartbeat=heartbeat,
        completion=ObservedCompletion(completion, observer),
        failure=observed_failure,
        heartbeat_seconds=30,
        handler_timeout_seconds=30,
        cancellation_grace_seconds=1,
        timing=EventLoopExecutionTiming(),
    )
    executions = 0

    class StopAfterTwo:
        async def execute(self) -> ExecuteOneJobOutcome:
            nonlocal executions
            result = await executor.execute()
            executions += 1
            if executions == 2:
                shutdown.set()
            return result

    worker = WorkerRuntime(
        recovery=recovery,
        executor=StopAfterTwo(),
        shutdown_event=shutdown,
        observer=observer,
        fatal_termination=ForbiddenFatal(),
        poll_seconds=1,
        stale_seconds=120,
        cancellation_grace_seconds=1,
    )
    try:
        assert await worker.run() == 0
        assert executions == 2
        assert _checkedout(runtime_db) == 0
    finally:
        await runtime_db.engine.dispose()

    with clean_worker_rows.connect() as connection:
        rows = connection.execute(
            text(
                "SELECT id, status, result, claimed_by, claimed_at, completed_at "
                "FROM public.job WHERE id = ANY(:ids) ORDER BY id"
            ),
            {"ids": list(_JOB_IDS)},
        ).all()
    assert len(rows) == 2
    assert all(row.status == "succeeded" and row.result == {} for row in rows)
    assert {row.claimed_by for row in rows} == {_OWNER}
    assert rows[0].completed_at <= rows[1].claimed_at


@pytest.mark.asyncio
async def test_real_claim_returned_after_shutdown_gets_cancellation_transition(
    integration_settings: IntegrationTestSettings,
    clean_worker_rows: Engine,
) -> None:
    _insert_noop(clean_worker_rows, _JOB_IDS[0])
    runtime_db, claim, heartbeat, _, failure, _ = _services(integration_settings)
    shutdown = asyncio.Event()

    class ClaimThenShutdown:
        async def claim(self, *, claimed_by: str) -> ClaimJobOutcome:
            outcome = await claim.claim(claimed_by=claimed_by)
            shutdown.set()
            return outcome

    adapter = ShutdownAwareClaim(
        ClaimThenShutdown(),
        heartbeat=heartbeat,
        failure=failure,
        shutdown_event=shutdown,
        observer=RuntimeExecutionObserver(),
    )
    try:
        await adapter.claim(claimed_by=_OWNER)
        assert _checkedout(runtime_db) == 0
    finally:
        await runtime_db.engine.dispose()

    with clean_worker_rows.connect() as connection:
        row = connection.execute(
            text("SELECT status, attempts, claimed_by, error_code FROM public.job WHERE id = :id"),
            {"id": _JOB_IDS[0]},
        ).one()
    assert tuple(row) == ("queued", 1, None, None)


def _child_environment(settings: IntegrationTestSettings) -> dict[str, str]:
    parsed = make_url(settings.test_database_url.get_secret_value())
    assert parsed.host in {"127.0.0.1", "localhost", "::1"}
    assert parsed.database == "lumina_test"
    assert parsed.username == "lumina_test_app"
    environment = os.environ.copy()
    environment["LUMINA_ENV"] = "test"
    environment["LUMINA_DATABASE_URL"] = settings.test_database_url.get_secret_value()
    return environment


@dataclass(frozen=True, slots=True)
class _SubprocessCleanupResult:
    termination_requested: bool
    killed: bool
    communication_timed_out: bool


async def _observe_subprocess_task(
    task: asyncio.Task[object],
    *,
    timeout: float,
) -> bool:
    done, _ = await asyncio.wait((task,), timeout=timeout)
    return task in done or task.done()


def _consume_subprocess_task(task: asyncio.Task[object]) -> None:
    if not task.done():
        return
    with suppress(BaseException):
        task.exception()


def _close_subprocess_pipe_transports(process: asyncio.subprocess.Process) -> None:
    transport = getattr(process, "_transport", None)
    if transport is None:
        return
    get_pipe_transport = getattr(transport, "get_pipe_transport", None)
    if not callable(get_pipe_transport):
        return
    for descriptor in (0, 1, 2):
        with suppress(BaseException):
            pipe_transport = get_pipe_transport(descriptor)
            if pipe_transport is not None:
                pipe_transport.close()


async def _reap_worker_subprocess(
    process: asyncio.subprocess.Process,
) -> _SubprocessCleanupResult:
    """Bound communication, graceful termination, forced kill, and final reaping."""
    communication = asyncio.create_task(
        process.communicate(),
        name="lumina.test.worker-subprocess-communicate",
    )
    termination_requested = False
    killed = False
    communication_timed_out = False

    if process.returncode is None:
        with suppress(ProcessLookupError):
            process.terminate()
            termination_requested = True

    if not await _observe_subprocess_task(
        cast(asyncio.Task[object], communication),
        timeout=_SUBPROCESS_GRACE_SECONDS,
    ):
        communication_timed_out = True
        if process.returncode is None:
            with suppress(ProcessLookupError):
                process.kill()
                killed = True
        if not await _observe_subprocess_task(
            cast(asyncio.Task[object], communication),
            timeout=_SUBPROCESS_GRACE_SECONDS,
        ):
            wait_task = asyncio.create_task(
                process.wait(),
                name="lumina.test.worker-subprocess-wait",
            )
            if not await _observe_subprocess_task(
                cast(asyncio.Task[object], wait_task),
                timeout=_SUBPROCESS_GRACE_SECONDS,
            ):
                wait_task.cancel()
                _consume_subprocess_task(cast(asyncio.Task[object], wait_task))
                _close_subprocess_pipe_transports(process)
                raise AssertionError("Worker subprocess did not settle after kill.")
            _consume_subprocess_task(cast(asyncio.Task[object], wait_task))
            _close_subprocess_pipe_transports(process)
            communication.cancel()
            if not await _observe_subprocess_task(
                cast(asyncio.Task[object], communication),
                timeout=_SUBPROCESS_GRACE_SECONDS,
            ):
                _close_subprocess_pipe_transports(process)
                raise AssertionError("Worker subprocess pipes did not settle.")

    _consume_subprocess_task(cast(asyncio.Task[object], communication))
    if process.returncode is None:
        wait_task = asyncio.create_task(
            process.wait(),
            name="lumina.test.worker-subprocess-final-wait",
        )
        if not await _observe_subprocess_task(
            cast(asyncio.Task[object], wait_task),
            timeout=_SUBPROCESS_GRACE_SECONDS,
        ):
            wait_task.cancel()
            _consume_subprocess_task(cast(asyncio.Task[object], wait_task))
            raise AssertionError("Worker subprocess was not reaped.")
        _consume_subprocess_task(cast(asyncio.Task[object], wait_task))
    assert process.returncode is not None
    return _SubprocessCleanupResult(
        termination_requested=termination_requested,
        killed=killed,
        communication_timed_out=communication_timed_out,
    )


@pytest.mark.asyncio
async def test_installed_worker_subprocess_starts_then_sigterm_is_exact(
    integration_settings: IntegrationTestSettings,
    clean_worker_rows: Engine,
) -> None:
    del clean_worker_rows
    executable = shutil.which("lumina-worker")
    assert executable is not None
    process = await asyncio.create_subprocess_exec(
        executable,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_child_environment(integration_settings),
    )
    try:
        assert process.stdout is not None
        line = await asyncio.wait_for(process.stdout.readline(), timeout=10)
        assert line == WORKER_STARTED
        process.send_signal(signal.SIGTERM)
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10)
        assert process.returncode == 0
        assert stdout == b""
        assert stderr == b""
    finally:
        await _reap_worker_subprocess(process)


@pytest.mark.asyncio
async def test_subprocess_invalid_poll_has_only_fixed_startup_failure(
    integration_settings: IntegrationTestSettings,
) -> None:
    executable = shutil.which("lumina-worker")
    assert executable is not None
    environment = _child_environment(integration_settings)
    environment["LUMINA_WORKER_POLL_SECONDS"] = "secret-invalid"
    process = await asyncio.create_subprocess_exec(
        executable,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=environment,
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10)

        assert process.returncode == 1
        assert stdout == b""
        assert stderr == WORKER_STARTUP_FAILED
    finally:
        await _reap_worker_subprocess(process)


@pytest.mark.asyncio
async def test_subprocess_secret_argument_is_silent(
    integration_settings: IntegrationTestSettings,
) -> None:
    executable = shutil.which("lumina-worker")
    assert executable is not None
    process = await asyncio.create_subprocess_exec(
        executable,
        "--database-password=argv-secret",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=_child_environment(integration_settings),
    )
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10)

        assert process.returncode == 2
        assert stdout == b""
        assert stderr == b""
    finally:
        await _reap_worker_subprocess(process)


@pytest.mark.asyncio
async def test_subprocess_startup_output_failure_is_fixed_and_reaped(
    integration_settings: IntegrationTestSettings,
) -> None:
    executable = shutil.which("lumina-worker")
    assert executable is not None
    read_fd, write_fd = os.pipe()
    os.close(read_fd)
    process: asyncio.subprocess.Process | None = None
    try:
        process = await asyncio.create_subprocess_exec(
            executable,
            stdout=write_fd,
            stderr=asyncio.subprocess.PIPE,
            env=_child_environment(integration_settings),
        )
        try:
            os.close(write_fd)
            _, stderr = await asyncio.wait_for(process.communicate(), timeout=10)

            assert process.returncode == 1
            assert stderr == WORKER_STARTUP_FAILED
        finally:
            await _reap_worker_subprocess(process)
    finally:
        if process is None:
            os.close(write_fd)


@pytest.mark.asyncio
async def test_subprocess_cleanup_reaps_an_already_exited_child() -> None:
    result: _SubprocessCleanupResult | None = None
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "pass",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        await asyncio.wait_for(process.wait(), timeout=5)
    finally:
        result = await _reap_worker_subprocess(process)

    assert result is not None
    assert process.returncode == 0
    assert result.termination_requested is False
    assert result.killed is False


@pytest.mark.asyncio
async def test_subprocess_cleanup_terminates_a_cooperative_child() -> None:
    result: _SubprocessCleanupResult | None = None
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        ("import os, signal; os.write(1, b'ready\\n'); signal.pause()"),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        assert await asyncio.wait_for(process.stdout.readline(), timeout=5) == b"ready\n"
    finally:
        result = await _reap_worker_subprocess(process)

    assert result is not None
    assert process.returncode is not None
    assert result.termination_requested is True
    assert result.killed is False


@pytest.mark.asyncio
async def test_subprocess_cleanup_runs_when_readiness_assertion_fails() -> None:
    cleanup_result: _SubprocessCleanupResult | None = None
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        ("import os, signal; os.write(1, b'not-ready\\n'); signal.pause()"),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        with pytest.raises(AssertionError):
            assert await asyncio.wait_for(process.stdout.readline(), timeout=5) == b"ready\n"
    finally:
        cleanup_result = await _reap_worker_subprocess(process)

    assert cleanup_result is not None
    assert cleanup_result.termination_requested is True
    assert process.returncode is not None


@pytest.mark.asyncio
async def test_subprocess_cleanup_runs_when_readiness_times_out() -> None:
    cleanup_result: _SubprocessCleanupResult | None = None
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import signal; signal.pause()",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(process.stdout.readline(), timeout=0.05)
    finally:
        cleanup_result = await _reap_worker_subprocess(process)

    assert cleanup_result is not None
    assert cleanup_result.termination_requested is True
    assert process.returncode is not None


@pytest.mark.asyncio
async def test_subprocess_cleanup_runs_after_immediate_assertion() -> None:
    cleanup_result: _SubprocessCleanupResult | None = None
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import signal; signal.pause()",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        with pytest.raises(AssertionError):
            raise AssertionError("fixture assertion")
    finally:
        cleanup_result = await _reap_worker_subprocess(process)

    assert cleanup_result is not None
    assert process.returncode is not None


@pytest.mark.asyncio
async def test_subprocess_cleanup_kills_sigterm_ignoring_child_after_timeout() -> None:
    cleanup_result: _SubprocessCleanupResult | None = None
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        (
            "import os, signal; "
            "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
            "os.write(1, b'ready\\n'); "
            "signal.pause()"
        ),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        assert await asyncio.wait_for(process.stdout.readline(), timeout=5) == b"ready\n"
    finally:
        cleanup_result = await _reap_worker_subprocess(process)

    assert cleanup_result is not None
    assert cleanup_result.termination_requested is True
    assert cleanup_result.communication_timed_out is True
    assert cleanup_result.killed is True
    assert process.returncode is not None
