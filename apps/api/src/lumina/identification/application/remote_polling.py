"""Durable Phase 6B remote-solver lifecycle advancement."""

from __future__ import annotations

import hashlib
import secrets
from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from lumina.identification.domain.nova import (
    NovaJobId,
    NovaJobState,
    NovaSession,
    NovaSubmissionId,
    NovaSubmissionSnapshot,
    RemoteAstrometryProtocolError,
    RemoteAstrometryRejected,
    RemoteAstrometryTimeout,
    RemoteAstrometryUnavailable,
)
from lumina.identification.domain.remote_raster import SanitizedRemoteRaster, sanitize_remote_raster
from lumina.identification.domain.remote_state import (
    RemoteFinalizationOutcome,
    RemoteLeaseToken,
    RemoteSolveClaim,
    RemoteSolveState,
    RemoteStateStorageFailure,
    RemoteTransitionReason,
)
from lumina.identification.domain.storage import PrivateObjectStore, PrivateStorageError
from lumina.identification.domain.submissions import (
    IdentificationSolverType,
    IdentificationSubmission,
    SubmissionNotFound,
    SubmissionStorageFailure,
)
from lumina.identification.domain.uploads import (
    UploadRejected,
    UploadValidationPolicy,
    validate_raster_upload,
)

_LEASE_SECONDS = 300


class RemoteSolveRepository(Protocol):
    async def claim_due(
        self, *, lease_token: RemoteLeaseToken, lease_seconds: int
    ) -> RemoteSolveClaim | None: ...

    async def mark_upload_attempt(self, claim: RemoteSolveClaim) -> RemoteFinalizationOutcome: ...

    async def reschedule(
        self, claim: RemoteSolveClaim, *, poll_seconds: int, polled: bool
    ) -> RemoteFinalizationOutcome: ...

    async def transition(
        self,
        claim: RemoteSolveClaim,
        *,
        to_state: RemoteSolveState,
        reason: RemoteTransitionReason,
        poll_seconds: int | None = None,
        external_submission_id: NovaSubmissionId | None = None,
        external_job_id: NovaJobId | None = None,
    ) -> RemoteFinalizationOutcome: ...


class SubmissionReader(Protocol):
    async def read(self, submission_id: UUID) -> IdentificationSubmission: ...


class NovaRemoteSolver(Protocol):
    async def login(self) -> NovaSession: ...

    async def upload(
        self, session: NovaSession, raster: SanitizedRemoteRaster
    ) -> NovaSubmissionId: ...

    async def submission_status(
        self, session: NovaSession, submission_id: NovaSubmissionId
    ) -> NovaSubmissionSnapshot: ...

    async def job_status(self, session: NovaSession, job_id: NovaJobId) -> NovaJobState: ...


class RemotePollingFailure(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Remote identification polling failed.")


class RemoteSolvePollingService:
    """Advance at most one durable Nova solve without consuming job attempts."""

    def __init__(
        self,
        repository: RemoteSolveRepository,
        submissions: SubmissionReader,
        store: PrivateObjectStore,
        solver: NovaRemoteSolver,
        policy: UploadValidationPolicy,
        *,
        poll_seconds: int,
        token_factory: Callable[[], str] | None = None,
    ) -> None:
        if type(poll_seconds) is not int or not 1 <= poll_seconds <= 60:
            raise ValueError("Remote identification poll interval is invalid.")
        self._repository = repository
        self._submissions = submissions
        self._store = store
        self._solver = solver
        self._policy = policy
        self._poll_seconds = poll_seconds
        self._token_factory = token_factory or (lambda: secrets.token_hex(32))

    async def advance(self) -> int:
        token = RemoteLeaseToken(self._token_factory())
        try:
            claim = await self._repository.claim_due(
                lease_token=token,
                lease_seconds=_LEASE_SECONDS,
            )
        except RemoteStateStorageFailure:
            raise RemotePollingFailure() from None
        if claim is None:
            return 0
        if claim.database_claimed_at >= claim.record.deadline_at:
            await self._transition(
                claim,
                to_state=RemoteSolveState.EXPIRED,
                reason=RemoteTransitionReason.SOLVER_TIMEOUT,
            )
            return 1
        if claim.record.state is RemoteSolveState.SUBMITTING:
            await self._advance_submitting(claim)
        elif claim.record.state in {RemoteSolveState.WAITING_FOR_SOLVER, RemoteSolveState.SOLVING}:
            if await self._stop_if_locally_deleted(claim):
                return 1
            if claim.record.state is RemoteSolveState.WAITING_FOR_SOLVER:
                await self._advance_waiting(claim)
            else:
                await self._advance_solving(claim)
        else:
            raise RemotePollingFailure()
        return 1

    async def _advance_submitting(self, claim: RemoteSolveClaim) -> None:
        if claim.record.upload_attempted_at is not None:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.REMOTE_SUBMISSION_OUTCOME_UNKNOWN,
            )
            return
        raster = await self._load_remote_raster(claim)
        if raster is None:
            return
        session = await self._login_or_reschedule(claim)
        if session is None:
            return
        try:
            marked = await self._repository.mark_upload_attempt(claim)
        except RemoteStateStorageFailure:
            raise RemotePollingFailure() from None
        if marked is RemoteFinalizationOutcome.FENCED:
            return
        try:
            submission_id = await self._solver.upload(session, raster)
        except RemoteAstrometryRejected:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_REJECTED,
            )
            return
        except (
            RemoteAstrometryTimeout,
            RemoteAstrometryUnavailable,
            RemoteAstrometryProtocolError,
        ):
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.REMOTE_SUBMISSION_OUTCOME_UNKNOWN,
            )
            return
        await self._transition(
            claim,
            to_state=RemoteSolveState.WAITING_FOR_SOLVER,
            reason=RemoteTransitionReason.REMOTE_UPLOAD_ACCEPTED,
            poll_seconds=self._poll_seconds,
            external_submission_id=submission_id,
        )

    async def _advance_waiting(self, claim: RemoteSolveClaim) -> None:
        submission_id = claim.record.external_submission_id
        if submission_id is None:
            raise RemotePollingFailure()
        session = await self._login_or_reschedule(claim)
        if session is None:
            return
        try:
            snapshot = await self._solver.submission_status(session, submission_id)
        except (RemoteAstrometryTimeout, RemoteAstrometryUnavailable):
            await self._reschedule(claim, polled=True)
            return
        except RemoteAstrometryRejected:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_REJECTED,
            )
            return
        except RemoteAstrometryProtocolError:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_PROTOCOL_ERROR,
            )
            return
        if not snapshot.jobs:
            await self._reschedule(claim, polled=True)
            return
        if len(snapshot.jobs) != 1:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_PROTOCOL_ERROR,
            )
            return
        await self._transition(
            claim,
            to_state=RemoteSolveState.SOLVING,
            reason=RemoteTransitionReason.REMOTE_JOB_RESOLVED,
            poll_seconds=self._poll_seconds,
            external_job_id=snapshot.jobs[0],
        )

    async def _advance_solving(self, claim: RemoteSolveClaim) -> None:
        job_id = claim.record.external_job_id
        if job_id is None:
            raise RemotePollingFailure()
        session = await self._login_or_reschedule(claim)
        if session is None:
            return
        try:
            state = await self._solver.job_status(session, job_id)
        except (RemoteAstrometryTimeout, RemoteAstrometryUnavailable):
            await self._reschedule(claim, polled=True)
            return
        except RemoteAstrometryRejected:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_REJECTED,
            )
            return
        except RemoteAstrometryProtocolError:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_PROTOCOL_ERROR,
            )
            return
        if state is NovaJobState.SOLVING:
            await self._reschedule(claim, polled=True)
        elif state is NovaJobState.SUCCESS:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FETCHING_RESULTS,
                reason=RemoteTransitionReason.REMOTE_JOB_SUCCEEDED,
                poll_seconds=self._poll_seconds,
            )
        elif state is NovaJobState.FAILURE:
            await self._transition(
                claim,
                to_state=RemoteSolveState.UNSOLVED,
                reason=RemoteTransitionReason.NO_ASTROMETRIC_SOLUTION,
            )
        else:
            raise RemotePollingFailure()

    async def _load_remote_raster(self, claim: RemoteSolveClaim) -> SanitizedRemoteRaster | None:
        try:
            submission = await self._submissions.read(claim.record.submission_id)
        except (SubmissionNotFound, SubmissionStorageFailure):
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.LOCAL_INPUT_UNAVAILABLE,
            )
            return None
        if submission.deleted:
            await self._transition(
                claim,
                to_state=RemoteSolveState.DELETED,
                reason=RemoteTransitionReason.LOCAL_DELETED,
            )
            return None
        if (
            submission.solver_type is not IdentificationSolverType.NOVA
            or submission.consent_remote_processing is not True
            or submission.storage_object_key is None
            or submission.sha256 is None
        ):
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.LOCAL_INPUT_UNAVAILABLE,
            )
            return None
        try:
            content = self._store.read(
                submission.storage_object_key,
                maximum_bytes=submission.byte_size,
            )
            if len(content) != submission.byte_size:
                raise PrivateStorageError()
            if hashlib.sha256(content).hexdigest() != submission.sha256:
                raise PrivateStorageError()
            upload = validate_raster_upload(
                content,
                declared_media_type=submission.media_type.value,
                policy=self._policy,
            )
            if (upload.width, upload.height) != (submission.width, submission.height):
                raise PrivateStorageError()
            return sanitize_remote_raster(upload)
        except (PrivateStorageError, UploadRejected):
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.LOCAL_INPUT_UNAVAILABLE,
            )
            return None

    async def _stop_if_locally_deleted(self, claim: RemoteSolveClaim) -> bool:
        try:
            submission = await self._submissions.read(claim.record.submission_id)
        except (SubmissionNotFound, SubmissionStorageFailure):
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.LOCAL_INPUT_UNAVAILABLE,
            )
            return True
        if submission.deleted:
            await self._transition(
                claim,
                to_state=RemoteSolveState.DELETED,
                reason=RemoteTransitionReason.LOCAL_DELETED,
            )
            return True
        if (
            submission.solver_type is not IdentificationSolverType.NOVA
            or submission.consent_remote_processing is not True
        ):
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.LOCAL_INPUT_UNAVAILABLE,
            )
            return True
        return False

    async def _login_or_reschedule(self, claim: RemoteSolveClaim) -> NovaSession | None:
        try:
            return await self._solver.login()
        except (RemoteAstrometryTimeout, RemoteAstrometryUnavailable):
            await self._reschedule(claim, polled=False)
            return None
        except RemoteAstrometryRejected:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_REJECTED,
            )
            return None
        except RemoteAstrometryProtocolError:
            await self._transition(
                claim,
                to_state=RemoteSolveState.FAILED,
                reason=RemoteTransitionReason.PROVIDER_PROTOCOL_ERROR,
            )
            return None

    async def _reschedule(self, claim: RemoteSolveClaim, *, polled: bool) -> None:
        try:
            await self._repository.reschedule(
                claim,
                poll_seconds=self._poll_seconds,
                polled=polled,
            )
        except RemoteStateStorageFailure:
            raise RemotePollingFailure() from None

    async def _transition(
        self,
        claim: RemoteSolveClaim,
        *,
        to_state: RemoteSolveState,
        reason: RemoteTransitionReason,
        poll_seconds: int | None = None,
        external_submission_id: NovaSubmissionId | None = None,
        external_job_id: NovaJobId | None = None,
    ) -> None:
        try:
            await self._repository.transition(
                claim,
                to_state=to_state,
                reason=reason,
                poll_seconds=poll_seconds,
                external_submission_id=external_submission_id,
                external_job_id=external_job_id,
            )
        except (RemoteStateStorageFailure, TypeError, ValueError):
            raise RemotePollingFailure() from None

    def __repr__(self) -> str:
        return "RemoteSolvePollingService(<redacted>)"


__all__ = ["RemotePollingFailure", "RemoteSolvePollingService"]
