"""Local credentials are generated only once and stay private."""

from __future__ import annotations

import importlib.util
import os
import re
import stat
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Protocol, cast

import pytest


class _EnvCreator(Protocol):
    def create_local_env(
        self, repository_root: Path, *, volume_inspection: Callable[[], object] = ...
    ) -> bool: ...

    def main(
        self, repository_root: Path, *, volume_inspection: Callable[[], object] = ...
    ) -> int: ...

    def inspect_local_database_volume(
        self, run: Callable[[list[str]], subprocess.CompletedProcess[str]]
    ) -> object: ...


class _Inspection(Protocol):
    value: str


def _module() -> _EnvCreator:
    path = Path(__file__).resolve().parents[3] / "scripts/bootstrap/create_local_env.py"
    spec = importlib.util.spec_from_file_location("create_local_env", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return cast(_EnvCreator, module)


def _value(inspection: object) -> str:
    return cast(_Inspection, inspection).value


def _result(
    command: list[str], returncode: int = 0, stdout: str = "", stderr: str = ""
) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess(command, returncode, stdout, stderr)


def _runner(
    responses: list[subprocess.CompletedProcess[str] | OSError | subprocess.SubprocessError],
) -> Callable[[list[str]], subprocess.CompletedProcess[str]]:
    iterator = iter(responses)

    def run(command: list[str]) -> subprocess.CompletedProcess[str]:
        response = next(iterator)
        if isinstance(response, (OSError, subprocess.SubprocessError)):
            raise response
        return response

    return run


def test_create_local_env_is_private_complete_and_idempotent(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    module = _module()
    monkeypatch.setenv("COMPOSE_PROJECT_NAME", "another_project")
    absent = module.inspect_local_database_volume(
        _runner(
            [
                _result(["docker", "info"], stdout="29.6.1\n"),
                _result(
                    ["docker", "volume", "inspect"],
                    returncode=1,
                    stderr=(
                        "Error response from daemon: get lumina_lumina_postgres_data: "
                        "no such volume\n"
                    ),
                ),
            ]
        )
    )
    assert _value(absent) == "absent"
    assert module.create_local_env(tmp_path, volume_inspection=lambda: absent)
    env_file = tmp_path / ".env"
    first = env_file.read_text(encoding="utf-8")

    assert stat.S_IMODE(env_file.stat().st_mode) == 0o600
    assert not module.create_local_env(tmp_path, volume_inspection=lambda: object())
    assert env_file.read_text(encoding="utf-8") == first
    passwords = re.findall(r"^POSTGRES(?:_[A-Z]+)*=([0-9a-f]{64})$", first, re.MULTILINE)
    assert len(passwords) == 5
    assert len(set(passwords)) == 5


def test_existing_env_is_preserved_without_volume_inspection(tmp_path: Path) -> None:
    module = _module()
    env_file = tmp_path / ".env"
    original = "LUMINA_ENV=development\n"
    env_file.write_text(original, encoding="utf-8")

    assert not module.create_local_env(
        tmp_path,
        volume_inspection=lambda: (_ for _ in ()).throw(AssertionError("not inspected")),
    )
    assert env_file.read_text(encoding="utf-8") == original


def test_existing_volume_without_env_refuses_without_disclosing_credentials(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _module()
    monkeypatch.setenv("COMPOSE_PROJECT_NAME", "another_project")
    exists = module.inspect_local_database_volume(
        _runner(
            [
                _result(["docker", "info"], stdout="29.6.1\n"),
                _result(
                    ["docker", "volume", "inspect"],
                    stdout="lumina_lumina_postgres_data\n",
                ),
            ]
        )
    )
    secret = "a" * 64
    url = f"postgresql+asyncpg://lumina_app:{secret}@127.0.0.1:5432/lumina"

    assert module.main(tmp_path, volume_inspection=lambda: exists) == 1
    captured = capsys.readouterr()

    assert "Restore the matching .env" in captured.err
    assert secret not in captured.out + captured.err
    assert url not in captured.out + captured.err
    assert not (tmp_path / ".env").exists()


@pytest.mark.parametrize(
    ("responses", "description"),
    [
        ([_result(["docker", "info"], returncode=1, stderr="permission denied")], "permission"),
        ([_result(["docker", "info"], returncode=1, stderr="daemon unavailable")], "daemon"),
        ([FileNotFoundError("docker")], "missing executable"),
        (
            [
                _result(["docker", "info"], stdout="29.6.1\n"),
                _result(["docker", "volume", "inspect"], stdout="wrong-volume\n"),
            ],
            "malformed inspect output",
        ),
        (
            [
                _result(["docker", "info"], stdout="29.6.1\n"),
                _result(
                    ["docker", "volume", "inspect"],
                    returncode=1,
                    stderr=(
                        "Error response from daemon: get lumina_lumina_postgres_data: "
                        "no such volume\n\n"
                    ),
                ),
            ],
            "malformed not-found output",
        ),
        (
            [
                _result(["docker", "info"], stdout="29.6.1\n"),
                _result(
                    ["docker", "volume", "inspect"], returncode=1, stderr="context unavailable"
                ),
            ],
            "failed exact inspection",
        ),
    ],
)
def test_volume_inspection_failures_refuse_credential_generation(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    responses: list[subprocess.CompletedProcess[str] | OSError | subprocess.SubprocessError],
    description: str,
) -> None:
    module = _module()
    inspection = module.inspect_local_database_volume(_runner(responses))
    assert _value(inspection) == "inspection_failed", description

    assert module.main(tmp_path, volume_inspection=lambda: inspection) == 1
    captured = capsys.readouterr()
    output = captured.out + captured.err
    assert "Docker could not inspect" in output
    assert "postgresql://" not in output
    assert "a" * 64 not in output
    assert not (tmp_path / ".env").exists()


def test_exact_volume_not_found_is_authoritative_absence() -> None:
    module = _module()
    inspection = module.inspect_local_database_volume(
        _runner(
            [
                _result(["docker", "info"], stdout="29.6.1\n"),
                _result(
                    ["docker", "volume", "inspect"],
                    returncode=1,
                    stderr=(
                        "Error response from daemon: get lumina_lumina_postgres_data: "
                        "no such volume\n"
                    ),
                ),
            ]
        )
    )
    assert _value(inspection) == "absent"


@pytest.mark.parametrize("listed_volume", ["", "lumina_lumina_postgres_data\n"])
def test_denied_exact_inspection_never_falls_back_to_volume_listing(listed_volume: str) -> None:
    module = _module()
    calls: list[list[str]] = []
    responses = iter(
        [
            _result(["docker", "info"], stdout="29.6.1\n"),
            _result(["docker", "volume", "inspect"], returncode=1, stderr="permission denied"),
            _result(["docker", "volume", "ls"], stdout=listed_volume),
        ]
    )

    def run(command: list[str]) -> subprocess.CompletedProcess[str]:
        calls.append(command)
        return next(responses)

    assert _value(module.inspect_local_database_volume(run)) == "inspection_failed"
    assert calls == [
        ["docker", "info", "--format", "{{.ServerVersion}}"],
        [
            "docker",
            "volume",
            "inspect",
            "lumina_lumina_postgres_data",
            "--format",
            "{{.Name}}",
        ],
    ]


@pytest.mark.parametrize(
    "response",
    [
        _result(["docker", "info"], returncode=1, stderr="daemon unavailable"),
        _result(["docker", "info"], returncode=1, stderr="invalid context"),
        subprocess.TimeoutExpired(["docker", "info"], timeout=1),
    ],
)
def test_unavailable_docker_inspection_fails_closed(
    response: subprocess.CompletedProcess[str] | subprocess.SubprocessError,
) -> None:
    module = _module()
    assert _value(module.inspect_local_database_volume(_runner([response]))) == "inspection_failed"


def _validation_harness(tmp_path: Path) -> Path:
    source = (
        Path(__file__).resolve().parents[3] / "infra/docker/postgres/010-ensure-lumina-databases.sh"
    ).read_text(encoding="utf-8")
    function_source = source.split("for secret_name", maxsplit=1)[0]
    harness = tmp_path / "validate-secret.sh"
    harness.write_text(f"{function_source}\nrequire_secret POSTGRES_PASSWORD\n", encoding="utf-8")
    harness.chmod(0o700)
    return harness


@pytest.mark.parametrize(
    ("value", "expected_success"),
    [
        ("a" * 64, True),
        ("A" * 64, True),
        ("a" * 63, False),
        ("a" * 65, False),
        ("g" + "a" * 63, False),
        ("a" * 63 + "g", False),
        ("a" * 64 + "\n", False),
        ("a" * 64 + "\n\n", False),
        ("a" * 64 + "\r\n", False),
        ("a" * 63 + " ", False),
        ("a" * 63 + "\t", False),
        ("a" * 63 + "'", False),
        ("a" * 63 + "\\", False),
    ],
)
def test_postgres_secret_validation_requires_exact_hexadecimal_bytes(
    tmp_path: Path, value: str, expected_success: bool
) -> None:
    completed = subprocess.run(
        ["bash", str(_validation_harness(tmp_path))],
        env={**os.environ, "POSTGRES_PASSWORD": value},
        capture_output=True,
        text=True,
        check=False,
    )

    assert (completed.returncode == 0) is expected_success


def test_healthcheck_fails_when_role_database_predicate_is_false(tmp_path: Path) -> None:
    binary_directory = tmp_path / "bin"
    binary_directory.mkdir()
    for name, content in {
        "pg_isready": "#!/bin/sh\nexit 0\n",
        "psql": "#!/bin/sh\nprintf 'f\\n'\n",
    }.items():
        binary = binary_directory / name
        binary.write_text(content, encoding="utf-8")
        binary.chmod(0o700)
    script = Path(__file__).resolve().parents[3] / "infra/docker/postgres/healthcheck.sh"

    completed = subprocess.run(
        ["sh", str(script)],
        env={
            **os.environ,
            "PATH": f"{binary_directory}:{os.environ['PATH']}",
            "POSTGRES_PASSWORD": "a" * 64,
        },
        capture_output=True,
        text=True,
        check=False,
    )

    assert completed.returncode != 0
    assert completed.stdout == ""
