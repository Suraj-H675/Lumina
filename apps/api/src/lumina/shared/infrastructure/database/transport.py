"""Reviewed PostgreSQL transport modes shared by async runtime and migrations."""

from __future__ import annotations

import ssl
from typing import Literal

DatabaseTlsMode = Literal["disable", "verify-full"]


def asyncpg_connect_args(mode: DatabaseTlsMode) -> dict[str, object]:
    """Translate the reviewed transport mode to asyncpg without URL query options."""
    if mode == "disable":
        return {"ssl": False}
    return {"ssl": ssl.create_default_context()}


def psycopg_connect_args(mode: DatabaseTlsMode) -> dict[str, str]:
    """Translate the reviewed transport mode to psycopg without URL query options."""
    return {"sslmode": mode}


__all__ = ["DatabaseTlsMode", "asyncpg_connect_args", "psycopg_connect_args"]
