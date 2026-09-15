"""Secret-safe domain contracts for the Phase 6B remote Nova adapter."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

_MAX_REMOTE_ID = 9_223_372_036_854_775_807


class RemoteAstrometryError(RuntimeError):
    message = "Remote astrometry operation failed."

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(<redacted>)"


class RemoteAstrometryTimeout(RemoteAstrometryError):
    message = "Remote astrometry request timed out."


class RemoteAstrometryUnavailable(RemoteAstrometryError):
    message = "Remote astrometry is temporarily unavailable."


class RemoteAstrometryRejected(RemoteAstrometryError):
    message = "Remote astrometry rejected the request."


class RemoteAstrometryProtocolError(RemoteAstrometryError):
    message = "Remote astrometry returned an incompatible response."


@dataclass(frozen=True, slots=True, repr=False)
class NovaSession:
    value: str = field(repr=False)

    def __post_init__(self) -> None:
        if (
            type(self.value) is not str
            or not 1 <= len(self.value) <= 256
            or not self.value.isascii()
            or any(not 33 <= ord(character) <= 126 for character in self.value)
        ):
            raise ValueError("Nova session is invalid.")

    def __repr__(self) -> str:
        return "NovaSession(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


@dataclass(frozen=True, slots=True)
class NovaSubmissionId:
    value: int

    def __post_init__(self) -> None:
        if type(self.value) is not int or not 1 <= self.value <= _MAX_REMOTE_ID:
            raise ValueError("Nova submission identifier is invalid.")


@dataclass(frozen=True, slots=True)
class NovaJobId:
    value: int

    def __post_init__(self) -> None:
        if type(self.value) is not int or not 1 <= self.value <= _MAX_REMOTE_ID:
            raise ValueError("Nova job identifier is invalid.")


@dataclass(frozen=True, slots=True)
class NovaSubmissionSnapshot:
    jobs: tuple[NovaJobId, ...]
    calibrated_jobs: tuple[NovaJobId, ...]

    def __post_init__(self) -> None:
        if (
            type(self.jobs) is not tuple
            or type(self.calibrated_jobs) is not tuple
            or any(type(job) is not NovaJobId for job in self.jobs)
            or any(type(job) is not NovaJobId for job in self.calibrated_jobs)
            or len({job.value for job in self.jobs}) != len(self.jobs)
            or len({job.value for job in self.calibrated_jobs}) != len(self.calibrated_jobs)
            or any(
                job.value not in {candidate.value for candidate in self.jobs}
                for job in self.calibrated_jobs
            )
        ):
            raise ValueError("Nova submission snapshot is invalid.")


class NovaJobState(StrEnum):
    SOLVING = "solving"
    SUCCESS = "success"
    FAILURE = "failure"


__all__ = [
    "NovaJobId",
    "NovaJobState",
    "NovaSession",
    "NovaSubmissionId",
    "NovaSubmissionSnapshot",
    "RemoteAstrometryError",
    "RemoteAstrometryProtocolError",
    "RemoteAstrometryRejected",
    "RemoteAstrometryTimeout",
    "RemoteAstrometryUnavailable",
]
