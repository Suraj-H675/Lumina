"""Bounded async lifecycle mechanics shared by PostgreSQL job adapters."""

from __future__ import annotations

import asyncio
import inspect
from collections.abc import Awaitable, Coroutine
from contextlib import suppress
from dataclasses import dataclass
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)
BACKEND_PID_SQL = text("SELECT pg_backend_pid()")
OPERATION_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)


@dataclass(frozen=True, repr=False, slots=True)
class DeferredResult[Result]:
    value: Result | None = None
    error: BaseException | None = None


async def run_deferring_process_control[Result](
    operation: Coroutine[Any, Any, Result],
) -> DeferredResult[Result]:
    """Let an in-flight lifecycle operation settle despite caller cancellation."""
    task = asyncio.create_task(operation)
    while True:
        try:
            return DeferredResult(value=await asyncio.shield(task))
        except PROCESS_CONTROL_ERRORS as interruption:
            if not task.done():
                continue
            if task.cancelled():
                return DeferredResult(error=interruption)
            try:
                return DeferredResult(value=task.result())
            except BaseException as error:
                return DeferredResult(error=error)
        except BaseException as error:
            return DeferredResult(error=error)


async def run_until_deadline[Result](
    operation: Awaitable[Result],
    *,
    deadline: float,
    settlement_deadline: float,
    deadline_error: type[BaseException],
) -> DeferredResult[Result]:
    """Settle, cancel, and observe one operation by an absolute deadline."""
    if deadline_expired(deadline):
        _close_unstarted_awaitable(operation)
        return DeferredResult(error=deadline_error())
    task = asyncio.create_task(_await_operation(operation))
    while True:
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            await _cancel_and_observe(task, deadline=settlement_deadline)
            return DeferredResult(error=deadline_error())
        try:
            value = await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
            return DeferredResult(value=value)
        except TimeoutError:
            await _cancel_and_observe(task, deadline=settlement_deadline)
            return DeferredResult(error=deadline_error())
        except PROCESS_CONTROL_ERRORS as interruption:
            if not task.done():
                continue
            return _completed_task_result(task, fallback=interruption)
        except BaseException as error:
            return DeferredResult(error=error)


def deadline_after_ms(timeout_ms: int) -> float:
    return asyncio.get_running_loop().time() + timeout_ms / 1_000


def work_deadline(deadline: float, timeout_ms: int) -> float:
    total_seconds = timeout_ms / 1_000
    settlement_reserve = min(0.05, total_seconds / 10)
    return deadline - settlement_reserve


def commit_deadlines(work_deadline: float) -> tuple[float, float]:
    now = asyncio.get_running_loop().time()
    remaining = max(0.0, work_deadline - now)
    return now + remaining / 3, now + remaining / 2


def cleanup_step_deadlines(deadline: float) -> tuple[float, float]:
    now = asyncio.get_running_loop().time()
    remaining = max(0.0, deadline - now)
    return now + remaining / 3, now + (remaining * 2) / 3


def next_cleanup_step_deadline(deadline: float) -> float:
    now = asyncio.get_running_loop().time()
    return now + max(0.0, deadline - now) / 2


def deadline_expired(deadline: float) -> bool:
    return asyncio.get_running_loop().time() >= deadline


def transaction_is_inactive(session: AsyncSession) -> bool:
    try:
        transaction = session.in_transaction()
        return transaction is None or transaction is False
    except BaseException:
        return False


async def invalidate_connection(connection: AsyncConnection | None) -> bool:
    """Discard a connection through its bounded async or test-double capability."""
    if connection is None:
        return False
    invalidate = getattr(connection, "invalidate", None)
    if not callable(invalidate):
        return False
    outcome = invalidate()
    if inspect.isawaitable(outcome):
        await outcome
    return True


async def _cancel_and_observe(task: asyncio.Task[object], *, deadline: float) -> None:
    task.cancel()
    while not task.done():
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            task.add_done_callback(_consume_task_exception)
            return
        try:
            await asyncio.wait_for(asyncio.shield(task), timeout=remaining)
        except TimeoutError:
            task.add_done_callback(_consume_task_exception)
            return
        except PROCESS_CONTROL_ERRORS:
            continue
        except BaseException:
            break
    _consume_task_exception(task)


def _completed_task_result[Result](
    task: asyncio.Task[Result],
    *,
    fallback: BaseException,
) -> DeferredResult[Result]:
    if task.cancelled():
        return DeferredResult(error=fallback)
    try:
        return DeferredResult(value=task.result())
    except BaseException as error:
        return DeferredResult(error=error)


def _consume_task_exception(task: asyncio.Task[object]) -> None:
    with suppress(BaseException):
        task.exception()


async def _await_operation[Result](operation: Awaitable[Result]) -> Result:
    return await operation


def _close_unstarted_awaitable(operation: Awaitable[object]) -> None:
    close = getattr(operation, "close", None)
    if callable(close):
        with suppress(BaseException):
            close()
