"""Event-loop monotonic timing and bounded task-settlement capabilities."""

from __future__ import annotations

import asyncio
from typing import Protocol

type ExecutionTask = asyncio.Task[object]


class ExecutionTiming(Protocol):
    """Narrow injectable timing used by one-job execution orchestration."""

    def monotonic(self) -> float:
        """Return the current monotonic event-loop time."""
        ...

    async def sleep_until(self, deadline: float) -> None:
        """Sleep until one absolute monotonic deadline."""
        ...

    async def wait_first(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        """Wait until a task settles or the absolute deadline is reached."""
        ...

    async def settle(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        """Wait for task settlement only within the remaining absolute budget."""
        ...


class EventLoopExecutionTiming:
    """Production timing backed exclusively by the running event loop."""

    def monotonic(self) -> float:
        """Use the event loop's monotonic clock."""
        return asyncio.get_running_loop().time()

    async def sleep_until(self, deadline: float) -> None:
        """Sleep for only the positive remainder of an absolute deadline."""
        await asyncio.sleep(max(0.0, deadline - self.monotonic()))

    async def wait_first(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        """Return every task observed done when the first wait completes."""
        done, _ = await asyncio.wait(
            tasks,
            timeout=max(0.0, deadline - self.monotonic()),
            return_when=asyncio.FIRST_COMPLETED,
        )
        return frozenset(done)

    async def settle(
        self,
        tasks: tuple[ExecutionTask, ...],
        *,
        deadline: float,
    ) -> frozenset[ExecutionTask]:
        """Bound settlement of all supplied tasks by one absolute deadline."""
        if not tasks:
            return frozenset()
        done, _ = await asyncio.wait(
            tasks,
            timeout=max(0.0, deadline - self.monotonic()),
            return_when=asyncio.ALL_COMPLETED,
        )
        return frozenset(done)
