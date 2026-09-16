from __future__ import annotations

from io import BytesIO

import pytest
from astropy.io import fits
from astropy.wcs import WCS
from lumina.identification.domain.nova import NovaAnnotation, NovaCalibration
from lumina.identification.domain.solution import AstrometricFrame, SolutionValidationError
from lumina.identification.infrastructure.wcs import normalize_nova_solution

_WIDTH = 1000
_HEIGHT = 800


def _wcs_bytes(*, image_width: int = _WIDTH, image_height: int = _HEIGHT) -> bytes:
    header = fits.Header()
    header["WCSAXES"] = 2
    header["CTYPE1"] = "RA---TAN"
    header["CTYPE2"] = "DEC--TAN"
    header["EQUINOX"] = 2000.0
    header["CRPIX1"] = (image_width + 1) / 2.0
    header["CRPIX2"] = (image_height + 1) / 2.0
    header["CRVAL1"] = 120.0
    header["CRVAL2"] = 20.0
    header["CD1_1"] = -1.0 / 3600.0
    header["CD1_2"] = 0.0
    header["CD2_1"] = 0.0
    header["CD2_2"] = 1.0 / 3600.0
    header["IMAGEW"] = image_width
    header["IMAGEH"] = image_height
    output = BytesIO()
    fits.PrimaryHDU(header=header).writeto(output)
    return output.getvalue()


def _calibration(**overrides: object) -> NovaCalibration:
    values: dict[str, object] = {
        "ra_deg": 120.0,
        "dec_deg": 20.0,
        "orientation_deg": 0.0,
        "parity": -1,
        "pixel_scale_arcsec_per_pixel": 1.0,
        "radius_deg": 0.2,
    }
    values.update(overrides)
    return NovaCalibration(**values)  # type: ignore[arg-type]


def test_normalization_derives_fk5_j2000_and_wcs_annotation_coordinates() -> None:
    annotation = NovaAnnotation(
        category="ngc",
        names=("NGC 1234",),
        pixel_x=600.0,
        pixel_y=400.0,
    )
    result = normalize_nova_solution(
        calibration=_calibration(),
        annotations=(annotation,),
        wcs_bytes=_wcs_bytes(),
        image_width=_WIDTH,
        image_height=_HEIGHT,
    )

    assert result.wcs.frame is AstrometricFrame.FK5_J2000
    assert result.wcs.image_width == _WIDTH
    assert result.wcs.image_height == _HEIGHT
    assert result.calibration.center_ra_deg == 120.0
    assert result.calibration.parity == -1
    assert result.solver_name == "astrometry.net-nova"
    assert result.solver_version is None
    assert len(result.annotations) == 1

    normalized = result.annotations[0]
    assert normalized.category == "ngc"
    assert normalized.names == ("NGC 1234",)
    assert normalized.pixel_x == 600.0
    assert normalized.pixel_y == 400.0
    assert 0.0 <= normalized.ra_deg < 360.0
    assert -90.0 <= normalized.dec_deg <= 90.0

    round_trip = WCS(fits.Header.fromstring(result.wcs.header_text, sep="\n")).celestial
    world = round_trip.all_pix2world([[normalized.pixel_x, normalized.pixel_y]], 0)[0]
    assert normalized.ra_deg == pytest.approx(float(world[0]) % 360.0, abs=1e-10)
    assert normalized.dec_deg == pytest.approx(float(world[1]), abs=1e-10)


def test_calibration_center_must_match_wcs_center() -> None:
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(ra_deg=121.0),
            annotations=(),
            wcs_bytes=_wcs_bytes(),
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )


def test_calibration_pixel_scale_and_parity_must_match_wcs() -> None:
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(pixel_scale_arcsec_per_pixel=2.0),
            annotations=(),
            wcs_bytes=_wcs_bytes(),
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(parity=1),
            annotations=(),
            wcs_bytes=_wcs_bytes(),
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )


def test_wcs_image_dimensions_must_match_private_submission() -> None:
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(),
            annotations=(),
            wcs_bytes=_wcs_bytes(image_width=_WIDTH + 1),
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )


def test_annotation_must_be_inside_validated_image() -> None:
    annotation = NovaAnnotation(
        category="hd",
        names=("HD 1",),
        pixel_x=float(_WIDTH),
        pixel_y=0.0,
    )
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(),
            annotations=(annotation,),
            wcs_bytes=_wcs_bytes(),
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )


def test_wcs_input_is_bounded_and_requires_single_header_only_hdu() -> None:
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(),
            annotations=(),
            wcs_bytes=b"x" * 262_145,
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )

    output = BytesIO()
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU()]).writeto(output)
    with pytest.raises(SolutionValidationError):
        normalize_nova_solution(
            calibration=_calibration(),
            annotations=(),
            wcs_bytes=output.getvalue(),
            image_width=_WIDTH,
            image_height=_HEIGHT,
        )


def test_sip_distortion_is_preserved_in_normalized_wcs_header() -> None:
    header = fits.Header.fromstring(
        fits.getheader(BytesIO(_wcs_bytes())).tostring(sep="\n", endcard=False, padding=False),
        sep="\n",
    )
    header["CTYPE1"] = "RA---TAN-SIP"
    header["CTYPE2"] = "DEC--TAN-SIP"
    header["A_ORDER"] = 2
    header["B_ORDER"] = 2
    header["A_2_0"] = 1.0e-8
    header["A_1_1"] = 0.0
    header["A_0_2"] = 0.0
    header["B_2_0"] = 0.0
    header["B_1_1"] = 0.0
    header["B_0_2"] = -1.0e-8
    output = BytesIO()
    fits.PrimaryHDU(header=header).writeto(output)

    result = normalize_nova_solution(
        calibration=_calibration(),
        annotations=(),
        wcs_bytes=output.getvalue(),
        image_width=_WIDTH,
        image_height=_HEIGHT,
    )

    normalized_header = fits.Header.fromstring(result.wcs.header_text, sep="\n")
    round_trip = WCS(normalized_header, relax=True).celestial
    assert normalized_header["CTYPE1"] == "RA---TAN-SIP"
    assert normalized_header["CTYPE2"] == "DEC--TAN-SIP"
    assert normalized_header["A_ORDER"] == 2
    assert normalized_header["B_ORDER"] == 2
    assert round_trip.sip is not None


@pytest.mark.parametrize("name", ["M 42\u202e", "NGC\u2066 1976", "HD\u2028 1", "X\ue000"])
def test_annotation_names_reject_invisible_or_private_unicode(name: str) -> None:
    with pytest.raises(ValueError):
        NovaAnnotation(category="ngc", names=(name,), pixel_x=1.0, pixel_y=1.0)


def test_annotation_names_allow_printable_unicode() -> None:
    annotation = NovaAnnotation(category="star", names=("α Centauri",), pixel_x=1.0, pixel_y=1.0)
    result = normalize_nova_solution(
        calibration=_calibration(),
        annotations=(annotation,),
        wcs_bytes=_wcs_bytes(),
        image_width=_WIDTH,
        image_height=_HEIGHT,
    )
    assert result.annotations[0].names == ("α Centauri",)
