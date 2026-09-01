"""Static safety checks for the only local Compose service."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import cast

import pytest

_CANONICAL_VOLUME_NAME = "lumina_lumina_postgres_data"
_COMPOSE_ENVIRONMENT = {
    "POSTGRES_PASSWORD": "0" * 64,
    "POSTGRES_RUNTIME_PASSWORD": "1" * 64,
    "POSTGRES_MIGRATION_PASSWORD": "2" * 64,
    "POSTGRES_TEST_RUNTIME_PASSWORD": "3" * 64,
    "POSTGRES_TEST_MIGRATION_PASSWORD": "4" * 64,
    "POSTGRES_CATALOG_OPERATOR_PASSWORD": "5" * 64,
    "POSTGRES_TEST_CATALOG_OPERATOR_PASSWORD": "6" * 64,
    "POSTGRES_HOST_PORT": "15432",
}


def _render_compose(
    *,
    environment_project: str | None = None,
    cli_project: str | None = None,
    physical_volume_name: str | None = None,
) -> dict[str, object]:
    environment = {**os.environ, **_COMPOSE_ENVIRONMENT}
    environment.pop("COMPOSE_PROJECT_NAME", None)
    environment.pop("COMPOSE_POSTGRES_VOLUME_NAME", None)
    if environment_project is not None:
        environment["COMPOSE_PROJECT_NAME"] = environment_project
    if physical_volume_name is not None:
        environment["COMPOSE_POSTGRES_VOLUME_NAME"] = physical_volume_name
    command = ["docker", "compose", "--env-file", ".env.example"]
    if cli_project is not None:
        command.extend(["-p", cli_project])
    command.extend(["config", "--format", "json"])
    completed = subprocess.run(
        command,
        cwd=Path(__file__).resolve().parents[3],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    assert completed.returncode == 0, "Sentinel-only Compose rendering failed."
    rendered: object = json.loads(completed.stdout)
    assert isinstance(rendered, dict)
    return cast(dict[str, object], rendered)


def test_compose_is_single_loopback_pinned_postgres_service() -> None:
    content = (Path(__file__).resolve().parents[3] / "compose.yaml").read_text(encoding="utf-8")

    assert "  db:" in content
    assert (
        "postgres:18.4@sha256:3a82e1f56c8f0f5616a11103ac3d47e632c3938698946a7ad26da0df1334744a"
        in content
    )
    assert "host_ip: 127.0.0.1" in content
    assert "/var/lib/postgresql" in content
    assert "scram-sha-256" in content
    assert "name: lumina" in content
    assert "    name: ${COMPOSE_POSTGRES_VOLUME_NAME:-lumina_lumina_postgres_data}" in content
    assert "lumina-postgres-healthcheck" in content
    assert "POSTGRES_HOST_AUTH_METHOD=trust" not in content
    for forbidden in ("supabase", "worker:", "api:"):
        assert forbidden not in content.lower()


@pytest.mark.parametrize(
    ("environment_project", "cli_project"),
    [
        pytest.param(None, None, id="default-project"),
        pytest.param("another_project", None, id="environment-project-override"),
        pytest.param(None, "another_project", id="cli-project-override"),
    ],
)
def test_compose_project_overrides_preserve_canonical_physical_volume(
    environment_project: str | None,
    cli_project: str | None,
) -> None:
    rendered = _render_compose(
        environment_project=environment_project,
        cli_project=cli_project,
    )

    assert rendered["volumes"] == {"lumina_postgres_data": {"name": _CANONICAL_VOLUME_NAME}}
    services = rendered["services"]
    assert isinstance(services, dict)
    database_service = services["db"]
    assert isinstance(database_service, dict)
    database_mounts = database_service["volumes"]
    assert isinstance(database_mounts, list)
    assert {
        "type": "volume",
        "source": "lumina_postgres_data",
        "target": "/var/lib/postgresql",
        "volume": {},
    } in database_mounts


def test_compose_candidate_override_uses_only_isolated_physical_volume() -> None:
    project = "lumina_public_candidate_0123456789abcdef"
    candidate_volume = f"{project}_postgres_data"
    rendered = _render_compose(
        environment_project=project,
        cli_project=project,
        physical_volume_name=candidate_volume,
    )

    assert rendered["name"] == project
    assert rendered["volumes"] == {"lumina_postgres_data": {"name": candidate_volume}}
    assert _CANONICAL_VOLUME_NAME not in json.dumps(rendered["volumes"], sort_keys=True)
    services = rendered["services"]
    assert isinstance(services, dict)
    database_service = services["db"]
    assert isinstance(database_service, dict)
    assert database_service["ports"] == [
        {
            "mode": "ingress",
            "target": 5432,
            "published": "15432",
            "protocol": "tcp",
            "host_ip": "127.0.0.1",
        }
    ]
