"""Runtime construction must be lazy and bounded."""

from __future__ import annotations

import ssl
from types import SimpleNamespace
from typing import Protocol, cast

import anyio
import lumina.shared.infrastructure.database.runtime as runtime_module
import lumina.shared.infrastructure.database.transport as transport_module
import pytest
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from lumina.shared.infrastructure.database.transport import psycopg_connect_args
from pydantic import SecretStr


class _PoolInfo(Protocol):
    def size(self) -> int: ...

    def checkedout(self) -> int: ...


def test_runtime_constructs_expected_pool_without_connecting() -> None:
    runtime = create_database_runtime(
        SecretStr("postgresql+asyncpg://lumina_test_app:private@127.0.0.1:5432/lumina_test")
    )

    pool = cast(_PoolInfo, runtime.engine.pool)
    assert pool.size() == 5
    assert pool.checkedout() == 0
    assert runtime.engine.sync_engine.hide_parameters is True

    anyio.run(runtime.engine.dispose)


def test_runtime_threads_verified_tls_as_driver_connect_args(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, object] = {}
    engine = object()

    def fake_create_async_engine(url: object, **kwargs: object) -> object:
        seen["url"] = url
        seen.update(kwargs)
        return engine

    monkeypatch.setattr(runtime_module, "create_async_engine", fake_create_async_engine)

    runtime = create_database_runtime(
        SecretStr("postgresql+asyncpg://runtime:private@db.example.test:5432/lumina"),
        tls_mode="verify-full",
    )

    assert runtime.engine is engine
    connect_args = cast(dict[str, object], seen["connect_args"])
    ssl_context = connect_args["ssl"]
    assert isinstance(ssl_context, ssl.SSLContext)
    assert ssl_context.check_hostname is True
    assert ssl_context.verify_mode == ssl.CERT_REQUIRED


def test_runtime_disables_asyncpg_tls_only_when_explicitly_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: dict[str, object] = {}
    engine = object()

    def fake_create_async_engine(url: object, **kwargs: object) -> object:
        seen["url"] = url
        seen.update(kwargs)
        return engine

    monkeypatch.setattr(runtime_module, "create_async_engine", fake_create_async_engine)

    runtime = create_database_runtime(
        SecretStr("postgresql+asyncpg://runtime:private@127.0.0.1:5432/lumina"),
        tls_mode="disable",
    )

    assert runtime.engine is engine
    assert seen["connect_args"] == {"ssl": False}


def test_migration_tls_mode_uses_default_ca_file_when_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        transport_module.ssl,
        "get_default_verify_paths",
        lambda: SimpleNamespace(cafile="/system/ca-bundle.pem"),
    )

    assert psycopg_connect_args("verify-full") == {
        "sslmode": "verify-full",
        "sslrootcert": "/system/ca-bundle.pem",
    }


def test_migration_tls_mode_falls_back_to_libpq_system_roots(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        transport_module.ssl,
        "get_default_verify_paths",
        lambda: SimpleNamespace(cafile=None),
    )

    assert psycopg_connect_args("verify-full") == {
        "sslmode": "verify-full",
        "sslrootcert": "system",
    }
    assert psycopg_connect_args("disable") == {"sslmode": "disable"}
