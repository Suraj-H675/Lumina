"""Migration/runtime URL pairing is strict and secret-safe."""

from __future__ import annotations

from hashlib import sha256
from pathlib import Path

import pytest
from lumina.shared.infrastructure.database.migration_identity import (
    MigrationIdentityError,
    migration_identity_from_secrets,
    validate_migration_identity,
)
from pydantic import SecretStr
from sqlalchemy import URL

_PROTECTED_MIGRATION_HASHES = {
    "0001_create_job.py": "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b",
    "0002_grant_job_runtime_dml.py": (
        "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889"
    ),
    "d502b5935120_create_catalog_identity_provenance.py": (
        "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b"
    ),
    "e4c9f1a7b362_add_measurement_provenance.py": (
        "336a59a593c1f1d5fcfd4b32c3b8405bb290b1f13c9a6fee094e8170249c8c2d"
    ),
    "a1a3c0f17c5e_add_deterministic_catalog_ingestion.py": (
        "26b5dad738a93d9776a62155c638402319b35365896ab515cb018413274cfda5"
    ),
    "c4b9e2d7a6f1_seed_gaia_dr3_slice.py": (
        "ae89acabb3e241e49d6874a429ca2de0319aaa25ed5e2ba1185866df6cbfdf7a"
    ),
}


def _migration_url(**changes: object) -> URL:
    values: dict[str, object] = {
        "drivername": "postgresql+psycopg",
        "username": "lumina_test_migrate",
        "password": "migration-secret",
        "host": "127.0.0.1",
        "port": 5432,
        "database": "lumina_test",
    }
    values.update(changes)
    return URL.create(**values)  # type: ignore[arg-type]


def _runtime_url(**changes: object) -> URL:
    values: dict[str, object] = {
        "drivername": "postgresql+asyncpg",
        "username": "lumina_test_app",
        "password": "runtime-secret",
        "host": "127.0.0.1",
        "port": 5432,
        "database": "lumina_test",
    }
    values.update(changes)
    return URL.create(**values)  # type: ignore[arg-type]


def test_protected_migrations_are_byte_for_byte_unchanged() -> None:
    root = Path(__file__).resolve().parents[3] / "migrations" / "versions"
    assert {
        name: sha256((root / name).read_bytes()).hexdigest() for name in _PROTECTED_MIGRATION_HASHES
    } == _PROTECTED_MIGRATION_HASHES


def test_valid_identity_pairs_one_target_without_revealing_secrets() -> None:
    identity = validate_migration_identity(_migration_url(), _runtime_url())

    assert identity.migration_role == "lumina_test_migrate"
    assert identity.runtime_role == "lumina_test_app"
    assert "migration-secret" not in repr(identity)
    assert "runtime-secret" not in repr(identity)


@pytest.mark.parametrize(
    ("migration_host", "runtime_host"),
    [
        ("db.example.test", "DB.EXAMPLE.TEST."),
        ("192.0.2.10", "192.0.2.10"),
        ("0:0:0:0:0:0:0:1", "::1"),
    ],
)
def test_valid_single_hosts_are_normalized(
    migration_host: str,
    runtime_host: str,
) -> None:
    identity = validate_migration_identity(
        _migration_url(host=migration_host),
        _runtime_url(host=runtime_host),
    )

    assert identity.runtime_role == "lumina_test_app"


@pytest.mark.parametrize(
    ("migration_changes", "runtime_changes"),
    [
        ({"drivername": "postgresql"}, {}),
        ({}, {"drivername": "postgresql+psycopg"}),
        ({"host": "localhost"}, {}),
        ({}, {"port": 5433}),
        ({}, {"database": "lumina"}),
        ({"port": None}, {"port": None}),
        ({}, {"host": None}),
        ({"query": {"service": "unsafe"}}, {}),
        ({}, {"query": {"host": "remote.example"}}),
        ({}, {"username": "lumina-test-app"}),
        ({}, {"username": "BadRole"}),
        ({}, {"username": "lumina_test_migrate"}),
    ],
)
def test_invalid_or_ambiguous_identity_is_rejected_safely(
    migration_changes: dict[str, object],
    runtime_changes: dict[str, object],
) -> None:
    with pytest.raises(MigrationIdentityError) as failure:
        validate_migration_identity(
            _migration_url(**migration_changes),
            _runtime_url(**runtime_changes),
        )

    assert str(failure.value) == "Migration database identity is invalid."
    assert "secret" not in repr(failure.value)


@pytest.mark.parametrize(
    "unsafe_host",
    [
        "localhost,203.0.113.1",
        "localhost%2C203.0.113.1",
        ",localhost",
        "localhost,",
        "localhost,,203.0.113.1",
        "localhost remote.example",
        "/var/run/postgresql",
        "%2Fvar%2Frun%2Fpostgresql",
        "[::1",
        "::1]",
        "localhost:5432",
        "user@localhost",
        "local\nhost",
    ],
)
def test_ambiguous_or_multi_host_forms_are_rejected_without_echo(
    unsafe_host: str,
) -> None:
    with pytest.raises(MigrationIdentityError) as failure:
        validate_migration_identity(
            _migration_url(host=unsafe_host),
            _runtime_url(host=unsafe_host),
        )

    assert str(failure.value) == "Migration database identity is invalid."
    assert unsafe_host not in repr(failure.value)


@pytest.mark.parametrize(
    "query",
    [
        {"host": "remote.example"},
        {"hostaddr": "203.0.113.1"},
        {"service": "production"},
        {"port": "5433"},
    ],
)
def test_connection_target_query_overrides_are_rejected(query: dict[str, str]) -> None:
    with pytest.raises(MigrationIdentityError) as failure:
        validate_migration_identity(_migration_url(query=query), _runtime_url())

    assert str(failure.value) == "Migration database identity is invalid."


def test_mismatched_normalized_hosts_are_rejected() -> None:
    with pytest.raises(MigrationIdentityError) as failure:
        validate_migration_identity(
            _migration_url(host="127.0.0.1"),
            _runtime_url(host="::1"),
        )

    assert str(failure.value) == "Migration database identity is invalid."


@pytest.mark.parametrize("query_suffix", ["?", "?host=", "?unknown"])
def test_raw_migration_pairing_rejects_query_syntax_before_parsing(
    query_suffix: str,
) -> None:
    with pytest.raises(MigrationIdentityError) as failure:
        migration_identity_from_secrets(
            SecretStr(
                "postgresql+psycopg://lumina_test_migrate:migration-secret"
                f"@127.0.0.1:5432/lumina_test{query_suffix}"
            ),
            SecretStr(
                "postgresql+asyncpg://lumina_test_app:runtime-secret@127.0.0.1:5432/lumina_test"
            ),
        )

    assert str(failure.value) == "Migration database identity is invalid."
    assert "secret" not in repr(failure.value)
