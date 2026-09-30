"""Adversarial validation tests for private raster uploads."""

from __future__ import annotations

import struct

import pytest
from fakes.raster import black_rgb_png
from lumina.identification.domain.uploads import (
    UploadDimensionsRejected,
    UploadMalformed,
    UploadMediaType,
    UploadTooLarge,
    UploadTypeMismatch,
    UploadTypeUnsupported,
    UploadValidationPolicy,
    validate_raster_upload,
)


def _jpeg(width: int = 16, height: int = 16) -> bytes:
    app0 = b"\xff\xe0" + struct.pack(">H", 4) + b"JF"
    sof_data = bytes([8]) + struct.pack(">HHB", height, width, 3) + b"\x01\x11\x00"
    sof = b"\xff\xc0" + struct.pack(">H", len(sof_data) + 2) + sof_data
    sos_data = b"\x03\x01\x00\x00"
    sos = b"\xff\xda" + struct.pack(">H", len(sos_data) + 2) + sos_data
    return b"\xff\xd8" + app0 + sof + sos + b"\x00\x11\x22" + b"\xff\xd9"


def _policy(**overrides: int) -> UploadValidationPolicy:
    values = {"max_bytes": 1_000_000, "max_pixels": 10_000_000, "min_dimension": 8}
    values.update(overrides)
    return UploadValidationPolicy(**values)


def test_valid_png_and_jpeg_are_classified_from_bytes() -> None:
    png = validate_raster_upload(black_rgb_png(), declared_media_type="image/png", policy=_policy())
    jpeg = validate_raster_upload(_jpeg(), declared_media_type="image/jpeg", policy=_policy())

    assert (png.media_type, png.width, png.height) == (UploadMediaType.PNG, 16, 16)
    assert (jpeg.media_type, jpeg.width, jpeg.height) == (UploadMediaType.JPEG, 16, 16)
    assert png.byte_size == len(png.content)
    assert len(png.sha256) == 64
    assert repr(png) == str(png) == "ValidatedRasterUpload(<redacted>)"


def test_browser_mime_is_not_trusted_over_signature() -> None:
    with pytest.raises(UploadTypeMismatch):
        validate_raster_upload(black_rgb_png(), declared_media_type="image/jpeg", policy=_policy())
    with pytest.raises(UploadTypeMismatch):
        validate_raster_upload(
            _jpeg(), declared_media_type="application/octet-stream", policy=_policy()
        )


def test_unknown_empty_and_non_bytes_inputs_fail_closed() -> None:
    with pytest.raises(UploadTypeUnsupported):
        validate_raster_upload(b"GIF89a", declared_media_type=None, policy=_policy())
    with pytest.raises(UploadMalformed):
        validate_raster_upload(b"", declared_media_type=None, policy=_policy())
    with pytest.raises(UploadMalformed):
        validate_raster_upload(
            bytearray(black_rgb_png()),  # type: ignore[arg-type]
            declared_media_type=None,
            policy=_policy(),
        )


def test_byte_limit_is_enforced_before_image_parsing() -> None:
    content = black_rgb_png()
    with pytest.raises(UploadTooLarge):
        validate_raster_upload(
            content,
            declared_media_type="image/png",
            policy=_policy(max_bytes=len(content) - 1),
        )


def test_pixel_and_minimum_dimension_limits_reject_header_bombs() -> None:
    with pytest.raises(UploadDimensionsRejected):
        validate_raster_upload(
            black_rgb_png(20_000, 1), declared_media_type="image/png", policy=_policy()
        )
    with pytest.raises(UploadDimensionsRejected):
        validate_raster_upload(
            black_rgb_png(4, 16), declared_media_type="image/png", policy=_policy()
        )


def test_png_crc_duplicate_header_and_trailing_bytes_are_rejected() -> None:
    content = bytearray(black_rgb_png())
    content[29] ^= 0x01
    with pytest.raises(UploadMalformed):
        validate_raster_upload(bytes(content), declared_media_type="image/png", policy=_policy())

    valid = black_rgb_png()
    ihdr = valid[8:33]
    duplicate = valid[:33] + ihdr + valid[33:]
    with pytest.raises(UploadMalformed):
        validate_raster_upload(duplicate, declared_media_type="image/png", policy=_policy())

    with pytest.raises(UploadMalformed):
        validate_raster_upload(
            valid + b"trailing", declared_media_type="image/png", policy=_policy()
        )


def test_truncated_or_dimensionless_jpeg_is_rejected() -> None:
    with pytest.raises(UploadMalformed):
        validate_raster_upload(_jpeg()[:-2], declared_media_type="image/jpeg", policy=_policy())
    with pytest.raises(UploadMalformed):
        validate_raster_upload(
            b"\xff\xd8\xff\xda\x00\x02\xff\xd9", declared_media_type="image/jpeg", policy=_policy()
        )


def test_policy_requires_exact_bounded_integers() -> None:
    for values in (
        {"max_bytes": 0, "max_pixels": 1, "min_dimension": 1},
        {"max_bytes": 1, "max_pixels": 0, "min_dimension": 1},
        {"max_bytes": 1, "max_pixels": 1, "min_dimension": 0},
        {"max_bytes": True, "max_pixels": 1, "min_dimension": 1},
    ):
        with pytest.raises(ValueError, match="policy is invalid"):
            UploadValidationPolicy(**values)
