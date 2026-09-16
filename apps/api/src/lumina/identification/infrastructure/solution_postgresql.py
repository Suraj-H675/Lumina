"""Atomic PostgreSQL persistence for normalized identification results."""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from uuid import UUID, uuid4

from sqlalchemy import RowMapping, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from lumina.identification.domain.public_read import StoredSolutionSlice
from lumina.identification.domain.remote_state import (
    RemoteFinalizationOutcome,
    RemoteSolveClaim,
    RemoteSolveState,
    RemoteStateValidationError,
)
from lumina.identification.domain.solution import (
    AstrometricFrame,
    NormalizedPlateSolution,
    NormalizedWcs,
    PlateAnnotation,
    PlateCalibration,
    SolutionStorageFailure,
    SolutionValidationError,
)

_TIMEOUT_SQL = text("SET LOCAL statement_timeout = :timeout")
_LOCK_SQL = text(
    "SELECT solve.submission_id, solve.external_job_id "
    "FROM public.identification_remote_solve AS solve "
    "JOIN public.identification_submission AS submission ON submission.id = solve.submission_id "
    "WHERE solve.submission_id = :submission_id AND solve.state = 'fetching_results' "
    "AND solve.external_job_id = :external_job_id AND solve.active_lease_token = :lease_token "
    "AND solve.active_lease_expires_at > CURRENT_TIMESTAMP AND submission.deleted_at IS NULL "
    "FOR UPDATE OF solve"
)
_INSERT_SOLUTION_SQL = text(
    "INSERT INTO public.identification_solution "
    "(submission_id, external_job_id, provider, coordinate_frame, center_ra_deg, center_dec_deg, "
    "orientation_deg, parity, pixel_scale_arcsec_per_pixel, radius_deg, image_width, image_height, "
    "wcs_header, wcs_source_sha256, solver_name, solver_version) VALUES "
    "(:submission_id, :external_job_id, 'nova', :coordinate_frame, :center_ra_deg, "
    ":center_dec_deg, :orientation_deg, :parity, :pixel_scale, :radius_deg, :image_width, "
    ":image_height, :wcs_header, "
    ":wcs_sha256, :solver_name, :solver_version)"
)
_INSERT_ANNOTATION_SQL = text(
    "INSERT INTO public.identification_annotation "
    "(submission_id, ordinal, category, names, pixel_x, pixel_y, ra_deg, dec_deg) VALUES "
    "(:submission_id, :ordinal, :category, CAST(:names AS varchar(128)[]), :pixel_x, :pixel_y, "
    ":ra_deg, :dec_deg)"
)
_SUCCESS_SQL = text(
    "UPDATE public.identification_remote_solve SET state = 'succeeded', next_poll_at = NULL, "
    "last_polled_at = CURRENT_TIMESTAMP, terminal_at = CURRENT_TIMESTAMP, "
    "safe_reason = 'results_stored', "
    "active_lease_token = NULL, active_lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP "
    "WHERE submission_id = :submission_id AND state = 'fetching_results' "
    "AND active_lease_token = :lease_token AND active_lease_expires_at > CURRENT_TIMESTAMP "
    "RETURNING submission_id"
)
_TRANSITION_SQL = text(
    "INSERT INTO public.identification_remote_transition "
    "(event_id, submission_id, from_state, to_state, reason, recorded_at) VALUES "
    "(:event_id, :submission_id, 'fetching_results', 'succeeded', 'results_stored', "
    "CURRENT_TIMESTAMP)"
)
_READ_SOLUTION_SQL = text(
    "SELECT coordinate_frame, center_ra_deg, center_dec_deg, orientation_deg, parity, "
    "pixel_scale_arcsec_per_pixel, radius_deg, image_width, image_height, wcs_header, "
    "wcs_source_sha256, solver_name, solver_version FROM public.identification_solution "
    "WHERE submission_id = :submission_id"
)
_READ_ANNOTATIONS_SQL = text(
    "SELECT ordinal, category, names, pixel_x, pixel_y, ra_deg, dec_deg "
    "FROM public.identification_annotation WHERE submission_id = :submission_id "
    "AND (CAST(:after_ordinal AS integer) IS NULL OR ordinal > CAST(:after_ordinal AS integer)) "
    "ORDER BY ordinal ASC LIMIT :limit"
)
_PURGE_SQL = text(
    "DELETE FROM public.identification_solution WHERE submission_id = :submission_id "
    "RETURNING submission_id"
)


class PostgreSqlSolutionRepository:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        *,
        operation_wait_timeout_ms: int = 5_000,
    ) -> None:
        if (
            type(operation_wait_timeout_ms) is not int
            or not 100 <= operation_wait_timeout_ms <= 30_000
        ):
            raise ValueError("Identification solution database timeout is invalid.")
        self._session_factory = session_factory
        self._timeout = f"{operation_wait_timeout_ms}ms"

    async def store_and_succeed(
        self,
        claim: RemoteSolveClaim,
        solution: NormalizedPlateSolution,
    ) -> RemoteFinalizationOutcome:
        if (
            type(claim) is not RemoteSolveClaim
            or claim.record.state is not RemoteSolveState.FETCHING_RESULTS
            or claim.record.external_job_id is None
            or type(solution) is not NormalizedPlateSolution
        ):
            raise SolutionStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeout(connection)
                locked = (
                    (
                        await connection.execute(
                            _LOCK_SQL,
                            {
                                "submission_id": claim.record.submission_id,
                                "external_job_id": claim.record.external_job_id.value,
                                "lease_token": claim.lease_token.value,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if locked is None:
                    return RemoteFinalizationOutcome.FENCED
                await connection.execute(
                    _INSERT_SOLUTION_SQL,
                    _solution_parameters(claim, solution),
                )
                if solution.annotations:
                    await connection.execute(
                        _INSERT_ANNOTATION_SQL,
                        [
                            _annotation_parameters(claim.record.submission_id, ordinal, annotation)
                            for ordinal, annotation in enumerate(solution.annotations)
                        ],
                    )
                updated = (
                    (
                        await connection.execute(
                            _SUCCESS_SQL,
                            {
                                "submission_id": claim.record.submission_id,
                                "lease_token": claim.lease_token.value,
                            },
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if updated is None:
                    raise SolutionStorageFailure()
                await connection.execute(
                    _TRANSITION_SQL,
                    {"event_id": uuid4(), "submission_id": claim.record.submission_id},
                )
                return RemoteFinalizationOutcome.APPLIED
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except SolutionStorageFailure:
            raise
        except (
            OSError,
            SQLAlchemyError,
            TypeError,
            ValueError,
            RemoteStateValidationError,
            SolutionValidationError,
        ):
            raise SolutionStorageFailure() from None

    async def read_slice(
        self,
        submission_id: UUID,
        *,
        after_ordinal: int | None,
        limit: int,
    ) -> StoredSolutionSlice:
        if (
            not isinstance(submission_id, UUID)
            or submission_id.version != 4
            or (
                after_ordinal is not None
                and (type(after_ordinal) is not int or not 0 <= after_ordinal <= 2_047)
            )
            or type(limit) is not int
            or not 1 <= limit <= 51
        ):
            raise SolutionStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeout(connection)
                solution_row = (
                    (
                        await connection.execute(
                            _READ_SOLUTION_SQL,
                            {"submission_id": submission_id},
                        )
                    )
                    .mappings()
                    .one_or_none()
                )
                if solution_row is None:
                    raise SolutionStorageFailure()
                annotation_rows = (
                    (
                        await connection.execute(
                            _READ_ANNOTATIONS_SQL,
                            {
                                "submission_id": submission_id,
                                "after_ordinal": after_ordinal,
                                "limit": limit,
                            },
                        )
                    )
                    .mappings()
                    .all()
                )
                return _stored_solution(solution_row, annotation_rows)
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except SolutionStorageFailure:
            raise
        except (
            OSError,
            SQLAlchemyError,
            TypeError,
            ValueError,
            SolutionValidationError,
        ):
            raise SolutionStorageFailure() from None

    async def purge(self, submission_id: UUID) -> bool:
        if not isinstance(submission_id, UUID) or submission_id.version != 4:
            raise SolutionStorageFailure()
        try:
            async with self._session_factory() as session, session.begin():
                connection = await session.connection()
                await self._set_timeout(connection)
                row = (
                    (await connection.execute(_PURGE_SQL, {"submission_id": submission_id}))
                    .mappings()
                    .one_or_none()
                )
                return row is not None
        except (asyncio.CancelledError, KeyboardInterrupt, SystemExit):
            raise
        except (OSError, SQLAlchemyError, TypeError, ValueError):
            raise SolutionStorageFailure() from None

    async def _set_timeout(self, connection: AsyncConnection) -> None:
        await connection.execute(_TIMEOUT_SQL, {"timeout": self._timeout})


def _stored_solution(
    solution_row: RowMapping,
    annotation_rows: Sequence[RowMapping],
) -> StoredSolutionSlice:
    try:
        calibration = PlateCalibration(
            center_ra_deg=float(solution_row["center_ra_deg"]),
            center_dec_deg=float(solution_row["center_dec_deg"]),
            orientation_deg=float(solution_row["orientation_deg"]),
            parity=int(solution_row["parity"]),
            pixel_scale_arcsec_per_pixel=float(solution_row["pixel_scale_arcsec_per_pixel"]),
            radius_deg=float(solution_row["radius_deg"]),
        )
        wcs = NormalizedWcs(
            frame=AstrometricFrame(str(solution_row["coordinate_frame"])),
            header_text=str(solution_row["wcs_header"]),
            source_sha256=str(solution_row["wcs_source_sha256"]),
            image_width=int(solution_row["image_width"]),
            image_height=int(solution_row["image_height"]),
        )
        raw_version = solution_row["solver_version"]
        solver_version = None if raw_version is None else str(raw_version)
        annotations: list[PlateAnnotation] = []
        ordinals: list[int] = []
        for row in annotation_rows:
            raw_names = row["names"]
            if type(raw_names) not in {list, tuple}:
                raise SolutionStorageFailure()
            ordinal = int(row["ordinal"])
            annotations.append(
                PlateAnnotation(
                    category=str(row["category"]),
                    names=tuple(str(name) for name in raw_names),
                    pixel_x=float(row["pixel_x"]),
                    pixel_y=float(row["pixel_y"]),
                    ra_deg=float(row["ra_deg"]),
                    dec_deg=float(row["dec_deg"]),
                )
            )
            ordinals.append(ordinal)
        return StoredSolutionSlice(
            calibration=calibration,
            wcs=wcs,
            annotations=tuple(annotations),
            annotation_ordinals=tuple(ordinals),
            solver_name=str(solution_row["solver_name"]),
            solver_version=solver_version,
        )
    except (KeyError, TypeError, ValueError, SolutionValidationError):
        raise SolutionStorageFailure() from None


def _solution_parameters(
    claim: RemoteSolveClaim, solution: NormalizedPlateSolution
) -> dict[str, object]:
    job_id = claim.record.external_job_id
    if job_id is None:
        raise SolutionStorageFailure()
    calibration = solution.calibration
    wcs = solution.wcs
    return {
        "submission_id": claim.record.submission_id,
        "external_job_id": job_id.value,
        "coordinate_frame": wcs.frame.value,
        "center_ra_deg": calibration.center_ra_deg,
        "center_dec_deg": calibration.center_dec_deg,
        "orientation_deg": calibration.orientation_deg,
        "parity": calibration.parity,
        "pixel_scale": calibration.pixel_scale_arcsec_per_pixel,
        "radius_deg": calibration.radius_deg,
        "image_width": wcs.image_width,
        "image_height": wcs.image_height,
        "wcs_header": wcs.header_text,
        "wcs_sha256": wcs.source_sha256,
        "solver_name": solution.solver_name,
        "solver_version": solution.solver_version,
    }


def _annotation_parameters(
    submission_id: UUID, ordinal: int, annotation: object
) -> dict[str, object]:
    from lumina.identification.domain.solution import PlateAnnotation

    if type(annotation) is not PlateAnnotation or not 0 <= ordinal <= 2_047:
        raise SolutionStorageFailure()
    return {
        "submission_id": submission_id,
        "ordinal": ordinal,
        "category": annotation.category,
        "names": list(annotation.names),
        "pixel_x": annotation.pixel_x,
        "pixel_y": annotation.pixel_y,
        "ra_deg": annotation.ra_deg,
        "dec_deg": annotation.dec_deg,
    }


__all__ = ["PostgreSqlSolutionRepository"]
