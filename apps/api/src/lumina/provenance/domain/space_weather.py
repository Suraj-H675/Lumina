"""Lumina-owned normalized contracts for the NOAA SWPC snapshot."""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Final, Literal, cast

from .runtime import NormalizedPayload, ProviderPayloadCodec, validate_normalized_payload

SWPC_NORMALIZED_FIELDS: Final = (
    "scales.date_text",
    "scales.time_text",
    "scales.radio_blackout",
    "scales.solar_radiation",
    "scales.geomagnetic",
    "kp_rows",
    "solar_wind.speed",
    "solar_wind.magnetic_field",
    "notifications",
    "source_evidence",
)
SWPC_COMPONENT_IDS: Final = (
    "scales",
    "kp",
    "solar_wind_speed",
    "solar_wind_field",
    "notifications",
)
SWPC_NOTIFICATION_LIMIT: Final = 32
SWPC_PUBLIC_NOTIFICATION_LIMIT: Final = 12
SWPC_KP_PUBLIC_FORECAST_LIMIT: Final = 8
SWPC_KP_ROW_LIMIT: Final = 256
SWPC_MESSAGE_MAX_UTF8_BYTES: Final = 16_384
SWPC_AURORA_OFFICIAL_URL: Final = "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast"

_HASH_PATTERN: Final = re.compile(r"[0-9a-f]{64}", re.ASCII)
_DATE_PATTERN: Final = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_CLOCK_PATTERN: Final = re.compile(r"[0-9]{2}:[0-9]{2}:[0-9]{2}", re.ASCII)
_KP_TIME_PATTERN: Final = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?",
    re.ASCII,
)
_UTC_TIME_PATTERN: Final = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z",
    re.ASCII,
)
_ISSUE_TIME_PATTERN: Final = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?",
    re.ASCII,
)
_PRODUCT_ID_PATTERN: Final = re.compile(r"[A-Za-z0-9_-]{1,64}", re.ASCII)
_ALLOWED_CONTROLS: Final = frozenset({"\t", "\n", "\r"})
_KP_STATUS_ORDER: Final = {"observed": 0, "estimated": 1, "predicted": 2}
KpStatus = Literal["observed", "estimated", "predicted"]


@dataclass(frozen=True, slots=True)
class SwpcScaleState:
    """One current NOAA R/S/G source scale state."""

    level: int
    text: str | None


@dataclass(frozen=True, slots=True)
class SwpcScales:
    """The current-period (source key ``0``) NOAA scales."""

    date_text: str
    time_text: str
    radio_blackout: SwpcScaleState
    solar_radiation: SwpcScaleState
    geomagnetic: SwpcScaleState


@dataclass(frozen=True, slots=True)
class SwpcKpRow:
    """One Kp row retaining NOAA's observed/estimated/predicted status."""

    time_text: str
    kp: float
    status: KpStatus
    noaa_scale: str | None


@dataclass(frozen=True, slots=True)
class SwpcSolarWindSpeed:
    """One SWPC upstream proton-speed measurement."""

    time_utc: str | None
    proton_speed_km_s: float | None


@dataclass(frozen=True, slots=True)
class SwpcSolarWindField:
    """One SWPC upstream magnetic-field measurement in GSM coordinates."""

    time_utc: str | None
    bt_nt: float | None
    bz_gsm_nt: float | None


@dataclass(frozen=True, slots=True)
class SwpcNotification:
    """One bounded provider notification retained as plain text."""

    product_id: str
    issue_time_text: str
    message: str


@dataclass(frozen=True, slots=True)
class SwpcSourceEvidence:
    """Internal exact-body checksums retained inside the normalized cache."""

    scales_sha256: str
    kp_sha256: str
    solar_wind_speed_sha256: str
    solar_wind_field_sha256: str
    notifications_sha256: str


@dataclass(frozen=True, slots=True)
class SwpcNormalized:
    """The complete atomic normalized SWPC snapshot."""

    scales: SwpcScales
    kp_rows: tuple[SwpcKpRow, ...]
    solar_wind_speed: SwpcSolarWindSpeed
    solar_wind_field: SwpcSolarWindField
    notifications: tuple[SwpcNotification, ...]
    source_evidence: SwpcSourceEvidence


class SwpcCodec(ProviderPayloadCodec):
    """Strictly encode and decode the bounded SWPC cache representation."""

    def encode(self, normalized: object) -> NormalizedPayload:
        if type(normalized) is not SwpcNormalized:
            raise ValueError("SWPC normalized payload is invalid")
        _validate_normalized(normalized)
        encoded: dict[str, object] = {
            "scales": {
                "date_text": normalized.scales.date_text,
                "time_text": normalized.scales.time_text,
                "radio_blackout": _scale_dict(normalized.scales.radio_blackout),
                "solar_radiation": _scale_dict(normalized.scales.solar_radiation),
                "geomagnetic": _scale_dict(normalized.scales.geomagnetic),
            },
            "kp_rows": [
                {
                    "time_text": row.time_text,
                    "kp": row.kp,
                    "status": row.status,
                    "noaa_scale": row.noaa_scale,
                }
                for row in normalized.kp_rows
            ],
            "solar_wind": {
                "speed": {
                    "time_utc": normalized.solar_wind_speed.time_utc,
                    "proton_speed_km_s": normalized.solar_wind_speed.proton_speed_km_s,
                },
                "magnetic_field": {
                    "time_utc": normalized.solar_wind_field.time_utc,
                    "bt_nt": normalized.solar_wind_field.bt_nt,
                    "bz_gsm_nt": normalized.solar_wind_field.bz_gsm_nt,
                },
            },
            "notifications": [
                {
                    "product_id": notification.product_id,
                    "issue_time_text": notification.issue_time_text,
                    "message": notification.message,
                }
                for notification in normalized.notifications
            ],
            "source_evidence": {
                "scales_sha256": normalized.source_evidence.scales_sha256,
                "kp_sha256": normalized.source_evidence.kp_sha256,
                "solar_wind_speed_sha256": normalized.source_evidence.solar_wind_speed_sha256,
                "solar_wind_field_sha256": normalized.source_evidence.solar_wind_field_sha256,
                "notifications_sha256": normalized.source_evidence.notifications_sha256,
            },
        }
        return validate_normalized_payload(encoded)

    def decode(self, stored: object) -> SwpcNormalized:
        if not isinstance(stored, Mapping) or set(stored) != {
            "scales",
            "kp_rows",
            "solar_wind",
            "notifications",
            "source_evidence",
        }:
            raise ValueError("SWPC stored payload is invalid")
        scales = _decode_scales(stored.get("scales"))
        kp_rows = _decode_kp_rows(stored.get("kp_rows"))
        solar_speed, solar_field = _decode_solar_wind(stored.get("solar_wind"))
        notifications = _decode_notifications(stored.get("notifications"))
        evidence = _decode_evidence(stored.get("source_evidence"))
        normalized = SwpcNormalized(
            scales=scales,
            kp_rows=kp_rows,
            solar_wind_speed=solar_speed,
            solar_wind_field=solar_field,
            notifications=notifications,
            source_evidence=evidence,
        )
        _validate_normalized(normalized)
        return normalized

    def accepts_replacement(
        self,
        current: NormalizedPayload | None,
        candidate: NormalizedPayload,
    ) -> bool:
        del current
        self.decode(candidate)
        return True


def _scale_dict(value: SwpcScaleState) -> dict[str, object]:
    return {"level": value.level, "text": value.text}


def _validate_normalized(value: SwpcNormalized) -> None:
    _validate_scales(value.scales)
    if len(value.kp_rows) > SWPC_KP_ROW_LIMIT:
        raise ValueError("SWPC Kp row set is too large")
    for row in value.kp_rows:
        _validate_kp_row(row)
    try:
        expected_kp_order = tuple(sorted(value.kp_rows, key=kp_sort_key))
    except (TypeError, ValueError, OverflowError):
        raise ValueError("SWPC Kp rows are not canonically ordered") from None
    if tuple(value.kp_rows) != expected_kp_order:
        raise ValueError("SWPC Kp rows are not canonically ordered")
    _validate_speed(value.solar_wind_speed)
    _validate_field(value.solar_wind_field)
    if len(value.notifications) > SWPC_NOTIFICATION_LIMIT:
        raise ValueError("SWPC notification set is too large")
    for notification in value.notifications:
        _validate_notification(notification)
    try:
        expected_notification_order = tuple(
            sorted(value.notifications, key=notification_sort_key, reverse=True)
        )
    except (TypeError, ValueError, OverflowError):
        raise ValueError("SWPC notifications are not canonically ordered") from None
    if tuple(value.notifications) != expected_notification_order:
        raise ValueError("SWPC notifications are not canonically ordered")
    for checksum in (
        value.source_evidence.scales_sha256,
        value.source_evidence.kp_sha256,
        value.source_evidence.solar_wind_speed_sha256,
        value.source_evidence.solar_wind_field_sha256,
        value.source_evidence.notifications_sha256,
    ):
        if type(checksum) is not str or _HASH_PATTERN.fullmatch(checksum) is None:
            raise ValueError("SWPC source checksum is invalid")


def _validate_scales(value: SwpcScales) -> None:
    _validate_date_text(value.date_text)
    _validate_clock_text(value.time_text)
    for state in (value.radio_blackout, value.solar_radiation, value.geomagnetic):
        if type(state) is not SwpcScaleState or type(state.level) is not int:
            raise ValueError("SWPC scale state is invalid")
        if not 0 <= state.level <= 5:
            raise ValueError("SWPC scale level is outside 0..5")
        if state.text is not None:
            _validate_text(state.text, maximum=256, allow_empty=True)


def _validate_kp_row(value: SwpcKpRow) -> None:
    _validate_kp_time(value.time_text)
    if type(value.kp) is not float or not math.isfinite(value.kp) or not 0 <= value.kp <= 9:
        raise ValueError("SWPC Kp value is invalid")
    if value.status not in _KP_STATUS_ORDER:
        raise ValueError("SWPC Kp status is invalid")
    if value.noaa_scale is not None and value.noaa_scale not in {"G1", "G2", "G3", "G4", "G5"}:
        raise ValueError("SWPC Kp NOAA scale is invalid")


def _validate_speed(value: SwpcSolarWindSpeed) -> None:
    _validate_optional_utc_time(value.time_utc)
    if value.proton_speed_km_s is not None and (
        type(value.proton_speed_km_s) is not float
        or not math.isfinite(value.proton_speed_km_s)
        or value.proton_speed_km_s < 0
    ):
        raise ValueError("SWPC solar-wind speed is invalid")


def _validate_field(value: SwpcSolarWindField) -> None:
    _validate_optional_utc_time(value.time_utc)
    for number in (value.bt_nt, value.bz_gsm_nt):
        if number is not None and (type(number) is not float or not math.isfinite(number)):
            raise ValueError("SWPC magnetic-field value is invalid")
    if value.bt_nt is not None and value.bt_nt < 0:
        raise ValueError("SWPC total magnetic-field magnitude is invalid")


def _validate_notification(value: SwpcNotification) -> None:
    if type(value.product_id) is not str or _PRODUCT_ID_PATTERN.fullmatch(value.product_id) is None:
        raise ValueError("SWPC notification product ID is invalid")
    _validate_issue_time(value.issue_time_text)
    _validate_text(
        value.message,
        maximum=SWPC_MESSAGE_MAX_UTF8_BYTES,
        maximum_is_bytes=True,
    )


def _validate_text(
    value: str,
    *,
    maximum: int,
    allow_empty: bool = False,
    maximum_is_bytes: bool = False,
) -> None:
    if type(value) is not str or (not allow_empty and not value):
        raise ValueError("SWPC text is invalid")
    if (len(value.encode("utf-8")) if maximum_is_bytes else len(value)) > maximum:
        raise ValueError("SWPC text is too long")
    if any(
        unicodedata.category(character) in {"Cc", "Cf", "Cs"} and character not in _ALLOWED_CONTROLS
        for character in value
    ):
        raise ValueError("SWPC text contains an unsafe control character")


def _validate_date_text(value: str) -> None:
    if _DATE_PATTERN.fullmatch(value) is None:
        raise ValueError("SWPC date text is invalid")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        raise ValueError("SWPC date text is invalid") from None


def _validate_clock_text(value: str) -> None:
    if _CLOCK_PATTERN.fullmatch(value) is None:
        raise ValueError("SWPC clock text is invalid")
    try:
        datetime.strptime(value, "%H:%M:%S")
    except (TypeError, ValueError):
        raise ValueError("SWPC clock text is invalid") from None


def _validate_kp_time(value: str) -> None:
    if _KP_TIME_PATTERN.fullmatch(value) is None:
        raise ValueError("SWPC Kp timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise ValueError("SWPC Kp timestamp is invalid") from None
    if parsed.tzinfo is not None:
        raise ValueError("SWPC Kp timestamp must retain its naive source representation")


def _validate_utc_time(value: str) -> None:
    if _UTC_TIME_PATTERN.fullmatch(value) is None:
        raise ValueError("SWPC UTC timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("SWPC UTC timestamp is invalid") from None
    if parsed.tzinfo is None:
        raise ValueError("SWPC UTC timestamp is invalid")


def _validate_optional_utc_time(value: str | None) -> None:
    if value is not None:
        _validate_utc_time(value)


def _validate_issue_time(value: str) -> None:
    if _ISSUE_TIME_PATTERN.fullmatch(value) is None:
        raise ValueError("SWPC issue timestamp is invalid")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise ValueError("SWPC issue timestamp is invalid") from None
    if parsed.tzinfo is not None:
        raise ValueError("SWPC issue timestamp must retain its naive source representation")


def _decode_scales(value: object) -> SwpcScales:
    if not isinstance(value, Mapping) or set(value) != {
        "date_text",
        "time_text",
        "radio_blackout",
        "solar_radiation",
        "geomagnetic",
    }:
        raise ValueError("SWPC stored scales are invalid")
    result = SwpcScales(
        date_text=_strict_str(value, "date_text"),
        time_text=_strict_str(value, "time_text"),
        radio_blackout=_decode_scale(value.get("radio_blackout")),
        solar_radiation=_decode_scale(value.get("solar_radiation")),
        geomagnetic=_decode_scale(value.get("geomagnetic")),
    )
    _validate_scales(result)
    return result


def _decode_scale(value: object) -> SwpcScaleState:
    if not isinstance(value, Mapping) or set(value) != {"level", "text"}:
        raise ValueError("SWPC stored scale is invalid")
    level = value.get("level")
    text = value.get("text")
    if type(level) is not int or (text is not None and type(text) is not str):
        raise ValueError("SWPC stored scale is invalid")
    return SwpcScaleState(level=level, text=text)


def _decode_kp_rows(value: object) -> tuple[SwpcKpRow, ...]:
    if not isinstance(value, list) or len(value) > SWPC_KP_ROW_LIMIT:
        raise ValueError("SWPC stored Kp rows are invalid")
    rows: list[SwpcKpRow] = []
    for item in value:
        if not isinstance(item, Mapping) or set(item) != {
            "time_text",
            "kp",
            "status",
            "noaa_scale",
        }:
            raise ValueError("SWPC stored Kp row is invalid")
        kp = item.get("kp")
        status = item.get("status")
        noaa_scale = item.get("noaa_scale")
        if (
            type(kp) is not float
            or type(status) is not str
            or status not in _KP_STATUS_ORDER
            or (noaa_scale is not None and type(noaa_scale) is not str)
        ):
            raise ValueError("SWPC stored Kp row is invalid")
        rows.append(
            SwpcKpRow(
                time_text=_strict_str(item, "time_text"),
                kp=kp,
                status=cast(KpStatus, status),
                noaa_scale=noaa_scale,
            )
        )
    return tuple(rows)


def _decode_solar_wind(value: object) -> tuple[SwpcSolarWindSpeed, SwpcSolarWindField]:
    if not isinstance(value, Mapping) or set(value) != {"speed", "magnetic_field"}:
        raise ValueError("SWPC stored solar wind is invalid")
    speed_value = value.get("speed")
    field_value = value.get("magnetic_field")
    if not isinstance(speed_value, Mapping) or set(speed_value) != {
        "time_utc",
        "proton_speed_km_s",
    }:
        raise ValueError("SWPC stored solar-wind speed is invalid")
    if not isinstance(field_value, Mapping) or set(field_value) != {
        "time_utc",
        "bt_nt",
        "bz_gsm_nt",
    }:
        raise ValueError("SWPC stored solar-wind field is invalid")
    speed = SwpcSolarWindSpeed(
        time_utc=_optional_str(speed_value.get("time_utc")),
        proton_speed_km_s=_optional_float(speed_value.get("proton_speed_km_s")),
    )
    field = SwpcSolarWindField(
        time_utc=_optional_str(field_value.get("time_utc")),
        bt_nt=_optional_float(field_value.get("bt_nt")),
        bz_gsm_nt=_optional_float(field_value.get("bz_gsm_nt")),
    )
    _validate_speed(speed)
    _validate_field(field)
    return speed, field


def _decode_notifications(value: object) -> tuple[SwpcNotification, ...]:
    if not isinstance(value, list) or len(value) > SWPC_NOTIFICATION_LIMIT:
        raise ValueError("SWPC stored notifications are invalid")
    result: list[SwpcNotification] = []
    for item in value:
        if not isinstance(item, Mapping) or set(item) != {
            "product_id",
            "issue_time_text",
            "message",
        }:
            raise ValueError("SWPC stored notification is invalid")
        result.append(
            SwpcNotification(
                product_id=_strict_str(item, "product_id"),
                issue_time_text=_strict_str(item, "issue_time_text"),
                message=_strict_str(item, "message"),
            )
        )
    for notification in result:
        _validate_notification(notification)
    return tuple(result)


def _decode_evidence(value: object) -> SwpcSourceEvidence:
    fields = {
        "scales_sha256",
        "kp_sha256",
        "solar_wind_speed_sha256",
        "solar_wind_field_sha256",
        "notifications_sha256",
    }
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError("SWPC source evidence is invalid")
    evidence = SwpcSourceEvidence(
        scales_sha256=_strict_str(value, "scales_sha256"),
        kp_sha256=_strict_str(value, "kp_sha256"),
        solar_wind_speed_sha256=_strict_str(value, "solar_wind_speed_sha256"),
        solar_wind_field_sha256=_strict_str(value, "solar_wind_field_sha256"),
        notifications_sha256=_strict_str(value, "notifications_sha256"),
    )
    return evidence


def _strict_str(value: Mapping[str, object], key: str) -> str:
    result = value.get(key)
    if type(result) is not str:
        raise ValueError("SWPC stored text is invalid")
    return result


def _optional_str(value: object) -> str | None:
    if value is not None and type(value) is not str:
        raise ValueError("SWPC stored optional text is invalid")
    return value


def _optional_float(value: object) -> float | None:
    if value is not None and type(value) is not float:
        raise ValueError("SWPC stored optional number is invalid")
    return value


def kp_sort_key(row: SwpcKpRow) -> tuple[datetime, int, float, str | None]:
    """Return deterministic chronology without changing the source time text."""
    parsed = datetime.fromisoformat(row.time_text)
    return parsed, _KP_STATUS_ORDER[row.status], row.kp, row.noaa_scale


def notification_sort_key(
    notification: SwpcNotification,
) -> tuple[datetime, str, str]:
    """Return newest-first deterministic notification ordering."""
    parsed = datetime.fromisoformat(notification.issue_time_text)
    return parsed, notification.product_id, notification.message


__all__ = [
    "KpStatus",
    "SWPC_COMPONENT_IDS",
    "SWPC_AURORA_OFFICIAL_URL",
    "SWPC_KP_PUBLIC_FORECAST_LIMIT",
    "SWPC_KP_ROW_LIMIT",
    "SWPC_MESSAGE_MAX_UTF8_BYTES",
    "SWPC_NORMALIZED_FIELDS",
    "SWPC_NOTIFICATION_LIMIT",
    "SWPC_PUBLIC_NOTIFICATION_LIMIT",
    "SwpcCodec",
    "SwpcKpRow",
    "SwpcNormalized",
    "SwpcNotification",
    "SwpcScaleState",
    "SwpcScales",
    "SwpcSolarWindField",
    "SwpcSolarWindSpeed",
    "SwpcSourceEvidence",
    "kp_sort_key",
    "notification_sort_key",
]
