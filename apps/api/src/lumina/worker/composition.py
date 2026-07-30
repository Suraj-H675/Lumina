"""One-process worker composition, readiness, and bounded resource unwind."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from dataclasses import dataclass
from enum import Enum, auto
from typing import Protocol

from lumina.jobs.application.claim import ClaimJobService
from lumina.jobs.application.completion import CompleteJobService
from lumina.jobs.application.execution import ExecuteOneJobService
from lumina.jobs.application.failure import FailJobService
from lumina.jobs.application.handlers import production_handler_registry
from lumina.jobs.application.heartbeat import HeartbeatJobService
from lumina.jobs.application.recovery import RecoverStaleJobsService
from lumina.jobs.infrastructure.postgresql.claim import PostgreSqlClaimJobStore
from lumina.jobs.infrastructure.postgresql.completion import PostgreSqlJobCompletionStore
from lumina.jobs.infrastructure.postgresql.failure import PostgreSqlFailureJobStore
from lumina.jobs.infrastructure.postgresql.heartbeat import PostgreSqlHeartbeatJobStore
from lumina.jobs.infrastructure.postgresql.recovery import PostgreSqlRecoverStaleJobsStore
from lumina.settings import AppSettings, load_settings
from lumina.shared.infrastructure.database.runtime import DatabaseRuntime, create_database_runtime
from lumina.worker.identity import build_worker_owner_identity
from lumina.worker.output import (
    WORKER_STARTED,
    WORKER_STARTUP_FAILED,
    ProcessOutput,
)
from lumina.worker.runtime import (
    ObservedCompletion,
    ObservedFailure,
    RuntimeExecutionObserver,
    ShutdownAwareClaim,
    ShutdownAwareRegistry,
    WorkerRuntime,
)
from lumina.worker.signals import InstalledSignalHandlers, install_signal_handlers
from lumina.worker.startup import (
    StartupCheckSettlementUnknown,
    check_startup_compatibility,
)
from lumina.worker.termination import (
    HardTerminationCoordinator,
    OsProcessTerminator,
    ProcessTerminator,
    TerminatorReturned,
)
from lumina.worker.timing import EventLoopExecutionTiming

_DEFAULT_CLEANUP_SECONDS = 5


class SettingsLoader(Protocol):
    def __call__(self) -> AppSettings:
        """Load one immutable process settings object."""
        ...


class ReadinessState(Enum):
    """Private readiness states with one synchronous linearization point."""

    NOT_READY = auto()
    STARTUP_OUTPUT_COMMITTED = auto()
    READY = auto()


class StartupReadiness:
    """Linearize shutdown against commitment to the fixed startup event."""

    def __init__(self, shutdown_event: asyncio.Event) -> None:
        self._shutdown_event = shutdown_event
        self._state = ReadinessState.NOT_READY

    @property
    def state(self) -> ReadinessState:
        return self._state

    def begin_startup_output(self) -> bool:
        """Synchronously let either shutdown or startup-output commitment win."""
        if self._state is not ReadinessState.NOT_READY:
            raise WorkerCompositionError()
        if self._shutdown_event.is_set():
            return False
        self._state = ReadinessState.STARTUP_OUTPUT_COMMITTED
        return True

    def mark_ready(self) -> None:
        if self._state is not ReadinessState.STARTUP_OUTPUT_COMMITTED:
            raise WorkerCompositionError()
        self._state = ReadinessState.READY


class WorkerCompositionError(RuntimeError):
    """Fixed composition/startup failure with no configuration evidence."""

    def __init__(self) -> None:
        super().__init__("Worker startup failed.")

    def __repr__(self) -> str:
        return "WorkerCompositionError(<redacted>)"


class CleanupSettlementUnknown(RuntimeError):
    """A composition-owned task remained live at cleanup expiry."""

    def __init__(self) -> None:
        super().__init__("Worker cleanup settlement is unknown.")


@dataclass(slots=True)
class _Resources:
    output: ProcessOutput
    engine_runtime: DatabaseRuntime | None = None
    signals: InstalledSignalHandlers | None = None
    engine_disposal: asyncio.Task[None] | None = None


async def run_worker_process(
    output: ProcessOutput,
    *,
    settings_loader: SettingsLoader = load_settings,
    terminator: ProcessTerminator | None = None,
) -> int:
    """Construct, start, run, and unwind one internal sequential worker."""
    resources = _Resources(output=output)
    settings: AppSettings | None = None
    shutdown_event = asyncio.Event()
    readiness = StartupReadiness(shutdown_event)
    startup_confirmed = False
    startup_failed = False
    graceful_pre_readiness = False
    status = 1
    hard: HardTerminationCoordinator | None = None

    try:
        settings = settings_loader()
        resources.engine_runtime = create_database_runtime(settings.database_url)

        async def fatal_cleanup(deadline: float) -> None:
            await _cleanup_runtime_resources(resources, deadline=deadline, restore_output=False)

        hard = HardTerminationCoordinator(
            output=output,
            terminator=terminator or OsProcessTerminator(),
            cancellation_grace_seconds=settings.job_cancellation_grace_seconds,
            cleanup=fatal_cleanup,
        )
        try:
            await check_startup_compatibility(
                resources.engine_runtime.engine,
                operation_wait_timeout_ms=settings.job_operation_wait_timeout_ms,
            )
        except StartupCheckSettlementUnknown:
            await hard.terminate(None)

        session_factory = resources.engine_runtime.session_factory
        operation_timeout = settings.job_operation_wait_timeout_ms
        claim = ClaimJobService(
            PostgreSqlClaimJobStore(
                session_factory,
                operation_wait_timeout_ms=operation_timeout,
            )
        )
        heartbeat = HeartbeatJobService(
            PostgreSqlHeartbeatJobStore(
                session_factory,
                operation_wait_timeout_ms=operation_timeout,
            )
        )
        completion = CompleteJobService(
            PostgreSqlJobCompletionStore(
                session_factory,
                operation_wait_timeout_ms=operation_timeout,
            ),
            result_max_bytes=settings.job_result_max_bytes,
        )
        failure = FailJobService(
            PostgreSqlFailureJobStore(
                session_factory,
                operation_wait_timeout_ms=operation_timeout,
            )
        )
        recovery = RecoverStaleJobsService(
            PostgreSqlRecoverStaleJobsStore(
                session_factory,
                operation_wait_timeout_ms=operation_timeout,
            ),
            stale_seconds=settings.job_stale_seconds,
        )
        registry = production_handler_registry()
        resources.signals = install_signal_handlers(shutdown_event)
        owner = build_worker_owner_identity(settings.worker_id_prefix)

        await asyncio.sleep(0)
        if not readiness.begin_startup_output():
            graceful_pre_readiness = True
            status = 0
        else:
            startup_deadline = (
                asyncio.get_running_loop().time() + settings.job_operation_wait_timeout_ms / 1_000
            )
            await output.write_stdout(WORKER_STARTED, deadline=startup_deadline)
            readiness.mark_ready()
            startup_confirmed = True
            if shutdown_event.is_set():
                status = 0
            else:
                observer = RuntimeExecutionObserver()
                observed_failure = ObservedFailure(failure, observer)
                executor = ExecuteOneJobService(
                    owner=owner,
                    registry=ShutdownAwareRegistry(
                        registry,
                        shutdown_event=shutdown_event,
                        observer=observer,
                    ),
                    claim=ShutdownAwareClaim(
                        claim,
                        heartbeat=heartbeat,
                        failure=observed_failure,
                        shutdown_event=shutdown_event,
                        observer=observer,
                    ),
                    heartbeat=heartbeat,
                    completion=ObservedCompletion(completion, observer),
                    failure=observed_failure,
                    heartbeat_seconds=settings.job_heartbeat_seconds,
                    handler_timeout_seconds=settings.job_handler_timeout_seconds,
                    cancellation_grace_seconds=settings.job_cancellation_grace_seconds,
                    timing=EventLoopExecutionTiming(),
                )
                runtime = WorkerRuntime(
                    recovery=recovery,
                    executor=executor,
                    shutdown_event=shutdown_event,
                    observer=observer,
                    fatal_termination=hard,
                    poll_seconds=settings.worker_poll_seconds,
                    stale_seconds=settings.job_stale_seconds,
                    cancellation_grace_seconds=settings.job_cancellation_grace_seconds,
                )
                status = await runtime.run()
    except TerminatorReturned:
        raise
    except (KeyboardInterrupt, SystemExit):
        raise
    except BaseException:
        if not startup_confirmed and not graceful_pre_readiness:
            startup_failed = True
        status = 1

    cleanup_seconds = (
        settings.job_cancellation_grace_seconds
        if settings is not None
        else _DEFAULT_CLEANUP_SECONDS
    )
    deadline = asyncio.get_running_loop().time() + cleanup_seconds
    cleanup_failed = False
    try:
        if resources.signals is not None:
            try:
                resources.signals.restore()
            except BaseException:
                cleanup_failed = True
            resources.signals = None
        if resources.engine_runtime is not None:
            try:
                await _dispose_engine(resources, deadline=deadline)
            except CleanupSettlementUnknown:
                raise
            except BaseException:
                cleanup_failed = True
        if startup_failed:
            try:
                await output.write_stderr(WORKER_STARTUP_FAILED, deadline=deadline)
            except BaseException:
                cleanup_failed = True
        try:
            output.restore()
        except BaseException:
            cleanup_failed = True
    except CleanupSettlementUnknown:
        if hard is None:
            hard = HardTerminationCoordinator(
                output=output,
                terminator=terminator or OsProcessTerminator(),
                cancellation_grace_seconds=cleanup_seconds,
                cleanup=_no_cleanup,
            )
        await hard.terminate(None)
    if cleanup_failed:
        return 1
    return status


async def _cleanup_runtime_resources(
    resources: _Resources,
    *,
    deadline: float,
    restore_output: bool,
) -> None:
    if resources.signals is not None:
        with suppress(BaseException):
            resources.signals.restore()
        resources.signals = None
    if resources.engine_runtime is not None:
        with suppress(BaseException):
            await _dispose_engine(resources, deadline=deadline)
    if restore_output:
        with suppress(BaseException):
            resources.output.restore()


async def _dispose_engine(resources: _Resources, *, deadline: float) -> None:
    runtime = resources.engine_runtime
    if runtime is None:
        return
    task = resources.engine_disposal
    if task is None:
        task = asyncio.create_task(
            runtime.engine.dispose(),
            name="lumina.worker.engine-disposal",
        )
        resources.engine_disposal = task
    try:
        async with asyncio.timeout_at(deadline):
            await asyncio.shield(task)
    except BaseException:
        if not task.done():
            task.cancel()
            try:
                async with asyncio.timeout_at(deadline):
                    await asyncio.shield(task)
            except BaseException:
                pass
        if not task.done():
            task.add_done_callback(_consume_task)
            raise CleanupSettlementUnknown() from None
        _consume_task(task)
        raise WorkerCompositionError() from None
    _consume_task(task)
    resources.engine_runtime = None


async def _no_cleanup(deadline: float) -> None:
    del deadline


def _consume_task(task: asyncio.Task[object]) -> None:
    if not task.done():
        return
    with suppress(BaseException):
        task.exception()
