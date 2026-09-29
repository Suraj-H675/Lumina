"""Shared PostgreSQL failure classification for job persistence adapters."""

from __future__ import annotations

from enum import Enum, auto

from sqlalchemy.exc import (
    DBAPIError,
    IntegrityError,
    OperationalError,
    ProgrammingError,
    SQLAlchemyError,
)
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError

_LOCK_TIMEOUT_SQLSTATE = "55P03"
_QUERY_CANCELLED_SQLSTATE = "57014"
_STATE_SQLSTATE_CLASSES = frozenset({"23"})
_PROGRAMMING_SQLSTATE_CLASSES = frozenset({"0A", "2F", "3F", "42"})
_CONNECTION_SQLSTATE_CLASS = "08"


class DatabasePhase(Enum):
    """Lifecycle phase used to interpret transport failures safely."""

    CONNECTION = auto()
    OPERATION = auto()
    EXIT = auto()


class DatabaseFailureKind(Enum):
    """Failure categories mapped to job-domain errors by each adapter."""

    STORAGE_UNAVAILABLE = auto()
    CONTENTION = auto()
    STATE = auto()
    PROGRAMMING = auto()
    OPERATION = auto()


def classify_database_failure(
    error: SQLAlchemyError,
    phase: DatabasePhase,
    *,
    timeout_installed: bool,
) -> DatabaseFailureKind:
    """Classify SQLAlchemy failures without exposing raw driver detail to callers."""
    sqlstate = _database_sqlstate(error) if isinstance(error, DBAPIError) else None
    if isinstance(error, DBAPIError) and (
        error.connection_invalidated
        or (sqlstate is not None and sqlstate.startswith(_CONNECTION_SQLSTATE_CLASS))
    ):
        return DatabaseFailureKind.STORAGE_UNAVAILABLE
    if (
        isinstance(error, DBAPIError)
        and timeout_installed
        and (
            sqlstate == _LOCK_TIMEOUT_SQLSTATE
            or (sqlstate == _QUERY_CANCELLED_SQLSTATE and _is_configured_statement_timeout(error))
        )
    ):
        return DatabaseFailureKind.CONTENTION
    if isinstance(error, IntegrityError):
        return DatabaseFailureKind.STATE
    if sqlstate is not None and sqlstate[:2] in _STATE_SQLSTATE_CLASSES:
        return DatabaseFailureKind.STATE
    if isinstance(error, ProgrammingError):
        return DatabaseFailureKind.PROGRAMMING
    if sqlstate is not None and sqlstate[:2] in _PROGRAMMING_SQLSTATE_CLASSES:
        return DatabaseFailureKind.PROGRAMMING
    if phase is DatabasePhase.CONNECTION and isinstance(
        error,
        OperationalError | SQLAlchemyTimeoutError,
    ):
        return DatabaseFailureKind.STORAGE_UNAVAILABLE
    return DatabaseFailureKind.OPERATION


def _is_configured_statement_timeout(error: DBAPIError) -> bool:
    return "statement timeout" in str(error.orig).lower()


def _database_sqlstate(error: DBAPIError) -> str | None:
    sqlstate = getattr(error.orig, "sqlstate", None)
    return sqlstate if isinstance(sqlstate, str) else None
