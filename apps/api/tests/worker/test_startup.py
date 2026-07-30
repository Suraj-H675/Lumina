"""Startup compatibility contract tests independent of PostgreSQL."""

from __future__ import annotations

import asyncio
from types import CoroutineType, FrameType, SimpleNamespace, TracebackType
from typing import Protocol, cast

import pytest
from lumina.settings import AppSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime
from lumina.worker import composition, startup
from lumina.worker.composition import run_worker_process
from lumina.worker.output import WORKER_STARTUP_FAILED, ProcessOutput
from lumina.worker.startup import (
    StartupCheckSettlementUnknown,
    StartupCompatibilityError,
    check_startup_compatibility,
)
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine


class _TaskDiagnostics(Protocol):
    _log_traceback: bool


_MAX_RETAINED_GRAPH_OBJECTS = 10_000


def _inspect_retained_failure_graph(
    root: BaseException,
) -> tuple[frozenset[int], frozenset[str], frozenset[int]]:
    """Traverse only traceback-local async state and bounded built-in containers."""
    pending: list[object] = [root]
    identities: set[int] = set()
    strings: set[str] = set()
    task_exception_identities: set[int] = set()

    while pending:
        value = pending.pop()
        identity = id(value)
        if identity in identities:
            continue
        if len(identities) >= _MAX_RETAINED_GRAPH_OBJECTS:
            raise AssertionError("Retained failure graph exceeded its fixed test bound.")
        identities.add(identity)

        if isinstance(value, str):
            strings.add(value)
        elif isinstance(value, BaseException):
            pending.extend(value.args)
            if value.__cause__ is not None:
                pending.append(value.__cause__)
            if value.__context__ is not None:
                pending.append(value.__context__)
            if value.__traceback__ is not None:
                pending.append(value.__traceback__)
        elif isinstance(value, TracebackType):
            pending.append(value.tb_frame)
            if value.tb_next is not None:
                pending.append(value.tb_next)
        elif isinstance(value, FrameType):
            pending.append(value.f_locals)
        elif isinstance(value, asyncio.Future):
            if isinstance(value, asyncio.Task):
                pending.append(value.get_coro())
            if value.done() and not value.cancelled():
                stored_exception = value.exception()
                if stored_exception is not None:
                    task_exception_identities.add(id(stored_exception))
                    pending.append(stored_exception)
                else:
                    pending.append(value.result())
        elif isinstance(value, CoroutineType):
            if value.cr_frame is not None:
                pending.append(value.cr_frame)
            if value.cr_await is not None:
                pending.append(value.cr_await)
        elif isinstance(value, dict):
            pending.extend(value.keys())
            pending.extend(value.values())
        elif isinstance(value, (list, tuple, set, frozenset)):
            pending.extend(value)

    return (
        frozenset(identities),
        frozenset(strings),
        frozenset(task_exception_identities),
    )


async def _capture_startup_failure(engine: _Engine) -> StartupCompatibilityError:
    try:
        await check_startup_compatibility(
            cast(AsyncEngine, engine),
            operation_wait_timeout_ms=1_000,
        )
    except StartupCompatibilityError as error:
        return error
    raise AssertionError("Expected a fixed startup compatibility failure.")


@pytest.mark.asyncio
async def test_invalid_timeout_fails_before_engine_access() -> None:
    class ForbiddenEngine:
        def __getattribute__(self, name: str) -> object:
            raise AssertionError(name)

    with pytest.raises(StartupCompatibilityError):
        await check_startup_compatibility(
            cast(AsyncEngine, ForbiddenEngine()),
            operation_wait_timeout_ms=99,
        )


def test_startup_contract_is_exactly_the_accepted_job_catalog() -> None:
    assert tuple(column[0] for column in startup._EXPECTED_COLUMNS) == (
        "id",
        "job_type",
        "status",
        "idempotency_key",
        "priority",
        "payload",
        "result",
        "progress",
        "attempts",
        "max_attempts",
        "available_at",
        "claimed_by",
        "claimed_at",
        "heartbeat_at",
        "completed_at",
        "error_code",
        "error_message",
        "created_at",
    )
    assert {row[0] for row in startup._EXPECTED_INDEXES} == {
        "pk_job",
        "uq_job_idempotency_key",
        "ix_job_queue_poll",
    }
    assert "alembic_version" not in startup._BASELINE_SQL


def test_startup_failures_have_fixed_redacted_diagnostics() -> None:
    sentinel = "database-url-secret"
    failure = StartupCompatibilityError()

    assert sentinel not in str(failure)
    assert repr(failure) == "StartupCompatibilityError(<redacted>)"


class _SyncEngine:
    def __init__(self, pool: object) -> None:
        self.pool = pool


class _Engine:
    def __init__(self, *, replace_pool: bool = False) -> None:
        self.original_pool = object()
        self.sync_engine = _SyncEngine(self.original_pool)
        self.replace_pool = replace_pool
        self.dispose_calls: list[bool] = []

    async def dispose(self, *, close: bool = True) -> None:
        self.dispose_calls.append(close)
        if self.replace_pool:
            self.sync_engine.pool = object()


class _Output:
    def __init__(self) -> None:
        self.stdout: list[bytes] = []
        self.stderr: list[bytes] = []
        self.restore_calls = 0

    async def write_stdout(self, data: bytes, *, deadline: float) -> None:
        del deadline
        self.stdout.append(data)

    async def write_stderr(self, data: bytes, *, deadline: float) -> None:
        del deadline
        self.stderr.append(data)

    def restore(self) -> None:
        self.restore_calls += 1


def _composition_settings() -> AppSettings:
    return cast(
        AppSettings,
        SimpleNamespace(
            database_url=object(),
            job_operation_wait_timeout_ms=1_000,
            job_result_max_bytes=61_440,
            job_stale_seconds=120,
            worker_id_prefix="worker.fixture",
            job_heartbeat_seconds=30,
            job_handler_timeout_seconds=30,
            job_cancellation_grace_seconds=1,
            worker_poll_seconds=2,
        ),
    )


class _Connection:
    def __init__(
        self,
        *,
        in_transaction: bool,
        rollback_fails: bool = False,
        invalidation_succeeds: bool = False,
        close_fails: bool = False,
        close_secret: str = "close-secret",
        close_release: asyncio.Event | None = None,
        cancellation_seen: asyncio.Event | None = None,
    ) -> None:
        self._in_transaction = in_transaction
        self.rollback_fails = rollback_fails
        self.invalidation_succeeds = invalidation_succeeds
        self.close_fails = close_fails
        self.close_secret = close_secret
        self.close_release = close_release
        self.cancellation_seen = cancellation_seen
        self.invalidated = False
        self.close_calls = 0
        self.close_task: asyncio.Task[None] | None = None

    def in_transaction(self) -> bool:
        return self._in_transaction

    async def rollback(self) -> None:
        if self.rollback_fails:
            raise RuntimeError("rollback-secret")
        self._in_transaction = False

    async def invalidate(self) -> None:
        if not self.invalidation_succeeds:
            raise RuntimeError("invalidate-secret")
        self.invalidated = True

    async def close(self) -> None:
        self.close_calls += 1
        if self.close_release is not None:
            self.close_task = asyncio.current_task()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                if self.cancellation_seen is not None:
                    self.cancellation_seen.set()
                await self.close_release.wait()
                raise RuntimeError("eventual-close-secret") from None
        if self.close_fails:
            raise RuntimeError(self.close_secret)


async def _cleanup(
    connection: _Connection,
    engine: _Engine,
    *,
    safe_to_close: bool,
    timeout: float = 1,
) -> None:
    await startup._cleanup_connection(
        cast(AsyncConnection, connection),
        engine=cast(AsyncEngine, engine),
        captured_pool=engine.original_pool,
        deadline=asyncio.get_running_loop().time() + timeout,
        safe_to_close=safe_to_close,
    )


@pytest.mark.parametrize(
    ("safe_path", "expected_disposals"),
    (
        ("transaction-inactive", []),
        ("physical-invalidation", []),
        ("pool-replacement", [False]),
    ),
)
@pytest.mark.asyncio
async def test_settled_safe_close_exception_has_no_public_exception_context(
    safe_path: str,
    expected_disposals: list[bool],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    sentinel = f"{safe_path}-close-secret"
    original_close_errors: list[BaseException] = []

    class SecretCloseConnection(_Connection):
        async def close(self) -> None:
            self.close_calls += 1
            error = RuntimeError(sentinel)
            original_close_errors.append(error)
            raise error

    connection = SecretCloseConnection(
        in_transaction=safe_path != "transaction-inactive",
        rollback_fails=safe_path != "transaction-inactive",
        invalidation_succeeds=safe_path == "physical-invalidation",
    )
    engine = _Engine(replace_pool=safe_path == "pool-replacement")
    safe_to_close = safe_path == "transaction-inactive"

    async def close_failure_check(
        engine_value: AsyncEngine,
        *,
        captured_pool: object,
        deadline: float,
    ) -> None:
        await startup._cleanup_connection(
            cast(AsyncConnection, connection),
            engine=engine_value,
            captured_pool=captured_pool,
            deadline=deadline,
            safe_to_close=safe_to_close,
        )

    monkeypatch.setattr(startup, "_run_check", close_failure_check)

    error = await _capture_startup_failure(engine)

    captured = capsys.readouterr()
    assert len(original_close_errors) == 1
    original_close_error = original_close_errors[0]
    identities, retained_strings, task_exception_identities = _inspect_retained_failure_graph(error)
    assert connection.close_calls == 1
    assert connection.invalidated is (safe_path == "physical-invalidation")
    assert engine.dispose_calls == expected_disposals
    assert (engine.sync_engine.pool is not engine.original_pool) is (
        safe_path == "pool-replacement"
    )
    assert error.__cause__ is None
    assert error.__context__ is None
    assert id(original_close_error) not in identities
    assert id(original_close_error) not in task_exception_identities
    assert all(sentinel not in value for value in retained_strings)
    assert sentinel not in str(error)
    assert sentinel not in repr(error)
    assert sentinel not in repr(error.args)
    assert sentinel not in caplog.text
    assert sentinel not in captured.out
    assert sentinel not in captured.err


@pytest.mark.parametrize(
    "safe_path",
    (
        "transaction-inactive",
        "physical-invalidation",
        "pool-replacement",
    ),
)
@pytest.mark.asyncio
async def test_settled_safe_close_failure_disposes_engine_with_normal_status(
    safe_path: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sentinel = f"{safe_path}-composition-close-secret"
    connection = _Connection(
        in_transaction=safe_path != "transaction-inactive",
        rollback_fails=safe_path != "transaction-inactive",
        invalidation_succeeds=safe_path == "physical-invalidation",
        close_fails=True,
        close_secret=sentinel,
    )
    engine = _Engine(replace_pool=safe_path == "pool-replacement")
    safe_to_close = safe_path == "transaction-inactive"

    async def close_failure_check(
        engine_value: AsyncEngine,
        *,
        captured_pool: object,
        deadline: float,
    ) -> None:
        await startup._cleanup_connection(
            cast(AsyncConnection, connection),
            engine=engine_value,
            captured_pool=captured_pool,
            deadline=deadline,
            safe_to_close=safe_to_close,
        )

    runtime = cast(
        DatabaseRuntime,
        SimpleNamespace(engine=engine, session_factory=object()),
    )
    output = _Output()
    monkeypatch.setattr(startup, "_run_check", close_failure_check)
    monkeypatch.setattr(composition, "create_database_runtime", lambda url: runtime)

    status = await run_worker_process(
        cast(ProcessOutput, output),
        settings_loader=_composition_settings,
    )

    assert status == 1
    assert engine.dispose_calls[-1] is True
    assert output.stdout == []
    assert output.stderr == [WORKER_STARTUP_FAILED]
    assert sentinel not in repr(output.stderr)


@pytest.mark.asyncio
async def test_live_close_task_is_settlement_unknown_and_eventually_consumed() -> None:
    release = asyncio.Event()
    cancellation_seen = asyncio.Event()
    connection = _Connection(
        in_transaction=False,
        close_release=release,
        cancellation_seen=cancellation_seen,
    )
    engine = _Engine()

    with pytest.raises(StartupCheckSettlementUnknown):
        await _cleanup(connection, engine, safe_to_close=True, timeout=0.01)

    await cancellation_seen.wait()
    assert connection.close_task is not None
    assert connection.close_task.cancelling() == 1
    release.set()
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    assert connection.close_task.done()
    assert cast(_TaskDiagnostics, connection.close_task)._log_traceback is False


@pytest.mark.asyncio
async def test_unconfirmed_safe_state_is_settlement_unknown_without_close() -> None:
    connection = _Connection(
        in_transaction=True,
        rollback_fails=True,
        invalidation_succeeds=False,
    )
    engine = _Engine(replace_pool=False)

    with pytest.raises(StartupCheckSettlementUnknown):
        await _cleanup(connection, engine, safe_to_close=False)

    assert engine.dispose_calls == [False]
    assert connection.close_calls == 0
