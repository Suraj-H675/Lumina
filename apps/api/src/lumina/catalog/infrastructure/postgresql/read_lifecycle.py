"""Shared lifecycle and failure handling for catalogue read adapters."""

from __future__ import annotations

import asyncio
from enum import Enum, auto

from sqlalchemy import text
from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
    SQLAlchemyError,
)
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from sqlalchemy.ext.asyncio import AsyncSession

from lumina.catalog.domain.read import (
    CatalogDataInconsistent,
    CatalogReadOperationFailure,
    CatalogReadUnavailable,
)

OPERATION_TIMEOUT_SQL = text(
    "SELECT "
    "set_config('statement_timeout', :timeout, true), "
    "set_config('lock_timeout', :timeout, true)"
)
PROCESS_CONTROL_ERRORS = (asyncio.CancelledError, KeyboardInterrupt, SystemExit)

_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_CONNECTION_SQLSTATE_CLASS = "08"


class DatabasePhase(Enum):
    """Database lifecycle phase used to classify transport failures safely."""

    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


async def rollback_close_or_invalidate(session: AsyncSession) -> None:
    """Rollback a read transaction and quarantine uncertain checkouts before close."""
    rollback_failed = False
    interruption: BaseException | None = None
    try:
        if session.in_transaction():
            await session.rollback()
    except PROCESS_CONTROL_ERRORS as error:
        rollback_failed = True
        interruption = error
    except BaseException:
        rollback_failed = True

    if rollback_failed:
        try:
            await session.invalidate()
        except PROCESS_CONTROL_ERRORS as error:
            interruption = interruption or error
        except BaseException:
            pass

    close_failed = False
    try:
        await session.close()
    except PROCESS_CONTROL_ERRORS as error:
        close_failed = True
        interruption = interruption or error
    except BaseException:
        close_failed = True
    if close_failed and not rollback_failed:
        try:
            await session.invalidate()
        except PROCESS_CONTROL_ERRORS as error:
            interruption = interruption or error
        except BaseException:
            pass
    if close_failed:
        try:
            await session.close()
        except PROCESS_CONTROL_ERRORS as error:
            interruption = interruption or error
        except BaseException:
            pass
    if interruption is not None:
        raise interruption


def classify_database_failure(
    error: SQLAlchemyError,
    phase: DatabasePhase,
) -> type[RuntimeError]:
    """Map SQLAlchemy read failures to the catalogue's safe domain errors."""
    sqlstate = _database_sqlstate(error) if isinstance(error, DBAPIError) else None
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated
        or (sqlstate is not None and sqlstate.startswith(_CONNECTION_SQLSTATE_CLASS))
        or sqlstate in {_LOCK_TIMEOUT_SQLSTATE, _QUERY_CANCELLED_SQLSTATE}
    ):
        return CatalogReadUnavailable
    if phase is DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return CatalogReadUnavailable
    if isinstance(error, IntegrityError):
        return CatalogDataInconsistent
    if isinstance(error, ProgrammingError):
        return CatalogReadOperationFailure
    return CatalogReadOperationFailure


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
