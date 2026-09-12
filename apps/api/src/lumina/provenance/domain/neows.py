"""Provider-owned normalized contracts for the NASA Asteroids NeoWs feed."""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date
from typing import Final

from .runtime import (
    NEOWS_PROVIDER_CODE,
    NormalizedPayload,
    ProviderPayloadCodec,
    validate_normalized_payload,
)

NEOWS_NORMALIZED_FIELDS: Final = (
    "absolute_magnitude_h",
    "approach_date",
    "approach_time_text",
    "estimated_diameter_max_m",
    "estimated_diameter_min_m",
    "is_potentially_hazardous_asteroid",
    "name",
    "neo_reference_id",
    "nominal_distance_km",
    "nominal_distance_lunar",
    "provider_epoch_ms",
    "relative_velocity_km_s",
    "window_end_date",
    "window_start_date",
)
NEOWS_ENCOUNTER_FIELDS: Final = (
    "absolute_magnitude_h",
    "approach_date",
    "approach_time_text",
    "estimated_diameter_max_m",
    "estimated_diameter_min_m",
    "is_potentially_hazardous_asteroid",
    "name",
    "neo_reference_id",
    "nominal_distance_km",
    "nominal_distance_lunar",
    "provider_epoch_ms",
    "relative_velocity_km_s",
)
NEOWS_UNCERTAINTY_STATUS: Final = "not_provided_by_source"
MAX_NEOWS_ENCOUNTERS: Final = 256
NEOWS_PUBLIC_ENCOUNTER_LIMIT: Final = 32
MAX_NEOWS_NAME_LENGTH: Final = 512
MAX_NEOWS_APPROACH_TIME_LENGTH: Final = 128
MAX_NEOWS_ID_LENGTH: Final = 32

_DATE_PATTERN: Final = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", re.ASCII)
_ID_PATTERN: Final = re.compile(r"[0-9]{1,32}", re.ASCII)
_EPOCH_PATTERN: Final = re.compile(r"(?:0|[1-9][0-9]{0,31})", re.ASCII)


@dataclass(frozen=True, slots=True)
class NasaNeowsEncounter:
    """One Earth close-approach event retained in the provider cache."""

    neo_reference_id: str
    name: str
    approach_date: str
    approach_time_text: str
    provider_epoch_ms: str
    absolute_magnitude_h: float
    nominal_distance_km: float
    nominal_distance_lunar: float
    relative_velocity_km_s: float
    estimated_diameter_min_m: float
    estimated_diameter_max_m: float
    is_potentially_hazardous_asteroid: bool


@dataclass(frozen=True, slots=True)
class NasaNeowsNormalized:
    """The complete validated seven-day NeoWs feed projection."""

    window_start_date: str
    window_end_date: str
    encounters: tuple[NasaNeowsEncounter, ...]


class NasaNeowsCodec(ProviderPayloadCodec):
    """Strictly encode and decode the bounded nested NeoWs cache shape."""

    def encode(self, normalized: object) -> NormalizedPayload:
        if type(normalized) is not NasaNeowsNormalized:
            raise ValueError("NeoWs normalized payload is invalid")
        _validate_normalized(normalized)
        encoded: NormalizedPayload = {
            "window_start_date": normalized.window_start_date,
            "window_end_date": normalized.window_end_date,
            "encounters": [
                {
                    "neo_reference_id": encounter.neo_reference_id,
                    "name": encounter.name,
                    "approach_date": encounter.approach_date,
                    "approach_time_text": encounter.approach_time_text,
                    "provider_epoch_ms": encounter.provider_epoch_ms,
                    "absolute_magnitude_h": encounter.absolute_magnitude_h,
                    "nominal_distance_km": encounter.nominal_distance_km,
                    "nominal_distance_lunar": encounter.nominal_distance_lunar,
                    "relative_velocity_km_s": encounter.relative_velocity_km_s,
                    "estimated_diameter_min_m": encounter.estimated_diameter_min_m,
                    "estimated_diameter_max_m": encounter.estimated_diameter_max_m,
                    "is_potentially_hazardous_asteroid": (
                        encounter.is_potentially_hazardous_asteroid
                    ),
                }
                for encounter in normalized.encounters
            ],
        }
        return validate_normalized_payload(encoded)

    def decode(self, stored: object) -> NasaNeowsNormalized:
        if not isinstance(stored, Mapping) or set(stored) != {
            "window_start_date",
            "window_end_date",
            "encounters",
        }:
            raise ValueError("NeoWs stored payload is invalid")
        window_start = stored.get("window_start_date")
        window_end = stored.get("window_end_date")
        encounters = stored.get("encounters")
        if (
            type(window_start) is not str
            or type(window_end) is not str
            or not isinstance(encounters, list)
            or len(encounters) > MAX_NEOWS_ENCOUNTERS
        ):
            raise ValueError("NeoWs stored payload is invalid")
        decoded: list[NasaNeowsEncounter] = []
        for value in encounters:
            if not isinstance(value, Mapping) or set(value) != set(NEOWS_ENCOUNTER_FIELDS):
                raise ValueError("NeoWs stored encounter is invalid")
            decoded.append(
                NasaNeowsEncounter(
                    neo_reference_id=_as_str(value, "neo_reference_id"),
                    name=_as_str(value, "name"),
                    approach_date=_as_str(value, "approach_date"),
                    approach_time_text=_as_str(value, "approach_time_text"),
                    provider_epoch_ms=_as_str(value, "provider_epoch_ms"),
                    absolute_magnitude_h=_as_float(value, "absolute_magnitude_h"),
                    nominal_distance_km=_as_float(value, "nominal_distance_km"),
                    nominal_distance_lunar=_as_float(value, "nominal_distance_lunar"),
                    relative_velocity_km_s=_as_float(value, "relative_velocity_km_s"),
                    estimated_diameter_min_m=_as_float(value, "estimated_diameter_min_m"),
                    estimated_diameter_max_m=_as_float(value, "estimated_diameter_max_m"),
                    is_potentially_hazardous_asteroid=_as_bool(
                        value, "is_potentially_hazardous_asteroid"
                    ),
                )
            )
        normalized = NasaNeowsNormalized(
            window_start_date=window_start,
            window_end_date=window_end,
            encounters=tuple(decoded),
        )
        _validate_normalized(normalized)
        return normalized

    def accepts_replacement(
        self,
        current: NormalizedPayload | None,
        candidate: NormalizedPayload,
    ) -> bool:
        candidate_value = self.decode(candidate)
        if current is None:
            return True
        current_value = self.decode(current)
        return date.fromisoformat(candidate_value.window_start_date) >= date.fromisoformat(
            current_value.window_start_date
        )


def neows_object_id(neo_reference_id: str) -> str:
    """Build the public Lumina object identity from the validated source ID."""
    _validate_neo_reference_id(neo_reference_id)
    return f"{NEOWS_PROVIDER_CODE}-{neo_reference_id}"


def neows_encounter_id(neo_reference_id: str, approach_date: str) -> str:
    """Build the public Lumina event identity from source ID and date."""
    _validate_neo_reference_id(neo_reference_id)
    _parse_date(approach_date)
    return f"{neows_object_id(neo_reference_id)}-{approach_date}"


def _validate_normalized(value: NasaNeowsNormalized) -> None:
    start = _parse_date(value.window_start_date)
    end = _parse_date(value.window_end_date)
    if end != start.fromordinal(start.toordinal() + 6):
        raise ValueError("NeoWs normalized window must contain seven calendar dates")
    if len(value.encounters) > MAX_NEOWS_ENCOUNTERS:
        raise ValueError("NeoWs normalized encounter count exceeds the bound")

    seen: set[tuple[str, str]] = set()
    for encounter in value.encounters:
        _validate_neo_reference_id(encounter.neo_reference_id)
        _validate_text(encounter.name, maximum=MAX_NEOWS_NAME_LENGTH)
        approach_date = _parse_date(encounter.approach_date)
        if not start <= approach_date <= end:
            raise ValueError("NeoWs encounter date is outside the normalized window")
        _validate_text(encounter.approach_time_text, maximum=MAX_NEOWS_APPROACH_TIME_LENGTH)
        _validate_epoch(encounter.provider_epoch_ms)
        _validate_float(encounter.absolute_magnitude_h, positive=False)
        _validate_float(encounter.nominal_distance_km, positive=True)
        _validate_float(encounter.nominal_distance_lunar, positive=True)
        _validate_float(encounter.relative_velocity_km_s, positive=True)
        _validate_float(encounter.estimated_diameter_min_m, positive=True)
        _validate_float(encounter.estimated_diameter_max_m, positive=True)
        if encounter.estimated_diameter_min_m > encounter.estimated_diameter_max_m:
            raise ValueError("NeoWs estimated diameter range is inverted")
        if type(encounter.is_potentially_hazardous_asteroid) is not bool:
            raise ValueError("NeoWs PHA value is invalid")
        identity = (encounter.neo_reference_id, encounter.approach_date)
        if identity in seen:
            raise ValueError("NeoWs encounter identity is duplicated")
        seen.add(identity)

    expected_order = tuple(
        sorted(
            value.encounters,
            key=lambda encounter: (
                int(encounter.provider_epoch_ms),
                encounter.nominal_distance_km,
                encounter.neo_reference_id,
            ),
        )
    )
    if tuple(value.encounters) != expected_order:
        raise ValueError("NeoWs encounters are not in canonical order")


def _validate_neo_reference_id(value: str) -> None:
    if (
        type(value) is not str
        or _ID_PATTERN.fullmatch(value) is None
        or (len(value) > 1 and value.startswith("0"))
    ):
        raise ValueError("NeoWs object identity is invalid")
    if int(value, 10) <= 0:
        raise ValueError("NeoWs object identity is invalid")


def _validate_epoch(value: str) -> None:
    if type(value) is not str or _EPOCH_PATTERN.fullmatch(value) is None:
        raise ValueError("NeoWs provider epoch is invalid")


def _parse_date(value: str) -> date:
    if type(value) is not str or _DATE_PATTERN.fullmatch(value) is None:
        raise ValueError("NeoWs date is invalid")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise ValueError("NeoWs date is invalid") from None


def _validate_text(value: str, *, maximum: int) -> None:
    if (
        type(value) is not str
        or not value
        or value != value.strip()
        or len(value) > maximum
        or any(unicodedata.category(character) in {"Cc", "Cf", "Cs"} for character in value)
    ):
        raise ValueError("NeoWs text is invalid")


def _validate_float(value: float, *, positive: bool) -> None:
    if type(value) is not float or not math.isfinite(value) or (positive and value <= 0):
        raise ValueError("NeoWs numeric value is invalid")


def _as_str(value: Mapping[str, object], field: str) -> str:
    result = value.get(field)
    if type(result) is not str:
        raise ValueError("NeoWs stored value is invalid")
    return result


def _as_float(value: Mapping[str, object], field: str) -> float:
    result = value.get(field)
    if type(result) is int and not isinstance(result, bool):
        result = float(result)
    if type(result) is not float:
        raise ValueError("NeoWs stored value is invalid")
    return result


def _as_bool(value: Mapping[str, object], field: str) -> bool:
    result = value.get(field)
    if type(result) is not bool:
        raise ValueError("NeoWs stored value is invalid")
    return result


__all__ = [
    "MAX_NEOWS_ENCOUNTERS",
    "NEOWS_PUBLIC_ENCOUNTER_LIMIT",
    "NasaNeowsCodec",
    "NasaNeowsEncounter",
    "NasaNeowsNormalized",
    "NEOWS_ENCOUNTER_FIELDS",
    "NEOWS_NORMALIZED_FIELDS",
    "NEOWS_UNCERTAINTY_STATUS",
    "neows_encounter_id",
    "neows_object_id",
]
