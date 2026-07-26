"""Evidence-sensitive claim database error classification tests."""

from __future__ import annotations

import pytest
from lumina.jobs.domain.models import (
    JobClaimContention,
    JobClaimDatabaseOperationFailure,
    JobClaimStorageUnavailable,
)
from lumina.jobs.infrastructure.postgresql.claim import (
    _classify_database_failure,
    _DatabasePhase,
)
from sqlalchemy.exc import DBAPIError, OperationalError

_SQL_SENTINEL = "SELECT CLAIM-ERROR-SQL-SENTINEL"


class _DriverFailure(Exception):
    def __init__(self, sqlstate: str, message: str) -> None:
        super().__init__(message)
        self.sqlstate = sqlstate


def _error(sqlstate: str, message: str, *, invalidated: bool = False) -> DBAPIError:
    return OperationalError(
        _SQL_SENTINEL,
        {"secret": "CLAIM-ERROR-PARAMETER-SENTINEL"},
        _DriverFailure(sqlstate, message),
        connection_invalidated=invalidated,
    )


@pytest.mark.parametrize(
    ("error", "timeout_installed", "expected"),
    [
        (
            _error("57014", "canceling statement due to statement timeout"),
            True,
            JobClaimContention,
        ),
        (
            _error("57014", "canceling statement due to user request"),
            True,
            JobClaimDatabaseOperationFailure,
        ),
        (
            _error("57014", "canceling statement due to statement timeout"),
            False,
            JobClaimDatabaseOperationFailure,
        ),
        (
            _error("55P03", "canceling statement due to lock timeout"),
            True,
            JobClaimContention,
        ),
        (
            _error("55P03", "could not obtain lock"),
            False,
            JobClaimDatabaseOperationFailure,
        ),
        (
            _error(
                "55P03",
                "canceling statement due to lock timeout",
                invalidated=True,
            ),
            True,
            JobClaimStorageUnavailable,
        ),
        (
            _error(
                "57014",
                "canceling statement due to statement timeout",
                invalidated=True,
            ),
            True,
            JobClaimStorageUnavailable,
        ),
        (
            _error("08006", "connection failure"),
            True,
            JobClaimStorageUnavailable,
        ),
    ],
)
def test_classification_requires_positive_timeout_or_connectivity_evidence(
    error: DBAPIError,
    timeout_installed: bool,
    expected: type[RuntimeError],
) -> None:
    assert (
        _classify_database_failure(
            error,
            _DatabasePhase.OPERATION,
            timeout_installed=timeout_installed,
        )
        is expected
    )
