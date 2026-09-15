from __future__ import annotations

import struct
import zlib

import pytest
from lumina.identification.domain.remote_raster import SanitizedRemoteRaster, sanitize_remote_raster
from lumina.identification.domain.uploads import (
    UploadMalformed,
    UploadValidationPolicy,
    validate_raster_upload,
)


def _chunk(kind: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(kind + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", crc)


def _policy() -> UploadValidationPolicy:
    return UploadValidationPolicy(max_bytes=1_000_000, max_pixels=1_000_000, min_dimension=8)


def _png_with_metadata() -> bytes:
    width = height = 16
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    rows = b"".join(b"\x00" + b"\x00" * (width * 3) for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"tEXt", b"GPS=private-location")
        + _chunk(b"eXIf", b"Exif-private-metadata")
        + _chunk(b"tRNS", b"\x00\x01\x00\x02\x00\x03")
        + _chunk(b"IDAT", zlib.compress(rows))
        + _chunk(b"IEND", b"")
    )


def _segment(marker: int, data: bytes) -> bytes:
    return b"\xff" + bytes((marker,)) + struct.pack(">H", len(data) + 2) + data


def _jpeg_with_metadata() -> bytes:
    sof_data = bytes([8]) + struct.pack(">HHB", 16, 16, 3) + b"\x01\x11\x00"
    sos_data = b"\x03\x01\x00\x00"
    return (
        b"\xff\xd8"
        + _segment(0xE0, b"JFIF-private-thumbnail")
        + _segment(0xE1, b"Exif\x00\x00private-location")
        + _segment(0xED, b"Photoshop-private-metadata")
        + _segment(0xEE, b"Adobe\x00\x64\x00\x00\x00\x00\x00")
        + _segment(0xFE, b"private-comment")
        + _segment(0xC0, sof_data)
        + _segment(0xDA, sos_data)
        + b"\x00\x11\x22"
        + b"\xff\xd9"
    )


def test_png_remote_copy_strips_metadata_but_preserves_image_semantics_chunks() -> None:
    original = validate_raster_upload(
        _png_with_metadata(), declared_media_type="image/png", policy=_policy()
    )
    sanitized = sanitize_remote_raster(original)

    assert (sanitized.width, sanitized.height) == (16, 16)
    assert b"private-location" not in sanitized.content
    assert b"Exif-private-metadata" not in sanitized.content
    assert b"tEXt" not in sanitized.content
    assert b"eXIf" not in sanitized.content
    assert b"IHDR" in sanitized.content and b"IDAT" in sanitized.content
    assert b"tRNS" in sanitized.content
    assert repr(sanitized) == str(sanitized) == "SanitizedRemoteRaster(<redacted>)"


def test_jpeg_remote_copy_strips_metadata_without_reencoding_scan_data() -> None:
    source = _jpeg_with_metadata()
    original = validate_raster_upload(source, declared_media_type="image/jpeg", policy=_policy())
    sanitized = sanitize_remote_raster(original)

    assert (sanitized.width, sanitized.height) == (16, 16)
    for secret in (
        b"private-thumbnail",
        b"private-location",
        b"private-metadata",
        b"private-comment",
    ):
        assert secret not in sanitized.content
    assert b"Adobe" in sanitized.content
    assert sanitized.content.endswith(b"\x00\x11\x22\xff\xd9")
    assert len(sanitized.content) < len(source)


def test_sanitized_remote_raster_cannot_be_constructed_with_unsanitized_or_invalid_bytes() -> None:
    source = _png_with_metadata()
    with pytest.raises(UploadMalformed):
        SanitizedRemoteRaster(
            media_type=validate_raster_upload(
                source, declared_media_type="image/png", policy=_policy()
            ).media_type,
            width=16,
            height=16,
            content=source,
        )

    with pytest.raises(UploadMalformed):
        SanitizedRemoteRaster(
            media_type=validate_raster_upload(
                _png_with_metadata(), declared_media_type="image/png", policy=_policy()
            ).media_type,
            width=16,
            height=16,
            content=b"not-an-image",
        )
