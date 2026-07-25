#!/usr/bin/env python3
"""Atomically create the ignored local database configuration exactly once."""

from __future__ import annotations

import os
import secrets
import subprocess
import sys
from collections.abc import Callable
from contextlib import suppress
from enum import Enum
from pathlib import Path
from typing import Final

# This is Compose's explicitly pinned physical volume name, not a project-scoped derivation.
_COMPOSE_VOLUME_NAME: Final = "lumina_lumina_postgres_data"
_EXACT_VOLUME_NOT_FOUND: Final = (
    f"Error response from daemon: get {_COMPOSE_VOLUME_NAME}: no such volume"
)


class ExistingLocalDatabaseVolumeError(RuntimeError):
    """Raised when credentials cannot safely be recreated for an initialized local database."""


class VolumeInspection(Enum):
    """Authoritative outcome of inspecting the exact local Compose volume."""

    EXISTS = "exists"
    ABSENT = "absent"
    INSPECTION_FAILED = "inspection_failed"


class LocalDatabaseInspectionError(RuntimeError):
    """Raised when Docker cannot authoritatively inspect the exact local volume."""


def _run_docker(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        check=False,
    )


def inspect_local_database_volume(
    run: Callable[[list[str]], subprocess.CompletedProcess[str]] = _run_docker,
) -> VolumeInspection:
    """Inspect the explicit Compose volume, refusing to confuse failure with absence."""
    try:
        daemon = run(["docker", "info", "--format", "{{.ServerVersion}}"])
        if daemon.returncode != 0 or not daemon.stdout.strip():
            return VolumeInspection.INSPECTION_FAILED
        inspected = run(
            ["docker", "volume", "inspect", _COMPOSE_VOLUME_NAME, "--format", "{{.Name}}"]
        )
        if inspected.returncode == 0:
            return (
                VolumeInspection.EXISTS
                if inspected.stdout == f"{_COMPOSE_VOLUME_NAME}\n" and not inspected.stderr
                else VolumeInspection.INSPECTION_FAILED
            )
        if (
            inspected.returncode == 1
            and not inspected.stdout
            and inspected.stderr in {_EXACT_VOLUME_NOT_FOUND, f"{_EXACT_VOLUME_NOT_FOUND}\n"}
        ):
            return VolumeInspection.ABSENT
    except (OSError, subprocess.SubprocessError):
        return VolumeInspection.INSPECTION_FAILED
    return VolumeInspection.INSPECTION_FAILED


def _content() -> str:
    secrets_by_name = {
        "POSTGRES_PASSWORD": secrets.token_hex(32),
        "POSTGRES_RUNTIME_PASSWORD": secrets.token_hex(32),
        "POSTGRES_MIGRATION_PASSWORD": secrets.token_hex(32),
        "POSTGRES_TEST_RUNTIME_PASSWORD": secrets.token_hex(32),
        "POSTGRES_TEST_MIGRATION_PASSWORD": secrets.token_hex(32),
    }
    lines = [
        "LUMINA_ENV=development",
        "LUMINA_LOG_LEVEL=INFO",
        "LUMINA_API_HOST=127.0.0.1",
        "LUMINA_API_PORT=8000",
        "LUMINA_CORS_ORIGINS=",
        "POSTGRES_HOST_PORT=5432",
        *(f"{name}={value}" for name, value in secrets_by_name.items()),
        "LUMINA_DATABASE_URL=postgresql+asyncpg://lumina_app:${POSTGRES_RUNTIME_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina",
        "LUMINA_DATABASE_SYNC_URL=postgresql+psycopg://lumina_migrate:${POSTGRES_MIGRATION_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina",
        "LUMINA_TEST_DATABASE_URL=postgresql+asyncpg://lumina_test_app:${POSTGRES_TEST_RUNTIME_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina_test",
        "LUMINA_TEST_DATABASE_SYNC_URL=postgresql+psycopg://lumina_test_migrate:${POSTGRES_TEST_MIGRATION_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina_test",
        "",
    ]
    return "\n".join(lines)


def create_local_env(
    repository_root: Path,
    *,
    volume_inspection: Callable[[], VolumeInspection] = inspect_local_database_volume,
) -> bool:
    """Create `.env` with mode 0600, atomically, without replacing an existing file."""
    destination = repository_root / ".env"
    if destination.exists():
        return False
    inspection = volume_inspection()
    if inspection is VolumeInspection.EXISTS:
        raise ExistingLocalDatabaseVolumeError(
            "A local PostgreSQL volume exists but .env is missing. Restore the matching .env or "
            "follow the documented manual recovery procedure before continuing."
        )
    if inspection is not VolumeInspection.ABSENT:
        raise LocalDatabaseInspectionError(
            "Docker could not inspect the local PostgreSQL volume. Start Docker or restore access "
            "before creating .env."
        )

    old_umask = os.umask(0o077)
    temporary = repository_root / f".env.{os.getpid()}.{secrets.token_hex(8)}.tmp"
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(_content())
                stream.flush()
                os.fsync(stream.fileno())
        except BaseException:
            with suppress(FileNotFoundError):
                temporary.unlink()
            raise
        try:
            os.link(temporary, destination)
        except FileExistsError:
            return False
        finally:
            with suppress(FileNotFoundError):
                temporary.unlink()
        directory_descriptor = os.open(repository_root, os.O_RDONLY)
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
        return True
    finally:
        os.umask(old_umask)


def main(
    repository_root: Path | None = None,
    *,
    volume_inspection: Callable[[], VolumeInspection] = inspect_local_database_volume,
) -> int:
    """Create the repository-local `.env` without disclosing its contents."""
    resolved_root = repository_root or Path(__file__).resolve().parents[2]
    try:
        create_local_env(resolved_root, volume_inspection=volume_inspection)
    except (ExistingLocalDatabaseVolumeError, LocalDatabaseInspectionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except OSError:
        print("error: could not create the local environment file safely", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
