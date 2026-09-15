"""Normalized Launch Library 2 contracts for the Phase 4C launch vertical."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Final
from urllib.parse import urlsplit
from uuid import UUID

from .runtime import NormalizedPayload, ProviderPayloadCodec, validate_normalized_payload

LL2_MAX_LAUNCHES: Final = 20
LL2_PUBLIC_LAUNCH_LIMIT: Final = 12
LL2_ACTIVE_MISSION_LIMIT: Final = 6
LL2_NORMALIZED_FIELDS: Final = (
    "launches",
    "snapshot_latest_updated_utc",
)
LL2_COUNTDOWN_PRECISION_IDS: Final = frozenset({0, 1})
LL2_CALENDAR_PRECISION_IDS: Final = frozenset({0, 1, 2})
LL2_TERMINAL_STATUS_ABBREVIATIONS: Final = frozenset(
    {"Success", "Failure", "Partial Failure", "Deployed"}
)

_STATUS_CONTRACT: Final = {
    1: ("Go for Launch", "Go"),
    2: ("To Be Determined", "TBD"),
    3: ("Launch Successful", "Success"),
    4: ("Launch Failure", "Failure"),
    5: ("On Hold", "Hold"),
    6: ("Launch in Flight", "In Flight"),
    7: ("Launch was a Partial Failure", "Partial Failure"),
    8: ("To Be Confirmed", "TBC"),
    9: ("Payload Deployed", "Deployed"),
}
_PRECISION_CONTRACT: Final = {
    0: ("Second", "SEC"),
    1: ("Minute", "MIN"),
    2: ("Hour", "HR"),
    3: ("Morning", "AM"),
    4: ("Afternoon", "PM"),
    5: ("Day", "DAY"),
    6: ("Week", "WK"),
    7: ("Month", "M"),
    8: ("Quarter 1", "Q1"),
    9: ("Quarter 2", "Q2"),
    10: ("Quarter 3", "Q3"),
    11: ("Quarter 4", "Q4"),
    12: ("Year Half 1", "H1"),
    13: ("Year Half 2", "H2"),
    14: ("Year", "Y"),
    15: ("Fiscal Year", "FY"),
    16: ("Decade", "DEC"),
}
_SLUG_PATTERN: Final = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*", re.ASCII)
_COUNTRY_PATTERN: Final = re.compile(r"[A-Z]{2}", re.ASCII)
_ALLOWED_DESCRIPTION_CONTROLS: Final = frozenset({"\t", "\n", "\r"})


@dataclass(frozen=True, slots=True)
class Ll2Status:
    id: int
    name: str
    abbreviation: str


@dataclass(frozen=True, slots=True)
class Ll2Precision:
    id: int
    name: str
    abbreviation: str


@dataclass(frozen=True, slots=True)
class Ll2Agency:
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class Ll2Vehicle:
    configuration_id: int
    name: str
    full_name: str
    variant: str | None


@dataclass(frozen=True, slots=True)
class Ll2Mission:
    id: int
    name: str
    mission_type: str | None
    description: str | None
    orbit_name: str | None
    orbit_abbreviation: str | None
    destination_body: str | None
    agency_names: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Ll2Site:
    pad_id: int
    pad_name: str
    location_name: str | None
    country_name: str | None
    country_code: str | None


@dataclass(frozen=True, slots=True)
class Ll2Launch:
    launch_id: str
    slug: str
    name: str
    status: Ll2Status
    net_utc: str
    precision: Ll2Precision
    window_start_utc: str | None
    window_end_utc: str | None
    last_updated_utc: str
    agency: Ll2Agency | None
    vehicle: Ll2Vehicle | None
    mission: Ll2Mission | None
    site: Ll2Site | None
    official_page_url: str | None
    official_webcast_url: str | None
    webcast_live: bool


@dataclass(frozen=True, slots=True)
class Ll2Normalized:
    snapshot_latest_updated_utc: str | None
    launches: tuple[Ll2Launch, ...]


class Ll2Codec(ProviderPayloadCodec):
    """Strictly encode and decode the bounded LL2 cache representation."""

    def encode(self, normalized: object) -> NormalizedPayload:
        if type(normalized) is not Ll2Normalized:
            raise ValueError("LL2 normalized payload is invalid")
        _validate_normalized(normalized)
        value: dict[str, object] = {
            "snapshot_latest_updated_utc": normalized.snapshot_latest_updated_utc,
            "launches": [_encode_launch(launch) for launch in normalized.launches],
        }
        return validate_normalized_payload(value)

    def decode(self, stored: object) -> Ll2Normalized:
        if not isinstance(stored, Mapping) or set(stored) != {
            "snapshot_latest_updated_utc",
            "launches",
        }:
            raise ValueError("LL2 stored payload is invalid")
        latest = _optional_str(stored.get("snapshot_latest_updated_utc"))
        launches_value = stored.get("launches")
        if not isinstance(launches_value, list) or len(launches_value) > LL2_MAX_LAUNCHES:
            raise ValueError("LL2 stored launch set is invalid")
        normalized = Ll2Normalized(
            snapshot_latest_updated_utc=latest,
            launches=tuple(_decode_launch(item) for item in launches_value),
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


def launch_countdown_eligible(value: Ll2Launch) -> bool:
    """Return whether a labelled exact countdown is honest for this launch."""
    return value.status.abbreviation == "Go" and value.precision.id in LL2_COUNTDOWN_PRECISION_IDS


def launch_calendar_eligible(value: Ll2Launch) -> bool:
    """Return whether the provider time is precise enough for an iCalendar event."""
    return value.precision.id in LL2_CALENDAR_PRECISION_IDS


def launch_is_terminal(value: Ll2Launch) -> bool:
    return value.status.abbreviation in LL2_TERMINAL_STATUS_ABBREVIATIONS


def _encode_launch(value: Ll2Launch) -> dict[str, object]:
    return {
        "launch_id": value.launch_id,
        "slug": value.slug,
        "name": value.name,
        "status": {
            "id": value.status.id,
            "name": value.status.name,
            "abbreviation": value.status.abbreviation,
        },
        "net_utc": value.net_utc,
        "precision": {
            "id": value.precision.id,
            "name": value.precision.name,
            "abbreviation": value.precision.abbreviation,
        },
        "window_start_utc": value.window_start_utc,
        "window_end_utc": value.window_end_utc,
        "last_updated_utc": value.last_updated_utc,
        "agency": None
        if value.agency is None
        else {"id": value.agency.id, "name": value.agency.name},
        "vehicle": None
        if value.vehicle is None
        else {
            "configuration_id": value.vehicle.configuration_id,
            "name": value.vehicle.name,
            "full_name": value.vehicle.full_name,
            "variant": value.vehicle.variant,
        },
        "mission": None
        if value.mission is None
        else {
            "id": value.mission.id,
            "name": value.mission.name,
            "mission_type": value.mission.mission_type,
            "description": value.mission.description,
            "orbit_name": value.mission.orbit_name,
            "orbit_abbreviation": value.mission.orbit_abbreviation,
            "destination_body": value.mission.destination_body,
            "agency_names": list(value.mission.agency_names),
        },
        "site": None
        if value.site is None
        else {
            "pad_id": value.site.pad_id,
            "pad_name": value.site.pad_name,
            "location_name": value.site.location_name,
            "country_name": value.site.country_name,
            "country_code": value.site.country_code,
        },
        "official_page_url": value.official_page_url,
        "official_webcast_url": value.official_webcast_url,
        "webcast_live": value.webcast_live,
    }


def _decode_launch(value: object) -> Ll2Launch:
    fields = {
        "launch_id",
        "slug",
        "name",
        "status",
        "net_utc",
        "precision",
        "window_start_utc",
        "window_end_utc",
        "last_updated_utc",
        "agency",
        "vehicle",
        "mission",
        "site",
        "official_page_url",
        "official_webcast_url",
        "webcast_live",
    }
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError("LL2 stored launch is invalid")
    status = _decode_status(value.get("status"))
    precision = _decode_precision(value.get("precision"))
    webcast_live = value.get("webcast_live")
    if type(webcast_live) is not bool:
        raise ValueError("LL2 stored launch is invalid")
    return Ll2Launch(
        launch_id=_required_str(value, "launch_id"),
        slug=_required_str(value, "slug"),
        name=_required_str(value, "name"),
        status=status,
        net_utc=_required_str(value, "net_utc"),
        precision=precision,
        window_start_utc=_optional_str(value.get("window_start_utc")),
        window_end_utc=_optional_str(value.get("window_end_utc")),
        last_updated_utc=_required_str(value, "last_updated_utc"),
        agency=_decode_optional_agency(value.get("agency")),
        vehicle=_decode_optional_vehicle(value.get("vehicle")),
        mission=_decode_optional_mission(value.get("mission")),
        site=_decode_optional_site(value.get("site")),
        official_page_url=_optional_str(value.get("official_page_url")),
        official_webcast_url=_optional_str(value.get("official_webcast_url")),
        webcast_live=webcast_live,
    )


def _decode_status(value: object) -> Ll2Status:
    if not isinstance(value, Mapping) or set(value) != {"id", "name", "abbreviation"}:
        raise ValueError("LL2 stored status is invalid")
    return Ll2Status(
        _required_int(value, "id"),
        _required_str(value, "name"),
        _required_str(value, "abbreviation"),
    )


def _decode_precision(value: object) -> Ll2Precision:
    if not isinstance(value, Mapping) or set(value) != {"id", "name", "abbreviation"}:
        raise ValueError("LL2 stored precision is invalid")
    return Ll2Precision(
        _required_int(value, "id"),
        _required_str(value, "name"),
        _required_str(value, "abbreviation"),
    )


def _decode_optional_agency(value: object) -> Ll2Agency | None:
    if value is None:
        return None
    if not isinstance(value, Mapping) or set(value) != {"id", "name"}:
        raise ValueError("LL2 stored agency is invalid")
    return Ll2Agency(_required_int(value, "id"), _required_str(value, "name"))


def _decode_optional_vehicle(value: object) -> Ll2Vehicle | None:
    if value is None:
        return None
    fields = {"configuration_id", "name", "full_name", "variant"}
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError("LL2 stored vehicle is invalid")
    return Ll2Vehicle(
        _required_int(value, "configuration_id"),
        _required_str(value, "name"),
        _required_str(value, "full_name"),
        _optional_str(value.get("variant")),
    )


def _decode_optional_mission(value: object) -> Ll2Mission | None:
    if value is None:
        return None
    fields = {
        "id",
        "name",
        "mission_type",
        "description",
        "orbit_name",
        "orbit_abbreviation",
        "destination_body",
        "agency_names",
    }
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError("LL2 stored mission is invalid")
    agency_names = value.get("agency_names")
    if not isinstance(agency_names, list) or any(type(item) is not str for item in agency_names):
        raise ValueError("LL2 stored mission is invalid")
    return Ll2Mission(
        _required_int(value, "id"),
        _required_str(value, "name"),
        _optional_str(value.get("mission_type")),
        _optional_str(value.get("description")),
        _optional_str(value.get("orbit_name")),
        _optional_str(value.get("orbit_abbreviation")),
        _optional_str(value.get("destination_body")),
        tuple(agency_names),
    )


def _decode_optional_site(value: object) -> Ll2Site | None:
    if value is None:
        return None
    fields = {"pad_id", "pad_name", "location_name", "country_name", "country_code"}
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError("LL2 stored site is invalid")
    return Ll2Site(
        _required_int(value, "pad_id"),
        _required_str(value, "pad_name"),
        _optional_str(value.get("location_name")),
        _optional_str(value.get("country_name")),
        _optional_str(value.get("country_code")),
    )


def _validate_normalized(value: Ll2Normalized) -> None:
    if len(value.launches) > LL2_MAX_LAUNCHES:
        raise ValueError("LL2 normalized launch count exceeds the bound")
    if value.snapshot_latest_updated_utc is not None:
        _parse_utc(value.snapshot_latest_updated_utc)
    seen_ids: set[str] = set()
    seen_slugs: set[str] = set()
    for launch in value.launches:
        _validate_launch(launch)
        if launch.launch_id in seen_ids or launch.slug in seen_slugs:
            raise ValueError("LL2 normalized launch identity is duplicated")
        seen_ids.add(launch.launch_id)
        seen_slugs.add(launch.slug)
    expected = tuple(
        sorted(value.launches, key=lambda item: (_parse_utc(item.net_utc), item.launch_id))
    )
    if tuple(value.launches) != expected:
        raise ValueError("LL2 launches are not canonically ordered")
    expected_latest = (
        None
        if not value.launches
        else max(
            value.launches, key=lambda item: _parse_utc(item.last_updated_utc)
        ).last_updated_utc
    )
    if value.snapshot_latest_updated_utc != expected_latest:
        raise ValueError("LL2 snapshot latest-update timestamp is inconsistent")


def _validate_launch(value: Ll2Launch) -> None:
    try:
        parsed_uuid = UUID(value.launch_id)
    except (TypeError, ValueError, AttributeError):
        raise ValueError("LL2 launch identity is invalid") from None
    if str(parsed_uuid) != value.launch_id:
        raise ValueError("LL2 launch identity is invalid")
    if (
        type(value.slug) is not str
        or len(value.slug) > 256
        or _SLUG_PATTERN.fullmatch(value.slug) is None
    ):
        raise ValueError("LL2 launch slug is invalid")
    _validate_text(value.name, maximum=512)
    _validate_status(value.status)
    _parse_utc(value.net_utc)
    _validate_precision(value.precision)
    start = None if value.window_start_utc is None else _parse_utc(value.window_start_utc)
    end = None if value.window_end_utc is None else _parse_utc(value.window_end_utc)
    if start is not None and end is not None and end < start:
        raise ValueError("LL2 launch window is inverted")
    _parse_utc(value.last_updated_utc)
    if value.agency is not None:
        _validate_positive_id(value.agency.id)
        _validate_text(value.agency.name, maximum=256)
    if value.vehicle is not None:
        _validate_positive_id(value.vehicle.configuration_id)
        _validate_text(value.vehicle.name, maximum=256)
        _validate_text(value.vehicle.full_name, maximum=256)
        if value.vehicle.variant is not None:
            _validate_text(value.vehicle.variant, maximum=128, allow_empty=False)
    if value.mission is not None:
        _validate_positive_id(value.mission.id)
        _validate_text(value.mission.name, maximum=512)
        for item, maximum in (
            (value.mission.mission_type, 256),
            (value.mission.orbit_name, 256),
            (value.mission.orbit_abbreviation, 64),
            (value.mission.destination_body, 128),
        ):
            if item is not None:
                _validate_text(item, maximum=maximum)
        if value.mission.description is not None:
            _validate_text(value.mission.description, maximum=4096)
        if len(value.mission.agency_names) > 32:
            raise ValueError("LL2 mission agency set is too large")
        if len(value.mission.agency_names) != len(set(value.mission.agency_names)):
            raise ValueError("LL2 mission agency set contains duplicates")
        for name in value.mission.agency_names:
            _validate_text(name, maximum=256)
    if value.site is not None:
        _validate_positive_id(value.site.pad_id)
        _validate_text(value.site.pad_name, maximum=256)
        for item, maximum in ((value.site.location_name, 256), (value.site.country_name, 128)):
            if item is not None:
                _validate_text(item, maximum=maximum)
        if (
            value.site.country_code is not None
            and _COUNTRY_PATTERN.fullmatch(value.site.country_code) is None
        ):
            raise ValueError("LL2 site country code is invalid")
    for url in (value.official_page_url, value.official_webcast_url):
        if url is not None:
            _validate_https_url(url)
    if type(value.webcast_live) is not bool:
        raise ValueError("LL2 webcast state is invalid")


def _validate_status(value: Ll2Status) -> None:
    expected = _STATUS_CONTRACT.get(value.id)
    if expected is None or expected != (value.name, value.abbreviation):
        raise ValueError("LL2 launch status is outside the reviewed contract")


def _validate_precision(value: Ll2Precision) -> None:
    expected = _PRECISION_CONTRACT.get(value.id)
    if expected is None or expected != (value.name, value.abbreviation):
        raise ValueError("LL2 NET precision is outside the reviewed contract")


def _validate_positive_id(value: int) -> None:
    if type(value) is not int or value <= 0:
        raise ValueError("LL2 numeric identity is invalid")


def _validate_text(value: str, *, maximum: int, allow_empty: bool = False) -> None:
    if (
        type(value) is not str
        or len(value) > maximum
        or (not allow_empty and not value)
        or value != value.strip()
    ):
        raise ValueError("LL2 text is invalid")
    if any(unicodedata.category(char) in {"Cc", "Cf", "Cs"} for char in value):
        raise ValueError("LL2 text contains a disallowed control character")


def _parse_utc(value: str) -> datetime:
    if type(value) is not str or not value.endswith("Z") or len(value) > 40:
        raise ValueError("LL2 UTC timestamp is invalid")
    try:
        result = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("LL2 UTC timestamp is invalid") from None
    if result.utcoffset() != UTC.utcoffset(result):
        raise ValueError("LL2 UTC timestamp is invalid")
    return result


def _validate_https_url(value: str) -> None:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or len(value) > 2048
        or "\\" in value
        or any(char.isspace() for char in value)
    ):
        raise ValueError("LL2 public URL is invalid")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise ValueError("LL2 public URL is invalid") from None
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
        or parsed.fragment
    ):
        raise ValueError("LL2 public URL is invalid")


def _required_str(value: Mapping[str, object], key: str) -> str:
    result = value.get(key)
    if type(result) is not str:
        raise ValueError("LL2 stored text is invalid")
    return result


def _optional_str(value: object) -> str | None:
    if value is not None and type(value) is not str:
        raise ValueError("LL2 stored optional text is invalid")
    return value


def _required_int(value: Mapping[str, object], key: str) -> int:
    result = value.get(key)
    if type(result) is not int:
        raise ValueError("LL2 stored integer is invalid")
    return result


__all__ = [
    "LL2_ACTIVE_MISSION_LIMIT",
    "LL2_CALENDAR_PRECISION_IDS",
    "LL2_COUNTDOWN_PRECISION_IDS",
    "LL2_MAX_LAUNCHES",
    "LL2_NORMALIZED_FIELDS",
    "LL2_PUBLIC_LAUNCH_LIMIT",
    "Ll2Agency",
    "Ll2Codec",
    "Ll2Launch",
    "Ll2Mission",
    "Ll2Normalized",
    "Ll2Precision",
    "Ll2Site",
    "Ll2Status",
    "Ll2Vehicle",
    "launch_calendar_eligible",
    "launch_countdown_eligible",
    "launch_is_terminal",
]
