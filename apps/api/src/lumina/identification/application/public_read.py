"""Solver-neutral public-safe identification read services."""

from __future__ import annotations

import json
from typing import Protocol
from uuid import UUID

from lumina.identification.domain.public_read import (
    IdentificationPublicReadFailure,
    IdentificationPublicState,
    IdentificationSolutionNotReady,
    PublicIdentificationStatus,
    PublicSolutionPage,
    SolutionAnnotationCursor,
    StoredSolutionSlice,
    decode_solution_cursor,
    encode_solution_cursor,
)
from lumina.identification.domain.remote_state import RemoteSolveRecord, RemoteSolveState
from lumina.identification.domain.solution import PlateAnnotation
from lumina.identification.domain.submissions import (
    IdentificationSolverType,
    IdentificationSubmission,
    IdentificationSubmissionStatus,
)

_MAX_ANNOTATION_VISIBLE = 50
_MAX_ANNOTATION_QUERY = _MAX_ANNOTATION_VISIBLE + 1
_ANNOTATION_PUBLIC_BYTE_BUDGET = 24_576


class SubmissionPublicReader(Protocol):
    async def read(self, submission_id: UUID) -> IdentificationSubmission: ...

    async def read_status(self, submission_id: UUID) -> IdentificationSubmissionStatus: ...


class RemotePublicReader(Protocol):
    async def read(self, submission_id: UUID) -> RemoteSolveRecord: ...


class SolutionPublicReader(Protocol):
    async def read_slice(
        self,
        submission_id: UUID,
        *,
        after_ordinal: int | None,
        limit: int,
    ) -> StoredSolutionSlice: ...


class IdentificationPublicReadService:
    def __init__(
        self,
        submissions: SubmissionPublicReader,
        remote: RemotePublicReader,
        solutions: SolutionPublicReader,
    ) -> None:
        self._submissions = submissions
        self._remote = remote
        self._solutions = solutions

    async def status(self, submission_id: UUID) -> PublicIdentificationStatus:
        submission = await self._submissions.read(submission_id)
        if submission.deleted:
            return PublicIdentificationStatus(
                submission_id=submission.id,
                job_id=submission.job_id,
                solver_type=submission.solver_type,
                remote_processing=submission.consent_remote_processing,
                state=IdentificationPublicState.DELETED,
                progress=None,
                fake_result=None,
                error_code=None,
                solution_available=False,
                created_at=submission.created_at,
                completed_at=None,
                deleted_at=submission.deleted_at,
            )
        if submission.solver_type is IdentificationSolverType.FAKE:
            if submission.consent_remote_processing or submission.job_id is None:
                raise IdentificationPublicReadFailure()
            return _fake_status(await self._submissions.read_status(submission_id))
        if (
            submission.solver_type is not IdentificationSolverType.NOVA
            or not submission.consent_remote_processing
            or submission.job_id is not None
        ):
            raise IdentificationPublicReadFailure()
        return _remote_status(submission, await self._remote.read(submission_id))

    async def solution(
        self, submission_id: UUID, *, cursor: object | None = None
    ) -> PublicSolutionPage:
        submission = await self._submissions.read(submission_id)
        if submission.deleted:
            raise IdentificationSolutionNotReady()
        if (
            submission.solver_type is not IdentificationSolverType.NOVA
            or not submission.consent_remote_processing
            or submission.job_id is not None
        ):
            raise IdentificationSolutionNotReady()
        remote = await self._remote.read(submission_id)
        if remote.state is not RemoteSolveState.SUCCEEDED or remote.terminal_at is None:
            raise IdentificationSolutionNotReady()
        decoded = (
            None if cursor is None else decode_solution_cursor(cursor, submission_id=submission_id)
        )
        result = await self._solutions.read_slice(
            submission_id,
            after_ordinal=None if decoded is None else decoded.ordinal,
            limit=_MAX_ANNOTATION_QUERY,
        )
        visible_count = _visible_annotation_count(result)
        visible = result.annotations[:visible_count]
        ordinals = result.annotation_ordinals[:visible_count]
        has_more = visible_count < len(result.annotations)
        next_cursor = (
            encode_solution_cursor(SolutionAnnotationCursor(submission_id, ordinals[-1]))
            if has_more and ordinals
            else None
        )
        return PublicSolutionPage(
            submission_id=submission_id,
            calibration=result.calibration,
            wcs=result.wcs,
            annotations=visible,
            solver_name=result.solver_name,
            solver_version=result.solver_version,
            next_cursor=next_cursor,
            has_more=has_more,
        )


def _fake_status(status: IdentificationSubmissionStatus) -> PublicIdentificationStatus:
    return PublicIdentificationStatus(
        submission_id=status.submission_id,
        job_id=status.job_id,
        solver_type=IdentificationSolverType.FAKE,
        remote_processing=False,
        state=IdentificationPublicState(status.state.value),
        progress=status.progress,
        fake_result=status.result,
        error_code=status.error_code,
        solution_available=False,
        created_at=status.created_at,
        completed_at=status.completed_at,
        deleted_at=status.deleted_at,
    )


def _remote_status(
    submission: IdentificationSubmission, remote: RemoteSolveRecord
) -> PublicIdentificationStatus:
    if remote.submission_id != submission.id or remote.created_at < submission.created_at:
        raise IdentificationPublicReadFailure()
    error_code = (
        remote.safe_reason.value
        if remote.state in {RemoteSolveState.FAILED, RemoteSolveState.EXPIRED}
        and remote.safe_reason is not None
        else None
    )
    return PublicIdentificationStatus(
        submission_id=submission.id,
        job_id=None,
        solver_type=IdentificationSolverType.NOVA,
        remote_processing=True,
        state=IdentificationPublicState(remote.state.value),
        progress=None,
        fake_result=None,
        error_code=error_code,
        solution_available=remote.state is RemoteSolveState.SUCCEEDED,
        created_at=submission.created_at,
        completed_at=remote.terminal_at,
        deleted_at=None,
    )


def _visible_annotation_count(result: StoredSolutionSlice) -> int:
    used = 0
    count = 0
    for annotation in result.annotations[:_MAX_ANNOTATION_VISIBLE]:
        serialized_size = _annotation_public_size(annotation)
        if count and used + serialized_size > _ANNOTATION_PUBLIC_BYTE_BUDGET:
            break
        if not count and serialized_size > _ANNOTATION_PUBLIC_BYTE_BUDGET:
            raise IdentificationPublicReadFailure()
        used += serialized_size
        count += 1
    return count


def _annotation_public_size(annotation: object) -> int:
    if not isinstance(annotation, PlateAnnotation):
        raise IdentificationPublicReadFailure()
    try:
        payload = json.dumps(
            {
                "category": annotation.category,
                "dec_deg": annotation.dec_deg,
                "names": annotation.names,
                "pixel_x": annotation.pixel_x,
                "pixel_y": annotation.pixel_y,
                "ra_deg": annotation.ra_deg,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise IdentificationPublicReadFailure() from None
    return len(payload) + 1


__all__ = ["IdentificationPublicReadService"]
