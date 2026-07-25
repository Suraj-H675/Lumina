"""Database readiness application boundary."""

from __future__ import annotations

import asyncio
import logging
from typing import Protocol


class DatabaseProbe(Protocol):
    """Minimal dependency boundary for database reachability."""

    async def probe(self) -> None:
        """Perform one bounded, side-effect-free database probe."""


class DatabaseReadinessService:
    """Translate a database probe into a safe availability result."""

    def __init__(self, probe: DatabaseProbe) -> None:
        self._probe = probe
        self._logger = logging.getLogger("lumina.database")

    async def is_ready(self) -> bool:
        """Return whether the database answers within the fixed readiness budget."""
        try:
            await asyncio.wait_for(self._probe.probe(), timeout=3)
        except Exception:
            self._logger.warning("database.readiness_unavailable")
            return False
        return True
