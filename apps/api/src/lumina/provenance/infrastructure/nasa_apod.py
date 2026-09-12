"""Fixed NASA Astronomy Picture of the Day provider adapter."""

from __future__ import annotations

import json
import pkgutil
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Final, Literal, Protocol

from pydantic import BaseModel, ConfigDict, SecretStr, StrictStr, ValidationError

from lumina.provenance.domain.apod import (
    APOD_MIN_CONTENT_DATE,
    NasaApodCodec,
    NasaApodNormalized,
    validate_apod_public_compatibility,
)
from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json
from lumina.provenance.domain.provider import (
    ProviderAdapter,
    ProviderNormalizationFailed,
    ProviderNotConfigured,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.runtime import (
    APOD_ADAPTER_ID,
    APOD_ADAPTER_VERSION,
    APOD_CONTENT_TYPE,
    APOD_HOST,
    APOD_PATH,
    APOD_PROVIDER_CODE,
    APOD_SOURCE_SCHEMA_VERSION,
    APOD_USER_AGENT,
    MAX_RESPONSE_BYTES,
    RawProviderResponse,
)

from .http import FixedHttpRequest

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/nasa-apod.json"
EXPECTED_CONTENT_TYPE: Final = APOD_CONTENT_TYPE
_OPERATION: Final = "batch_fetch"


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, slots=True)
class NasaApodRequest:
    """The sole typed request accepted by the fixed current-APOD adapter."""

    operation: Literal["batch_fetch"] = _OPERATION

    def __post_init__(self) -> None:
        if self.operation != _OPERATION:
            raise ProviderRequestRejected()


class NasaApodPayload(BaseModel):
    """Strict validated APOD JSON fields before Lumina normalization."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    date: StrictStr
    title: StrictStr
    explanation: StrictStr
    media_type: Literal["image", "video"]
    url: StrictStr
    hdurl: StrictStr | None = None
    thumbnail_url: StrictStr | None = None
    copyright: StrictStr | None = None
    service_version: Literal["v1"]


class NasaApodTransport(Protocol):
    """One-attempt transport capability required by the APOD adapter."""

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        """Execute one fixed NASA request within the framework deadline."""
        ...


class NasaApodAdapter(ProviderAdapter[NasaApodRequest, NasaApodPayload, NasaApodNormalized]):
    """Fetch and normalize the one current APOD object returned by NASA."""

    def __init__(
        self,
        transport: NasaApodTransport,
        *,
        api_key: SecretStr | None,
        source_manifest: SourceManifest,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._transport = transport
        self._api_key = api_key
        self._source_manifest = source_manifest
        self._clock = clock or (lambda: datetime.now(UTC))
        self._codec = NasaApodCodec()
        if (
            source_manifest.source_id != APOD_PROVIDER_CODE
            or source_manifest.adapter_id != APOD_ADAPTER_ID
            or source_manifest.adapter_version != APOD_ADAPTER_VERSION
            or source_manifest.source_schema_version != APOD_SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or set(source_manifest.normalized_fields)
            != {
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
            or source_manifest.endpoint_or_base_url != f"https://{APOD_HOST}{APOD_PATH}"
            or source_manifest.source_page_url != "https://apod.nasa.gov/apod/"
        ):
            raise ValueError("NASA APOD source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the reviewed immutable provenance identity."""
        return self._source_manifest

    @property
    def codec(self) -> NasaApodCodec:
        """Return the exact normalized cache codec owned by this adapter."""
        return self._codec

    def is_configured(self) -> bool:
        """Return whether a valid non-example NASA key is available."""
        return self._api_key is not None and _valid_api_key(self._api_key.get_secret_value())

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        """Issue only the fixed current-APOD request through the transport."""
        if type(request) is not NasaApodRequest:
            raise ProviderRequestRejected()
        if not self.is_configured():
            raise ProviderNotConfigured()
        assert self._api_key is not None
        return await self._transport.request(
            FixedHttpRequest(
                url=f"https://{APOD_HOST}{APOD_PATH}",
                params=(("api_key", self._api_key.get_secret_value()),),
                expected_content_type=EXPECTED_CONTENT_TYPE,
                max_response_bytes=MAX_RESPONSE_BYTES,
                user_agent=APOD_USER_AGENT,
            ),
            attempt_deadline=attempt_deadline,
        )

    def validate_payload(self, payload: object) -> NasaApodPayload:
        """Parse one bounded JSON object under the reviewed APOD contract."""
        if not isinstance(payload, RawProviderResponse):
            raise ProviderPayloadInvalid()
        if payload.status_code != 200 or not payload.raw_complete or not payload.content_type_valid:
            raise ProviderPayloadInvalid()
        try:
            text = payload.body.decode("utf-8", errors="strict")
            decoded = json.loads(
                text,
                object_pairs_hook=_object_without_duplicate_keys,
                parse_constant=_reject_json_constant,
            )
        except (
            UnicodeDecodeError,
            json.JSONDecodeError,
            RecursionError,
            ValueError,
            TypeError,
        ):
            raise ProviderPayloadInvalid() from None
        if not isinstance(decoded, dict):
            raise ProviderPayloadInvalid()
        try:
            validated = NasaApodPayload.model_validate(decoded)
        except (RecursionError, TypeError, ValidationError):
            raise ProviderPayloadInvalid() from None
        try:
            content_date = _parse_content_date(validated.date)
        except ValueError:
            raise ProviderPayloadInvalid() from None
        retrieved_date = _utc_now(self._clock).date()
        if content_date < APOD_MIN_CONTENT_DATE or content_date > retrieved_date:
            raise ProviderPayloadInvalid()
        try:
            normalized = NasaApodNormalized(
                date=validated.date,
                title=validated.title,
                explanation=validated.explanation,
                media_type=validated.media_type,
                source_media_url=validated.url,
                source_hd_media_url=validated.hdurl,
                source_thumbnail_url=validated.thumbnail_url,
                copyright=validated.copyright,
                service_version=validated.service_version,
            )
            self._codec.encode(normalized)
        except (TypeError, ValueError):
            raise ProviderPayloadInvalid() from None
        return validated

    def normalize(self, request: object, payload: object) -> NasaApodNormalized:
        """Rename only the reviewed APOD source fields into the cache contract."""
        if type(request) is not NasaApodRequest or type(payload) is not NasaApodPayload:
            raise ProviderNormalizationFailed()
        normalized = NasaApodNormalized(
            date=payload.date,
            title=payload.title,
            explanation=payload.explanation,
            media_type=payload.media_type,
            source_media_url=payload.url,
            source_hd_media_url=payload.hdurl,
            source_thumbnail_url=payload.thumbnail_url,
            copyright=payload.copyright,
            service_version=payload.service_version,
        )
        try:
            validate_apod_public_compatibility(normalized)
            self._codec.encode(normalized)
        except ValueError:
            raise ProviderNormalizationFailed() from None
        return normalized


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _parse_content_date(value: str) -> date:
    if len(value) != 10 or value[4] != "-" or value[7] != "-":
        raise ValueError("invalid APOD date")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("invalid APOD date") from None


def _utc_now(clock: Callable[[], datetime]) -> datetime:
    value = clock()
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("APOD clock must use UTC")
    return value.astimezone(UTC)


def _valid_api_key(value: str) -> bool:
    return (
        type(value) is str
        and 1 <= len(value) <= 256
        and value != "DEMO_KEY"
        and value.isascii()
        and all(not character.isspace() and 32 <= ord(character) < 127 for character in value)
    )


def load_nasa_apod_source_manifest(
    repository_root: Path | None = REPOSITORY_ROOT,
) -> SourceManifest:
    """Load the reviewed APOD documentary manifest from source or wheel resources."""
    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / SOURCE_MANIFEST_PATH).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data("lumina", "data/manifests/sources/nasa-apod.json")
        except (ImportError, OSError):
            raise ValueError("NASA APOD source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("NASA APOD source manifest is unavailable") from None
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("NASA APOD source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("NASA APOD source manifest is unavailable")
    return manifest


__all__ = [
    "EXPECTED_CONTENT_TYPE",
    "NasaApodAdapter",
    "NasaApodPayload",
    "NasaApodRequest",
    "NasaApodTransport",
    "REPOSITORY_ROOT",
    "SOURCE_MANIFEST_PATH",
    "load_nasa_apod_source_manifest",
]
