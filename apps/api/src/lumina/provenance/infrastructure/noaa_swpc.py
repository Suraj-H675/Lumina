"""Fixed, bounded NOAA SWPC multi-product provider adapter."""

from __future__ import annotations

import json
import pkgutil
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Final, Literal, Protocol, cast

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
    SWPC_ADAPTER_ID,
    SWPC_ADAPTER_VERSION,
    SWPC_BASE_PATH,
    SWPC_CONTENT_TYPE,
    SWPC_HOST,
    SWPC_KP_MAX_RESPONSE_BYTES,
    SWPC_KP_PATH,
    SWPC_MAX_TOTAL_RESPONSE_BYTES,
    SWPC_NOTIFICATIONS_MAX_RESPONSE_BYTES,
    SWPC_NOTIFICATIONS_PATH,
    SWPC_PROVIDER_CODE,
    SWPC_SCALES_MAX_RESPONSE_BYTES,
    SWPC_SCALES_PATH,
    SWPC_SOLAR_WIND_FIELD_MAX_RESPONSE_BYTES,
    SWPC_SOLAR_WIND_FIELD_PATH,
    SWPC_SOLAR_WIND_SPEED_MAX_RESPONSE_BYTES,
    SWPC_SOLAR_WIND_SPEED_PATH,
    SWPC_SOURCE_SCHEMA_VERSION,
    SWPC_USER_AGENT,
    RawProviderResponse,
)
from lumina.provenance.domain.space_weather import (
    SWPC_COMPONENT_IDS,
    SWPC_KP_ROW_LIMIT,
    SWPC_MESSAGE_MAX_UTF8_BYTES,
    SWPC_NORMALIZED_FIELDS,
    SWPC_NOTIFICATION_LIMIT,
    SwpcCodec,
    SwpcKpRow,
    SwpcNormalized,
    SwpcNotification,
    SwpcScales,
    SwpcScaleState,
    SwpcSolarWindField,
    SwpcSolarWindSpeed,
    SwpcSourceEvidence,
    kp_sort_key,
    notification_sort_key,
)

from .http import FixedHttpRequest

SOURCE_MANIFEST_PATH: Final = "data/manifests/sources/noaa-swpc.json"
_OPERATION: Final = "batch_fetch"
_MAX_JSON_DEPTH: Final = 16
_MAX_JSON_OBJECT_KEYS: Final = 256
_MAX_JSON_ARRAY_LENGTH: Final = 256
_SCALE_TEXT_MAX_LENGTH: Final = 256
_DATE_TEXT_MAX_LENGTH: Final = 32
_TIME_TEXT_MAX_LENGTH: Final = 32
_PRODUCT_ID_PATTERN: Final = re.compile(r"[A-Za-z0-9_-]{1,64}", re.ASCII)
_PATH_BY_COMPONENT: Final = {
    "scales": (SWPC_SCALES_PATH, SWPC_SCALES_MAX_RESPONSE_BYTES),
    "kp": (SWPC_KP_PATH, SWPC_KP_MAX_RESPONSE_BYTES),
    "solar_wind_speed": (
        SWPC_SOLAR_WIND_SPEED_PATH,
        SWPC_SOLAR_WIND_SPEED_MAX_RESPONSE_BYTES,
    ),
    "solar_wind_field": (
        SWPC_SOLAR_WIND_FIELD_PATH,
        SWPC_SOLAR_WIND_FIELD_MAX_RESPONSE_BYTES,
    ),
    "notifications": (SWPC_NOTIFICATIONS_PATH, SWPC_NOTIFICATIONS_MAX_RESPONSE_BYTES),
}


def _find_repository_root(start: Path) -> Path | None:
    for parent in (start, *start.parents):
        if (parent / SOURCE_MANIFEST_PATH).is_file():
            return parent
    return None


REPOSITORY_ROOT: Final = _find_repository_root(Path(__file__).resolve())


@dataclass(frozen=True, slots=True)
class SwpcComponentRequest:
    """One static SWPC component token; it contains no caller-controlled URL data."""

    component_id: Literal[
        "scales",
        "kp",
        "solar_wind_speed",
        "solar_wind_field",
        "notifications",
    ]
    path: str
    max_response_bytes: int

    def __post_init__(self) -> None:
        expected = _PATH_BY_COMPONENT.get(self.component_id)
        if expected is None or (self.path, self.max_response_bytes) != expected:
            raise ProviderRequestRejected()

    def __repr__(self) -> str:
        return f"SwpcComponentRequest(component_id={self.component_id!r})"


def noaa_swpc_request_plan() -> ProviderRequestPlan:
    """Return the exact reviewed five-request plan in its frozen order."""
    return ProviderRequestPlan(
        components=tuple(
            ProviderRequestComponent(
                component_id=component_id,
                request=SwpcComponentRequest(
                    component_id=component_id,
                    path=_PATH_BY_COMPONENT[component_id][0],
                    max_response_bytes=_PATH_BY_COMPONENT[component_id][1],
                ),
                max_response_bytes=_PATH_BY_COMPONENT[component_id][1],
            )
            for component_id in SWPC_COMPONENT_IDS
        ),
        max_total_response_bytes=SWPC_MAX_TOTAL_RESPONSE_BYTES,
        checksum_domain="LUMINA-SWPC-SNAPSHOT-V1",
    )


class SwpcTransport(Protocol):
    """One-attempt fixed HTTP transport used by the SWPC adapter."""

    async def request(
        self,
        request: FixedHttpRequest,
        *,
        attempt_deadline: float | None = None,
    ) -> RawProviderResponse:
        """Execute one HTTPS request within the provider cycle deadline."""
        ...


class NoaaSwpcAdapter(ProviderBatchAdapter):
    """Fetch and validate exactly the five approved NOAA SWPC products."""

    def __init__(self, transport: SwpcTransport, *, source_manifest: SourceManifest) -> None:
        self._transport = transport
        self._source_manifest = source_manifest
        if (
            source_manifest.source_id != SWPC_PROVIDER_CODE
            or source_manifest.adapter_id != SWPC_ADAPTER_ID
            or source_manifest.adapter_version != SWPC_ADAPTER_VERSION
            or source_manifest.source_schema_version != SWPC_SOURCE_SCHEMA_VERSION
            or source_manifest.capabilities != (_OPERATION,)
            or source_manifest.normalized_fields != tuple(sorted(SWPC_NORMALIZED_FIELDS))
            or source_manifest.endpoint_or_base_url != f"https://{SWPC_HOST}{SWPC_BASE_PATH}"
        ):
            raise ValueError("NOAA SWPC source manifest is incompatible with the adapter")

    @property
    def source_manifest(self) -> SourceManifest:
        """Return the reviewed immutable NOAA source identity."""
        return self._source_manifest

    @property
    def codec(self) -> SwpcCodec:
        """Return the strict normalized cache codec owned by this adapter."""
        return SwpcCodec()

    async def fetch(
        self,
        request: object,
        *,
        attempt_deadline: float | None = None,
    ) -> object:
        """Issue one exact SWPC GET request through the shared bounded transport."""
        if type(request) is not SwpcComponentRequest:
            raise ProviderRequestRejected()
        return await self._transport.request(
            FixedHttpRequest(
                url=f"https://{SWPC_HOST}{request.path}",
                params=(),
                expected_content_type=SWPC_CONTENT_TYPE,
                max_response_bytes=request.max_response_bytes,
                user_agent=SWPC_USER_AGENT,
            ),
            attempt_deadline=attempt_deadline,
        )

    def validate_payload(self, payload: object) -> object:
        """The shared batch seam supplies the component context for validation."""
        raise ProviderPayloadInvalid()

    def normalize(self, request: object, payload: object) -> object:
        """The shared batch seam supplies the component context for normalization."""
        del request, payload
        raise ProviderNormalizationFailed()

    def validate_component_payload(self, request: object, payload: object) -> object:
        """Parse one component only after verifying its exact bounded response contract."""
        if type(request) is not SwpcComponentRequest or not isinstance(
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
            decoded = _parse_json(payload.body)
            if request.component_id == "scales":
                return _parse_scales(decoded)
            if request.component_id == "kp":
                return _parse_kp_rows(decoded)
            if request.component_id == "solar_wind_speed":
                return _parse_speed(decoded)
            if request.component_id == "solar_wind_field":
                return _parse_field(decoded)
            if request.component_id == "notifications":
                return _parse_notifications(decoded)
        except (TypeError, ValueError, RecursionError, UnicodeDecodeError):
            raise ProviderPayloadInvalid() from None
        raise ProviderPayloadInvalid()

    def normalize_component(self, request: object, payload: object) -> object:
        """Return the already strict component DTO without changing source semantics."""
        if type(request) is not SwpcComponentRequest:
            raise ProviderNormalizationFailed()
        if request.component_id == "scales" and type(payload) is SwpcScales:
            return payload
        if request.component_id == "kp" and type(payload) is tuple:
            return payload
        if request.component_id == "solar_wind_speed" and type(payload) is SwpcSolarWindSpeed:
            return payload
        if request.component_id == "solar_wind_field" and type(payload) is SwpcSolarWindField:
            return payload
        if request.component_id == "notifications" and type(payload) is tuple:
            return payload
        raise ProviderNormalizationFailed()


def compose_swpc_snapshot(
    plan: ProviderRequestPlan,
    results: tuple[ProviderComponentResult, ...],
) -> SwpcNormalized:
    """Compose exactly one complete ordered set of validated component results."""
    if plan.component_ids != SWPC_COMPONENT_IDS or len(results) != len(SWPC_COMPONENT_IDS):
        raise ProviderNormalizationFailed()
    by_id = {result.component_id: result for result in results}
    if tuple(by_id) != SWPC_COMPONENT_IDS:
        raise ProviderNormalizationFailed()
    scales = by_id["scales"].normalized
    kp_rows = by_id["kp"].normalized
    speed = by_id["solar_wind_speed"].normalized
    field = by_id["solar_wind_field"].normalized
    notifications = by_id["notifications"].normalized
    if (
        type(scales) is not SwpcScales
        or type(kp_rows) is not tuple
        or type(speed) is not SwpcSolarWindSpeed
        or type(field) is not SwpcSolarWindField
        or type(notifications) is not tuple
    ):
        raise ProviderNormalizationFailed()
    evidence = SwpcSourceEvidence(
        scales_sha256=by_id["scales"].raw_sha256,
        kp_sha256=by_id["kp"].raw_sha256,
        solar_wind_speed_sha256=by_id["solar_wind_speed"].raw_sha256,
        solar_wind_field_sha256=by_id["solar_wind_field"].raw_sha256,
        notifications_sha256=by_id["notifications"].raw_sha256,
    )
    return SwpcNormalized(
        scales=scales,
        kp_rows=cast(tuple[SwpcKpRow, ...], kp_rows),
        solar_wind_speed=speed,
        solar_wind_field=field,
        notifications=cast(tuple[SwpcNotification, ...], notifications),
        source_evidence=evidence,
    )


def _parse_json(body: bytes) -> object:
    decoded = json.loads(
        body.decode("utf-8", errors="strict"),
        object_pairs_hook=_object_without_duplicate_keys,
        parse_constant=_reject_json_constant,
    )
    _walk_json(decoded, depth=0)
    return decoded


def _walk_json(value: object, *, depth: int) -> None:
    if depth > _MAX_JSON_DEPTH:
        raise ValueError("SWPC JSON nesting is too deep")
    if isinstance(value, Mapping):
        if len(value) > _MAX_JSON_OBJECT_KEYS:
            raise ValueError("SWPC JSON object is too large")
        for key, item in value.items():
            if type(key) is not str:
                raise ValueError("SWPC JSON key is invalid")
            _walk_json(item, depth=depth + 1)
    elif isinstance(value, list):
        if len(value) > _MAX_JSON_ARRAY_LENGTH:
            raise ValueError("SWPC JSON array is too large")
        for item in value:
            _walk_json(item, depth=depth + 1)


def _object_without_duplicate_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def _reject_json_constant(_value: str) -> None:
    raise ValueError("non-finite JSON number")


def _parse_scales(value: object) -> SwpcScales:
    if not isinstance(value, Mapping):
        raise ValueError("SWPC scales payload is not an object")
    current = value.get("0")
    if not isinstance(current, Mapping):
        raise ValueError("SWPC current scales record is missing")
    result = SwpcScales(
        date_text=_required_text(current, "DateStamp", maximum=_DATE_TEXT_MAX_LENGTH),
        time_text=_required_text(current, "TimeStamp", maximum=_TIME_TEXT_MAX_LENGTH),
        radio_blackout=_parse_scale(current.get("R")),
        solar_radiation=_parse_scale(current.get("S")),
        geomagnetic=_parse_scale(current.get("G")),
    )
    _validate_swpc_scales(result)
    return result


def _parse_scale(value: object) -> SwpcScaleState:
    if not isinstance(value, Mapping):
        raise ValueError("SWPC scale category is invalid")
    level = value.get("Scale")
    text = value.get("Text")
    if type(level) is not str or level not in {"0", "1", "2", "3", "4", "5"}:
        raise ValueError("SWPC scale level is invalid")
    if text is not None and type(text) is not str:
        raise ValueError("SWPC scale text is invalid")
    return SwpcScaleState(level=int(level), text=text)


def _parse_kp_rows(value: object) -> tuple[SwpcKpRow, ...]:
    if not isinstance(value, list) or len(value) > SWPC_KP_ROW_LIMIT:
        raise ValueError("SWPC Kp payload is invalid")
    rows: list[SwpcKpRow] = []
    for item in value:
        if not isinstance(item, Mapping):
            raise ValueError("SWPC Kp row is invalid")
        time_text = _required_text(item, "time_tag", maximum=64)
        raw_kp = item.get("kp")
        status = item.get("observed")
        raw_scale = item.get("noaa_scale")
        kp = _finite_number(raw_kp)
        if not 0 <= kp <= 9:
            raise ValueError("SWPC Kp value is outside 0..9")
        if type(status) is not str or status not in {"observed", "estimated", "predicted"}:
            raise ValueError("SWPC Kp status is invalid")
        if raw_scale in {None, ""}:
            noaa_scale = None
        elif type(raw_scale) is str and raw_scale in {"G1", "G2", "G3", "G4", "G5"}:
            noaa_scale = raw_scale
        else:
            raise ValueError("SWPC Kp NOAA scale is invalid")
        rows.append(
            SwpcKpRow(
                time_text=time_text,
                kp=kp,
                status=cast(Literal["observed", "estimated", "predicted"], status),
                noaa_scale=noaa_scale,
            )
        )
    for row in rows:
        _validate_kp_row(row)
    return tuple(sorted(rows, key=kp_sort_key))


def _parse_speed(value: object) -> SwpcSolarWindSpeed:
    item = _single_summary_row(value)
    if item is None:
        return SwpcSolarWindSpeed(time_utc=None, proton_speed_km_s=None)
    raw_speed = item.get("proton_speed")
    speed = None if raw_speed is None else _finite_number(raw_speed)
    if speed is not None and speed < 0:
        raise ValueError("SWPC proton speed is invalid")
    time_utc = _optional_utc_text(item.get("time_tag"))
    result = SwpcSolarWindSpeed(time_utc=time_utc, proton_speed_km_s=speed)
    _validate_speed(result)
    return result


def _parse_field(value: object) -> SwpcSolarWindField:
    item = _single_summary_row(value)
    if item is None:
        return SwpcSolarWindField(time_utc=None, bt_nt=None, bz_gsm_nt=None)
    raw_bt = item.get("bt")
    raw_bz = item.get("bz_gsm")
    bt = None if raw_bt is None else _finite_number(raw_bt)
    bz = None if raw_bz is None else _finite_number(raw_bz)
    if bt is not None and bt < 0:
        raise ValueError("SWPC total magnetic field is invalid")
    result = SwpcSolarWindField(
        time_utc=_optional_utc_text(item.get("time_tag")),
        bt_nt=bt,
        bz_gsm_nt=bz,
    )
    _validate_field(result)
    return result


def _single_summary_row(value: object) -> Mapping[str, object] | None:
    if not isinstance(value, list) or len(value) > 1:
        raise ValueError("SWPC summary payload is invalid")
    if not value:
        return None
    item = value[0]
    if not isinstance(item, Mapping):
        raise ValueError("SWPC summary row is invalid")
    if "time_tag" not in item:
        raise ValueError("SWPC summary timestamp is missing")
    return item


def _parse_notifications(value: object) -> tuple[SwpcNotification, ...]:
    if not isinstance(value, list) or len(value) > _MAX_JSON_ARRAY_LENGTH:
        raise ValueError("SWPC notification payload is invalid")
    normalized: list[SwpcNotification] = []
    for item in value:
        if not isinstance(item, Mapping):
            raise ValueError("SWPC notification record is invalid")
        product_id = item.get("product_id")
        issue_time = item.get("issue_datetime")
        message = item.get("message")
        if (
            type(product_id) is not str
            or _PRODUCT_ID_PATTERN.fullmatch(product_id) is None
            or type(issue_time) is not str
            or type(message) is not str
            or not message
            or len(message.encode("utf-8")) > SWPC_MESSAGE_MAX_UTF8_BYTES
        ):
            raise ValueError("SWPC notification fields are invalid")
        normalized.append(
            SwpcNotification(
                product_id=product_id,
                issue_time_text=issue_time,
                message=message,
            )
        )
    for notification in normalized:
        _validate_notification(notification)
    normalized.sort(key=notification_sort_key, reverse=True)
    normalized = normalized[:SWPC_NOTIFICATION_LIMIT]
    return tuple(normalized)


def _required_text(value: Mapping[str, object], key: str, *, maximum: int) -> str:
    result = value.get(key)
    if type(result) is not str or not result or len(result) > maximum:
        raise ValueError("SWPC required text is invalid")
    return result


def _optional_utc_text(value: object) -> str | None:
    if value is None:
        return None
    if type(value) is not str:
        raise ValueError("SWPC optional UTC timestamp is invalid")
    return value


def _finite_number(value: object) -> float:
    if type(value) is bool or not isinstance(value, (int, float)):
        raise ValueError("SWPC number is invalid")
    try:
        result = float(value)
    except (OverflowError, ValueError):
        raise ValueError("SWPC number is invalid") from None
    if result != result or result in {float("inf"), float("-inf")}:
        raise ValueError("SWPC number is not finite")
    return result


def _validate_swpc_scales(value: SwpcScales) -> None:
    SwpcCodec().encode(
        SwpcNormalized(
            scales=value,
            kp_rows=(),
            solar_wind_speed=SwpcSolarWindSpeed(None, None),
            solar_wind_field=SwpcSolarWindField(None, None, None),
            notifications=(),
            source_evidence=SwpcSourceEvidence("0" * 64, "0" * 64, "0" * 64, "0" * 64, "0" * 64),
        )
    )


def _validate_kp_row(value: SwpcKpRow) -> None:
    if not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?",
        value.time_text,
        re.ASCII,
    ):
        raise ValueError("SWPC Kp timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value.time_text)
    except ValueError:
        raise ValueError("SWPC Kp timestamp is invalid") from None
    if parsed.tzinfo is not None:
        raise ValueError("SWPC Kp timestamp must be naive source text")
    if type(value.kp) is not float or not 0 <= value.kp <= 9:
        raise ValueError("SWPC Kp value is invalid")


def _validate_speed(value: SwpcSolarWindSpeed) -> None:
    if value.time_utc is not None:
        _validate_utc(value.time_utc)
    if value.proton_speed_km_s is not None and (
        type(value.proton_speed_km_s) is not float or value.proton_speed_km_s < 0
    ):
        raise ValueError("SWPC proton speed is invalid")


def _validate_field(value: SwpcSolarWindField) -> None:
    if value.time_utc is not None:
        _validate_utc(value.time_utc)
    if value.bt_nt is not None and (type(value.bt_nt) is not float or value.bt_nt < 0):
        raise ValueError("SWPC Bt is invalid")
    if value.bz_gsm_nt is not None and type(value.bz_gsm_nt) is not float:
        raise ValueError("SWPC Bz is invalid")


def _validate_notification(value: SwpcNotification) -> None:
    if _PRODUCT_ID_PATTERN.fullmatch(value.product_id) is None:
        raise ValueError("SWPC product ID is invalid")
    try:
        parsed = datetime.fromisoformat(value.issue_time_text)
    except ValueError:
        raise ValueError("SWPC issue timestamp is invalid") from None
    if parsed.tzinfo is not None or not value.issue_time_text or "T" in value.issue_time_text:
        raise ValueError("SWPC issue timestamp is invalid")
    if not value.message or len(value.message.encode("utf-8")) > SWPC_MESSAGE_MAX_UTF8_BYTES:
        raise ValueError("SWPC notification message is invalid")
    if any(
        (ord(character) < 32 and character not in {"\t", "\n", "\r"})
        or unicodedata.category(character) == "Cf"
        or 0xD800 <= ord(character) <= 0xDFFF
        for character in value.message
    ):
        raise ValueError("SWPC notification message contains unsafe text")


def _validate_utc(value: str) -> None:
    if not value.endswith("Z"):
        raise ValueError("SWPC UTC timestamp is invalid")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("SWPC UTC timestamp is invalid") from None


def load_noaa_swpc_source_manifest(
    repository_root: Path | None = REPOSITORY_ROOT,
) -> SourceManifest:
    """Load the reviewed NOAA SWPC documentary manifest."""
    manifest_bytes: bytes | None = None
    if repository_root is not None:
        try:
            manifest_bytes = (repository_root / SOURCE_MANIFEST_PATH).read_bytes()
        except OSError:
            manifest_bytes = None
    if manifest_bytes is None:
        try:
            manifest_bytes = pkgutil.get_data("lumina", "data/manifests/sources/noaa-swpc.json")
        except (ImportError, OSError):
            raise ValueError("NOAA SWPC source manifest is unavailable") from None
    if manifest_bytes is None:
        raise ValueError("NOAA SWPC source manifest is unavailable")
    try:
        manifest = parse_manifest_json(manifest_bytes)
    except ValueError:
        raise ValueError("NOAA SWPC source manifest is unavailable") from None
    if not isinstance(manifest, SourceManifest):
        raise ValueError("NOAA SWPC source manifest is unavailable")
    return manifest


__all__ = [
    "NoaaSwpcAdapter",
    "REPOSITORY_ROOT",
    "SOURCE_MANIFEST_PATH",
    "SwpcComponentRequest",
    "SwpcTransport",
    "compose_swpc_snapshot",
    "load_noaa_swpc_source_manifest",
    "noaa_swpc_request_plan",
]
