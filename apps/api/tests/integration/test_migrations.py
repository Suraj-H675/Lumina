"""The accepted migration lineage is exact and reversible on guarded PostgreSQL."""

from __future__ import annotations

import re
from hashlib import sha256
from pathlib import Path

import pytest
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import OperationalError

from .migration_lifecycle import (
    integration_migration_identity,
    open_migration_connection,
    run_alembic,
    run_migration_operation,
)

_ACCEPTED_0001_SHA256 = "d805d2f626f9c9f248c87202a1fd6351f1682c4dd0c930aaca1ec662aad6892b"
_ACCEPTED_0002_SHA256 = "8d9de0d1bfc4b4785ad4234028fbba754437c85e4f6adc267193d6044966b889"
_ACCEPTED_PHASE1A1_SHA256 = "f95087a60d2365ea52af9c8026b3c7dbf3b780a1f11673f53308e7b6b8400f7b"
_ACCEPTED_HEAD = "a1a3c0f17c5e"

_EXPECTED_COLUMNS = [
    ("id", "uuid", False, True, "<none>", "", ""),
    ("job_type", "character varying(128)", False, False, "<none>", "", ""),
    ("status", "character varying(32)", False, False, "'queued'::character varying", "", ""),
    ("idempotency_key", "character varying(255)", True, False, "<none>", "", ""),
    ("priority", "smallint", False, False, "'0'::smallint", "", ""),
    ("payload", "jsonb", False, False, "<none>", "", ""),
    ("result", "jsonb", True, False, "<none>", "", ""),
    ("progress", "double precision", False, False, "'0'::double precision", "", ""),
    ("attempts", "smallint", False, False, "'0'::smallint", "", ""),
    ("max_attempts", "smallint", False, False, "'5'::smallint", "", ""),
    ("available_at", "timestamp with time zone", False, False, "CURRENT_TIMESTAMP", "", ""),
    ("claimed_by", "character varying(128)", True, False, "<none>", "", ""),
    ("claimed_at", "timestamp with time zone", True, False, "<none>", "", ""),
    ("heartbeat_at", "timestamp with time zone", True, False, "<none>", "", ""),
    ("completed_at", "timestamp with time zone", True, False, "<none>", "", ""),
    ("error_code", "character varying(128)", True, False, "<none>", "", ""),
    ("error_message", "character varying(1024)", True, False, "<none>", "", ""),
    ("created_at", "timestamp with time zone", False, False, "CURRENT_TIMESTAMP", "", ""),
]

_EXPECTED_CONSTRAINTS = {
    ("ck_job_attempts", "c", "CHECK (attempts >= 0 AND attempts <= max_attempts)"),
    ("ck_job_claim_pair", "c", "CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))"),
    (
        "ck_job_claimed_by_identifier",
        "c",
        "CHECK (claimed_by IS NULL OR claimed_by::text ~ '^[a-z][a-z0-9_.-]{0,127}$'::text)",
    ),
    (
        "ck_job_completion_order",
        "c",
        "CHECK (completed_at IS NULL OR completed_at >= COALESCE(heartbeat_at, claimed_at))",
    ),
    (
        "ck_job_error_code_identifier",
        "c",
        "CHECK (error_code IS NULL OR error_code::text ~ '^[a-z][a-z0-9_.-]{0,127}$'::text)",
    ),
    ("ck_job_error_message_code", "c", "CHECK (error_message IS NULL OR error_code IS NOT NULL)"),
    (
        "ck_job_error_state",
        "c",
        (
            "CHECK ((status::text = ANY (ARRAY['failed'::character varying, "
            "'dead_letter'::character varying]::text[])) = (error_code IS NOT NULL))"
        ),
    ),
    ("ck_job_heartbeat_order", "c", "CHECK (heartbeat_at IS NULL OR heartbeat_at >= claimed_at)"),
    (
        "ck_job_idempotency_key_nonempty",
        "c",
        "CHECK (idempotency_key IS NULL OR length(idempotency_key::text) > 0)",
    ),
    ("ck_job_max_attempts", "c", "CHECK (max_attempts >= 1 AND max_attempts <= 5)"),
    (
        "ck_job_payload_size",
        "c",
        "CHECK (octet_length(convert_to(payload::text, 'UTF8'::name)) <= 65536)",
    ),
    (
        "ck_job_progress",
        "c",
        "CHECK (progress >= 0::double precision AND progress <= 1::double precision)",
    ),
    (
        "ck_job_result_size",
        "c",
        "CHECK (result IS NULL OR octet_length(convert_to(result::text, 'UTF8'::name)) <= 65536)",
    ),
    (
        "ck_job_state_fields",
        "c",
        (
            "CHECK (status::text = 'queued'::text AND claimed_by IS NULL AND "
            "heartbeat_at IS NULL AND completed_at IS NULL OR status::text = "
            "'running'::text AND claimed_by IS NOT NULL AND completed_at IS NULL OR "
            "(status::text = ANY (ARRAY['succeeded'::character varying, "
            "'failed'::character varying, 'dead_letter'::character varying]::text[])) "
            "AND claimed_by IS NOT NULL AND completed_at IS NOT NULL)"
        ),
    ),
    (
        "ck_job_status",
        "c",
        (
            "CHECK (status::text = ANY (ARRAY['queued'::character varying, "
            "'running'::character varying, 'succeeded'::character varying, "
            "'failed'::character varying, 'dead_letter'::character varying]::text[]))"
        ),
    ),
    ("ck_job_type_identifier", "c", "CHECK (job_type::text ~ '^[a-z][a-z0-9_.-]{0,127}$'::text)"),
    ("pk_job", "p", "PRIMARY KEY (id)"),
    ("uq_job_idempotency_key", "u", "UNIQUE (idempotency_key)"),
}

_EXPECTED_INDEXES = {
    (
        "ix_job_queue_poll",
        "btree",
        False,
        (
            "CREATE INDEX ix_job_queue_poll ON public.job USING btree "
            "(priority DESC, available_at, created_at, id) "
            "WHERE ((status)::text = 'queued'::text)"
        ),
        "((status)::text = 'queued'::text)",
        4,
        4,
    ),
    (
        "pk_job",
        "btree",
        True,
        "CREATE UNIQUE INDEX pk_job ON public.job USING btree (id)",
        "<none>",
        1,
        1,
    ),
    (
        "uq_job_idempotency_key",
        "btree",
        True,
        "CREATE UNIQUE INDEX uq_job_idempotency_key ON public.job USING btree (idempotency_key)",
        "<none>",
        1,
        1,
    ),
}


def _table_names(url: URL) -> set[str]:
    def query(connection: Connection) -> set[str]:
        return set(
            connection.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                )
            ).scalars()
        )

    return run_migration_operation(url, query)


def _revision(url: URL) -> str | None:
    def query(connection: Connection) -> str | None:
        return connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one_or_none()

    return run_migration_operation(url, query)


def _schema_snapshot(
    url: URL,
) -> tuple[list[tuple[object, ...]], set[tuple[object, ...]], set[tuple[object, ...]], set[str]]:
    def query(
        connection: Connection,
    ) -> tuple[
        list[tuple[object, ...]], set[tuple[object, ...]], set[tuple[object, ...]], set[str]
    ]:
        columns = [
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT attribute.attname, "
                    "format_type(attribute.atttypid, attribute.atttypmod), "
                    "NOT attribute.attnotnull, "
                    "EXISTS (SELECT 1 FROM pg_index AS index "
                    "WHERE index.indrelid = attribute.attrelid "
                    "AND index.indisprimary "
                    "AND attribute.attnum = ANY (index.indkey)), "
                    "COALESCE(pg_get_expr(default_value.adbin, "
                    "default_value.adrelid), '<none>'), "
                    "attribute.attidentity, attribute.attgenerated "
                    "FROM pg_attribute AS attribute "
                    "LEFT JOIN pg_attrdef AS default_value "
                    "ON default_value.adrelid = attribute.attrelid "
                    "AND default_value.adnum = attribute.attnum "
                    "WHERE attribute.attrelid = 'public.job'::regclass "
                    "AND attribute.attnum > 0 "
                    "AND NOT attribute.attisdropped ORDER BY attribute.attnum"
                )
            ).all()
        ]
        constraints = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT conname, contype, "
                    "regexp_replace(pg_get_constraintdef(oid, true), '\\s+', ' ', 'g') "
                    "FROM pg_constraint "
                    "WHERE conrelid = 'public.job'::regclass "
                    "AND contype IN ('p', 'u', 'c', 'f') ORDER BY conname"
                )
            ).all()
        }
        indexes = {
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT index_class.relname, access_method.amname, "
                    "index_data.indisunique, "
                    "pg_get_indexdef(index_data.indexrelid), "
                    "COALESCE(pg_get_expr(index_data.indpred, "
                    "index_data.indrelid), '<none>'), "
                    "index_data.indnkeyatts, index_data.indnatts "
                    "FROM pg_index AS index_data "
                    "JOIN pg_class AS index_class "
                    "ON index_class.oid = index_data.indexrelid "
                    "JOIN pg_class AS table_class "
                    "ON table_class.oid = index_data.indrelid "
                    "JOIN pg_namespace AS namespace "
                    "ON namespace.oid = table_class.relnamespace "
                    "JOIN pg_am AS access_method ON access_method.oid = index_class.relam "
                    "WHERE namespace.nspname = 'public' AND table_class.relname = 'job' "
                    "ORDER BY index_class.relname"
                )
            ).all()
        }
        extensions = set(connection.execute(text("SELECT extname FROM pg_extension")).scalars())
        return columns, constraints, indexes, extensions

    return run_migration_operation(url, query)


def _assert_head_schema(url: URL) -> None:
    """Reject every missing or unexpected job catalog entry after migration."""
    revision = _revision(url)
    tables = _table_names(url)
    columns, constraints, indexes, extensions = _schema_snapshot(url)

    assert revision == _ACCEPTED_HEAD
    assert tables == {
        "alembic_version",
        "canonical_measurement",
        "dataset",
        "entity",
        "ingestion_conflict",
        "job",
        "measurement",
        "provider",
        "quantity",
        "quantity_unit",
        "source_record",
        "unit",
    }
    assert columns == _EXPECTED_COLUMNS
    assert constraints == _EXPECTED_CONSTRAINTS
    assert indexes == _EXPECTED_INDEXES
    # `plpgsql` is PostgreSQL's built-in extension; Lumina installs no extension.
    assert extensions == {"plpgsql"}


def test_protected_migrations_are_byte_for_byte_unchanged() -> None:
    root = Path(__file__).resolve().parents[4] / "migrations" / "versions"
    assert sha256((root / "0001_create_job.py").read_bytes()).hexdigest() == _ACCEPTED_0001_SHA256
    assert (
        sha256((root / "0002_grant_job_runtime_dml.py").read_bytes()).hexdigest()
        == _ACCEPTED_0002_SHA256
    )
    assert (
        sha256(
            (root / "d502b5935120_create_catalog_identity_provenance.py").read_bytes()
        ).hexdigest()
        == _ACCEPTED_PHASE1A1_SHA256
    )


def test_upgrade_downgrade_and_reupgrade(integration_settings: IntegrationTestSettings) -> None:
    sync_url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    identity = integration_migration_identity(integration_settings)

    run_migration_operation(
        sync_url, lambda connection: run_alembic(connection, identity, "base", downgrade=True)
    )
    run_migration_operation(
        sync_url, lambda connection: run_alembic(connection, identity, "head", downgrade=False)
    )
    _assert_head_schema(sync_url)

    run_migration_operation(
        sync_url, lambda connection: run_alembic(connection, identity, "base", downgrade=True)
    )
    assert _revision(sync_url) is None
    assert _table_names(sync_url) == {"alembic_version"}

    run_migration_operation(
        sync_url, lambda connection: run_alembic(connection, identity, "head", downgrade=False)
    )
    _assert_head_schema(sync_url)


@pytest.mark.parametrize(
    ("hostname", "port"),
    [("migration-host-sentinel", 6542), ("127.0.0.1", 1)],
)
def test_migration_connection_failure_is_sanitized(
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
    hostname: str,
    port: int,
) -> None:
    password = "MIGRATION-SECRET-SENTINEL"
    username = "migration-user-sentinel"
    database = "migration-database-sentinel"
    url = URL.create(
        "postgresql+psycopg",
        username=username,
        password=password,
        host=hostname,
        port=port,
        database=database,
        query={"connect_timeout": "1"},
    )

    with pytest.raises(pytest.fail.Exception) as failure, open_migration_connection(url):
        pass
    captured = capsys.readouterr()
    serialized = (
        str(failure.value) + repr(failure.value) + captured.out + captured.err + caplog.text
    )

    assert "Integration migration operation failed." in serialized
    for secret_or_connection_detail in (password, username, hostname, str(port), database):
        assert secret_or_connection_detail not in serialized
    assert failure.value.__cause__ is None
    assert failure.value.__suppress_context__


def test_migration_assertions_remain_visible(integration_settings: IntegrationTestSettings) -> None:
    url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    with pytest.raises(AssertionError, match="schema sentinel"):
        run_migration_operation(
            url,
            lambda _connection: (_ for _ in ()).throw(AssertionError("schema sentinel")),
        )


@pytest.mark.parametrize(
    "error",
    [
        OperationalError("migration cancellation sentinel", None, Exception("cancelled")),
        OperationalError("migration lock sentinel", None, Exception("lock unavailable")),
        OperationalError("migration resource sentinel", None, Exception("resource exhausted")),
        RuntimeError("migration script sentinel"),
    ],
)
def test_non_connectivity_migration_failures_remain_visible(
    integration_settings: IntegrationTestSettings,
    error: Exception,
) -> None:
    url = make_url(integration_settings.test_database_sync_url.get_secret_value())
    with pytest.raises(type(error), match=re.escape(str(error))):
        run_migration_operation(url, lambda _connection: (_ for _ in ()).throw(error))
