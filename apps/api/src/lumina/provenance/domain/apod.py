"""Provider-owned normalized contracts for NASA Astronomy Picture of the Day."""

from __future__ import annotations

import json
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import Final, Literal, cast
from urllib.parse import urlsplit

from .runtime import MAX_RESPONSE_BYTES, NormalizedPayload, ProviderPayloadCodec

APOD_MIN_CONTENT_DATE: Final = date(1995, 6, 16)
APOD_NORMALIZED_FIELDS: Final = (
    "date",
    "title",
    "explanation",
    "media_type",
    "source_media_url",
    "source_hd_media_url",
    "source_thumbnail_url",
    "copyright",
    "service_version",
)
_DATE_PATTERN = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_MEDIA_TYPES = frozenset({"image", "video"})
_ALLOWED_TEXT_CONTROLS = frozenset({"\t", "\n", "\r"})
_MAX_TITLE_LENGTH = 512
_MAX_EXPLANATION_LENGTH = 60_000
_MAX_COPYRIGHT_LENGTH = 512


@dataclass(frozen=True, slots=True)
class NasaApodNormalized:
    """The exact provider/cache shape consumed by the Daily Visual projection."""

    date: str
    title: str
    explanation: str
    media_type: Literal["image", "video"]
    source_media_url: str
    source_hd_media_url: str | None
    source_thumbnail_url: str | None
    copyright: str | None
    service_version: Literal["v1"]


class NasaApodCodec(ProviderPayloadCodec):
    """Strictly encode and decode the bounded APOD normalized payload."""

    def encode(self, normalized: object) -> NormalizedPayload:
        if type(normalized) is not NasaApodNormalized:
            raise ValueError("APOD normalized payload is invalid")
        _validate_normalized(normalized)
        encoded: NormalizedPayload = {
            "date": normalized.date,
            "title": normalized.title,
            "explanation": normalized.explanation,
            "media_type": normalized.media_type,
            "source_media_url": normalized.source_media_url,
            "source_hd_media_url": normalized.source_hd_media_url,
            "source_thumbnail_url": normalized.source_thumbnail_url,
            "copyright": normalized.copyright,
            "service_version": normalized.service_version,
        }
        _ensure_storage_bound(encoded)
        return encoded

    def decode(self, stored: object) -> NasaApodNormalized:
        if not isinstance(stored, Mapping) or set(stored) != set(APOD_NORMALIZED_FIELDS):
            raise ValueError("APOD stored payload is invalid")
        values = {field: stored.get(field) for field in APOD_NORMALIZED_FIELDS}
        if (
            type(values["date"]) is not str
            or type(values["title"]) is not str
            or type(values["explanation"]) is not str
            or type(values["media_type"]) is not str
            or values["media_type"] not in _MEDIA_TYPES
            or type(values["source_media_url"]) is not str
            or (
                values["source_hd_media_url"] is not None
                and type(values["source_hd_media_url"]) is not str
            )
            or (
                values["source_thumbnail_url"] is not None
                and type(values["source_thumbnail_url"]) is not str
            )
            or (values["copyright"] is not None and type(values["copyright"]) is not str)
            or values["service_version"] != "v1"
        ):
            raise ValueError("APOD stored payload is invalid")
        normalized = NasaApodNormalized(
            date=values["date"],
            title=values["title"],
            explanation=values["explanation"],
            media_type=cast(Literal["image", "video"], values["media_type"]),
            source_media_url=values["source_media_url"],
            source_hd_media_url=values["source_hd_media_url"],
            source_thumbnail_url=values["source_thumbnail_url"],
            copyright=values["copyright"],
            service_version=values["service_version"],
        )
        _validate_normalized(normalized)
        _ensure_storage_bound(self.encode(normalized))
        return normalized

    def accepts_replacement(
        self,
        current: NormalizedPayload | None,
        candidate: NormalizedPayload,
    ) -> bool:
        candidate_value = self.decode(candidate)
        if current is None:
            return True
        current_value = self.decode(current)
        return date.fromisoformat(candidate_value.date) >= date.fromisoformat(current_value.date)


def apod_page_url(content_date: str) -> str:
    """Build the only user-facing APOD URL from an already validated date."""
    parsed = _parse_content_date(content_date)
    return f"https://apod.nasa.gov/apod/ap{parsed:%y%m%d}.html"


def _validate_normalized(value: NasaApodNormalized) -> None:
    content_date = _parse_content_date(value.date)
    if content_date < APOD_MIN_CONTENT_DATE:
        raise ValueError("APOD content date is outside the documented range")
    _validate_text(value.title, maximum=_MAX_TITLE_LENGTH)
    _validate_text(value.explanation, maximum=_MAX_EXPLANATION_LENGTH)
    _validate_media_url(value.source_media_url)
    if value.source_hd_media_url is not None:
        _validate_media_url(value.source_hd_media_url)
    if value.source_thumbnail_url is not None:
        _validate_media_url(value.source_thumbnail_url)
    if value.copyright is not None:
        _validate_text(value.copyright, maximum=_MAX_COPYRIGHT_LENGTH)
    media_type: object = value.media_type
    service_version: object = value.service_version
    if not isinstance(media_type, str) or media_type not in _MEDIA_TYPES or service_version != "v1":
        raise ValueError("APOD normalized payload contains an unsupported value")


def _parse_content_date(value: str) -> date:
    if type(value) is not str or _DATE_PATTERN.fullmatch(value) is None:
        raise ValueError("APOD content date is invalid")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("APOD content date is invalid") from None


def _validate_text(value: str, *, maximum: int) -> None:
    if (
        type(value) is not str
        or not value
        or len(value) > maximum
        or any(
            unicodedata.category(character) in {"Cc", "Cs"}
            and character not in _ALLOWED_TEXT_CONTROLS
            for character in value
        )
    ):
        raise ValueError("APOD text is invalid")


def _validate_media_url(value: str) -> None:
    if type(value) is not str or not value or value != value.strip() or "\\" in value:
        raise ValueError("APOD media URL is invalid")
    if any(
        character.isspace() or unicodedata.category(character) in {"Cc", "Cs"}
        for character in value
    ):
        raise ValueError("APOD media URL is invalid")
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        raise ValueError("APOD media URL is invalid") from None
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or port is not None
        and not 1 <= port <= 65_535
    ):
        raise ValueError("APOD media URL is invalid")


def _ensure_storage_bound(payload: NormalizedPayload) -> None:
    try:
        encoded = json.dumps(
            dict(payload),
            allow_nan=False,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeEncodeError):
        raise ValueError("APOD normalized payload is invalid") from None
    if len(encoded) > MAX_RESPONSE_BYTES:
        raise ValueError("APOD normalized payload exceeds the provider bound")


__all__ = [
    "APOD_MIN_CONTENT_DATE",
    "APOD_NORMALIZED_FIELDS",
    "NasaApodCodec",
    "NasaApodNormalized",
    "apod_page_url",
]
