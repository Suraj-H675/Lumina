"""Guarded PostgreSQL contracts for durable consented remote identification."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from lumina.settings import IntegrationTestSettings
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import run_migration_operation

_HEAD = "e9f0a1b2c3d4"
_REMOTE = "identification_remote_solve"
_TRANSITION = "identification_remote_transition"
_FAKE_ID = UUID("63000000-0000-4000-8000-000000000001")
_NOVA_ID = UUID("63000000-0000-4000-8000-000000000002")


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
                    "DELETE FROM public.identification_remote_transition "
                    "WHERE submission_id IN (:fake, :nova)"
                ),
                {"fake": _FAKE_ID, "nova": _NOVA_ID},
            )
            connection.execute(
                text(
                    "DELETE FROM public.identification_remote_solve "
                    "WHERE submission_id IN (:fake, :nova)"
                ),
                {"fake": _FAKE_ID, "nova": _NOVA_ID},
            )
            connection.execute(
                text("DELETE FROM public.identification_submission WHERE id IN (:fake, :nova)"),
                {"fake": _FAKE_ID, "nova": _NOVA_ID},
            )

    run_migration_operation(_sync_url(settings), operation)


def test_remote_state_schema_and_acl_are_exact(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime_role = make_url(integration_settings.test_database_url.get_secret_value()).username
    assert runtime_role is not None

    def inspect(connection: Connection) -> None:
        assert connection.execute(
            text("SELECT version_num FROM public.alembic_version")
        ).scalar_one() == (_HEAD)
        remote_columns = tuple(
            connection.execute(
                text(
                    "SELECT attname FROM pg_attribute "
                    "WHERE attrelid = 'public.identification_remote_solve'::regclass "
                    "AND attnum > 0 AND NOT attisdropped ORDER BY attnum"
                )
            ).scalars()
        )
        assert remote_columns == (
            "submission_id",
            "solver_type",
            "consent_remote_processing",
            "provider",
            "state",
            "external_submission_id",
            "external_job_id",
            "next_poll_at",
            "deadline_at",
            "last_polled_at",
            "upload_attempted_at",
            "terminal_at",
            "safe_reason",
            "active_lease_token",
            "active_lease_expires_at",
            "created_at",
            "updated_at",
        )
        remote_constraints = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'public.identification_remote_solve'::regclass "
                    "AND contype <> 'n'"
                )
            ).scalars()
        )
        assert remote_constraints == {
            "pk_identification_remote_solve",
            "fk_identification_remote_solve_consented_submission",
            "uq_identification_remote_solve_external_submission_id",
            "uq_identification_remote_solve_external_job_id",
            "ck_identification_remote_solve_parent_mode",
            "ck_identification_remote_solve_provider",
            "ck_identification_remote_solve_state",
            "ck_identification_remote_solve_submission_id_positive",
            "ck_identification_remote_solve_job_id_positive",
            "ck_identification_remote_solve_time_order",
            "ck_identification_remote_solve_next_poll_order",
            "ck_identification_remote_solve_last_poll_order",
            "ck_identification_remote_solve_upload_attempt_order",
            "ck_identification_remote_solve_terminal_order",
            "ck_identification_remote_solve_lease_pair",
            "ck_identification_remote_solve_lease_token",
            "ck_identification_remote_solve_safe_reason",
            "ck_identification_remote_solve_lifecycle_shape",
            "ck_identification_remote_solve_external_id_shape",
        }
        transition_constraints = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'public.identification_remote_transition'::regclass "
                    "AND contype <> 'n'"
                )
            ).scalars()
        )
        assert transition_constraints == {
            "pk_identification_remote_transition",
            "fk_identification_remote_transition_solve",
            "ck_identification_remote_transition_from_state",
            "ck_identification_remote_transition_to_state",
            "ck_identification_remote_transition_shape",
            "ck_identification_remote_transition_reason",
            "ck_identification_remote_transition_reason_catalog",
        }
        assert connection.execute(
            text(
                "SELECT has_table_privilege(:role, 'public.identification_remote_solve', 'SELECT')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text(
                "SELECT has_table_privilege(:role, 'public.identification_remote_solve', 'DELETE')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_remote_solve', "
                "'submission_id', 'INSERT')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_remote_solve', "
                "'provider', 'UPDATE')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_remote_transition', "
                "'reason', 'INSERT')"
            ),
            {"role": runtime_role},
        ).scalar_one()

    run_migration_operation(_sync_url(integration_settings), inspect)


def test_runtime_cannot_bypass_remote_consent_or_delete_remote_evidence(
    integration_settings: IntegrationTestSettings,
) -> None:
    _cleanup(integration_settings)
    engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            for submission_id, solver, consent, key in (
                (_FAKE_ID, "fake", False, "3" * 32),
                (_NOVA_ID, "nova", True, "4" * 32),
            ):
                connection.execute(
                    text(
                        "INSERT INTO public.identification_submission "
                        "(id, storage_object_key, original_filename, mime_type, byte_size, width, "
                        "height, sha256, solver_type, consent_remote_processing, retention_until) "
                        "VALUES (:id, :key, 'night.png', 'image/png', 100, 32, 32, :sha, "
                        ":solver, :consent, CURRENT_TIMESTAMP + interval '24 hours')"
                    ),
                    {
                        "id": submission_id,
                        "key": key,
                        "sha": key[0] * 64,
                        "solver": solver,
                        "consent": consent,
                    },
                )

        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_remote_solve "
                    "(submission_id, provider, state, next_poll_at, deadline_at) VALUES "
                    "(:id, 'nova', 'submitting', CURRENT_TIMESTAMP, "
                    "CURRENT_TIMESTAMP + interval '15 minutes')"
                ),
                {"id": _FAKE_ID},
            )

        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_remote_solve "
                    "(submission_id, provider, state, next_poll_at, deadline_at) VALUES "
                    "(:id, 'nova', 'submitting', CURRENT_TIMESTAMP, "
                    "CURRENT_TIMESTAMP + interval '15 minutes')"
                ),
                {"id": _NOVA_ID},
            )
            connection.execute(
                text(
                    "INSERT INTO public.identification_remote_transition "
                    "(event_id, submission_id, from_state, to_state, reason, recorded_at) VALUES "
                    "(:event, :id, NULL, 'submitting', 'remote_processing_consented', "
                    "CURRENT_TIMESTAMP)"
                ),
                {"event": uuid4(), "id": _NOVA_ID},
            )

        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_remote_transition "
                    "(event_id, submission_id, from_state, to_state, reason, recorded_at) VALUES "
                    "(:event, :id, 'submitting', 'failed', 'made_up_reason', CURRENT_TIMESTAMP)"
                ),
                {"event": uuid4(), "id": _NOVA_ID},
            )
        with pytest.raises(ProgrammingError), engine.begin() as connection:
            connection.execute(
                text("DELETE FROM public.identification_remote_solve WHERE submission_id = :id"),
                {"id": _NOVA_ID},
            )
        with pytest.raises(ProgrammingError), engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE public.identification_remote_solve SET provider = 'other' "
                    "WHERE submission_id = :id"
                ),
                {"id": _NOVA_ID},
            )
    finally:
        engine.dispose()
        _cleanup(integration_settings)
