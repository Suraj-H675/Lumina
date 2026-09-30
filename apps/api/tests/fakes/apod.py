"""Shared deterministic APOD test fixtures."""

from __future__ import annotations

import json

from lumina.provenance.domain.apod import NasaApodNormalized, apod_page_url
from lumina.provenance.domain.runtime import RawProviderResponse


def json_response(
    body: bytes,
    *,
    status_code: int = 200,
    content_type: str = "application/json; charset=utf-8",
) -> RawProviderResponse:
    return RawProviderResponse(
        status_code=status_code,
        headers={"content-type": content_type},
        body=body,
        raw_complete=True,
        observed_bytes=len(body),
        content_type_valid=content_type.split(";", 1)[0].strip().lower() == "application/json",
    )


def public_content_bytes(value: NasaApodNormalized) -> bytes:
    return json.dumps(
        {
            "date": value.date,
            "title": value.title,
            "explanation": value.explanation,
            "media_type": value.media_type,
            "copyright": value.copyright,
            "service_version": value.service_version,
            "apod_page_url": apod_page_url(value.date),
        },
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
