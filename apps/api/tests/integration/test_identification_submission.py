"""Guarded PostgreSQL contracts for Phase 6A private submission metadata."""

from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

import pytest
from alembic.script import ScriptDirectory
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import (
    integration_migration_identity,
    migration_config,
    run_alembic,
    run_migration_operation,
)

_HEAD_REVISION = "f1b2c3d4e5f6"
_PHASE6B2_REVISION = "e9f0a1b2c3d4"
_PHASE6A_REVISION = "d8e9f0a1b2c3"
_PARENT_REVISION = "c6d7e8f9a0b1"
_TABLE = "identification_submission"
_SUBMISSION_ID = UUID("61000000-0000-4000-8000-000000000001")


def _sync_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_sync_url.get_secret_value())


def _runtime_url(settings: IntegrationTestSettings) -> URL:
    return make_url(settings.test_database_url.get_secret_value()).set(
        drivername="postgresql+psycopg"
    )


def _cleanup(settings: IntegrationTestSettings) -> None:
    def operation(connection: Connection) -> None:
        with connection.begin():
            connection.execute(
                text(
                    "DELETE FROM public.identification_submission WHERE id IN "
                    "(:id1, :id2, :id3, :id4)"
                ),
                {
                    "id1": _SUBMISSION_ID,
                    "id2": UUID("61000000-0000-4000-8000-000000000002"),
                    "id3": UUID("61000000-0000-4000-8000-000000000003"),
                    "id4": UUID("61000000-0000-4000-8000-000000000004"),
                },
            )

    run_migration_operation(_sync_url(settings), operation)


def test_identification_migrations_are_linear_to_the_single_current_head() -> None:
    script = ScriptDirectory.from_config(migration_config())
    assert script.get_heads() == [_HEAD_REVISION]
    assert script.get_revision(_HEAD_REVISION).down_revision == _PHASE6B2_REVISION
    assert script.get_revision(_PHASE6B2_REVISION).down_revision == _PHASE6A_REVISION
    assert script.get_revision(_PHASE6A_REVISION).down_revision == _PARENT_REVISION


def test_identification_schema_and_private_scrub_contract_are_exact(
    integration_settings: IntegrationTestSettings,
) -> None:
    def inspect(connection: Connection) -> None:
        assert connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one() == (_HEAD_REVISION)
        columns = [
            tuple(row)
            for row in connection.execute(
                text(
                    "SELECT attname, format_type(atttypid, atttypmod), NOT attnotnull, "
                    "COALESCE(pg_get_expr(default_data.adbin, default_data.adrelid), '<none>') "
                    "FROM pg_attribute AS attribute "
                    "LEFT JOIN pg_attrdef AS default_data "
                    "ON default_data.adrelid = attribute.attrelid "
                    "AND default_data.adnum = attribute.attnum "
                    "WHERE attribute.attrelid = 'public.identification_submission'::regclass "
                    "AND attribute.attnum > 0 AND NOT attribute.attisdropped "
                    "ORDER BY attribute.attnum"
                )
            )
        ]
        assert [row[0] for row in columns] == [
            "id",
            "job_id",
            "storage_object_key",
            "original_filename",
            "mime_type",
            "byte_size",
            "width",
            "height",
            "sha256",
            "solver_type",
            "consent_remote_processing",
            "retention_until",
            "deleted_at",
            "created_at",
        ]
        assert [bool(row[2]) for row in columns] == [
            False,
            True,
            True,
            True,
            False,
            False,
            False,
            False,
            True,
            False,
            False,
            False,
            True,
            False,
        ]
        assert columns[10][3] == "false"
        assert columns[13][3] == "CURRENT_TIMESTAMP"

        constraints = {
            str(name): str(definition)
            for name, definition in connection.execute(
                text(
                    "SELECT conname, pg_get_constraintdef(oid, true) FROM pg_constraint "
                    "WHERE conrelid = 'public.identification_submission'::regclass "
                    "AND contype <> 'n'"
                )
            )
        }
        assert set(constraints) == {
            "pk_identification_submission",
            "uq_identification_submission_job_id",
            "uq_identification_submission_storage_object_key",
            "fk_identification_submission_job",
            "ck_identification_submission_storage_key",
            "ck_identification_submission_filename",
            "ck_identification_submission_mime_type",
            "ck_identification_submission_byte_size",
            "ck_identification_submission_dimensions",
            "ck_identification_submission_sha256",
            "ck_identification_submission_solver_type",
            "ck_identification_submission_solver_consent_pair",
            "uq_identification_submission_id_solver_consent",
            "ck_identification_submission_retention_order",
            "ck_identification_submission_deletion_order",
            "ck_identification_submission_private_scrub",
        }
        index_definition = connection.execute(
            text(
                "SELECT pg_get_indexdef(indexrelid) FROM pg_index "
                "WHERE indexrelid = 'public.ix_identification_submission_retention'::regclass"
            )
        ).scalar_one()
        assert "(retention_until, id) WHERE (deleted_at IS NULL)" in index_definition

    run_migration_operation(_sync_url(integration_settings), inspect)


def test_runtime_acl_allows_only_required_submission_operations(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime_role = make_url(integration_settings.test_database_url.get_secret_value()).username
    assert runtime_role is not None

    def inspect(connection: Connection) -> None:
        for privilege in {
            "SELECT",
            "INSERT",
            "UPDATE",
            "DELETE",
            "TRUNCATE",
            "REFERENCES",
            "TRIGGER",
        }:
            actual = connection.execute(
                text(
                    "SELECT has_table_privilege("
                    ":role, 'public.identification_submission', :privilege)"
                ),
                {"role": runtime_role, "privilege": privilege},
            ).scalar_one()
            assert bool(actual) is (privilege == "SELECT")
        assert connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_submission', "
                "'storage_object_key', 'INSERT')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_submission', "
                "'deleted_at', 'UPDATE')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_submission', "
                "'byte_size', 'UPDATE')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text(
                "SELECT has_table_privilege('public', 'public.identification_submission', 'SELECT')"
            )
        ).scalar_one()

    run_migration_operation(_sync_url(integration_settings), inspect)


def test_runtime_can_create_fake_or_consented_nova_and_scrub_but_cannot_delete(
    integration_settings: IntegrationTestSettings,
) -> None:
    _cleanup(integration_settings)
    engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_submission "
                    "(id, storage_object_key, original_filename, mime_type, byte_size, width, "
                    "height, sha256, solver_type, consent_remote_processing, "
                    "retention_until) VALUES "
                    "(:id, :key, :filename, 'image/png', 1234, 120, 80, :sha256, 'fake', false, "
                    "CURRENT_TIMESTAMP + interval '24 hours')"
                ),
                {
                    "id": _SUBMISSION_ID,
                    "key": "a" * 32,
                    "filename": "night.png",
                    "sha256": "b" * 64,
                },
            )
            created_at = connection.execute(
                text("SELECT created_at FROM public.identification_submission WHERE id = :id"),
                {"id": _SUBMISSION_ID},
            ).scalar_one()
            assert isinstance(created_at, datetime)
            deleted_at = created_at + timedelta(hours=1)

        with pytest.raises(ProgrammingError), engine.begin() as connection:
            connection.execute(
                text("UPDATE public.identification_submission SET byte_size = 99 WHERE id = :id"),
                {"id": _SUBMISSION_ID},
            )
        with pytest.raises(ProgrammingError), engine.begin() as connection:
            connection.execute(
                text("DELETE FROM public.identification_submission WHERE id = :id"),
                {"id": _SUBMISSION_ID},
            )
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_submission "
                    "(id, storage_object_key, original_filename, mime_type, byte_size, width, "
                    "height, sha256, solver_type, consent_remote_processing, "
                    "retention_until) VALUES "
                    "(:id, :key, 'invalid.png', 'image/png', 10, 8, 8, :sha256, 'fake', true, "
                    "CURRENT_TIMESTAMP + interval '24 hours')"
                ),
                {
                    "id": UUID("61000000-0000-4000-8000-000000000002"),
                    "key": "c" * 32,
                    "sha256": "d" * 64,
                },
            )
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_submission "
                    "(id, storage_object_key, original_filename, mime_type, byte_size, width, "
                    "height, sha256, solver_type, consent_remote_processing, "
                    "retention_until) VALUES "
                    "(:id, :key, 'invalid-nova.png', 'image/png', 10, 8, 8, :sha256, 'nova', "
                    "false, CURRENT_TIMESTAMP + interval '24 hours')"
                ),
                {
                    "id": UUID("61000000-0000-4000-8000-000000000003"),
                    "key": "e" * 32,
                    "sha256": "f" * 64,
                },
            )
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_submission "
                    "(id, storage_object_key, original_filename, mime_type, byte_size, width, "
                    "height, sha256, solver_type, consent_remote_processing, "
                    "retention_until) VALUES "
                    "(:id, :key, 'remote.png', 'image/png', 10, 8, 8, :sha256, 'nova', true, "
                    "CURRENT_TIMESTAMP + interval '24 hours')"
                ),
                {
                    "id": UUID("61000000-0000-4000-8000-000000000004"),
                    "key": "1" * 32,
                    "sha256": "2" * 64,
                },
            )

        with engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE public.identification_submission SET storage_object_key = NULL, "
                    "original_filename = NULL, sha256 = NULL, deleted_at = :deleted_at "
                    "WHERE id = :id"
                ),
                {"id": _SUBMISSION_ID, "deleted_at": deleted_at},
            )
        with engine.connect() as connection:
            row = connection.execute(
                text(
                    "SELECT storage_object_key, original_filename, sha256, deleted_at "
                    "FROM public.identification_submission WHERE id = :id"
                ),
                {"id": _SUBMISSION_ID},
            ).one()
            assert tuple(row[:3]) == (None, None, None)
            assert row[3] == deleted_at
    finally:
        engine.dispose()
        _cleanup(integration_settings)


def test_migration_round_trip_preserves_every_older_table(
    integration_settings: IntegrationTestSettings,
) -> None:
    _cleanup(integration_settings)
    identity = integration_migration_identity(integration_settings)

    def operation(connection: Connection) -> None:
        run_alembic(connection, identity, _PHASE6A_REVISION, downgrade=True)
        assert (
            connection.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one()
            == _PHASE6A_REVISION
        )
        before = set(
            connection.execute(
                text(
                    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
                    "AND tablename <> 'identification_submission'"
                )
            ).scalars()
        )
        run_alembic(connection, identity, _PARENT_REVISION, downgrade=True)
        assert (
            connection.execute(
                text("SELECT to_regclass('public.identification_submission')")
            ).scalar_one()
            is None
        )
        after = set(
            connection.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            ).scalars()
        )
        assert after == before
        run_alembic(connection, identity, "head", downgrade=False)
        assert (
            connection.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one()
            == _HEAD_REVISION
        )

    run_migration_operation(_sync_url(integration_settings), operation)
