"""Fixed NASA Asteroids NeoWs feed adapter for the Phase 4B NEO vertical."""

from __future__ import annotations

import json
import math
import pkgutil
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Final, Literal, Protocol
from urllib.parse import quote, quote_plus

from pydantic import BaseModel, ConfigDict, SecretStr, StrictBool, StrictStr, ValidationError

from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json
from lumina.provenance.domain.neows import (
    MAX_NEOWS_ENCOUNTERS,
    NEOWS_NORMALIZED_FIELDS,
    NasaNeowsCodec,
    NasaNeowsEncounter,
    NasaNeowsNormalized,
    neows_object_id,
)
from lumina.provenance.domain.provider import (
    ProviderAdapter,
    ProviderNormalizationFailed,
    ProviderNotConfigured,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.runtime import (
    NEOWS_ADAPTER_ID,
    NEOWS_ADAPTER_VERSION,
    NEOWS_CONTENT_TYPE,
    NEOWS_HOST,
    NEOWS_MAX_RESPONSE_BYTES,
    NEOWS_PATH,
    NEOWS_PROVIDER_CODE,
    NEOWS_SOURCE_SCHEMA_VERSION,
    NEOWS_USER_AGENT,
    RawProviderResponse,
)

from .http import FixedHttpRequest, _valid_api_key

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/nasa-neows.json"
EXPECTED_CONTENT_TYPE: Final = NEOWS_CONTENT_TYPE
_OPERATION: Final = "batch_fetch"
_DATE_PATTERN: Final = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_NUMBER_PATTERN: Final = re.compile(
    r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?",
    re.ASCII,
)
_INTEGER_PATTERN: Final = re.compile(r"[+-]?[0-9]+", re.ASCII)
_MAX_WIRE_DEPTH: Final = 32
_MAX_WIRE_LIST_LENGTH: Final = 512
_MAX_APPROACH_TIME_LENGTH: Final = 128
_MAX_SOURCE_TEXT_LENGTH: Final = 512


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, repr=False, slots=True)
class NasaNeowsRequest:
    """One frozen seven-date NeoWs request; the credential is never represented."""

    start_date: str
    end_date: str
    api_key: SecretStr = field(repr=False)
    operation: Literal["batch_fetch"] = _OPERATION

    def __post_init__(self) -> None:
        if type(self.api_key) is not SecretStr or self.operation != _OPERATION:
            raise ProviderRequestRejected()
        try:
            start = _parse_date(self.start_date)
            end = _parse_date(self.end_date)
        except ValueError:
            raise ProviderRequestRejected() from None
        if end != start + timedelta(days=6) or not _valid_api_key(self.api_key.get_secret_value()):
            raise ProviderRequestRejected()

    def __repr__(self) -> str:
        return (
            "NasaNeowsRequest("
            f"start_date={self.start_date!r}, end_date={self.end_date!r}, "
            "api_key=<redacted>, operation='batch_fetch')"
        )


class NasaNeowsRelativeVelocity(BaseModel):
    """Consumed relative-velocity branch of one NeoWs approach record."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    kilometers_per_second: object


class NasaNeowsMissDistance(BaseModel):
    """Consumed nominal miss-distance branch of one NeoWs approach record."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    kilometers: object
    lunar: object


class NasaNeowsCloseApproach(BaseModel):
    """Strict consumed fields for one provider close-approach record."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    close_approach_date: StrictStr
    close_approach_date_full: StrictStr
    epoch_date_close_approach: object
    relative_velocity: NasaNeowsRelativeVelocity
    miss_distance: NasaNeowsMissDistance
    orbiting_body: StrictStr


class NasaNeowsMeters(BaseModel):
    """Estimated diameter in the only v1 product unit."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    estimated_diameter_min: object
    estimated_diameter_max: object


class NasaNeowsEstimatedDiameter(BaseModel):
    """Provider estimated-diameter object with unrelated units ignored."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    meters: NasaNeowsMeters


class NasaNeowsObject(BaseModel):
    """Strict consumed object fields before event normalization."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    neo_reference_id: StrictStr
    name: StrictStr
    absolute_magnitude_h: object
    estimated_diameter: NasaNeowsEstimatedDiameter
    is_potentially_hazardous_asteroid: StrictBool
    close_approach_data: list[NasaNeowsCloseApproach]


class NasaNeowsPayload(BaseModel):
    """Strict top-level NeoWs feed shape with additive metadata compatibility."""

    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)

    near_earth_objects: dict[StrictStr, list[NasaNeowsObject]]


class NasaNeowsTransport(Protocol):
    """One-attempt transport capability required by the NeoWs adapter."""

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        """Execute one fixed NASA request within the framework deadline."""
        ...


class NasaNeowsAdapter(ProviderAdapter[NasaNeowsRequest, NasaNeowsPayload, NasaNeowsNormalized]):
    """Fetch, validate, and normalize exactly one bounded NeoWs feed response."""

    def __init__(
        self,
        transport: NasaNeowsTransport,
        *,
        api_key: SecretStr | None,
        source_manifest: SourceManifest,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._transport = transport
        self._api_key = api_key
        self._source_manifest = source_manifest
        self._clock = clock or (lambda: datetime.now(UTC))
        self._codec = NasaNeowsCodec()
        if (
            source_manifest.source_id != NEOWS_PROVIDER_CODE
            or source_manifest.adapter_id != NEOWS_ADAPTER_ID
            or source_manifest.adapter_version != NEOWS_ADAPTER_VERSION
            or source_manifest.source_schema_version != NEOWS_SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or source_manifest.normalized_fields != tuple(sorted(NEOWS_NORMALIZED_FIELDS))
            or source_manifest.endpoint_or_base_url != f"https://{NEOWS_HOST}{NEOWS_PATH}"
        ):
            raise ValueError("NASA NeoWs source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the reviewed immutable provenance identity."""
        return self._source_manifest

    @property
    def codec(self) -> NasaNeowsCodec:
        """Return the exact normalized cache codec owned by this adapter."""
        return self._codec

    def is_configured(self) -> bool:
        """Return whether a valid non-example NASA key is available."""
        return self._api_key is not None and _valid_api_key(self._api_key.get_secret_value())

    def new_request(self) -> NasaNeowsRequest:
        """Capture one UTC date window and credential for a sync cycle."""
        if not self.is_configured():
            raise ProviderNotConfigured()
        assert self._api_key is not None
        now = _utc_now(self._clock)
        start = now.date()
        return NasaNeowsRequest(
            start_date=start.isoformat(),
            end_date=(start + timedelta(days=6)).isoformat(),
            api_key=self._api_key,
        )

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        """Issue only the fixed seven-date request through the transport."""
        if type(request) is not NasaNeowsRequest:
            raise ProviderRequestRejected()
        if not self.is_configured():
            raise ProviderNotConfigured()
        assert self._api_key is not None
        if request.api_key.get_secret_value() != self._api_key.get_secret_value():
            raise ProviderRequestRejected()
        raw = await self._transport.request(
            FixedHttpRequest(
                url=f"https://{NEOWS_HOST}{NEOWS_PATH}",
                params=(
                    ("start_date", request.start_date),
                    ("end_date", request.end_date),
                    ("api_key", self._api_key.get_secret_value()),
                ),
                expected_content_type=EXPECTED_CONTENT_TYPE,
                max_response_bytes=NEOWS_MAX_RESPONSE_BYTES,
                user_agent=NEOWS_USER_AGENT,
            ),
            attempt_deadline=attempt_deadline,
        )
        return replace(
            raw,
            quarantine_body=_redact_quarantine_body(
                raw.body,
                self._api_key.get_secret_value(),
            ),
        )

    def validate_payload(self, payload: object) -> NasaNeowsPayload:
        """Parse one bounded NeoWs response without retaining raw provider links."""
        if not isinstance(payload, RawProviderResponse):
            raise ProviderPayloadInvalid()
        if (
            payload.status_code != 200
            or not payload.raw_complete
            or not payload.content_type_valid
            or payload.max_response_bytes != NEOWS_MAX_RESPONSE_BYTES
        ):
            raise ProviderPayloadInvalid()
        try:
            text = payload.body.decode("utf-8", errors="strict")
            decoded = json.loads(
                text,
                object_pairs_hook=_object_without_duplicate_keys,
                parse_constant=_reject_json_constant,
            )
            _validate_wire_shape(decoded)
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
            validated = NasaNeowsPayload.model_validate(decoded)
            _validate_source_payload(validated)
        except (RecursionError, TypeError, ValueError, ValidationError):
            raise ProviderPayloadInvalid() from None
        return validated

    def normalize(self, request: object, payload: object) -> NasaNeowsNormalized:
        """Select exactly one Earth event per feed bucket and canonicalize its values."""
        if type(request) is not NasaNeowsRequest or type(payload) is not NasaNeowsPayload:
            raise ProviderNormalizationFailed()
        start = _parse_date(request.start_date)
        end = _parse_date(request.end_date)
        encounters: list[NasaNeowsEncounter] = []
        seen_identity: set[tuple[str, str]] = set()
        for bucket_date, objects in sorted(payload.near_earth_objects.items()):
            bucket = _parse_date(bucket_date)
            if not start <= bucket <= end:
                raise ProviderNormalizationFailed()
            for source_object in objects:
                matching = [
                    approach
                    for approach in source_object.close_approach_data
                    if approach.orbiting_body == "Earth"
                    and approach.close_approach_date == bucket_date
                ]
                if len(matching) != 1:
                    raise ProviderNormalizationFailed()
                approach = matching[0]
                identity = (source_object.neo_reference_id, bucket_date)
                if identity in seen_identity:
                    raise ProviderNormalizationFailed()
                seen_identity.add(identity)
                if len(seen_identity) > MAX_NEOWS_ENCOUNTERS:
                    raise ProviderNormalizationFailed()
                try:
                    encounters.append(
                        NasaNeowsEncounter(
                            neo_reference_id=source_object.neo_reference_id,
                            name=source_object.name,
                            approach_date=bucket_date,
                            approach_time_text=approach.close_approach_date_full,
                            provider_epoch_ms=str(
                                _parse_exact_integer(approach.epoch_date_close_approach)
                            ),
                            absolute_magnitude_h=_parse_number(
                                source_object.absolute_magnitude_h,
                                positive=False,
                            ),
                            nominal_distance_km=_parse_number(
                                approach.miss_distance.kilometers,
                                positive=True,
                            ),
                            nominal_distance_lunar=_parse_number(
                                approach.miss_distance.lunar,
                                positive=True,
                            ),
                            relative_velocity_km_s=_parse_number(
                                approach.relative_velocity.kilometers_per_second,
                                positive=True,
                            ),
                            estimated_diameter_min_m=_parse_number(
                                source_object.estimated_diameter.meters.estimated_diameter_min,
                                positive=True,
                            ),
                            estimated_diameter_max_m=_parse_number(
                                source_object.estimated_diameter.meters.estimated_diameter_max,
                                positive=True,
                            ),
                            is_potentially_hazardous_asteroid=(
                                source_object.is_potentially_hazardous_asteroid
                            ),
                        )
                    )
                except (TypeError, ValueError):
                    raise ProviderNormalizationFailed() from None
        encounters.sort(
            key=lambda encounter: (
                int(encounter.provider_epoch_ms),
                encounter.nominal_distance_km,
                encounter.neo_reference_id,
            )
        )
        normalized = NasaNeowsNormalized(
            window_start_date=request.start_date,
            window_end_date=request.end_date,
            encounters=tuple(encounters),
        )
        if self._api_key is not None and _normalized_contains_secret(
            normalized, self._api_key.get_secret_value()
        ):
            raise ProviderNormalizationFailed()
        try:
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


def _redact_quarantine_body(body: bytes, secret: str) -> bytes:
    """Keep NeoWs invalid-response evidence useful without retaining the NASA key."""
    secret_bytes = secret.encode("ascii")
    json_encoded = json.dumps(secret, ensure_ascii=True)[1:-1].encode("ascii")
    candidates = {
        quote(secret, safe="").encode("ascii"),
        quote_plus(secret).encode("ascii"),
        json_encoded,
    }
    if secret_bytes not in {b'"', b"\\"}:
        candidates.add(secret_bytes)
    redacted = body
    for candidate in sorted(candidates, key=len, reverse=True):
        if candidate:
            redacted = redacted.replace(
                candidate,
                _redaction_replacement(candidate, secret_bytes),
            )
    return redacted


_REDACTION_MARKER: Final = b"<redacted>"
_REDACTION_MASK_CHARS: Final = b"~!@#$%^&*()_+-={}[]|:;,.?"


def _redaction_replacement(candidate: bytes, secret: bytes) -> bytes:
    """Choose a non-expanding replacement that cannot contain the secret."""
    if len(candidate) >= len(_REDACTION_MARKER) and secret not in _REDACTION_MARKER:
        return _REDACTION_MARKER
    for character in _REDACTION_MASK_CHARS:
        mask = bytes((character,))
        if mask not in secret:
            return mask * len(candidate)
    return b"\x00" * len(candidate)


def _normalized_contains_secret(value: NasaNeowsNormalized, secret: str) -> bool:
    """Reject provider text that would reflect the server credential downstream."""
    strings = [value.window_start_date, value.window_end_date]
    for encounter in value.encounters:
        strings.extend(
            (
                encounter.neo_reference_id,
                encounter.name,
                encounter.approach_date,
                encounter.approach_time_text,
            )
        )
    return any(secret in candidate for candidate in strings)


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _validate_wire_shape(value: object, depth: int = 0) -> None:
    if depth > _MAX_WIRE_DEPTH:
        raise ValueError("NeoWs wire payload is too deeply nested")
    if isinstance(value, dict):
        for key, child in value.items():
            if type(key) is not str:
                raise ValueError("NeoWs wire object key is invalid")
            _validate_wire_shape(child, depth + 1)
    elif isinstance(value, list):
        if len(value) > _MAX_WIRE_LIST_LENGTH:
            raise ValueError("NeoWs wire list exceeds the bound")
        for child in value:
            _validate_wire_shape(child, depth + 1)


def _validate_source_payload(payload: NasaNeowsPayload) -> None:
    object_count = 0
    for bucket_date, objects in payload.near_earth_objects.items():
        _parse_date(bucket_date)
        if len(objects) > MAX_NEOWS_ENCOUNTERS:
            raise ValueError("NeoWs object count exceeds the bound")
        object_ids: set[str] = set()
        for source_object in objects:
            object_count += 1
            if object_count > MAX_NEOWS_ENCOUNTERS:
                raise ValueError("NeoWs encounter count exceeds the bound")
            neows_object_id(source_object.neo_reference_id)
            _validate_text(source_object.name, maximum=_MAX_SOURCE_TEXT_LENGTH)
            _parse_number(source_object.absolute_magnitude_h, positive=False)
            _parse_number(
                source_object.estimated_diameter.meters.estimated_diameter_min,
                positive=True,
            )
            _parse_number(
                source_object.estimated_diameter.meters.estimated_diameter_max,
                positive=True,
            )
            if _parse_number(
                source_object.estimated_diameter.meters.estimated_diameter_min,
                positive=True,
            ) > _parse_number(
                source_object.estimated_diameter.meters.estimated_diameter_max,
                positive=True,
            ):
                raise ValueError("NeoWs estimated diameter range is inverted")
            if source_object.neo_reference_id in object_ids:
                raise ValueError("NeoWs object identity is duplicated in a date bucket")
            object_ids.add(source_object.neo_reference_id)
            if not source_object.close_approach_data:
                raise ValueError("NeoWs close-approach data is empty")
            if len(source_object.close_approach_data) > _MAX_WIRE_LIST_LENGTH:
                raise ValueError("NeoWs close-approach data exceeds the bound")
            for approach in source_object.close_approach_data:
                _parse_date(approach.close_approach_date)
                _validate_text(
                    approach.close_approach_date_full,
                    maximum=_MAX_APPROACH_TIME_LENGTH,
                )
                _parse_exact_integer(approach.epoch_date_close_approach)
                _parse_number(approach.relative_velocity.kilometers_per_second, positive=True)
                _parse_number(approach.miss_distance.kilometers, positive=True)
                _parse_number(approach.miss_distance.lunar, positive=True)
                _validate_text(approach.orbiting_body, maximum=64)


def _parse_date(value: str) -> date:
    if type(value) is not str or _DATE_PATTERN.fullmatch(value) is None:
        raise ValueError("NeoWs date is invalid")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("NeoWs date is invalid") from None


def _parse_exact_integer(value: object) -> int:
    if type(value) is int and not isinstance(value, bool):
        if value < 0:
            raise ValueError("NeoWs integer is negative")
        return value
    if type(value) is not str or _INTEGER_PATTERN.fullmatch(value) is None:
        raise ValueError("NeoWs integer is invalid")
    if len(value) > 1 and value.startswith("0"):
        raise ValueError("NeoWs integer is not canonical")
    parsed = int(value, 10)
    if parsed < 0:
        raise ValueError("NeoWs integer is negative")
    return parsed


def _parse_number(value: object, *, positive: bool) -> float:
    if type(value) is bool:
        raise ValueError("NeoWs number is invalid")
    if type(value) is int:
        text = str(value)
    elif type(value) is float:
        if not math.isfinite(value):
            raise ValueError("NeoWs number is not finite")
        text = repr(value)
    elif type(value) is str:
        if _NUMBER_PATTERN.fullmatch(value) is None:
            raise ValueError("NeoWs number is invalid")
        text = value
    else:
        raise ValueError("NeoWs number is invalid")
    try:
        parsed = Decimal(text)
    except (InvalidOperation, ValueError):
        raise ValueError("NeoWs number is invalid") from None
    if not parsed.is_finite() or (positive and parsed <= 0):
        raise ValueError("NeoWs number is invalid")
    try:
        result = float(parsed)
    except (OverflowError, ValueError):
        raise ValueError("NeoWs number is invalid") from None
    if not math.isfinite(result) or (positive and result <= 0):
        raise ValueError("NeoWs number is invalid")
    return result


def _validate_text(value: str, *, maximum: int) -> None:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or len(value) > maximum
        or any(unicodedata.category(character) in {"Cc", "Cf", "Cs"} for character in value)
    ):
        raise ValueError("NeoWs text is invalid")


def _utc_now(clock: Callable[[], datetime]) -> datetime:
    value = clock()
    if value.tzinfo is None or value.utcoffset() != UTC.utcoffset(value):
        raise ValueError("NeoWs clock must use UTC")
    return value.astimezone(UTC)


def load_nasa_neows_source_manifest(
    repository_root: Path | None = REPOSITORY_ROOT,
) -> SourceManifest:
    """Load the reviewed NeoWs documentary manifest from source or wheel resources."""
    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / SOURCE_MANIFEST_PATH).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data("lumina", "data/manifests/sources/nasa-neows.json")
        except (ImportError, OSError):
            raise ValueError("NASA NeoWs source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("NASA NeoWs source manifest is unavailable") from None
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("NASA NeoWs source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("NASA NeoWs source manifest is unavailable")
    return manifest


__all__ = [
    "EXPECTED_CONTENT_TYPE",
    "NasaNeowsAdapter",
    "NasaNeowsCloseApproach",
    "NasaNeowsEstimatedDiameter",
    "NasaNeowsMeters",
    "NasaNeowsMissDistance",
    "NasaNeowsObject",
    "NasaNeowsPayload",
    "NasaNeowsRelativeVelocity",
    "NasaNeowsRequest",
    "NasaNeowsTransport",
    "REPOSITORY_ROOT",
    "SOURCE_MANIFEST_PATH",
    "load_nasa_neows_source_manifest",
]
