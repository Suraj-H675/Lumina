"""Fixed selected-group CelesTrak OMM JSON adapter for Phase 4D."""

from __future__ import annotations

import json
import pkgutil
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Final, Literal, Protocol, cast

from lumina.provenance.domain.celestrak import (
    CELESTRAK_MAX_GROUP_RECORDS,
    CELESTRAK_NORMALIZED_FIELDS,
    CelestrakCodec,
    CelestrakGroup,
    CelestrakNormalized,
    CelestrakSatellite,
    merge_group_satellites,
)
from lumina.provenance.domain.manifests import SourceManifest, parse_manifest_json
from lumina.provenance.domain.provider import (
    ProviderBatchAdapter,
    ProviderNormalizationFailed,
    ProviderPayloadInvalid,
    ProviderRequestRejected,
)
from lumina.provenance.domain.request_plan import (
    ProviderComponentResult,
    ProviderRequestComponent,
    ProviderRequestPlan,
)
from lumina.provenance.domain.runtime import (
    CELESTRAK_ADAPTER_ID,
    CELESTRAK_ADAPTER_VERSION,
    CELESTRAK_CONTENT_TYPE,
    CELESTRAK_HOST,
    CELESTRAK_MAX_TOTAL_RESPONSE_BYTES,
    CELESTRAK_PATH,
    CELESTRAK_PROVIDER_CODE,
    CELESTRAK_SOURCE_SCHEMA_VERSION,
    CELESTRAK_STATIONS_MAX_RESPONSE_BYTES,
    CELESTRAK_USER_AGENT,
    CELESTRAK_VISUAL_MAX_RESPONSE_BYTES,
    RawProviderResponse,
)

from .http import FixedHttpRequest

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/celestrak-gp.json"
_OPERATION: Final = "batch_fetch"
CelestrakComponentId = Literal["stations", "visual"]
_GROUP_POLICY: Final[dict[CelestrakComponentId, tuple[CelestrakGroup, int]]] = {
    "stations": ("STATIONS", CELESTRAK_STATIONS_MAX_RESPONSE_BYTES),
    "visual": ("VISUAL", CELESTRAK_VISUAL_MAX_RESPONSE_BYTES),
}
_EXPECTED_OMM_KEYS: Final = frozenset(
    {
        "OBJECT_NAME",
        "OBJECT_ID",
        "EPOCH",
        "MEAN_MOTION",
        "ECCENTRICITY",
        "INCLINATION",
        "RA_OF_ASC_NODE",
        "ARG_OF_PERICENTER",
        "MEAN_ANOMALY",
        "EPHEMERIS_TYPE",
        "CLASSIFICATION_TYPE",
        "NORAD_CAT_ID",
        "ELEMENT_SET_NO",
        "REV_AT_EPOCH",
        "BSTAR",
        "MEAN_MOTION_DOT",
        "MEAN_MOTION_DDOT",
    }
)


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, slots=True)
class CelestrakComponentRequest:
    """One fixed selected-group query with no caller-controlled URL data."""

    component_id: CelestrakComponentId
    group: CelestrakGroup
    max_response_bytes: int

    def __post_init__(self) -> None:
        expected = _GROUP_POLICY.get(self.component_id)
        if expected is None or (self.group, self.max_response_bytes) != expected:
            raise ProviderRequestRejected()


def celestrak_request_plan() -> ProviderRequestPlan:
    """Return the exact atomic STATIONS + VISUAL request plan."""
    return ProviderRequestPlan(
        components=tuple(
            ProviderRequestComponent(
                component_id=component_id,
                request=CelestrakComponentRequest(component_id, group, maximum),
                max_response_bytes=maximum,
            )
            for component_id, (group, maximum) in _GROUP_POLICY.items()
        ),
        max_total_response_bytes=CELESTRAK_MAX_TOTAL_RESPONSE_BYTES,
        checksum_domain="LUMINA-CELESTRAK-SELECTED-GROUPS-V1",
    )


class CelestrakTransport(Protocol):
    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse: ...


class CelestrakAdapter(ProviderBatchAdapter):
    """Fetch and validate exactly STATIONS and VISUAL OMM-keyword JSON."""

    def __init__(self, transport: CelestrakTransport, *, source_manifest: SourceManifest) -> None:
        self._transport = transport
        self._source_manifest = source_manifest
        self._codec = CelestrakCodec()
        if (
            source_manifest.source_id != CELESTRAK_PROVIDER_CODE
            or source_manifest.adapter_id != CELESTRAK_ADAPTER_ID
            or source_manifest.adapter_version != CELESTRAK_ADAPTER_VERSION
            or source_manifest.source_schema_version != CELESTRAK_SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or source_manifest.normalized_fields != tuple(sorted(CELESTRAK_NORMALIZED_FIELDS))
            or source_manifest.endpoint_or_base_url != f"https://{CELESTRAK_HOST}{CELESTRAK_PATH}"
        ):
            raise ValueError("CelesTrak source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        return self._source_manifest

    @property
    def codec(self) -> CelestrakCodec:
        return self._codec

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        if type(request) is not CelestrakComponentRequest:
            raise ProviderRequestRejected()
        return await self._transport.request(
            FixedHttpRequest(
                url=f"https://{CELESTRAK_HOST}{CELESTRAK_PATH}",
                params=(("GROUP", request.group), ("FORMAT", "JSON")),
                expected_content_type=CELESTRAK_CONTENT_TYPE,
                max_response_bytes=request.max_response_bytes,
                user_agent=CELESTRAK_USER_AGENT,
            ),
            attempt_deadline=attempt_deadline,
        )

    def validate_payload(self, payload: object) -> object:
        del payload
        raise ProviderPayloadInvalid()

    def normalize(self, request: object, payload: object) -> object:
        del request, payload
        raise ProviderNormalizationFailed()

    def validate_component_payload(self, request: object, payload: object) -> object:
        """Parse one selected group only after exact bounded transport validation."""
        if type(request) is not CelestrakComponentRequest or not isinstance(
            payload, RawProviderResponse
        ):
            raise ProviderPayloadInvalid()
        if (
            payload.status_code != 200
            or not payload.raw_complete
            or not payload.content_type_valid
            or payload.max_response_bytes != request.max_response_bytes
        ):
            raise ProviderPayloadInvalid()
        try:
            decoded = json.loads(
                payload.body.decode("utf-8", errors="strict"),
                object_pairs_hook=_object_without_duplicate_keys,
                parse_constant=_reject_json_constant,
            )
            if (
                not isinstance(decoded, list)
                or not 1 <= len(decoded) <= CELESTRAK_MAX_GROUP_RECORDS
            ):
                raise ValueError("CelesTrak group record count is invalid")
            satellites = tuple(_parse_satellite(item, request.group) for item in decoded)
            if len({item.catalog_number for item in satellites}) != len(satellites):
                raise ValueError("CelesTrak group contains duplicate catalog identities")
            return satellites
        except (UnicodeDecodeError, json.JSONDecodeError, RecursionError, TypeError, ValueError):
            raise ProviderPayloadInvalid() from None

    def normalize_component(self, request: object, payload: object) -> object:
        if type(request) is not CelestrakComponentRequest or type(payload) is not tuple:
            raise ProviderNormalizationFailed()
        if not payload or any(type(item) is not CelestrakSatellite for item in payload):
            raise ProviderNormalizationFailed()
        satellites = cast(tuple[CelestrakSatellite, ...], payload)
        if any(item.groups != (request.group,) for item in satellites):
            raise ProviderNormalizationFailed()
        return tuple(sorted(satellites, key=lambda item: item.catalog_number))


def compose_celestrak_snapshot(
    plan: ProviderRequestPlan,
    results: tuple[ProviderComponentResult, ...],
) -> CelestrakNormalized:
    """Merge both complete groups atomically, rejecting conflicting duplicate states."""
    if (
        plan.component_ids != ("stations", "visual")
        or tuple(result.component_id for result in results) != plan.component_ids
    ):
        raise ProviderNormalizationFailed()
    if any(type(result.normalized) is not tuple for result in results):
        raise ProviderNormalizationFailed()
    try:
        groups = cast(
            tuple[tuple[CelestrakSatellite, ...], ...], tuple(item.normalized for item in results)
        )
        return merge_group_satellites(groups)
    except (TypeError, ValueError):
        raise ProviderNormalizationFailed() from None


def _parse_satellite(value: object, group: CelestrakGroup) -> CelestrakSatellite:
    if not isinstance(value, Mapping) or set(value) != _EXPECTED_OMM_KEYS:
        raise ValueError("CelesTrak OMM object shape is invalid")
    object_id_value = value.get("OBJECT_ID")
    if object_id_value in {None, ""}:
        object_id = None
    elif type(object_id_value) is str:
        object_id = object_id_value
    else:
        raise ValueError("CelesTrak OMM object identity is invalid")
    return CelestrakSatellite(
        catalog_number=_integer(value, "NORAD_CAT_ID"),
        object_name=_text(value, "OBJECT_NAME", maximum=128),
        object_id=object_id,
        epoch_utc=_canonical_utc(_text(value, "EPOCH", maximum=40)),
        mean_motion_rev_per_day=_number(value, "MEAN_MOTION"),
        eccentricity=_number(value, "ECCENTRICITY"),
        inclination_deg=_number(value, "INCLINATION"),
        ra_of_asc_node_deg=_number(value, "RA_OF_ASC_NODE"),
        arg_of_pericenter_deg=_number(value, "ARG_OF_PERICENTER"),
        mean_anomaly_deg=_number(value, "MEAN_ANOMALY"),
        ephemeris_type=_integer(value, "EPHEMERIS_TYPE"),
        classification_type=_text(value, "CLASSIFICATION_TYPE", maximum=1),
        element_set_number=_integer(value, "ELEMENT_SET_NO"),
        revolution_at_epoch=_integer(value, "REV_AT_EPOCH"),
        bstar=_number(value, "BSTAR"),
        mean_motion_dot=_number(value, "MEAN_MOTION_DOT"),
        mean_motion_ddot=_number(value, "MEAN_MOTION_DDOT"),
        groups=(group,),
    )


def _canonical_utc(value: str) -> str:
    raw = value[:-1] if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        raise ValueError("CelesTrak OMM epoch is invalid") from None
    if parsed.tzinfo is not None:
        raise ValueError("CelesTrak OMM epoch is invalid")
    parsed = parsed.replace(tzinfo=UTC)
    if parsed.year < 1957 or parsed.year > 2200:
        raise ValueError("CelesTrak OMM epoch is outside the supported range")
    return parsed.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _text(value: Mapping[str, object], key: str, *, maximum: int) -> str:
    result = value.get(key)
    if type(result) is not str or not result or result != result.strip() or len(result) > maximum:
        raise ValueError("CelesTrak OMM text is invalid")
    if any(unicodedata.category(character) in {"Cc", "Cf", "Cs"} for character in result):
        raise ValueError("CelesTrak OMM text contains a disallowed control character")
    return result


def _integer(value: Mapping[str, object], key: str) -> int:
    result = value.get(key)
    if type(result) is not int:
        raise ValueError("CelesTrak OMM integer is invalid")
    return result


def _number(value: Mapping[str, object], key: str) -> float:
    result = value.get(key)
    if type(result) not in {int, float}:
        raise ValueError("CelesTrak OMM number is invalid")
    return float(cast(int | float, result))


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def load_celestrak_source_manifest(
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
            manifest_bytes = pkgutil.get_data("lumina", "data/manifests/sources/celestrak-gp.json")
        except (ImportError, OSError):
            raise ValueError("CelesTrak source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("CelesTrak source manifest is unavailable")
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("CelesTrak source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("CelesTrak source manifest is unavailable")
    return manifest


__all__ = [
    "CelestrakAdapter",
    "CelestrakComponentRequest",
    "CelestrakTransport",
    "REPOSITORY_ROOT",
    "SOURCE_MANIFEST_PATH",
    "celestrak_request_plan",
    "compose_celestrak_snapshot",
    "load_celestrak_source_manifest",
]
