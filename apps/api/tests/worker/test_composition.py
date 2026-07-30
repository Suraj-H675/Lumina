"""Readiness and startup composition linearization tests."""

from __future__ import annotations

import ast
import asyncio
import inspect
from collections.abc import Callable
from types import SimpleNamespace
from typing import cast

import pytest
from lumina.settings import AppSettings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime
from lumina.worker import composition
from lumina.worker.composition import (
    ReadinessState,
    StartupReadiness,
    WorkerCompositionError,
    run_worker_process,
)
from lumina.worker.output import WORKER_STARTUP_FAILED


def test_shutdown_wins_before_readiness_without_output_commitment() -> None:
    shutdown = asyncio.Event()
    shutdown.set()
    readiness = StartupReadiness(shutdown)

    assert readiness.begin_startup_output() is False
    assert readiness.state is ReadinessState.NOT_READY


def test_startup_output_commitment_is_synchronous_and_then_becomes_ready() -> None:
    readiness = StartupReadiness(asyncio.Event())

    assert readiness.begin_startup_output() is True
    assert readiness.state is ReadinessState.STARTUP_OUTPUT_COMMITTED
    readiness.mark_ready()
    assert readiness.state.name == ReadinessState.READY.name


def test_readiness_cannot_be_committed_twice() -> None:
    readiness = StartupReadiness(asyncio.Event())
    assert readiness.begin_startup_output() is True

    with pytest.raises(WorkerCompositionError):
        readiness.begin_startup_output()


class _OutputSpy:
    def __init__(self) -> None:
        self.stdout: list[bytes] = []
        self.stderr: list[bytes] = []
        self.restored = 0

    def activate(self) -> None:
        pass

    async def write_stdout(self, data: bytes, *, deadline: float) -> None:
        del deadline
        self.stdout.append(data)

    async def write_stderr(self, data: bytes, *, deadline: float) -> None:
        del deadline
        self.stderr.append(data)

    def restore(self) -> None:
        self.restored += 1


class _EngineSpy:
    def __init__(self) -> None:
        self.dispose_calls = 0

    async def dispose(self) -> None:
        self.dispose_calls += 1


class _SignalsSpy:
    def __init__(self, callback: object) -> None:
        self.callback = cast(Callable[[], None], callback)
        self.restore_calls = 0

    def restore(self) -> None:
        self.restore_calls += 1


def _settings() -> AppSettings:
    return cast(
        AppSettings,
        SimpleNamespace(
            database_url=object(),
            job_operation_wait_timeout_ms=5_000,
            job_result_max_bytes=61_440,
            job_stale_seconds=120,
            worker_id_prefix="worker.fixture",
            job_heartbeat_seconds=30,
            job_handler_timeout_seconds=30,
            job_cancellation_grace_seconds=1,
            worker_poll_seconds=2,
        ),
    )


def _patch_pre_readiness_dependencies(
    monkeypatch: pytest.MonkeyPatch,
    *,
    engine: _EngineSpy,
) -> None:
    runtime = cast(
        DatabaseRuntime,
        SimpleNamespace(engine=engine, session_factory=object()),
    )
    monkeypatch.setattr(composition, "create_database_runtime", lambda url: runtime)

    async def compatible(engine_value: object, *, operation_wait_timeout_ms: int) -> None:
        del engine_value, operation_wait_timeout_ms

    monkeypatch.setattr(composition, "check_startup_compatibility", compatible)
    for name in (
        "PostgreSqlClaimJobStore",
        "PostgreSqlHeartbeatJobStore",
        "PostgreSqlJobCompletionStore",
        "PostgreSqlFailureJobStore",
        "PostgreSqlRecoverStaleJobsStore",
    ):
        monkeypatch.setattr(composition, name, lambda *args, **kwargs: object())
    for name in (
        "ClaimJobService",
        "HeartbeatJobService",
        "CompleteJobService",
        "FailJobService",
        "RecoverStaleJobsService",
    ):
        monkeypatch.setattr(composition, name, lambda *args, **kwargs: object())
    monkeypatch.setattr(composition, "production_handler_registry", object)


@pytest.mark.asyncio
async def test_queued_signal_during_identity_runs_before_readiness_and_stops_work(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = _EngineSpy()
    output = _OutputSpy()
    _patch_pre_readiness_dependencies(monkeypatch, engine=engine)
    callback_calls = 0
    signals: _SignalsSpy | None = None

    def install(shutdown_event: asyncio.Event) -> _SignalsSpy:
        nonlocal callback_calls, signals

        def signal_callback() -> None:
            nonlocal callback_calls
            callback_calls += 1
            shutdown_event.set()

        signals = _SignalsSpy(signal_callback)
        return signals

    def build_identity(prefix: str) -> object:
        del prefix
        assert signals is not None
        asyncio.get_running_loop().call_soon(signals.callback)
        return object()

    class ForbiddenRuntime:
        def __init__(self, **kwargs: object) -> None:
            raise AssertionError(kwargs)

    monkeypatch.setattr(composition, "install_signal_handlers", install)
    monkeypatch.setattr(composition, "build_worker_owner_identity", build_identity)
    monkeypatch.setattr(composition, "WorkerRuntime", ForbiddenRuntime)

    status = await run_worker_process(output, settings_loader=_settings)

    assert status == 0
    assert callback_calls == 1
    assert output.stdout == []
    assert output.stderr == []
    assert output.restored == 1
    assert signals is not None
    assert signals.restore_calls == 1
    assert engine.dispose_calls == 1


def test_readiness_checkpoint_is_single_and_immediately_precedes_linearization() -> None:
    tree = ast.parse(inspect.getsource(run_worker_process))
    checkpoint_pairs = 0
    sleep_calls = 0

    for node in ast.walk(tree):
        for _, value in ast.iter_fields(node):
            if not isinstance(value, list):
                continue
            statements = [item for item in value if isinstance(item, ast.stmt)]
            for index, statement in enumerate(statements):
                if not (
                    isinstance(statement, ast.Expr)
                    and isinstance(statement.value, ast.Await)
                    and isinstance(statement.value.value, ast.Call)
                    and isinstance(statement.value.value.func, ast.Attribute)
                    and statement.value.value.func.attr == "sleep"
                    and len(statement.value.value.args) == 1
                    and isinstance(statement.value.value.args[0], ast.Constant)
                    and statement.value.value.args[0].value == 0
                ):
                    continue
                sleep_calls += 1
                if index + 1 >= len(statements):
                    continue
                next_statement = statements[index + 1]
                if (
                    isinstance(next_statement, ast.If)
                    and isinstance(next_statement.test, ast.UnaryOp)
                    and isinstance(next_statement.test.operand, ast.Call)
                    and isinstance(next_statement.test.operand.func, ast.Attribute)
                    and next_statement.test.operand.func.attr == "begin_startup_output"
                ):
                    checkpoint_pairs += 1

    assert sleep_calls == 1
    assert checkpoint_pairs == 1


@pytest.mark.asyncio
async def test_settled_startup_failure_still_disposes_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = _EngineSpy()
    output = _OutputSpy()
    _patch_pre_readiness_dependencies(monkeypatch, engine=engine)

    async def fail_compatibility(engine_value: object, *, operation_wait_timeout_ms: int) -> None:
        del engine_value, operation_wait_timeout_ms
        raise RuntimeError("private-close-evidence")

    monkeypatch.setattr(composition, "check_startup_compatibility", fail_compatibility)

    assert await run_worker_process(output, settings_loader=_settings) == 1
    assert engine.dispose_calls == 1
    assert output.stdout == []
    assert output.stderr == [WORKER_STARTUP_FAILED]
