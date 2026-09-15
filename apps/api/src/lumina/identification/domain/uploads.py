"""Fail-closed validation for private astronomical raster uploads."""

from __future__ import annotations

import hashlib
import re
import zlib
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Final, NoReturn

_PNG_SIGNATURE: Final = b"\x89PNG\r\n\x1a\n"
_JPEG_SIGNATURE: Final = b"\xff\xd8"
_JPEG_EOI: Final = b"\xff\xd9"
_PNG_CHUNK_TYPE = re.compile(rb"[A-Za-z]{4}")
_JPEG_SOF_MARKERS: Final = frozenset({0xC0, 0xC1, 0xC2})


class UploadMediaType(StrEnum):
    PNG = "image/png"
    JPEG = "image/jpeg"


class UploadRejected(ValueError):
    """Base class for fixed, non-reflective upload validation failures."""

    message = "The uploaded image is invalid."

    def __init__(self) -> None:
        super().__init__(self.message)

    def __repr__(self) -> str:
        return f"{type(self).__name__}(<redacted>)"


class UploadTooLarge(UploadRejected):
    message = "The uploaded image is too large."


class UploadTypeUnsupported(UploadRejected):
    message = "The uploaded image type is not supported."


class UploadTypeMismatch(UploadRejected):
    message = "The uploaded image type does not match its content."


class UploadMalformed(UploadRejected):
    message = "The uploaded image is malformed."


class UploadDimensionsRejected(UploadRejected):
    message = "The uploaded image dimensions are not supported."


@dataclass(frozen=True, slots=True)
class UploadValidationPolicy:
    max_bytes: int
    max_pixels: int
    min_dimension: int

    def __post_init__(self) -> None:
        if (
            type(self.max_bytes) is not int
            or not 1 <= self.max_bytes <= 100 * 1024 * 1024
            or type(self.max_pixels) is not int
            or not 1 <= self.max_pixels <= 100_000_000
            or type(self.min_dimension) is not int
            or not 1 <= self.min_dimension <= 4_096
        ):
            raise ValueError("Upload validation policy is invalid.")


@dataclass(frozen=True, slots=True, repr=False)
class ValidatedRasterUpload:
    media_type: UploadMediaType
    byte_size: int
    width: int
    height: int
    sha256: str = field(repr=False)
    content: bytes = field(repr=False)

    def __repr__(self) -> str:
        return "ValidatedRasterUpload(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def validate_raster_upload(
    content: bytes,
    *,
    declared_media_type: str | None,
    policy: UploadValidationPolicy,
) -> ValidatedRasterUpload:
    """Validate bounded JPEG/PNG bytes without decoding compressed pixels."""
    if type(content) is not bytes:
        raise UploadMalformed()
    if not content:
        raise UploadMalformed()
    if len(content) > policy.max_bytes:
        raise UploadTooLarge()

    if content.startswith(_PNG_SIGNATURE):
        media_type = UploadMediaType.PNG
        width, height = _parse_png_dimensions(content)
    elif content.startswith(_JPEG_SIGNATURE):
        media_type = UploadMediaType.JPEG
        width, height = _parse_jpeg_dimensions(content)
    else:
        raise UploadTypeUnsupported()

    if declared_media_type is not None and declared_media_type != media_type.value:
        raise UploadTypeMismatch()
    if width < policy.min_dimension or height < policy.min_dimension:
        raise UploadDimensionsRejected()
    if width * height > policy.max_pixels:
        raise UploadDimensionsRejected()

    return ValidatedRasterUpload(
        media_type=media_type,
        byte_size=len(content),
        width=width,
        height=height,
        sha256=hashlib.sha256(content).hexdigest(),
        content=content,
    )


def _reject_malformed() -> NoReturn:
    raise UploadMalformed()


def _parse_png_dimensions(content: bytes) -> tuple[int, int]:
    position = len(_PNG_SIGNATURE)
    seen_ihdr = False
    seen_idat = False
    width = height = 0

    while position + 12 <= len(content):
        length = int.from_bytes(content[position : position + 4], "big")
        chunk_type = content[position + 4 : position + 8]
        if _PNG_CHUNK_TYPE.fullmatch(chunk_type) is None:
            _reject_malformed()
        chunk_end = position + 12 + length
        if chunk_end > len(content):
            _reject_malformed()
        data = content[position + 8 : position + 8 + length]
        expected_crc = int.from_bytes(content[position + 8 + length : chunk_end], "big")
        if zlib.crc32(chunk_type + data) & 0xFFFFFFFF != expected_crc:
            _reject_malformed()

        if not seen_ihdr:
            if chunk_type != b"IHDR" or length != 13:
                _reject_malformed()
            seen_ihdr = True
            width = int.from_bytes(data[0:4], "big")
            height = int.from_bytes(data[4:8], "big")
            bit_depth, color_type, compression, filter_method, interlace = data[8:13]
            valid_depths = {
                0: {1, 2, 4, 8, 16},
                2: {8, 16},
                3: {1, 2, 4, 8},
                4: {8, 16},
                6: {8, 16},
            }
            if (
                width == 0
                or height == 0
                or color_type not in valid_depths
                or bit_depth not in valid_depths[color_type]
                or compression != 0
                or filter_method != 0
                or interlace not in {0, 1}
            ):
                _reject_malformed()
        elif chunk_type == b"IHDR":
            _reject_malformed()

        if chunk_type == b"IDAT":
            seen_idat = True
        if chunk_type == b"IEND":
            if length != 0 or not seen_idat or chunk_end != len(content):
                _reject_malformed()
            return width, height
        position = chunk_end

    _reject_malformed()


def _parse_jpeg_dimensions(content: bytes) -> tuple[int, int]:
    if len(content) < 4 or not content.endswith(_JPEG_EOI):
        _reject_malformed()
    position = 2
    width = height = 0
    saw_start_of_scan = False

    while position < len(content) - 2:
        if content[position] != 0xFF:
            _reject_malformed()
        while position < len(content) and content[position] == 0xFF:
            position += 1
        if position >= len(content):
            _reject_malformed()
        marker = content[position]
        position += 1
        if marker in {0x00, 0xD8, 0xD9}:
            _reject_malformed()
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            continue
        if position + 2 > len(content):
            _reject_malformed()
        segment_length = int.from_bytes(content[position : position + 2], "big")
        if segment_length < 2 or position + segment_length > len(content):
            _reject_malformed()
        segment = content[position + 2 : position + segment_length]

        if marker in _JPEG_SOF_MARKERS:
            if len(segment) < 6 or segment[0] != 8:
                _reject_malformed()
            height = int.from_bytes(segment[1:3], "big")
            width = int.from_bytes(segment[3:5], "big")
            components = segment[5]
            if width == 0 or height == 0 or components not in {1, 3, 4}:
                _reject_malformed()
        if marker == 0xDA:
            saw_start_of_scan = True
            break
        position += segment_length

    if width == 0 or height == 0 or not saw_start_of_scan:
        _reject_malformed()
    return width, height
