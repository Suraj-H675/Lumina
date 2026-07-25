"""Runtime construction must be lazy and bounded."""

from __future__ import annotations

from typing import Protocol, cast

import anyio
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from pydantic import SecretStr


class _PoolInfo(Protocol):
    def size(self) -> int: ...

    def checkedout(self) -> int: ...


def test_runtime_constructs_expected_pool_without_connecting() -> None:
    runtime = create_database_runtime(
        SecretStr("postgresql+asyncpg://lumina_test_app:private@127.0.0.1/lumina_test")
    )

    pool = cast(_PoolInfo, runtime.engine.pool)
    assert pool.size() == 5
    assert pool.checkedout() == 0

    anyio.run(runtime.engine.dispose)
