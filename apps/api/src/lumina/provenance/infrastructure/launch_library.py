"""Fixed Launch Library 2 adapter for Phase 4C upcoming spaceflight data."""

from __future__ import annotations

import json
import pkgutil
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Literal, Protocol
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, StrictBool, StrictInt, StrictStr, ValidationError

from lumina.provenance.domain.launch_library import (
    LL2_MAX_LAUNCHES,
    LL2_NORMALIZED_FIELDS,
    Ll2Agency,
    Ll2Codec,
    Ll2Launch,
    Ll2Mission,
    Ll2Normalized,
    Ll2Precision,
    Ll2Site,
    Ll2Status,
    Ll2Vehicle,
)
from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json
from lumina.provenance.domain.provider import (
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.runtime import (
    LL2_ADAPTER_ID,
    LL2_ADAPTER_VERSION,
    LL2_CONTENT_TYPE,
    LL2_HOST,
    LL2_MAX_RESPONSE_BYTES,
    LL2_PATH,
    LL2_PROVIDER_CODE,
    LL2_SOURCE_SCHEMA_VERSION,
    LL2_USER_AGENT,
    RawProviderResponse,
)

from .http import FixedHttpRequest

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/launch-library-2.json"
EXPECTED_CONTENT_TYPE: Final = LL2_CONTENT_TYPE
_OPERATION: Final = "batch_fetch"
_LL2_PARAMS: Final = (
    ("format", "json"),
    ("limit", str(LL2_MAX_LAUNCHES)),
    ("mode", "detailed"),
    ("ordering", "net"),
)
_MAX_OPTIONAL_LINKS: Final = 64
_MAX_MISSION_AGENCIES: Final = 32
_ALLOWED_DESCRIPTION_CONTROLS: Final = frozenset({"\t", "\n", "\r"})


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, slots=True)
class LaunchLibraryRequest:
    """The sole request accepted by the LL2 upcoming-launch adapter."""

    operation: Literal["batch_fetch"] = _OPERATION

    def __post_init__(self) -> None:
        if self.operation != _OPERATION:
            raise ProviderRequestRejected()


class _Status(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr
    abbrev: StrictStr


class _Precision(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr
    abbrev: StrictStr


class _Type(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr


class _InfoUrl(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    priority: StrictInt
    url: StrictStr
    type: _Type


class _VideoUrl(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    priority: StrictInt
    url: StrictStr
    type: _Type


class _Agency(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr


class _Configuration(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr
    full_name: StrictStr
    variant: StrictStr


class _Rocket(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    configuration: _Configuration


class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    name: StrictStr


class _Orbit(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    name: StrictStr
    abbrev: StrictStr
    celestial_body: _Body


class _Mission(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr
    type: StrictStr | None = None
    description: StrictStr | None = None
    orbit: _Orbit | None = None
    agencies: list[_Agency]


class _Country(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    name: StrictStr
    alpha_2_code: StrictStr


class _Location(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    name: StrictStr


class _Pad(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictInt
    name: StrictStr
    country: _Country | None = None
    location: _Location | None = None


class _Launch(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    id: StrictStr
    slug: StrictStr
    name: StrictStr
    status: _Status
    last_updated: StrictStr
    net: StrictStr
    net_precision: _Precision
    window_start: StrictStr | None = None
    window_end: StrictStr | None = None
    launch_service_provider: _Agency | None = None
    rocket: _Rocket | None = None
    mission: _Mission | None = None
    pad: _Pad | None = None
    info_urls: list[_InfoUrl]
    vid_urls: list[_VideoUrl]
    webcast_live: StrictBool


class LaunchLibraryPayload(BaseModel):
    """Consumed LL2 pagination envelope and detailed launch records."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)
    count: StrictInt
    results: list[_Launch]


class LaunchLibraryTransport(Protocol):
    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse: ...


class LaunchLibraryAdapter:
    """Fetch, validate, and normalize one bounded LL2 upcoming-launch page."""

    def __init__(
        self, transport: LaunchLibraryTransport, *, source_manifest: SourceManifest
    ) -> None:
        self._transport = transport
        self._source_manifest = source_manifest
        self._codec = Ll2Codec()
        if (
            source_manifest.source_id != LL2_PROVIDER_CODE
            or source_manifest.adapter_id != LL2_ADAPTER_ID
            or source_manifest.adapter_version != LL2_ADAPTER_VERSION
            or source_manifest.source_schema_version != LL2_SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or source_manifest.normalized_fields != tuple(sorted(LL2_NORMALIZED_FIELDS))
            or source_manifest.endpoint_or_base_url != f"https://{LL2_HOST}{LL2_PATH}"
        ):
            raise ValueError("Launch Library 2 source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        return self._source_manifest

    @property
    def codec(self) -> Ll2Codec:
        return self._codec

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        if type(request) is not LaunchLibraryRequest:
            raise ProviderRequestRejected()
        return await self._transport.request(
            FixedHttpRequest(
                url=f"https://{LL2_HOST}{LL2_PATH}",
                params=_LL2_PARAMS,
                expected_content_type=EXPECTED_CONTENT_TYPE,
                max_response_bytes=LL2_MAX_RESPONSE_BYTES,
                user_agent=LL2_USER_AGENT,
            ),
            attempt_deadline=attempt_deadline,
        )

    def validate_payload(self, payload: object) -> LaunchLibraryPayload:
        if not isinstance(payload, RawProviderResponse):
            raise ProviderPayloadInvalid()
        if (
            payload.status_code != 200
            or not payload.raw_complete
            or not payload.content_type_valid
            or payload.max_response_bytes != LL2_MAX_RESPONSE_BYTES
        ):
            raise ProviderPayloadInvalid()
        try:
            decoded = json.loads(
                payload.body.decode("utf-8", errors="strict"),
                object_pairs_hook=_object_without_duplicate_keys,
                parse_constant=_reject_json_constant,
            )
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError, TypeError, ValueError):
            raise ProviderPayloadInvalid() from None
        if not isinstance(decoded, dict):
            raise ProviderPayloadInvalid()
        try:
            value = LaunchLibraryPayload.model_validate(decoded)
        except (RecursionError, TypeError, ValueError, ValidationError):
            raise ProviderPayloadInvalid() from None
        if value.count < 0 or len(value.results) > LL2_MAX_LAUNCHES:
            raise ProviderPayloadInvalid()
        if len(value.results) > value.count:
            raise ProviderPayloadInvalid()
        if any(
            len(item.info_urls) > _MAX_OPTIONAL_LINKS or len(item.vid_urls) > _MAX_OPTIONAL_LINKS
            for item in value.results
        ):
            raise ProviderPayloadInvalid()
        if any(
            item.mission is not None and len(item.mission.agencies) > _MAX_MISSION_AGENCIES
            for item in value.results
        ):
            raise ProviderPayloadInvalid()
        return value

    def normalize(self, request: object, payload: object) -> Ll2Normalized:
        if type(request) is not LaunchLibraryRequest or type(payload) is not LaunchLibraryPayload:
            raise ProviderNormalizationFailed()
        try:
            launches = tuple(
                sorted((_normalize_launch(item) for item in payload.results), key=_launch_sort_key)
            )
            latest = (
                None
                if not launches
                else max(
                    launches, key=lambda item: _parse_utc(item.last_updated_utc)
                ).last_updated_utc
            )
            normalized = Ll2Normalized(snapshot_latest_updated_utc=latest, launches=launches)
            self._codec.encode(normalized)
        except (TypeError, ValueError):
            raise ProviderNormalizationFailed() from None
        return normalized


def _normalize_launch(item: _Launch) -> Ll2Launch:
    agency = None
    if item.launch_service_provider is not None:
        agency = Ll2Agency(
            id=item.launch_service_provider.id,
            name=_plain_text(item.launch_service_provider.name, 256),
        )
    vehicle = None
    if item.rocket is not None:
        configuration = item.rocket.configuration
        variant = _optional_plain_text(configuration.variant, 128)
        vehicle = Ll2Vehicle(
            configuration_id=configuration.id,
            name=_plain_text(configuration.name, 256),
            full_name=_plain_text(configuration.full_name, 256),
            variant=variant,
        )
    mission = _normalize_mission(item.mission)
    site = _normalize_site(item.pad)
    return Ll2Launch(
        launch_id=item.id,
        slug=item.slug,
        name=_plain_text(item.name, 512),
        status=Ll2Status(item.status.id, item.status.name, item.status.abbrev),
        net_utc=_canonical_utc(item.net),
        precision=Ll2Precision(
            item.net_precision.id, item.net_precision.name, item.net_precision.abbrev
        ),
        window_start_utc=None if item.window_start is None else _canonical_utc(item.window_start),
        window_end_utc=None if item.window_end is None else _canonical_utc(item.window_end),
        last_updated_utc=_canonical_utc(item.last_updated),
        agency=agency,
        vehicle=vehicle,
        mission=mission,
        site=site,
        official_page_url=_select_official_info_url(item.info_urls),
        official_webcast_url=_select_official_webcast_url(item.vid_urls),
        webcast_live=item.webcast_live,
    )


def _normalize_mission(value: _Mission | None) -> Ll2Mission | None:
    if value is None:
        return None
    names = tuple(sorted({_plain_text(agency.name, 256) for agency in value.agencies}))
    orbit = value.orbit
    return Ll2Mission(
        id=value.id,
        name=_plain_text(value.name, 512),
        mission_type=_optional_plain_text(value.type, 256),
        description=_optional_description(value.description),
        orbit_name=None if orbit is None else _plain_text(orbit.name, 256),
        orbit_abbreviation=None if orbit is None else _plain_text(orbit.abbrev, 64),
        destination_body=None if orbit is None else _plain_text(orbit.celestial_body.name, 128),
        agency_names=names,
    )


def _normalize_site(value: _Pad | None) -> Ll2Site | None:
    if value is None:
        return None
    country = value.country
    return Ll2Site(
        pad_id=value.id,
        pad_name=_plain_text(value.name, 256),
        location_name=None if value.location is None else _plain_text(value.location.name, 256),
        country_name=None if country is None else _plain_text(country.name, 128),
        country_code=None if country is None else country.alpha_2_code,
    )


def _select_official_info_url(values: list[_InfoUrl]) -> str | None:
    candidates = sorted(
        (item.priority, item.url)
        for item in values
        if item.type.id == 1 and item.type.name == "Official Page" and _is_safe_https_url(item.url)
    )
    return None if not candidates else candidates[0][1]


def _select_official_webcast_url(values: list[_VideoUrl]) -> str | None:
    candidates = sorted(
        (item.priority, item.url)
        for item in values
        if item.type.id == 1
        and item.type.name == "Official Webcast"
        and _is_safe_https_url(item.url)
    )
    return None if not candidates else candidates[0][1]


def _is_safe_https_url(value: str) -> bool:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or len(value) > 2048
        or "\\" in value
        or any(character.isspace() for character in value)
    ):
        return False
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme == "https"
        and parsed.hostname is not None
        and parsed.username is None
        and parsed.password is None
        and port in {None, 443}
        and not parsed.fragment
    )


def _plain_text(value: str, maximum: int) -> str:
    if type(value) is not str or not value or value != value.strip() or len(value) > maximum:
        raise ValueError("LL2 provider text is invalid")
    if any(unicodedata.category(character) in {"Cc", "Cf", "Cs"} for character in value):
        raise ValueError("LL2 provider text is invalid")
    return value


def _optional_plain_text(value: str | None, maximum: int) -> str | None:
    if value is None or value == "":
        return None
    return _plain_text(value, maximum)


def _optional_description(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    if any(
        unicodedata.category(character) in {"Cf", "Cs"}
        or unicodedata.category(character) == "Cc"
        and character not in _ALLOWED_DESCRIPTION_CONTROLS
        for character in value
    ):
        raise ValueError("LL2 mission description contains an unsafe control character")
    normalized = " ".join(value.split())
    return _plain_text(normalized, 4096)


def _canonical_utc(value: str) -> str:
    parsed = _parse_utc(value)
    return parsed.isoformat(timespec="seconds").replace("+00:00", "Z")


def _parse_utc(value: str) -> datetime:
    if type(value) is not str or not value.endswith("Z") or len(value) > 40:
        raise ValueError("LL2 provider timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("LL2 provider timestamp is invalid") from None
    if parsed.utcoffset() != UTC.utcoffset(parsed):
        raise ValueError("LL2 provider timestamp is invalid")
    return parsed


def _launch_sort_key(value: Ll2Launch) -> tuple[datetime, str]:
    return _parse_utc(value.net_utc), value.launch_id


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def load_launch_library_source_manifest(
    repository_root: Path | None = REPOSITORY_ROOT,
) -> SourceManifest:
    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / SOURCE_MANIFEST_PATH).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data(
                "lumina", "data/manifests/sources/launch-library-2.json"
            )
        except (ImportError, OSError):
            raise ValueError("Launch Library 2 source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("Launch Library 2 source manifest is unavailable")
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("Launch Library 2 source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("Launch Library 2 source manifest is unavailable")
    return manifest


__all__ = [
    "EXPECTED_CONTENT_TYPE",
    "LaunchLibraryAdapter",
    "LaunchLibraryPayload",
    "LaunchLibraryRequest",
    "LaunchLibraryTransport",
    "REPOSITORY_ROOT",
    "SOURCE_MANIFEST_PATH",
    "load_launch_library_source_manifest",
]
