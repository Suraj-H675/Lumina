"""Parse and cross-check Nova FITS WCS results with Astropy."""

from __future__ import annotations

import hashlib
import math
import warnings
from io import BytesIO

from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning
from astropy.wcs.utils import proj_plane_pixel_scales

from lumina.identification.domain.nova import NovaAnnotation, NovaCalibration
from lumina.identification.domain.solution import (
    AstrometricFrame,
    NormalizedPlateSolution,
    NormalizedWcs,
    PlateAnnotation,
    PlateCalibration,
    SolutionValidationError,
)

_MAX_WCS_BYTES = 262_144


def normalize_nova_solution(
    *,
    calibration: NovaCalibration,
    annotations: tuple[NovaAnnotation, ...],
    wcs_bytes: bytes,
    image_width: int,
    image_height: int,
) -> NormalizedPlateSolution:
    if type(calibration) is not NovaCalibration or type(annotations) is not tuple:
        raise SolutionValidationError()
    if any(type(annotation) is not NovaAnnotation for annotation in annotations):
        raise SolutionValidationError()
    if type(wcs_bytes) is not bytes or not 1 <= len(wcs_bytes) <= _MAX_WCS_BYTES:
        raise SolutionValidationError()
    if type(image_width) is not int or type(image_height) is not int:
        raise SolutionValidationError()

    header, wcs = _parse_wcs(wcs_bytes, image_width=image_width, image_height=image_height)
    frame = _frame(wcs)
    normalized_calibration = PlateCalibration(
        center_ra_deg=calibration.ra_deg,
        center_dec_deg=calibration.dec_deg,
        orientation_deg=calibration.orientation_deg,
        parity=calibration.parity,
        pixel_scale_arcsec_per_pixel=calibration.pixel_scale_arcsec_per_pixel,
        radius_deg=calibration.radius_deg,
    )
    _cross_check(wcs, normalized_calibration, image_width=image_width, image_height=image_height)
    normalized_annotations = tuple(
        _annotation(annotation, wcs, image_width=image_width, image_height=image_height)
        for annotation in annotations
    )
    header_text = header.tostring(sep="\n", endcard=False, padding=False)
    normalized_wcs = NormalizedWcs(
        frame=frame,
        header_text=header_text,
        source_sha256=hashlib.sha256(wcs_bytes).hexdigest(),
        image_width=image_width,
        image_height=image_height,
    )
    return NormalizedPlateSolution(
        calibration=normalized_calibration,
        wcs=normalized_wcs,
        annotations=normalized_annotations,
    )


def _parse_wcs(content: bytes, *, image_width: int, image_height: int) -> tuple[fits.Header, WCS]:
    try:
        with fits.open(BytesIO(content), memmap=False, lazy_load_hdus=False) as hdus:
            if len(hdus) != 1 or hdus[0].data is not None:
                raise SolutionValidationError()
            source_header = hdus[0].header.copy()
        width = source_header.get("IMAGEW")
        height = source_header.get("IMAGEH")
        if (
            type(width) is not int
            or type(height) is not int
            or (width, height) != (image_width, image_height)
        ):
            raise SolutionValidationError()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FITSFixedWarning)
            celestial = WCS(source_header, relax=True).celestial
        if celestial.pixel_n_dim != 2 or celestial.world_n_dim != 2 or not celestial.has_celestial:
            raise SolutionValidationError()
        if not celestial.wcs.ctype[0].upper().startswith("RA---") or not celestial.wcs.ctype[
            1
        ].upper().startswith("DEC--"):
            raise SolutionValidationError()
        normalized_header = celestial.to_header(relax=True)
        return normalized_header, celestial
    except SolutionValidationError:
        raise
    except Exception:
        raise SolutionValidationError() from None


def _frame(wcs: WCS) -> AstrometricFrame:
    radesys = str(wcs.wcs.radesys).upper()
    equinox = float(wcs.wcs.equinox)
    if radesys == "ICRS":
        return AstrometricFrame.ICRS
    if radesys == "FK5" and math.isfinite(equinox) and math.isclose(equinox, 2000.0, abs_tol=1e-9):
        return AstrometricFrame.FK5_J2000
    raise SolutionValidationError()


def _cross_check(
    wcs: WCS, calibration: PlateCalibration, *, image_width: int, image_height: int
) -> None:
    center_x = (image_width - 1) / 2.0
    center_y = (image_height - 1) / 2.0
    try:
        center = wcs.all_pix2world([[center_x, center_y]], 0)[0]
        center_ra = float(center[0]) % 360.0
        center_dec = float(center[1])
        if not math.isfinite(center_ra) or not math.isfinite(center_dec):
            raise SolutionValidationError()
        separation = _angular_separation_arcsec(
            center_ra,
            center_dec,
            calibration.center_ra_deg,
            calibration.center_dec_deg,
        )
        if separation > max(1.0, calibration.pixel_scale_arcsec_per_pixel * 2.0):
            raise SolutionValidationError()
        scales = proj_plane_pixel_scales(wcs)
        pixel_scale = (abs(float(scales[0])) + abs(float(scales[1]))) * 1800.0
        if not math.isfinite(pixel_scale) or pixel_scale <= 0.0:
            raise SolutionValidationError()
        if (
            abs(pixel_scale - calibration.pixel_scale_arcsec_per_pixel)
            / calibration.pixel_scale_arcsec_per_pixel
            > 0.05
        ):
            raise SolutionValidationError()
        matrix = wcs.pixel_scale_matrix
        determinant = float(matrix[0, 0] * matrix[1, 1] - matrix[0, 1] * matrix[1, 0])
        if not math.isfinite(determinant) or determinant == 0.0:
            raise SolutionValidationError()
        parity = 1 if determinant > 0 else -1
        if parity != calibration.parity:
            raise SolutionValidationError()
    except SolutionValidationError:
        raise
    except Exception:
        raise SolutionValidationError() from None


def _annotation(
    annotation: NovaAnnotation, wcs: WCS, *, image_width: int, image_height: int
) -> PlateAnnotation:
    if (
        not 0.0 <= annotation.pixel_x <= image_width - 1
        or not 0.0 <= annotation.pixel_y <= image_height - 1
    ):
        raise SolutionValidationError()
    try:
        world = wcs.all_pix2world([[annotation.pixel_x, annotation.pixel_y]], 0)[0]
        ra = float(world[0]) % 360.0
        dec = float(world[1])
    except Exception:
        raise SolutionValidationError() from None
    return PlateAnnotation(
        category=annotation.category,
        names=annotation.names,
        pixel_x=annotation.pixel_x,
        pixel_y=annotation.pixel_y,
        ra_deg=ra,
        dec_deg=dec,
    )


def _angular_separation_arcsec(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    ra1_rad = math.radians(ra1)
    ra2_rad = math.radians(ra2)
    dec1_rad = math.radians(dec1)
    dec2_rad = math.radians(dec2)
    cosine = math.sin(dec1_rad) * math.sin(dec2_rad) + math.cos(dec1_rad) * math.cos(
        dec2_rad
    ) * math.cos(ra1_rad - ra2_rad)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosine)))) * 3600.0


__all__ = ["normalize_nova_solution"]
