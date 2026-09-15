"""Normalized CelesTrak OMM contracts for the Phase 4D satellite vertical."""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Final, Literal, cast

from .runtime import NormalizedPayload, ProviderPayloadCodec, validate_normalized_payload

CelestrakGroup = Literal["STATIONS", "VISUAL"]
CELESTRAK_GROUPS: Final[tuple[CelestrakGroup, ...]] = ("STATIONS", "VISUAL")
CELESTRAK_MAX_GROUP_RECORDS: Final = 256
CELESTRAK_MAX_SATELLITES: Final = 384
CELESTRAK_NORMALIZED_FIELDS: Final = ("satellites", "snapshot_latest_epoch_utc")
CELESTRAK_ELEMENT_WARNING_HOURS: Final = 24.0
CELESTRAK_ELEMENT_REFUSAL_HOURS: Final = 72.0

_OBJECT_ID_PATTERN: Final = re.compile(r"[0-9A-Z-]{1,32}", re.ASCII)
_ALLOWED_GROUPS: Final = frozenset(CELESTRAK_GROUPS)


@dataclass(frozen=True, slots=True)
class CelestrakSatellite:
    """One validated current-GP OMM element set with selected-group membership."""

    catalog_number: int
    object_name: str
    object_id: str | None
    epoch_utc: str
    mean_motion_rev_per_day: float
    eccentricity: float
    inclination_deg: float
    ra_of_asc_node_deg: float
    arg_of_pericenter_deg: float
    mean_anomaly_deg: float
    ephemeris_type: int
    classification_type: str
    element_set_number: int
    revolution_at_epoch: int
    bstar: float
    mean_motion_dot: float
    mean_motion_ddot: float
    groups: tuple[CelestrakGroup, ...]

    def __post_init__(self) -> None:
        _validate_satellite(self)

    def to_omm_fields(self) -> dict[str, str | int | float]:
        """Return the exact OMM-keyword mapping accepted by python-sgp4/Skyfield."""
        return {
            "OBJECT_NAME": self.object_name,
            "OBJECT_ID": self.object_id or "",
            "EPOCH": self.epoch_utc.removesuffix("Z"),
            "MEAN_MOTION": self.mean_motion_rev_per_day,
            "ECCENTRICITY": self.eccentricity,
            "INCLINATION": self.inclination_deg,
            "RA_OF_ASC_NODE": self.ra_of_asc_node_deg,
            "ARG_OF_PERICENTER": self.arg_of_pericenter_deg,
            "MEAN_ANOMALY": self.mean_anomaly_deg,
            "EPHEMERIS_TYPE": self.ephemeris_type,
            "CLASSIFICATION_TYPE": self.classification_type,
            "NORAD_CAT_ID": self.catalog_number,
            "ELEMENT_SET_NO": self.element_set_number,
            "REV_AT_EPOCH": self.revolution_at_epoch,
            "BSTAR": self.bstar,
            "MEAN_MOTION_DOT": self.mean_motion_dot,
            "MEAN_MOTION_DDOT": self.mean_motion_ddot,
        }


@dataclass(frozen=True, slots=True)
class CelestrakNormalized:
    """One atomic selected-group snapshot ordered by NORAD catalog number."""

    snapshot_latest_epoch_utc: str
    satellites: tuple[CelestrakSatellite, ...]

    def __post_init__(self) -> None:
        _validate_normalized(self)


class CelestrakCodec(ProviderPayloadCodec):
    """Strict canonical codec guarding cached selected-group OMM data."""

    def encode(self, normalized: object) -> NormalizedPayload:
        if type(normalized) is not CelestrakNormalized:
            raise ValueError("CelesTrak normalized payload is invalid")
        _validate_normalized(normalized)
        return validate_normalized_payload(
            {
                "snapshot_latest_epoch_utc": normalized.snapshot_latest_epoch_utc,
                "satellites": [_encode_satellite(item) for item in normalized.satellites],
            }
        )

    def decode(self, stored: object) -> CelestrakNormalized:
        if not isinstance(stored, Mapping) or set(stored) != {
            "snapshot_latest_epoch_utc",
            "satellites",
        }:
            raise ValueError("CelesTrak stored payload is invalid")
        latest = stored.get("snapshot_latest_epoch_utc")
        items = stored.get("satellites")
        if type(latest) is not str or not isinstance(items, list) or not items:
            raise ValueError("CelesTrak stored payload is invalid")
        if len(items) > CELESTRAK_MAX_SATELLITES:
            raise ValueError("CelesTrak stored payload is too large")
        return CelestrakNormalized(
            snapshot_latest_epoch_utc=latest,
            satellites=tuple(_decode_satellite(item) for item in items),
        )

    def accepts_replacement(
        self,
        current: NormalizedPayload | None,
        candidate: NormalizedPayload,
    ) -> bool:
        """Reject whole-snapshot and per-satellite element-epoch regression."""
        next_value = self.decode(candidate)
        if current is None:
            return True
        previous = self.decode(current)
        if parse_element_epoch(next_value.snapshot_latest_epoch_utc) < parse_element_epoch(
            previous.snapshot_latest_epoch_utc
        ):
            return False
        previous_by_catalog = {item.catalog_number: item for item in previous.satellites}
        for item in next_value.satellites:
            old = previous_by_catalog.get(item.catalog_number)
            if old is not None and parse_element_epoch(item.epoch_utc) < parse_element_epoch(
                old.epoch_utc
            ):
                return False
        return True


def merge_group_satellites(
    groups: tuple[tuple[CelestrakSatellite, ...], ...],
) -> CelestrakNormalized:
    """Merge exact duplicate identities and fail closed on conflicting orbital state."""
    merged: dict[int, CelestrakSatellite] = {}
    for items in groups:
        for item in items:
            current = merged.get(item.catalog_number)
            if current is None:
                merged[item.catalog_number] = item
                continue
            if _state_without_groups(current) != _state_without_groups(item):
                raise ValueError("CelesTrak duplicate catalog element states conflict")
            memberships = tuple(
                group for group in CELESTRAK_GROUPS if group in {*current.groups, *item.groups}
            )
            merged[item.catalog_number] = replace(current, groups=memberships)
    satellites = tuple(sorted(merged.values(), key=lambda item: item.catalog_number))
    if not satellites or len(satellites) > CELESTRAK_MAX_SATELLITES:
        raise ValueError("CelesTrak merged satellite set is invalid")
    latest = max(satellites, key=lambda item: parse_element_epoch(item.epoch_utc)).epoch_utc
    return CelestrakNormalized(snapshot_latest_epoch_utc=latest, satellites=satellites)


def element_age_hours(value: CelestrakSatellite, at: datetime) -> float:
    """Return signed age of one element set at an explicit UTC instant."""
    if at.tzinfo is None or at.utcoffset() != UTC.utcoffset(at):
        raise ValueError("Satellite age time must use UTC")
    return (at.astimezone(UTC) - parse_element_epoch(value.epoch_utc)).total_seconds() / 3600.0


def parse_element_epoch(value: str) -> datetime:
    """Parse the canonical normalized UTC element epoch."""
    if type(value) is not str or not value.endswith("Z") or len(value) > 40:
        raise ValueError("CelesTrak epoch is invalid")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("CelesTrak epoch is invalid") from None
    if parsed.utcoffset() != UTC.utcoffset(parsed):
        raise ValueError("CelesTrak epoch is invalid")
    canonical = parsed.astimezone(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
    if canonical != value:
        raise ValueError("CelesTrak epoch is not canonical")
    return parsed


def _state_without_groups(value: CelestrakSatellite) -> tuple[object, ...]:
    return (
        value.catalog_number,
        value.object_name,
        value.object_id,
        value.epoch_utc,
        value.mean_motion_rev_per_day,
        value.eccentricity,
        value.inclination_deg,
        value.ra_of_asc_node_deg,
        value.arg_of_pericenter_deg,
        value.mean_anomaly_deg,
        value.ephemeris_type,
        value.classification_type,
        value.element_set_number,
        value.revolution_at_epoch,
        value.bstar,
        value.mean_motion_dot,
        value.mean_motion_ddot,
    )


def _encode_satellite(value: CelestrakSatellite) -> dict[str, object]:
    return {
        "catalog_number": value.catalog_number,
        "object_name": value.object_name,
        "object_id": value.object_id,
        "epoch_utc": value.epoch_utc,
        "mean_motion_rev_per_day": value.mean_motion_rev_per_day,
        "eccentricity": value.eccentricity,
        "inclination_deg": value.inclination_deg,
        "ra_of_asc_node_deg": value.ra_of_asc_node_deg,
        "arg_of_pericenter_deg": value.arg_of_pericenter_deg,
        "mean_anomaly_deg": value.mean_anomaly_deg,
        "ephemeris_type": value.ephemeris_type,
        "classification_type": value.classification_type,
        "element_set_number": value.element_set_number,
        "revolution_at_epoch": value.revolution_at_epoch,
        "bstar": value.bstar,
        "mean_motion_dot": value.mean_motion_dot,
        "mean_motion_ddot": value.mean_motion_ddot,
        "groups": list(value.groups),
    }


def _decode_satellite(value: object) -> CelestrakSatellite:
    expected = {
        "catalog_number",
        "object_name",
        "object_id",
        "epoch_utc",
        "mean_motion_rev_per_day",
        "eccentricity",
        "inclination_deg",
        "ra_of_asc_node_deg",
        "arg_of_pericenter_deg",
        "mean_anomaly_deg",
        "ephemeris_type",
        "classification_type",
        "element_set_number",
        "revolution_at_epoch",
        "bstar",
        "mean_motion_dot",
        "mean_motion_ddot",
        "groups",
    }
    if not isinstance(value, Mapping) or set(value) != expected:
        raise ValueError("CelesTrak stored satellite is invalid")
    groups = value.get("groups")
    if not isinstance(groups, list) or any(type(group) is not str for group in groups):
        raise ValueError("CelesTrak stored group membership is invalid")
    typed_groups = cast(tuple[CelestrakGroup, ...], tuple(groups))
    return CelestrakSatellite(
        catalog_number=_required_int(value, "catalog_number"),
        object_name=_required_str(value, "object_name"),
        object_id=_optional_str(value.get("object_id")),
        epoch_utc=_required_str(value, "epoch_utc"),
        mean_motion_rev_per_day=_required_number(value, "mean_motion_rev_per_day"),
        eccentricity=_required_number(value, "eccentricity"),
        inclination_deg=_required_number(value, "inclination_deg"),
        ra_of_asc_node_deg=_required_number(value, "ra_of_asc_node_deg"),
        arg_of_pericenter_deg=_required_number(value, "arg_of_pericenter_deg"),
        mean_anomaly_deg=_required_number(value, "mean_anomaly_deg"),
        ephemeris_type=_required_int(value, "ephemeris_type"),
        classification_type=_required_str(value, "classification_type"),
        element_set_number=_required_int(value, "element_set_number"),
        revolution_at_epoch=_required_int(value, "revolution_at_epoch"),
        bstar=_required_number(value, "bstar"),
        mean_motion_dot=_required_number(value, "mean_motion_dot"),
        mean_motion_ddot=_required_number(value, "mean_motion_ddot"),
        groups=typed_groups,
    )


def _validate_normalized(value: CelestrakNormalized) -> None:
    if not value.satellites or len(value.satellites) > CELESTRAK_MAX_SATELLITES:
        raise ValueError("CelesTrak normalized satellite count is invalid")
    parse_element_epoch(value.snapshot_latest_epoch_utc)
    seen: set[int] = set()
    for item in value.satellites:
        if item.catalog_number in seen:
            raise ValueError("CelesTrak normalized catalog identity is duplicated")
        seen.add(item.catalog_number)
    if tuple(sorted(value.satellites, key=lambda item: item.catalog_number)) != value.satellites:
        raise ValueError("CelesTrak normalized satellites are not canonically ordered")
    latest = max(value.satellites, key=lambda item: parse_element_epoch(item.epoch_utc)).epoch_utc
    if latest != value.snapshot_latest_epoch_utc:
        raise ValueError("CelesTrak latest element epoch is inconsistent")


def _validate_satellite(value: CelestrakSatellite) -> None:
    if type(value.catalog_number) is not int or not 1 <= value.catalog_number <= 999_999_999:
        raise ValueError("CelesTrak catalog number is invalid")
    _plain_text(value.object_name, 128)
    if value.object_id is not None and _OBJECT_ID_PATTERN.fullmatch(value.object_id) is None:
        raise ValueError("CelesTrak international designator is invalid")
    parse_element_epoch(value.epoch_utc)
    _bounded_number(value.mean_motion_rev_per_day, low=0.0, high=20.0, low_open=True)
    _bounded_number(value.eccentricity, low=0.0, high=1.0, high_open=True)
    _bounded_number(value.inclination_deg, low=0.0, high=180.0)
    for angle in (value.ra_of_asc_node_deg, value.arg_of_pericenter_deg, value.mean_anomaly_deg):
        _bounded_number(angle, low=0.0, high=360.0, high_open=True)
    if value.ephemeris_type != 0 or value.classification_type != "U":
        raise ValueError("CelesTrak public GP classification is outside the reviewed contract")
    if (
        type(value.element_set_number) is not int
        or not 0 <= value.element_set_number <= 9999
        or type(value.revolution_at_epoch) is not int
        or not 0 <= value.revolution_at_epoch <= 999_999_999
    ):
        raise ValueError("CelesTrak element counters are invalid")
    for number in (value.bstar, value.mean_motion_dot, value.mean_motion_ddot):
        _bounded_number(number, low=-20.0, high=20.0)
    if (
        not value.groups
        or len(value.groups) > len(CELESTRAK_GROUPS)
        or any(group not in _ALLOWED_GROUPS for group in value.groups)
        or tuple(group for group in CELESTRAK_GROUPS if group in value.groups) != value.groups
        or len(set(value.groups)) != len(value.groups)
    ):
        raise ValueError("CelesTrak group membership is invalid")


def _bounded_number(
    value: float,
    *,
    low: float,
    high: float,
    low_open: bool = False,
    high_open: bool = False,
) -> None:
    if type(value) not in {int, float} or not math.isfinite(float(value)):
        raise ValueError("CelesTrak orbital number is invalid")
    number = float(value)
    if (number <= low if low_open else number < low) or (
        number >= high if high_open else number > high
    ):
        raise ValueError("CelesTrak orbital number is outside the reviewed range")


def _plain_text(value: str, maximum: int) -> None:
    if type(value) is not str or not value or value != value.strip() or len(value) > maximum:
        raise ValueError("CelesTrak text is invalid")
    if any(unicodedata.category(character) in {"Cc", "Cf", "Cs"} for character in value):
        raise ValueError("CelesTrak text contains a disallowed control character")


def _required_str(value: Mapping[str, object], key: str) -> str:
    result = value.get(key)
    if type(result) is not str:
        raise ValueError("CelesTrak stored text is invalid")
    return result


def _optional_str(value: object) -> str | None:
    if value is None:
        return None
    if type(value) is not str:
        raise ValueError("CelesTrak stored optional text is invalid")
    return value


def _required_int(value: Mapping[str, object], key: str) -> int:
    result = value.get(key)
    if type(result) is not int:
        raise ValueError("CelesTrak stored integer is invalid")
    return result


def _required_number(value: Mapping[str, object], key: str) -> float:
    result = value.get(key)
    if type(result) not in {int, float}:
        raise ValueError("CelesTrak stored number is invalid")
    return float(cast(int | float, result))


__all__ = [
    "CELESTRAK_ELEMENT_REFUSAL_HOURS",
    "CELESTRAK_ELEMENT_WARNING_HOURS",
    "CELESTRAK_GROUPS",
    "CELESTRAK_MAX_GROUP_RECORDS",
    "CELESTRAK_MAX_SATELLITES",
    "CELESTRAK_NORMALIZED_FIELDS",
    "CelestrakCodec",
    "CelestrakGroup",
    "CelestrakNormalized",
    "CelestrakSatellite",
    "element_age_hours",
    "merge_group_satellites",
    "parse_element_epoch",
]
