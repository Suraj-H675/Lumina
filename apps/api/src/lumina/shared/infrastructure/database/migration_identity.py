"""Secret-safe pairing of migration and runtime PostgreSQL identities."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from pydantic import SecretStr
from sqlalchemy import URL

from .target import DatabaseTargetError, parse_database_url, validate_database_target

_ROLE_PATTERN = re.compile(r"[a-z][a-z0-9_]{0,62}", re.ASCII)
_SAFE_ERROR = "Migration database identity is invalid."


class MigrationIdentityError(ValueError):
    """Raised when migration and runtime database identities cannot be paired safely."""


@dataclass(frozen=True, repr=False)
class MigrationIdentity:
    """Validated URLs and role names for one database migration invocation."""

    migration_url: URL = field(repr=False)
    runtime_url: URL = field(repr=False)
    migration_role: str = field(repr=False)
    runtime_role: str = field(repr=False)


def migration_identity_from_secrets(
    migration_url: SecretStr,
    runtime_url: SecretStr,
) -> MigrationIdentity:
    """Parse secret settings into a validated, redacted migration identity."""
    try:
        parsed_migration, _ = parse_database_url(
            migration_url.get_secret_value(),
            drivername="postgresql+psycopg",
        )
        parsed_runtime, _ = parse_database_url(
            runtime_url.get_secret_value(),
            drivername="postgresql+asyncpg",
        )
    except DatabaseTargetError:
        raise MigrationIdentityError(_SAFE_ERROR) from None
    return validate_migration_identity(parsed_migration, parsed_runtime)


def validate_migration_identity(migration_url: URL, runtime_url: URL) -> MigrationIdentity:
    """Require one unambiguous database target and a safely bounded runtime role."""
    try:
        migration_target = validate_database_target(
            migration_url,
            drivername="postgresql+psycopg",
        )
        runtime_target = validate_database_target(
            runtime_url,
            drivername="postgresql+asyncpg",
        )
    except DatabaseTargetError:
        raise MigrationIdentityError(_SAFE_ERROR) from None

    migration_role = migration_target.username
    runtime_role = runtime_target.username
    same_target = (
        migration_target.host == runtime_target.host
        and migration_target.port == runtime_target.port
        and migration_target.database == runtime_target.database
    )
    if (
        not same_target
        or migration_role == runtime_role
        or _ROLE_PATTERN.fullmatch(migration_role) is None
        or _ROLE_PATTERN.fullmatch(runtime_role) is None
    ):
        raise MigrationIdentityError(_SAFE_ERROR)

    return MigrationIdentity(
        migration_url=migration_url,
        runtime_url=runtime_url,
        migration_role=migration_role,
        runtime_role=runtime_role,
    )
