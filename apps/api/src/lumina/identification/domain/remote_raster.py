"""Deterministic privacy preprocessing for raster bytes sent to remote solvers."""

from __future__ import annotations

from dataclasses import dataclass, field

from lumina.identification.domain.uploads import (
    UploadMalformed,
    UploadMediaType,
    UploadValidationPolicy,
    ValidatedRasterUpload,
    validate_raster_upload,
)

_PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
_PNG_METADATA_CHUNKS = frozenset({b"eXIf", b"tEXt", b"zTXt", b"iTXt", b"tIME"})
_JPEG_APP_FIRST = 0xE0
_JPEG_APP_LAST = 0xEF
_JPEG_COM = 0xFE
_JPEG_ADOBE_APP14 = 0xEE


@dataclass(frozen=True, slots=True, repr=False)
class SanitizedRemoteRaster:
    """Metadata-stripped raster bytes approved for a consented remote solve."""

    media_type: UploadMediaType
    width: int
    height: int
    content: bytes = field(repr=False)

    def __post_init__(self) -> None:
        if (
            type(self.media_type) is not UploadMediaType
            or type(self.width) is not int
            or type(self.height) is not int
            or self.width <= 0
            or self.height <= 0
            or type(self.content) is not bytes
            or not self.content
        ):
            raise UploadMalformed()
        try:
            verified = validate_raster_upload(
                self.content,
                declared_media_type=self.media_type.value,
                policy=UploadValidationPolicy(
                    max_bytes=len(self.content),
                    max_pixels=100_000_000,
                    min_dimension=1,
                ),
            )
        except ValueError:
            raise UploadMalformed() from None
        if (verified.width, verified.height) != (self.width, self.height):
            raise UploadMalformed()
        canonical = (
            _sanitize_png(self.content)
            if self.media_type is UploadMediaType.PNG
            else _sanitize_jpeg(self.content)
        )
        if canonical != self.content:
            raise UploadMalformed()

    def __repr__(self) -> str:
        return "SanitizedRemoteRaster(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


def sanitize_remote_raster(upload: ValidatedRasterUpload) -> SanitizedRemoteRaster:
    """Strip unnecessary raster metadata without re-encoding image pixels."""
    if type(upload) is not ValidatedRasterUpload:
        raise UploadMalformed()
    if upload.media_type is UploadMediaType.PNG:
        content = _sanitize_png(upload.content)
    elif upload.media_type is UploadMediaType.JPEG:
        content = _sanitize_jpeg(upload.content)
    else:
        raise UploadMalformed()

    verified = validate_raster_upload(
        content,
        declared_media_type=upload.media_type.value,
        policy=UploadValidationPolicy(
            max_bytes=max(1, upload.byte_size),
            max_pixels=100_000_000,
            min_dimension=1,
        ),
    )
    if (verified.width, verified.height) != (upload.width, upload.height):
        raise UploadMalformed()
    return SanitizedRemoteRaster(
        media_type=upload.media_type,
        width=upload.width,
        height=upload.height,
        content=content,
    )


def _sanitize_png(content: bytes) -> bytes:
    if not content.startswith(_PNG_SIGNATURE):
        raise UploadMalformed()
    output = bytearray(_PNG_SIGNATURE)
    position = len(_PNG_SIGNATURE)
    while position + 12 <= len(content):
        length = int.from_bytes(content[position : position + 4], "big")
        chunk_end = position + 12 + length
        if chunk_end > len(content):
            raise UploadMalformed()
        chunk_type = content[position + 4 : position + 8]
        if len(chunk_type) != 4:
            raise UploadMalformed()
        # Remove only metadata-bearing ancillary chunks. Transparency, color
        # management, and other image-semantics chunks remain byte-for-byte.
        if chunk_type not in _PNG_METADATA_CHUNKS:
            output.extend(content[position:chunk_end])
        position = chunk_end
        if chunk_type == b"IEND":
            break
    if position != len(content):
        raise UploadMalformed()
    return bytes(output)


def _sanitize_jpeg(content: bytes) -> bytes:
    if not content.startswith(b"\xff\xd8") or not content.endswith(b"\xff\xd9"):
        raise UploadMalformed()
    output = bytearray(b"\xff\xd8")
    position = 2
    while position < len(content) - 2:
        marker_start = position
        if content[position] != 0xFF:
            raise UploadMalformed()
        while position < len(content) and content[position] == 0xFF:
            position += 1
        if position >= len(content):
            raise UploadMalformed()
        marker = content[position]
        position += 1
        if marker in {0x00, 0xD8, 0xD9}:
            raise UploadMalformed()
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            output.extend(content[marker_start:position])
            continue
        if position + 2 > len(content):
            raise UploadMalformed()
        segment_length = int.from_bytes(content[position : position + 2], "big")
        segment_end = position + segment_length
        if segment_length < 2 or segment_end > len(content):
            raise UploadMalformed()
        if marker == 0xDA:
            output.extend(content[marker_start:])
            return bytes(output)
        is_metadata = (
            _JPEG_APP_FIRST <= marker <= _JPEG_APP_LAST and marker != _JPEG_ADOBE_APP14
        ) or marker == _JPEG_COM
        if not is_metadata:
            output.extend(content[marker_start:segment_end])
        position = segment_end
    raise UploadMalformed()


__all__ = ["SanitizedRemoteRaster", "sanitize_remote_raster"]
