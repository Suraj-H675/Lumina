"""Normalized astrometric solution contracts owned by Lumina."""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from enum import StrEnum

_SHA256 = re.compile(r"[0-9a-f]{64}", re.ASCII)
_CATEGORY = re.compile(r"[a-z0-9_.-]{1,32}", re.ASCII)


class AstrometricFrame(StrEnum):
    ICRS = "icrs"
    FK5_J2000 = "fk5_j2000"


class SolutionValidationError(ValueError):
    def __init__(self) -> None:
        super().__init__("Normalized astrometric solution is invalid.")


class SolutionStorageFailure(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Normalized astrometric solution storage failed.")

    def __repr__(self) -> str:
        return "SolutionStorageFailure(<redacted>)"


@dataclass(frozen=True, slots=True)
class PlateCalibration:
    center_ra_deg: float
    center_dec_deg: float
    orientation_deg: float
    parity: int
    pixel_scale_arcsec_per_pixel: float
    radius_deg: float

    def __post_init__(self) -> None:
        values = (
            self.center_ra_deg,
            self.center_dec_deg,
            self.orientation_deg,
            self.pixel_scale_arcsec_per_pixel,
            self.radius_deg,
        )
        if any(
            type(value) not in {int, float} or not math.isfinite(float(value)) for value in values
        ):
            raise SolutionValidationError()
        if not 0.0 <= float(self.center_ra_deg) < 360.0:
            raise SolutionValidationError()
        if not -90.0 <= float(self.center_dec_deg) <= 90.0:
            raise SolutionValidationError()
        if not 0.0 <= float(self.orientation_deg) < 360.0:
            raise SolutionValidationError()
        if type(self.parity) is not int or self.parity not in {-1, 1}:
            raise SolutionValidationError()
        if not 0.0 < float(self.pixel_scale_arcsec_per_pixel) <= 36_000.0:
            raise SolutionValidationError()
        if not 0.0 < float(self.radius_deg) <= 180.0:
            raise SolutionValidationError()


@dataclass(frozen=True, slots=True)
class NormalizedWcs:
    frame: AstrometricFrame
    header_text: str
    source_sha256: str
    image_width: int
    image_height: int

    def __post_init__(self) -> None:
        if type(self.frame) is not AstrometricFrame:
            raise SolutionValidationError()
        if (
            type(self.header_text) is not str
            or not 1 <= len(self.header_text.encode("ascii", errors="strict")) <= 65_536
        ):
            raise SolutionValidationError()
        if type(self.source_sha256) is not str or _SHA256.fullmatch(self.source_sha256) is None:
            raise SolutionValidationError()
        if (
            type(self.image_width) is not int
            or type(self.image_height) is not int
            or not 1 <= self.image_width <= 100_000
            or not 1 <= self.image_height <= 100_000
        ):
            raise SolutionValidationError()


@dataclass(frozen=True, slots=True)
class PlateAnnotation:
    category: str
    names: tuple[str, ...]
    pixel_x: float
    pixel_y: float
    ra_deg: float
    dec_deg: float

    def __post_init__(self) -> None:
        if type(self.category) is not str or _CATEGORY.fullmatch(self.category) is None:
            raise SolutionValidationError()
        if (
            type(self.names) is not tuple
            or not 1 <= len(self.names) <= 16
            or len(set(self.names)) != len(self.names)
            or any(type(name) is not str or not 1 <= len(name) <= 128 for name in self.names)
        ):
            raise SolutionValidationError()
        for name in self.names:
            if name != name.strip() or any(
                _unsafe_annotation_character(character) for character in name
            ):
                raise SolutionValidationError()
        values = (self.pixel_x, self.pixel_y, self.ra_deg, self.dec_deg)
        if any(
            type(value) not in {int, float} or not math.isfinite(float(value)) for value in values
        ):
            raise SolutionValidationError()
        if float(self.pixel_x) < 0.0 or float(self.pixel_y) < 0.0:
            raise SolutionValidationError()
        if not 0.0 <= float(self.ra_deg) < 360.0 or not -90.0 <= float(self.dec_deg) <= 90.0:
            raise SolutionValidationError()


def _unsafe_annotation_character(character: str) -> bool:
    category = unicodedata.category(character)
    return category.startswith("C") or category in {"Zl", "Zp"}


@dataclass(frozen=True, slots=True)
class NormalizedPlateSolution:
    calibration: PlateCalibration
    wcs: NormalizedWcs
    annotations: tuple[PlateAnnotation, ...]
    solver_name: str = "astrometry.net-nova"
    solver_version: str | None = None

    def __post_init__(self) -> None:
        if type(self.calibration) is not PlateCalibration or type(self.wcs) is not NormalizedWcs:
            raise SolutionValidationError()
        if (
            type(self.annotations) is not tuple
            or len(self.annotations) > 2_048
            or any(type(annotation) is not PlateAnnotation for annotation in self.annotations)
        ):
            raise SolutionValidationError()
        if self.solver_name != "astrometry.net-nova" or self.solver_version is not None:
            raise SolutionValidationError()


__all__ = [
    "AstrometricFrame",
    "NormalizedPlateSolution",
    "NormalizedWcs",
    "PlateAnnotation",
    "PlateCalibration",
    "SolutionStorageFailure",
    "SolutionValidationError",
]
