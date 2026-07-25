"""Destructive migration targets must be explicit, local, and query-free."""

from __future__ import annotations

import pytest
from sqlalchemy import URL

from .database_safety import require_local_test_database


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?dbname=lumina",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?host=203.0.113.1",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?hostaddr=203.0.113.1",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?port=5433",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?service=production",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?options=-c%20role%3Dadmin",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?dbname=lumina&host=203.0.113.1",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test?host=%32%30%33.%30.113.1",
        "postgresql+psycopg://role:password@203.0.113.1:5432/lumina_test",
        "postgresql+psycopg://role:password@localhost:5432/lumina",
        "postgresql+psycopg://role:password@localhost/lumina_test",
        "postgresql+psycopg://role:password@localhost,127.0.0.1:5432/lumina_test",
        "postgresql+psycopg://role:password@localhost:5432/lumina_test#fragment",
        "postgresql://role:password@localhost:5432/lumina_test",
        "postgresql+psycopg://role:password@/lumina_test",
        "postgresql+psycopg:///lumina_test",
        "postgresql+psycopg://role:password@[::1]:5432/lumina_test?host=localhost",
    ],
)
def test_destructive_migration_url_rejects_overrides_and_nonlocal_targets(url: str) -> None:
    with pytest.raises(
        ValueError, match="Destructive integration helpers require local lumina_test"
    ):
        require_local_test_database(url)


@pytest.mark.parametrize(
    "url",
    [
        URL.create(
            "postgresql+psycopg",
            username="role",
            password="password",
            host="127.0.0.1",
            port=5432,
            database="lumina_test",
        ),
        URL.create(
            "postgresql+psycopg",
            username="role",
            password="password",
            host="localhost",
            port=5432,
            database="lumina_test",
        ),
        URL.create(
            "postgresql+psycopg",
            username="role",
            password="password",
            host="::1",
            port=5432,
            database="lumina_test",
        ),
    ],
)
def test_destructive_migration_url_accepts_only_explicit_loopback_test_urls(url: URL) -> None:
    require_local_test_database(url)
