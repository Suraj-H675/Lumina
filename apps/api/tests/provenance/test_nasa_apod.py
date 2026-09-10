"""Deterministic NASA APOD adapter, codec, and trust-boundary contracts."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fakes.provider_runtime import DeterministicNasaTransport
from lumina.provenance.domain.apod import NasaApodCodec, NasaApodNormalized, apod_page_url
from lumina.provenance.domain.provider import (
    ProviderNotConfigured,
    ProviderPayloadInvalid,
)
from lumina.provenance.domain.runtime import MAX_RESPONSE_BYTES, RawProviderResponse
from lumina.provenance.infrastructure.nasa_apod import (
    NasaApodAdapter,
    NasaApodRequest,
    load_nasa_apod_source_manifest,
)
from lumina.provenance.infrastructure.nasa_exoplanet_archive import NasaCountCodec
from pydantic import SecretStr

_NOW = datetime(2026, 9, 10, 12, 0, tzinfo=UTC)
_FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "provider"
_TEST_KEY = "fixture-apod-key-2026"
_TEST_SECRET = SecretStr(_TEST_KEY)


def _json_response(
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


def _fixture(name: str) -> bytes:
    return (_FIXTURES / name).read_bytes()


def _adapter(
    transport: DeterministicNasaTransport,
    *,
    api_key: SecretStr | None = _TEST_SECRET,
) -> NasaApodAdapter:
    return NasaApodAdapter(
        transport,
        api_key=api_key,
        source_manifest=load_nasa_apod_source_manifest(),
        clock=lambda: _NOW,
    )


def _base_payload() -> dict[str, object]:
    return {
        "date": "2026-09-10",
        "title": "Fixture APOD",
        "explanation": "A deterministic APOD payload used only by offline tests.",
        "media_type": "image",
        "url": "https://example.invalid/apod/fixture.jpg",
        "service_version": "v1",
    }


def test_apod_manifest_and_runtime_identity_are_reviewed_and_exact() -> None:
    manifest = load_nasa_apod_source_manifest()

    assert manifest.source_id == "nasa-apod"
    assert manifest.source_name == "NASA Astronomy Picture of the Day (APOD)"
    assert manifest.adapter_id == "nasa-apod-daily-media"
    assert manifest.adapter_version == "1"
    assert manifest.source_schema_version == "apod-v1-json-v1"
    assert manifest.capabilities == ("batch_fetch",)
    assert manifest.endpoint_or_base_url == "https://api.nasa.gov/planetary/apod"
    assert manifest.source_page_url == "https://apod.nasa.gov/apod/"
    assert manifest.official_documentation_url == "https://api.nasa.gov/"
    assert manifest.terms_or_licence_url == (
        "https://www.nasa.gov/nasa-brand-center/images-and-media/"
    )
    assert "DEMO_KEY" in manifest.authentication_method
    assert "third-party" in manifest.attribution_text
    assert set(manifest.normalized_fields) == {
        "date",
        "title",
        "explanation",
        "media_type",
        "source_media_url",
        "source_hd_media_url",
        "source_thumbnail_url",
        "copyright",
        "service_version",
    }


@pytest.mark.asyncio
async def test_apod_fetch_uses_only_the_fixed_keyed_endpoint_and_redacts_key_repr() -> None:
    transport = DeterministicNasaTransport([_json_response(_fixture("nasa-apod-image.json"))])
    adapter = _adapter(transport)

    raw = await adapter.fetch(NasaApodRequest())

    assert isinstance(raw, RawProviderResponse)
    assert len(transport.requests) == 1
    request = transport.requests[0]
    assert request.url == "https://api.nasa.gov/planetary/apod"
    assert request.params == (("api_key", _TEST_KEY),)
    assert request.expected_content_type == "application/json"
    assert request.max_response_bytes == MAX_RESPONSE_BYTES
    assert request.user_agent == "Lumina/0.0 Phase-4B provider-sync"
    assert _TEST_KEY not in repr(request)
    assert _TEST_KEY not in str(request)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "api_key",
    [
        None,
        SecretStr(""),
        SecretStr("DEMO_KEY"),
        SecretStr("key with whitespace"),
        SecretStr("x" * 257),
        SecretStr("key\x7f"),
    ],
)
async def test_missing_or_invalid_apod_key_makes_zero_requests(
    api_key: SecretStr | None,
) -> None:
    transport = DeterministicNasaTransport([])
    adapter = _adapter(transport, api_key=api_key)

    with pytest.raises(ProviderNotConfigured):
        await adapter.fetch(NasaApodRequest())

    assert transport.requests == []


@pytest.mark.asyncio
async def test_image_fixture_normalizes_optional_absence_and_ignores_additive_fields() -> None:
    transport = DeterministicNasaTransport([_json_response(_fixture("nasa-apod-image.json"))])
    adapter = _adapter(transport)

    payload = adapter.validate_payload(await adapter.fetch(NasaApodRequest()))
    normalized = adapter.normalize(NasaApodRequest(), payload)

    assert payload.media_type == "image"
    assert payload.copyright is None
    assert normalized == NasaApodNormalized(
        date="2026-09-09",
        title="Fixture Image APOD",
        explanation=(
            "This deterministic fixture represents an image APOD response for offline tests."
        ),
        media_type="image",
        source_media_url="https://apod.nasa.gov/apod/image/260909/fixture.jpg",
        source_hd_media_url="https://apod.nasa.gov/apod/image/260909/fixture-hd.jpg",
        source_thumbnail_url=None,
        copyright=None,
        service_version="v1",
    )


@pytest.mark.asyncio
async def test_multiline_nasa_text_is_preserved_as_plain_text() -> None:
    transport = DeterministicNasaTransport(
        [
            _json_response(
                json.dumps({**_base_payload(), "explanation": "line one.\n\nline two."}).encode()
            )
        ]
    )
    adapter = _adapter(transport)

    payload = adapter.validate_payload(await adapter.fetch(NasaApodRequest()))

    assert payload.explanation == "line one.\n\nline two."


@pytest.mark.asyncio
async def test_copyrighted_image_preserves_exact_source_value() -> None:
    adapter = _adapter(
        DeterministicNasaTransport([_json_response(_fixture("nasa-apod-copyrighted-image.json"))])
    )

    payload = adapter.validate_payload(await adapter.fetch(NasaApodRequest()))

    assert payload.copyright == "Fixture Creator / Example Observatory"
    assert payload.thumbnail_url == "https://example.invalid/apod/fixture-copyrighted-thumb.jpg"


@pytest.mark.asyncio
async def test_video_fixture_requires_no_hd_url_and_remains_link_only_at_normalization() -> None:
    adapter = _adapter(
        DeterministicNasaTransport([_json_response(_fixture("nasa-apod-video.json"))])
    )

    payload = adapter.validate_payload(await adapter.fetch(NasaApodRequest()))
    normalized = adapter.normalize(NasaApodRequest(), payload)

    assert payload.media_type == "video"
    assert payload.hdurl is None
    assert normalized.source_media_url == "https://video.example.invalid/apod/fixture-video"
    assert normalized.source_hd_media_url is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "body",
    [
        json.dumps({**_base_payload(), "media_type": "audio"}).encode(),
        json.dumps({key: value for key, value in _base_payload().items() if key != "url"}).encode(),
        json.dumps({**_base_payload(), "title": ["not text"]}).encode(),
        json.dumps({**_base_payload(), "hdurl": {"not": "text"}}).encode(),
        json.dumps({**_base_payload(), "service_version": "v2"}).encode(),
        json.dumps({**_base_payload(), "date": "2026-2-10"}).encode(),
        json.dumps({**_base_payload(), "date": "2026-02-30"}).encode(),
        json.dumps({**_base_payload(), "date": "1995-06-15"}).encode(),
        json.dumps({**_base_payload(), "date": "2026-09-11"}).encode(),
        json.dumps({**_base_payload(), "url": "http://example.invalid/apod.jpg"}).encode(),
        json.dumps({**_base_payload(), "url": "javascript:alert(1)"}).encode(),
        json.dumps(
            {**_base_payload(), "url": "https://user:pass@example.invalid/apod.jpg"}
        ).encode(),
        json.dumps({**_base_payload(), "url": "https://example.invalid:bad/apod.jpg"}).encode(),
        b'{"date":"2026-09-10","date":"2026-09-10","title":"x","explanation":"x","media_type":"image","url":"https://example.invalid/x","service_version":"v1"}',
        b'{"date":"2026-09-10","title":"x","explanation":"x","media_type":"image","url":"https://example.invalid/x","service_version":"v1","extra":NaN}',
        b"[" * 10_000 + b"]" * 10_000,
        b"[]",
        b"{not-json",
        b"\xff",
    ],
)
async def test_apod_rejects_invalid_wire_payloads_without_specific_error_reflection(
    body: bytes,
) -> None:
    adapter = _adapter(DeterministicNasaTransport([_json_response(body)]))

    with pytest.raises(ProviderPayloadInvalid) as captured:
        adapter.validate_payload(await adapter.fetch(NasaApodRequest()))

    assert "example.invalid" not in str(captured.value)
    assert "not-json" not in repr(captured.value)


def test_apod_rejects_wrong_content_type_and_incomplete_bounded_body() -> None:
    adapter = _adapter(DeterministicNasaTransport([]))
    payload = _base_payload()

    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(
            _json_response(json.dumps(payload).encode(), content_type="text/html")
        )
    with pytest.raises(ProviderPayloadInvalid):
        adapter.validate_payload(
            RawProviderResponse(
                status_code=200,
                headers={"content-type": "application/json"},
                body=b"x" * MAX_RESPONSE_BYTES,
                raw_complete=False,
                observed_bytes=MAX_RESPONSE_BYTES + 1,
                content_type_valid=False,
            )
        )


def test_apod_codec_round_trip_is_exact_and_isolated_from_exoplanet_codec() -> None:
    normalized = NasaApodNormalized(
        date="2026-09-10",
        title="Fixture APOD",
        explanation="A fixture explanation.",
        media_type="image",
        source_media_url="https://example.invalid/apod/fixture.jpg",
        source_hd_media_url=None,
        source_thumbnail_url=None,
        copyright=None,
        service_version="v1",
    )
    codec = NasaApodCodec()
    encoded = codec.encode(normalized)

    assert set(encoded) == {
        "date",
        "title",
        "explanation",
        "media_type",
        "source_media_url",
        "source_hd_media_url",
        "source_thumbnail_url",
        "copyright",
        "service_version",
    }
    assert codec.decode(encoded) == normalized
    with pytest.raises(ValueError):
        codec.decode({"confirmed_planet_count": 6360})
    with pytest.raises(ValueError):
        NasaCountCodec().decode(encoded)

    malformed: dict[str, Any] = dict(encoded)
    malformed["media_type"] = ["image"]
    with pytest.raises(ValueError):
        codec.decode(malformed)


def test_apod_replacement_rejects_content_date_rollback_but_accepts_same_date() -> None:
    codec = NasaApodCodec()
    current = codec.encode(
        NasaApodNormalized(
            date="2026-09-09",
            title="Current",
            explanation="Current.",
            media_type="image",
            source_media_url="https://example.invalid/current.jpg",
            source_hd_media_url=None,
            source_thumbnail_url=None,
            copyright=None,
            service_version="v1",
        )
    )
    older = dict(current)
    older["date"] = "2026-09-08"
    same_date = dict(current)
    same_date["title"] = "Updated same date"

    assert codec.accepts_replacement(current, same_date)
    assert not codec.accepts_replacement(current, older)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("1995-06-16", "https://apod.nasa.gov/apod/ap950616.html"),
        ("2026-09-10", "https://apod.nasa.gov/apod/ap260910.html"),
    ],
)
def test_apod_page_url_is_fixed_origin_and_date_derived(value: str, expected: str) -> None:
    assert apod_page_url(value) == expected


def test_apod_page_url_rejects_non_calendar_dates() -> None:
    with pytest.raises(ValueError):
        apod_page_url("2026-2-10")
