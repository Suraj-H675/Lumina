"""SQLAlchemy implementation of the readiness probe boundary."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine


class SqlAlchemyDatabaseProbe:
    """Execute the parameter-free PostgreSQL readiness query."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine
        self._logger = logging.getLogger("lumina.database")

    async def probe(self) -> None:
        """Verify one connection without exposing driver detail in logs."""
        try:
            async with self._engine.connect() as connection:
                await connection.execute(text("SELECT 1"))
        except SQLAlchemyError:
            self._logger.warning("database.unavailable")
            raise
