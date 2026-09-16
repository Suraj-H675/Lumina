"""Secret-safe domain contracts for the Phase 6B remote Nova adapter."""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from enum import StrEnum

_MAX_REMOTE_ID = 9_223_372_036_854_775_807
_ANNOTATION_CATEGORY = re.compile(r"[a-z0-9_.-]{1,32}", re.ASCII)


class RemoteAstrometryError(RuntimeError):
    message = "Remote astrometry operation failed."

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(<redacted>)"


class RemoteAstrometryTimeout(RemoteAstrometryError):
    message = "Remote astrometry request timed out."


class RemoteAstrometryBusy(RemoteAstrometryError):
    message = "Remote astrometry is temporarily at capacity."


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


@dataclass(frozen=True, slots=True)
class NovaCalibration:
    ra_deg: float
    dec_deg: float
    orientation_deg: float
    parity: int
    pixel_scale_arcsec_per_pixel: float
    radius_deg: float

    def __post_init__(self) -> None:
        values = (
            self.ra_deg,
            self.dec_deg,
            self.orientation_deg,
            self.pixel_scale_arcsec_per_pixel,
            self.radius_deg,
        )
        if any(
            type(value) not in {int, float} or not math.isfinite(float(value)) for value in values
        ):
            raise ValueError("Nova calibration is invalid.")
        if not 0.0 <= float(self.ra_deg) < 360.0 or not -90.0 <= float(self.dec_deg) <= 90.0:
            raise ValueError("Nova calibration is invalid.")
        if not 0.0 <= float(self.orientation_deg) < 360.0:
            raise ValueError("Nova calibration is invalid.")
        if type(self.parity) is not int or self.parity not in {-1, 1}:
            raise ValueError("Nova calibration is invalid.")
        if not 0.0 < float(self.pixel_scale_arcsec_per_pixel) <= 36_000.0:
            raise ValueError("Nova calibration is invalid.")
        if not 0.0 < float(self.radius_deg) <= 180.0:
            raise ValueError("Nova calibration is invalid.")


@dataclass(frozen=True, slots=True)
class NovaAnnotation:
    category: str
    names: tuple[str, ...]
    pixel_x: float
    pixel_y: float

    def __post_init__(self) -> None:
        if type(self.category) is not str or _ANNOTATION_CATEGORY.fullmatch(self.category) is None:
            raise ValueError("Nova annotation is invalid.")
        if (
            type(self.names) is not tuple
            or not 1 <= len(self.names) <= 16
            or len(set(self.names)) != len(self.names)
            or any(type(name) is not str or not 1 <= len(name) <= 128 for name in self.names)
        ):
            raise ValueError("Nova annotation is invalid.")
        for name in self.names:
            if name != name.strip() or any(
                _unsafe_annotation_character(character) for character in name
            ):
                raise ValueError("Nova annotation is invalid.")
        if (
            type(self.pixel_x) not in {int, float}
            or type(self.pixel_y) not in {int, float}
            or not math.isfinite(float(self.pixel_x))
            or not math.isfinite(float(self.pixel_y))
            or float(self.pixel_x) < 0.0
            or float(self.pixel_y) < 0.0
        ):
            raise ValueError("Nova annotation is invalid.")


def _unsafe_annotation_character(character: str) -> bool:
    category = unicodedata.category(character)
    return category.startswith("C") or category in {"Zl", "Zp"}


class NovaJobState(StrEnum):
    SOLVING = "solving"
    SUCCESS = "success"
    FAILURE = "failure"


__all__ = [
    "NovaAnnotation",
    "NovaCalibration",
    "NovaJobId",
    "NovaJobState",
    "NovaSession",
    "NovaSubmissionId",
    "NovaSubmissionSnapshot",
    "RemoteAstrometryBusy",
    "RemoteAstrometryError",
    "RemoteAstrometryProtocolError",
    "RemoteAstrometryRejected",
    "RemoteAstrometryTimeout",
    "RemoteAstrometryUnavailable",
]
