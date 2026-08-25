"""Destructive database helpers are hard-bound to the local test database."""

from __future__ import annotations

from sqlalchemy import URL
from sqlalchemy.engine import make_url

_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
_CONTAINER_DB_HOST = "db"


_INTEGRATION_DATABASES = frozenset({"lumina_test", "lumina_history_test"})


def require_local_test_database(url: str | URL) -> None:
    """Refuse destructive work unless every effective connection component is local test-only."""
    parsed = make_url(url)
    if (
        parsed.drivername != "postgresql+psycopg"
        or parsed.database not in _INTEGRATION_DATABASES
        or parsed.host not in (_LOOPBACK_HOSTS | {_CONTAINER_DB_HOST})
        or parsed.port is None
        or not 1 <= parsed.port <= 65535
        or parsed.query
    ):
        raise ValueError("Destructive integration helpers require local lumina_test")
