#!/usr/bin/env python3
"""Atomically create ignored local or isolated test database configuration once."""

from __future__ import annotations

import os
import re
import secrets
import socket
import subprocess
import sys
from collections.abc import Callable, Sequence
from contextlib import suppress
from enum import Enum
from pathlib import Path
from typing import Final, cast

# This is Compose's explicitly pinned physical volume name, not a project-scoped derivation.
_CANONICAL_COMPOSE_VOLUME_NAME: Final = "lumina_lumina_postgres_data"
_CANDIDATE_PROJECT_PREFIX: Final = "lumina_public_candidate_"
_CANDIDATE_PROJECT_PATTERN: Final = re.compile(r"lumina_public_candidate_[0-9a-f]{16}")
_DEFAULT_POSTGRES_HOST_PORT: Final = 5432
_PASSWORD_NAMES: Final = (
    "POSTGRES_PASSWORD",
    "POSTGRES_RUNTIME_PASSWORD",
    "POSTGRES_MIGRATION_PASSWORD",
    "POSTGRES_TEST_RUNTIME_PASSWORD",
    "POSTGRES_TEST_MIGRATION_PASSWORD",
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


def inspect_database_volume(
    volume_name: str,
    run: Callable[[list[str]], subprocess.CompletedProcess[str]] = _run_docker,
) -> VolumeInspection:
    """Inspect one exact Compose volume, refusing to confuse failure with absence."""
    exact_volume_not_found = f"Error response from daemon: get {volume_name}: no such volume"
    try:
        daemon = run(["docker", "info", "--format", "{{.ServerVersion}}"])
        if daemon.returncode != 0 or not daemon.stdout.strip():
            return VolumeInspection.INSPECTION_FAILED
        inspected = run(["docker", "volume", "inspect", volume_name, "--format", "{{.Name}}"])
        if inspected.returncode == 0:
            return (
                VolumeInspection.EXISTS
                if inspected.stdout == f"{volume_name}\n" and not inspected.stderr
                else VolumeInspection.INSPECTION_FAILED
            )
        if (
            inspected.returncode == 1
            and inspected.stdout in {"", "\n"}
            and inspected.stderr in {exact_volume_not_found, f"{exact_volume_not_found}\n"}
        ):
            return VolumeInspection.ABSENT
    except (OSError, subprocess.SubprocessError):
        return VolumeInspection.INSPECTION_FAILED
    return VolumeInspection.INSPECTION_FAILED


def inspect_local_database_volume(
    run: Callable[[list[str]], subprocess.CompletedProcess[str]] = _run_docker,
) -> VolumeInspection:
    """Inspect the canonical local-development Compose volume."""
    return inspect_database_volume(_CANONICAL_COMPOSE_VOLUME_NAME, run)


def _new_credentials() -> dict[str, str]:
    """Generate five independently named, pairwise-distinct PostgreSQL credentials."""
    credentials: dict[str, str] = {}
    used_values: set[str] = set()
    for name in _PASSWORD_NAMES:
        value = secrets.token_hex(32)
        while value in used_values:
            value = secrets.token_hex(32)
        credentials[name] = value
        used_values.add(value)
    return credentials


def _content(
    *,
    environment: str,
    postgres_host_port: int,
    compose_project_name: str | None = None,
    compose_volume_name: str | None = None,
) -> str:
    secrets_by_name = _new_credentials()
    isolation_lines: tuple[str, ...] = ()
    if compose_project_name is not None and compose_volume_name is not None:
        isolation_lines = (
            f"COMPOSE_PROJECT_NAME={compose_project_name}",
            f"COMPOSE_POSTGRES_VOLUME_NAME={compose_volume_name}",
        )
    lines = [
        f"LUMINA_ENV={environment}",
        *isolation_lines,
        "LUMINA_LOG_LEVEL=INFO",
        "LUMINA_API_HOST=127.0.0.1",
        "LUMINA_API_PORT=8000",
        "LUMINA_CORS_ORIGINS=",
        f"POSTGRES_HOST_PORT={postgres_host_port}",
        *(f"{name}={value}" for name, value in secrets_by_name.items()),
        "LUMINA_DATABASE_URL=postgresql+asyncpg://lumina_app:${POSTGRES_RUNTIME_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina",
        "LUMINA_DATABASE_SYNC_URL=postgresql+psycopg://lumina_migrate:${POSTGRES_MIGRATION_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina",
        "LUMINA_TEST_DATABASE_URL=postgresql+asyncpg://lumina_test_app:${POSTGRES_TEST_RUNTIME_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina_test",
        "LUMINA_TEST_DATABASE_SYNC_URL=postgresql+psycopg://lumina_test_migrate:${POSTGRES_TEST_MIGRATION_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/lumina_test",
        "",
    ]
    return "\n".join(lines)


def select_available_loopback_port() -> int:
    """Ask the operating system for an available non-default loopback TCP port."""
    while True:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.bind(("127.0.0.1", 0))
            address = cast(tuple[str, int], listener.getsockname())
        if address[1] != _DEFAULT_POSTGRES_HOST_PORT:
            return address[1]


def _destination_exists(repository_root: Path) -> bool:
    destination = repository_root / ".env"
    return destination.exists() or destination.is_symlink()


def _write_environment(repository_root: Path, content: str) -> bool:
    """Privately publish complete environment content without replacing an existing path."""
    destination = repository_root / ".env"
    if _destination_exists(repository_root):
        return False

    old_umask = os.umask(0o077)
    temporary = repository_root / f".env.{os.getpid()}.{secrets.token_hex(8)}.tmp"
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as stream:
                stream.write(content)
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


def create_local_env(
    repository_root: Path,
    *,
    volume_inspection: Callable[[], VolumeInspection] = inspect_local_database_volume,
) -> bool:
    """Create `.env` with mode 0600, atomically, without replacing an existing file."""
    if _destination_exists(repository_root):
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
    return _write_environment(
        repository_root,
        _content(
            environment="development",
            postgres_host_port=_DEFAULT_POSTGRES_HOST_PORT,
        ),
    )


def create_ephemeral_candidate_env(
    repository_root: Path,
    *,
    volume_inspection: Callable[[str], VolumeInspection] = inspect_database_volume,
    host_port_selector: Callable[[], int] = select_available_loopback_port,
) -> bool:
    """Create an isolated mode-0600 test environment for a disposable candidate checkout."""
    if _destination_exists(repository_root):
        return False

    project_name = f"{_CANDIDATE_PROJECT_PREFIX}{secrets.token_hex(8)}"
    if _CANDIDATE_PROJECT_PATTERN.fullmatch(project_name) is None:
        raise LocalDatabaseInspectionError(
            "The isolated Compose identity could not be generated safely."
        )
    volume_name = f"{project_name}_postgres_data"
    inspection = volume_inspection(volume_name)
    if inspection is VolumeInspection.EXISTS:
        raise ExistingLocalDatabaseVolumeError(
            "An isolated candidate PostgreSQL volume already exists. Refusing to create .env."
        )
    if inspection is not VolumeInspection.ABSENT:
        raise LocalDatabaseInspectionError(
            "Docker could not inspect the isolated PostgreSQL volume. Start Docker or restore "
            "access before creating .env."
        )

    host_port = host_port_selector()
    if not 1 <= host_port <= 65535 or host_port == _DEFAULT_POSTGRES_HOST_PORT:
        raise LocalDatabaseInspectionError(
            "An isolated loopback PostgreSQL port could not be selected safely."
        )
    return _write_environment(
        repository_root,
        _content(
            environment="test",
            postgres_host_port=host_port,
            compose_project_name=project_name,
            compose_volume_name=volume_name,
        ),
    )


def main(
    repository_root: Path | None = None,
    *,
    ephemeral_candidate: bool = False,
    volume_inspection: Callable[[], VolumeInspection] = inspect_local_database_volume,
    candidate_volume_inspection: Callable[[str], VolumeInspection] = inspect_database_volume,
    candidate_host_port_selector: Callable[[], int] = select_available_loopback_port,
) -> int:
    """Create the repository-local `.env` without disclosing its contents."""
    resolved_root = repository_root or Path(__file__).resolve().parents[2]
    try:
        if ephemeral_candidate:
            create_ephemeral_candidate_env(
                resolved_root,
                volume_inspection=candidate_volume_inspection,
                host_port_selector=candidate_host_port_selector,
            )
        else:
            create_local_env(resolved_root, volume_inspection=volume_inspection)
    except (ExistingLocalDatabaseVolumeError, LocalDatabaseInspectionError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    except OSError:
        print("error: could not create the local environment file safely", file=sys.stderr)
        return 1
    return 0


def cli(argv: Sequence[str] | None = None) -> int:
    """Accept only the canonical default or the explicit isolated-candidate mode."""
    arguments = tuple(sys.argv[1:] if argv is None else argv)
    if not arguments:
        return main()
    if arguments == ("--ephemeral-candidate",):
        return main(ephemeral_candidate=True)
    print("error: expected no arguments or --ephemeral-candidate", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(cli())
