"""Guarded PostgreSQL contracts for normalized astrometric results."""

from __future__ import annotations

from uuid import UUID

import pytest
from lumina.identification.domain.remote_state import RemoteSolveState
from lumina.identification.infrastructure.remote_postgresql import PostgreSqlRemoteSolveRepository
from lumina.identification.infrastructure.solution_postgresql import PostgreSqlSolutionRepository
from lumina.settings import IntegrationTestSettings
from lumina.shared.infrastructure.database.runtime import create_database_runtime
from sqlalchemy import URL, Connection, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.pool import NullPool

from .migration_lifecycle import run_migration_operation

_HEAD = "f1b2c3d4e5f6"
_SOLUTION = "identification_solution"
_ANNOTATION = "identification_annotation"
_SUBMISSION_ID = UUID("64000000-0000-4000-8000-000000000001")


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
                text("DELETE FROM public.identification_annotation WHERE submission_id = :id"),
                {"id": _SUBMISSION_ID},
            )
            connection.execute(
                text("DELETE FROM public.identification_solution WHERE submission_id = :id"),
                {"id": _SUBMISSION_ID},
            )
            connection.execute(
                text(
                    "DELETE FROM public.identification_remote_transition WHERE submission_id = :id"
                ),
                {"id": _SUBMISSION_ID},
            )
            connection.execute(
                text("DELETE FROM public.identification_remote_solve WHERE submission_id = :id"),
                {"id": _SUBMISSION_ID},
            )
            connection.execute(
                text("DELETE FROM public.identification_submission WHERE id = :id"),
                {"id": _SUBMISSION_ID},
            )

    run_migration_operation(_sync_url(settings), operation)


def _seed_fetching_result(settings: IntegrationTestSettings) -> None:
    def operation(connection: Connection) -> None:
        with connection.begin():
            connection.execute(
                text(
                    "INSERT INTO public.identification_submission "
                    "(id, storage_object_key, original_filename, mime_type, byte_size, width, "
                    "height, "
                    "sha256, solver_type, consent_remote_processing, retention_until) VALUES "
                    "(:id, :key, 'night.png', 'image/png', 100, 32, 32, :sha, 'nova', true, "
                    "CURRENT_TIMESTAMP + interval '24 hours')"
                ),
                {"id": _SUBMISSION_ID, "key": "6" * 32, "sha": "6" * 64},
            )
            connection.execute(
                text(
                    "INSERT INTO public.identification_remote_solve "
                    "(submission_id, provider, state, external_submission_id, external_job_id, "
                    "next_poll_at, deadline_at, last_polled_at, upload_attempted_at) VALUES "
                    "(:id, 'nova', 'fetching_results', 101, 201, CURRENT_TIMESTAMP, "
                    "CURRENT_TIMESTAMP + interval '15 minutes', CURRENT_TIMESTAMP, "
                    "CURRENT_TIMESTAMP)"
                ),
                {"id": _SUBMISSION_ID},
            )

    run_migration_operation(_sync_url(settings), operation)


def _seed_succeeded_solution(settings: IntegrationTestSettings) -> None:
    _seed_fetching_result(settings)

    def operation(connection: Connection) -> None:
        with connection.begin():
            connection.execute(
                text(
                    "INSERT INTO public.identification_solution "
                    "(submission_id, external_job_id, provider, coordinate_frame, center_ra_deg, "
                    "center_dec_deg, orientation_deg, parity, pixel_scale_arcsec_per_pixel, "
                    "radius_deg, image_width, image_height, wcs_header, wcs_source_sha256, "
                    "solver_name, solver_version) VALUES "
                    "(:id, 201, 'nova', 'fk5_j2000', 120, 20, 45, -1, 1.2, 0.5, 32, 32, "
                    "'WCSAXES =                    2', :sha, 'astrometry.net-nova', NULL)"
                ),
                {"id": _SUBMISSION_ID, "sha": "b" * 64},
            )
            connection.execute(
                text(
                    "INSERT INTO public.identification_annotation "
                    "(submission_id, ordinal, category, names, pixel_x, pixel_y, ra_deg, dec_deg) "
                    "VALUES (:id, 0, 'ngc', ARRAY['NGC 1']::varchar(128)[], 10, 11, 120, 20)"
                ),
                {"id": _SUBMISSION_ID},
            )
            connection.execute(
                text(
                    "UPDATE public.identification_remote_solve SET state = 'succeeded', "
                    "next_poll_at = NULL, terminal_at = CURRENT_TIMESTAMP, "
                    "safe_reason = 'results_stored', updated_at = CURRENT_TIMESTAMP "
                    "WHERE submission_id = :id"
                ),
                {"id": _SUBMISSION_ID},
            )

    run_migration_operation(_sync_url(settings), operation)


def test_solution_schema_acl_and_fk_contract_are_exact(
    integration_settings: IntegrationTestSettings,
) -> None:
    runtime_role = make_url(integration_settings.test_database_url.get_secret_value()).username
    assert runtime_role is not None

    def inspect(connection: Connection) -> None:
        assert (
            connection.execute(text("SELECT version_num FROM public.alembic_version")).scalar_one()
            == _HEAD
        )
        solution_constraints = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'public.identification_solution'::regclass AND contype <> 'n'"
                )
            ).scalars()
        )
        assert solution_constraints == {
            "pk_identification_solution",
            "fk_identification_solution_remote_job",
            "ck_identification_solution_provider",
            "ck_identification_solution_coordinate_frame",
            "ck_identification_solution_ra",
            "ck_identification_solution_dec",
            "ck_identification_solution_orientation",
            "ck_identification_solution_parity",
            "ck_identification_solution_pixel_scale",
            "ck_identification_solution_radius",
            "ck_identification_solution_dimensions",
            "ck_identification_solution_wcs_size",
            "ck_identification_solution_wcs_sha256",
            "ck_identification_solution_solver_name",
        }
        annotation_constraints = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'public.identification_annotation'::regclass "
                    "AND contype <> 'n'"
                )
            ).scalars()
        )
        assert annotation_constraints == {
            "pk_identification_annotation",
            "fk_identification_annotation_solution",
            "ck_identification_annotation_ordinal",
            "ck_identification_annotation_category",
            "ck_identification_annotation_names",
            "ck_identification_annotation_pixel",
            "ck_identification_annotation_ra",
            "ck_identification_annotation_dec",
        }
        remote_constraints = set(
            connection.execute(
                text(
                    "SELECT conname FROM pg_constraint "
                    "WHERE conrelid = 'public.identification_remote_solve'::regclass "
                    "AND contype <> 'n'"
                )
            ).scalars()
        )
        assert "uq_identification_remote_solve_submission_job" in remote_constraints
        assert connection.execute(
            text("SELECT has_table_privilege(:role, 'public.identification_solution', 'SELECT')"),
            {"role": runtime_role},
        ).scalar_one()
        assert connection.execute(
            text("SELECT has_table_privilege(:role, 'public.identification_solution', 'DELETE')"),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text("SELECT has_table_privilege(:role, 'public.identification_solution', 'UPDATE')"),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text("SELECT has_table_privilege(:role, 'public.identification_annotation', 'DELETE')"),
            {"role": runtime_role},
        ).scalar_one()
        assert connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_solution', "
                "'wcs_header', 'INSERT')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert connection.execute(
            text(
                "SELECT has_column_privilege(:role, 'public.identification_annotation', "
                "'names', 'INSERT')"
            ),
            {"role": runtime_role},
        ).scalar_one()
        assert not connection.execute(
            text("SELECT has_table_privilege('public', 'public.identification_solution', 'SELECT')")
        ).scalar_one()

    run_migration_operation(_sync_url(integration_settings), inspect)


def test_runtime_result_rows_are_immutable_and_solution_delete_cascades_annotations(
    integration_settings: IntegrationTestSettings,
) -> None:
    _cleanup(integration_settings)
    _seed_fetching_result(integration_settings)
    engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    try:
        with engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_solution "
                    "(submission_id, external_job_id, provider, coordinate_frame, center_ra_deg, "
                    "center_dec_deg, orientation_deg, parity, pixel_scale_arcsec_per_pixel, "
                    "radius_deg, image_width, image_height, wcs_header, wcs_source_sha256, "
                    "solver_name, solver_version) VALUES "
                    "(:id, 201, 'nova', 'fk5_j2000', 120, 20, 0, -1, 1, 0.2, 32, 32, "
                    "'CTYPE1=RA---TAN', :sha, 'astrometry.net-nova', NULL)"
                ),
                {"id": _SUBMISSION_ID, "sha": "a" * 64},
            )
            connection.execute(
                text(
                    "INSERT INTO public.identification_annotation "
                    "(submission_id, ordinal, category, names, pixel_x, pixel_y, ra_deg, dec_deg) "
                    "VALUES (:id, 0, 'ngc', ARRAY['NGC 1']::varchar(128)[], 10, 11, 120, 20)"
                ),
                {"id": _SUBMISSION_ID},
            )
        with pytest.raises(ProgrammingError), engine.begin() as connection:
            connection.execute(
                text(
                    "UPDATE public.identification_solution SET radius_deg = 1 "
                    "WHERE submission_id = :id"
                ),
                {"id": _SUBMISSION_ID},
            )
        with pytest.raises(ProgrammingError), engine.begin() as connection:
            connection.execute(
                text("DELETE FROM public.identification_annotation WHERE submission_id = :id"),
                {"id": _SUBMISSION_ID},
            )
        with engine.begin() as connection:
            deleted = connection.execute(
                text(
                    "DELETE FROM public.identification_solution WHERE submission_id = :id "
                    "RETURNING submission_id"
                ),
                {"id": _SUBMISSION_ID},
            ).scalar_one()
            assert deleted == _SUBMISSION_ID
            assert (
                connection.execute(
                    text(
                        "SELECT count(*) FROM public.identification_annotation "
                        "WHERE submission_id = :id"
                    ),
                    {"id": _SUBMISSION_ID},
                ).scalar_one()
                == 0
            )
    finally:
        engine.dispose()
        _cleanup(integration_settings)


def test_solution_fk_and_science_checks_fail_closed(
    integration_settings: IntegrationTestSettings,
) -> None:
    _cleanup(integration_settings)
    _seed_fetching_result(integration_settings)
    engine = create_engine(_runtime_url(integration_settings), poolclass=NullPool)
    try:
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_solution "
                    "(submission_id, external_job_id, provider, coordinate_frame, center_ra_deg, "
                    "center_dec_deg, orientation_deg, parity, pixel_scale_arcsec_per_pixel, "
                    "radius_deg, image_width, image_height, wcs_header, wcs_source_sha256, "
                    "solver_name, solver_version) VALUES "
                    "(:id, 999, 'nova', 'fk5_j2000', 120, 20, 0, -1, 1, 0.2, 32, 32, "
                    "'CTYPE1=RA---TAN', :sha, 'astrometry.net-nova', NULL)"
                ),
                {"id": _SUBMISSION_ID, "sha": "a" * 64},
            )
        with pytest.raises(IntegrityError), engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO public.identification_solution "
                    "(submission_id, external_job_id, provider, coordinate_frame, center_ra_deg, "
                    "center_dec_deg, orientation_deg, parity, pixel_scale_arcsec_per_pixel, "
                    "radius_deg, image_width, image_height, wcs_header, wcs_source_sha256, "
                    "solver_name, solver_version) VALUES "
                    "(:id, 201, 'nova', 'fk5_j2000', 120, 20, 0, 0, 1, 0.2, 32, 32, "
                    "'CTYPE1=RA---TAN', :sha, 'astrometry.net-nova', NULL)"
                ),
                {"id": _SUBMISSION_ID, "sha": "a" * 64},
            )
    finally:
        engine.dispose()
        _cleanup(integration_settings)


@pytest.mark.asyncio
async def test_runtime_repositories_read_persisted_remote_solution_without_elevated_privileges(
    integration_settings: IntegrationTestSettings,
) -> None:
    _cleanup(integration_settings)
    _seed_succeeded_solution(integration_settings)
    runtime = create_database_runtime(integration_settings.test_database_url)
    try:
        remote = PostgreSqlRemoteSolveRepository(runtime.session_factory)
        solutions = PostgreSqlSolutionRepository(runtime.session_factory)

        state = await remote.read(_SUBMISSION_ID)
        page = await solutions.read_slice(_SUBMISSION_ID, after_ordinal=None, limit=51)

        assert state.state is RemoteSolveState.SUCCEEDED
        assert state.external_job_id is not None and state.external_job_id.value == 201
        assert page.calibration.center_ra_deg == 120.0
        assert page.wcs.frame.value == "fk5_j2000"
        assert page.wcs.source_sha256 == "b" * 64
        assert page.annotation_ordinals == (0,)
        assert page.annotations[0].names == ("NGC 1",)
    finally:
        await runtime.engine.dispose()
        _cleanup(integration_settings)
