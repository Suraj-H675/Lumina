"""Public-safe identification status and solution pagination contracts."""

from __future__ import annotations

import base64
import binascii
import json
import math
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from lumina.identification.domain.solution import NormalizedWcs, PlateAnnotation, PlateCalibration
from lumina.identification.domain.submissions import FakeSolverResult, IdentificationSolverType

_CURSOR = re.compile(r"[A-Za-z0-9_-]+", re.ASCII)
_CURSOR_VERSION = 1
_MAX_CURSOR_BYTES = 512
_ERROR_CODE = re.compile(r"[a-z][a-z0-9_.-]{0,127}", re.ASCII)


class IdentificationRemoteCondition(StrEnum):
    PROVIDER_BUSY = "provider_busy"
    PROVIDER_UNAVAILABLE = "provider_unavailable"


class IdentificationPublicState(StrEnum):
    CREATED = "created"
    QUEUED = "queued"
    RUNNING = "running"
    SUBMITTING = "submitting"
    WAITING_FOR_SOLVER = "waiting_for_solver"
    SOLVING = "solving"
    FETCHING_RESULTS = "fetching_results"
    SUCCEEDED = "succeeded"
    UNSOLVED = "unsolved"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"
    EXPIRED = "expired"
    DELETED = "deleted"


class IdentificationPublicReadFailure(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Identification read failed.")


class IdentificationSolutionNotReady(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Identification solution is not available.")


class IdentificationReadValidationError(ValueError):
    def __init__(self) -> None:
        super().__init__("Identification read request is invalid.")


@dataclass(frozen=True, slots=True)
class PublicIdentificationStatus:
    submission_id: UUID
    job_id: UUID | None
    solver_type: IdentificationSolverType
    remote_processing: bool
    state: IdentificationPublicState
    progress: float | None
    fake_result: FakeSolverResult | None
    remote_condition: IdentificationRemoteCondition | None
    error_code: str | None
    solution_available: bool
    created_at: datetime
    completed_at: datetime | None
    deleted_at: datetime | None

    def __post_init__(self) -> None:
        if (
            not isinstance(self.submission_id, UUID)
            or self.submission_id.version != 4
            or (
                self.job_id is not None
                and (not isinstance(self.job_id, UUID) or self.job_id.version != 4)
            )
            or type(self.solver_type) is not IdentificationSolverType
            or type(self.remote_processing) is not bool
            or type(self.state) is not IdentificationPublicState
            or type(self.solution_available) is not bool
            or (
                self.progress is not None
                and (
                    type(self.progress) not in {int, float}
                    or not math.isfinite(float(self.progress))
                    or not 0.0 <= float(self.progress) <= 1.0
                )
            )
            or (self.fake_result is not None and type(self.fake_result) is not FakeSolverResult)
            or (
                self.remote_condition is not None
                and type(self.remote_condition) is not IdentificationRemoteCondition
            )
            or (
                self.error_code is not None
                and (
                    type(self.error_code) is not str
                    or _ERROR_CODE.fullmatch(self.error_code) is None
                )
            )
        ):
            raise IdentificationPublicReadFailure()
        object.__setattr__(self, "created_at", _utc(self.created_at))
        if self.completed_at is not None:
            object.__setattr__(self, "completed_at", _utc(self.completed_at))
        if self.deleted_at is not None:
            object.__setattr__(self, "deleted_at", _utc(self.deleted_at))
        if self.state is IdentificationPublicState.DELETED:
            if (
                self.deleted_at is None
                or self.solution_available
                or self.fake_result is not None
                or self.remote_condition is not None
            ):
                raise IdentificationPublicReadFailure()
            return
        if self.deleted_at is not None:
            raise IdentificationPublicReadFailure()
        if self.solver_type is IdentificationSolverType.FAKE:
            if (
                self.remote_processing
                or self.job_id is None
                or self.progress is None
                or self.solution_available
                or self.remote_condition is not None
                or (self.state is IdentificationPublicState.SUCCEEDED)
                != (self.fake_result is not None)
            ):
                raise IdentificationPublicReadFailure()
            if self.state in {
                IdentificationPublicState.SUBMITTING,
                IdentificationPublicState.WAITING_FOR_SOLVER,
                IdentificationPublicState.SOLVING,
                IdentificationPublicState.FETCHING_RESULTS,
                IdentificationPublicState.UNSOLVED,
                IdentificationPublicState.EXPIRED,
            }:
                raise IdentificationPublicReadFailure()
        elif self.solver_type is IdentificationSolverType.NOVA:
            if (
                not self.remote_processing
                or self.job_id is not None
                or self.progress is not None
                or self.fake_result is not None
                or self.state
                in {
                    IdentificationPublicState.CREATED,
                    IdentificationPublicState.QUEUED,
                    IdentificationPublicState.RUNNING,
                    IdentificationPublicState.DEAD_LETTER,
                }
                or self.solution_available != (self.state is IdentificationPublicState.SUCCEEDED)
            ):
                raise IdentificationPublicReadFailure()
            pollable = self.state in {
                IdentificationPublicState.SUBMITTING,
                IdentificationPublicState.WAITING_FOR_SOLVER,
                IdentificationPublicState.SOLVING,
                IdentificationPublicState.FETCHING_RESULTS,
            }
            if (
                self.remote_condition is IdentificationRemoteCondition.PROVIDER_UNAVAILABLE
                and not pollable
            ):
                raise IdentificationPublicReadFailure()
            if self.remote_condition is IdentificationRemoteCondition.PROVIDER_BUSY and not (
                pollable or self.state is IdentificationPublicState.FAILED
            ):
                raise IdentificationPublicReadFailure()
            if pollable and self.error_code is not None:
                raise IdentificationPublicReadFailure()
            if (
                self.state is IdentificationPublicState.FAILED
                and self.remote_condition is IdentificationRemoteCondition.PROVIDER_BUSY
                and self.error_code != "provider_busy"
            ):
                raise IdentificationPublicReadFailure()
        terminal = self.state in {
            IdentificationPublicState.SUCCEEDED,
            IdentificationPublicState.UNSOLVED,
            IdentificationPublicState.FAILED,
            IdentificationPublicState.DEAD_LETTER,
            IdentificationPublicState.EXPIRED,
        }
        if terminal != (self.completed_at is not None):
            raise IdentificationPublicReadFailure()


@dataclass(frozen=True, slots=True)
class SolutionAnnotationCursor:
    submission_id: UUID
    ordinal: int

    def __post_init__(self) -> None:
        if (
            not isinstance(self.submission_id, UUID)
            or self.submission_id.version != 4
            or type(self.ordinal) is not int
            or not 0 <= self.ordinal <= 2_047
        ):
            raise IdentificationReadValidationError()


@dataclass(frozen=True, slots=True)
class StoredSolutionSlice:
    calibration: PlateCalibration
    wcs: NormalizedWcs
    annotations: tuple[PlateAnnotation, ...]
    annotation_ordinals: tuple[int, ...]
    solver_name: str
    solver_version: str | None

    def __post_init__(self) -> None:
        if (
            type(self.calibration) is not PlateCalibration
            or type(self.wcs) is not NormalizedWcs
            or type(self.annotations) is not tuple
            or type(self.annotation_ordinals) is not tuple
            or len(self.annotations) != len(self.annotation_ordinals)
            or any(type(item) is not PlateAnnotation for item in self.annotations)
            or any(
                type(value) is not int or not 0 <= value <= 2_047
                for value in self.annotation_ordinals
            )
            or tuple(sorted(self.annotation_ordinals)) != self.annotation_ordinals
            or len(set(self.annotation_ordinals)) != len(self.annotation_ordinals)
            or self.solver_name != "astrometry.net-nova"
            or (self.solver_version is not None and type(self.solver_version) is not str)
        ):
            raise IdentificationPublicReadFailure()


@dataclass(frozen=True, slots=True)
class PublicSolutionPage:
    submission_id: UUID
    calibration: PlateCalibration
    wcs: NormalizedWcs
    annotations: tuple[PlateAnnotation, ...]
    solver_name: str
    solver_version: str | None
    next_cursor: str | None
    has_more: bool

    def __post_init__(self) -> None:
        if (
            not isinstance(self.submission_id, UUID)
            or self.submission_id.version != 4
            or type(self.calibration) is not PlateCalibration
            or type(self.wcs) is not NormalizedWcs
            or type(self.annotations) is not tuple
            or len(self.annotations) > 50
            or any(type(annotation) is not PlateAnnotation for annotation in self.annotations)
            or self.solver_name != "astrometry.net-nova"
            or (self.solver_version is not None and type(self.solver_version) is not str)
            or type(self.has_more) is not bool
            or (
                self.next_cursor is not None
                and (
                    type(self.next_cursor) is not str
                    or not self.next_cursor
                    or len(self.next_cursor) > _MAX_CURSOR_BYTES
                    or _CURSOR.fullmatch(self.next_cursor) is None
                )
            )
            or self.has_more != (self.next_cursor is not None)
            or (self.has_more and not self.annotations)
        ):
            raise IdentificationPublicReadFailure()


def encode_solution_cursor(cursor: SolutionAnnotationCursor) -> str:
    if type(cursor) is not SolutionAnnotationCursor:
        raise IdentificationReadValidationError()
    raw = json.dumps(
        {"k": "solution_annotations", "o": cursor.ordinal, "s": str(cursor.submission_id), "v": 1},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("ascii")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_solution_cursor(value: object, *, submission_id: UUID) -> SolutionAnnotationCursor:
    if (
        type(value) is not str
        or not value
        or len(value) > _MAX_CURSOR_BYTES
        or _CURSOR.fullmatch(value) is None
    ):
        raise IdentificationReadValidationError()
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        if not raw or len(raw) > _MAX_CURSOR_BYTES or not raw.isascii():
            raise ValueError
        if base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") != value:
            raise ValueError
        decoded = json.loads(raw, object_pairs_hook=_no_duplicates)
        canonical = json.dumps(decoded, separators=(",", ":"), sort_keys=True).encode("ascii")
        if raw != canonical or type(decoded) is not dict or set(decoded) != {"k", "o", "s", "v"}:
            raise ValueError
        if decoded["v"] != _CURSOR_VERSION or decoded["k"] != "solution_annotations":
            raise ValueError
        if type(decoded["s"]) is not str or type(decoded["o"]) is not int:
            raise ValueError
        cursor = SolutionAnnotationCursor(UUID(decoded["s"]), decoded["o"])
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
        raise IdentificationReadValidationError() from None
    if cursor.submission_id != submission_id:
        raise IdentificationReadValidationError()
    return cursor


def _utc(value: object) -> datetime:
    if not isinstance(value, datetime) or value.tzinfo is None:
        raise IdentificationPublicReadFailure()
    return value.astimezone(UTC)


def _no_duplicates(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError
        result[key] = value
    return result


__all__ = [
    "IdentificationPublicReadFailure",
    "IdentificationPublicState",
    "IdentificationRemoteCondition",
    "IdentificationReadValidationError",
    "IdentificationSolutionNotReady",
    "PublicIdentificationStatus",
    "PublicSolutionPage",
    "SolutionAnnotationCursor",
    "StoredSolutionSlice",
    "decode_solution_cursor",
    "encode_solution_cursor",
]
