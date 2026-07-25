"""Alembic environment using only the synchronous, privileged configuration."""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from lumina.settings import load_migration_settings
from sqlalchemy import Connection, engine_from_config, pool

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = None


def _url() -> str:
    injected = config.attributes.get("sync_url")
    if isinstance(injected, str):
        return injected
    return load_migration_settings().database_sync_url.get_secret_value()


def run_migrations_offline() -> None:
    """Generate SQL with the validated Psycopg connection URL."""
    context.configure(url=_url(), target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Apply migrations with a non-pooled synchronous connection."""
    supplied_connection = config.attributes.get("connection")
    if isinstance(supplied_connection, Connection):
        context.configure(connection=supplied_connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
        return
    connectable = engine_from_config(
        {"sqlalchemy.url": _url()},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
