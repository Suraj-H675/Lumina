"""Alembic environment using only the synchronous, privileged configuration."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from lumina.settings import load_migration_settings
from lumina.shared.infrastructure.database.migration_identity import (
    MigrationIdentity,
    migration_identity_from_secrets,
)
from sqlalchemy import Connection, create_engine
from sqlalchemy.pool import NullPool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def _identity() -> MigrationIdentity:
    injected = config.attributes.get("migration_identity")
    if isinstance(injected, MigrationIdentity):
        return injected
    settings = load_migration_settings()
    return migration_identity_from_secrets(settings.database_sync_url, settings.database_url)


def run_migrations_offline() -> None:
    """Configure offline migrations; revision 0002 itself refuses offline ACL changes."""
    identity = _identity()
    config.attributes["migration_identity"] = identity
    context.configure(
        url=identity.migration_url,
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations with a non-pooled synchronous connection."""
    identity = _identity()
    config.attributes["migration_identity"] = identity
    supplied_connection = config.attributes.get("connection")
    if isinstance(supplied_connection, Connection):
        context.configure(connection=supplied_connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return
    connectable = create_engine(identity.migration_url, poolclass=NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
