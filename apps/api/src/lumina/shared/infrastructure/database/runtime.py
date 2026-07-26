"""Lazy async SQLAlchemy runtime construction."""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import SecretStr
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .target import parse_database_url


@dataclass(frozen=True)
class DatabaseRuntime:
    """One process-wide async engine and session factory, constructed without I/O."""

    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]


def create_database_runtime(database_url: SecretStr) -> DatabaseRuntime:
    """Construct the bounded runtime pool without opening a database connection."""
    parsed_url, _ = parse_database_url(
        database_url.get_secret_value(),
        drivername="postgresql+asyncpg",
    )
    engine = create_async_engine(
        parsed_url,
        echo=False,
        hide_parameters=True,
        pool_size=5,
        max_overflow=0,
        pool_timeout=5,
        pool_pre_ping=True,
    )
    return DatabaseRuntime(
        engine=engine, session_factory=async_sessionmaker(engine, expire_on_commit=False)
    )
