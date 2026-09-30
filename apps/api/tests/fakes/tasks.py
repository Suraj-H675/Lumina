from __future__ import annotations

import asyncio
from typing import cast


def pending_tasks() -> set[asyncio.Task[object]]:
    current = asyncio.current_task()
    return {
        cast(asyncio.Task[object], task)
        for task in asyncio.all_tasks()
        if task is not current and not task.done()
    }
