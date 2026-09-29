"""Contracts for shared catalogue read database lifecycle handling."""

from __future__ import annotations

import asyncio
from typing import cast

import pytest
from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogReadOperationFailure,
    CatalogReadUnavailable,
)
from lumina.catalog.infrastructure.postgresql.read_lifecycle import (
    DatabasePhase,
    classify_database_failure,
    rollback_close_or_invalidate,
)
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str, message: str) -> None:
        super().__init__(message)
        self.sqlstate = sqlstate


@pytest.mark.parametrize(
    ("error", "phase", "expected"),
    [
        (
            OperationalError(
                "SELECT hidden SQL",
                {},
                _DriverFailure("08006", "connection failure"),
                connection_invalidated=False,
            ),
            DatabasePhase.OPERATION,
            CatalogReadUnavailable,
        ),
        (
            OperationalError(
                "SELECT hidden SQL",
                {},
                _DriverFailure("57014", "canceling statement due to user request"),
                connection_invalidated=False,
            ),
            DatabasePhase.OPERATION,
            CatalogReadUnavailable,
        ),
        (
            OperationalError("CONNECT hidden SQL", {}, Exception("driver unavailable")),
            DatabasePhase.CONNECTION,
            CatalogReadUnavailable,
        ),
        (
            IntegrityError("SELECT hidden SQL", {}, Exception("integrity")),
            DatabasePhase.OPERATION,
            CatalogDataInconsistent,
        ),
        (
            ProgrammingError("SELECT hidden SQL", {}, Exception("programming")),
            DatabasePhase.OPERATION,
            CatalogReadOperationFailure,
        ),
        (
            SQLAlchemyError("database operation failed"),
            DatabasePhase.OPERATION,
            CatalogReadOperationFailure,
        ),
    ],
)
def test_database_failure_classification_preserves_read_contract(
    error: SQLAlchemyError,
    phase: DatabasePhase,
    expected: type[RuntimeError],
) -> None:
    assert classify_database_failure(error, phase) is expected


class _Session:
    def __init__(
        self,
        *,
        rollback_error: BaseException | None = None,
        close_errors: tuple[BaseException, ...] = (),
    ) -> None:
        self.rollback_error = rollback_error
        self.close_errors = list(close_errors)
        self.rollbacks = 0
        self.invalidations = 0
        self.closes = 0

    def in_transaction(self) -> bool:
        return True

    async def rollback(self) -> None:
        self.rollbacks += 1
        if self.rollback_error is not None:
            raise self.rollback_error

    async def invalidate(self) -> None:
        self.invalidations += 1

    async def close(self) -> None:
        self.closes += 1
        if self.close_errors:
            raise self.close_errors.pop(0)


@pytest.mark.asyncio
async def test_failed_rollback_invalidates_before_closing() -> None:
    session = _Session(rollback_error=RuntimeError("rollback failed"))

    await rollback_close_or_invalidate(cast(AsyncSession, session))

    assert session.rollbacks == 1
    assert session.invalidations == 1
    assert session.closes == 1


@pytest.mark.asyncio
async def test_failed_close_invalidates_and_retries_close() -> None:
    session = _Session(close_errors=(RuntimeError("close failed"),))

    await rollback_close_or_invalidate(cast(AsyncSession, session))

    assert session.rollbacks == 1
    assert session.invalidations == 1
    assert session.closes == 2


@pytest.mark.asyncio
async def test_process_control_error_is_re_raised_after_cleanup() -> None:
    interruption = asyncio.CancelledError()
    session = _Session(rollback_error=interruption)

    with pytest.raises(asyncio.CancelledError) as captured:
        await rollback_close_or_invalidate(cast(AsyncSession, session))

    assert captured.value is interruption
    assert session.rollbacks == 1
    assert session.invalidations == 1
    assert session.closes == 1
