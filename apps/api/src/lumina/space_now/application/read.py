"""Product projections for current Space Now provider snapshots."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from lumina.provenance.application.read import (
    ProviderSnapshot,
    ProviderSnapshotReader,
    ProviderSnapshotReadError,
)
from lumina.provenance.domain.apod import (
    NasaApodNormalized,
    apod_page_url,
    validate_apod_public_compatibility,
)
from lumina.provenance.domain.neows import (
    NEOWS_PUBLIC_ENCOUNTER_LIMIT,
    NasaNeowsEncounter,
    NasaNeowsNormalized,
    neows_encounter_id,
    neows_object_id,
)
from lumina.provenance.domain.runtime import (
    APOD_PROVIDER_CODE,
    NEOWS_PROVIDER_CODE,
    SWPC_PROVIDER_CODE,
    CacheState,
)
from lumina.provenance.domain.space_weather import (
    SWPC_AURORA_OFFICIAL_URL,
    SWPC_KP_PUBLIC_FORECAST_LIMIT,
    SWPC_PUBLIC_NOTIFICATION_LIMIT,
    SwpcKpRow,
    SwpcNormalized,
    SwpcNotification,
    SwpcScales,
    SwpcScaleState,
    SwpcSolarWindField,
    SwpcSolarWindSpeed,
)

ApodAvailability = Literal["fresh", "stale", "unavailable"]
ApodUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


@dataclass(frozen=True, slots=True)
class ApodContentProjection:
    """Public-safe APOD fields with link-only media navigation."""

    date: str
    title: str
    explanation: str
    media_type: Literal["image", "video"]
    copyright: str | None
    service_version: Literal["v1"]
    apod_page_url: str


@dataclass(frozen=True, slots=True)
class ApodFreshnessProjection:
    """Cache timing facts shown separately from the APOD content date."""

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


@dataclass(frozen=True, slots=True)
class ApodSourceProjection:
    """Reviewed APOD source and attribution links."""

    name: str
    official_url: str
    api_documentation_url: str
    media_usage_url: str
    attribution_text: str


@dataclass(frozen=True, slots=True)
class ApodProjection:
    """Complete user-facing Daily Visual projection."""

    availability: ApodAvailability
    unavailable_reason: ApodUnavailableReason | None
    content: ApodContentProjection | None
    freshness: ApodFreshnessProjection
    source: ApodSourceProjection


class ApodReadService:
    """Project the typed APOD cache through a product-owned public contract."""

    def __init__(self, reader: ProviderSnapshotReader) -> None:
        self._reader = reader

    async def read(self) -> ApodProjection:
        """Read only durable state; this service has no upstream network capability."""
        snapshot = await self._reader.read(APOD_PROVIDER_CODE)
        if not isinstance(snapshot, ProviderSnapshot):
            raise ProviderSnapshotReadError()
        if snapshot.config.provider_code != APOD_PROVIDER_CODE:
            raise ProviderSnapshotReadError()
        source = ApodSourceProjection(
            name=snapshot.config.source_manifest.source_name,
            official_url=_official_apod_url(snapshot),
            api_documentation_url=str(snapshot.config.source_manifest.official_documentation_url),
            media_usage_url=str(snapshot.config.source_manifest.terms_or_licence_url),
            attribution_text=snapshot.config.source_manifest.attribution_text,
        )
        cache = snapshot.status.cache
        freshness = ApodFreshnessProjection(
            cache_state=snapshot.status.cache_state,
            retrieved_at=None if cache is None else cache.fetched_at,
            fresh_until=None if cache is None else cache.fresh_until,
            stale_until=None if cache is None else cache.stale_until,
            last_refresh_failure_code=(
                None
                if snapshot.status.state.last_failure_code is None
                else snapshot.status.state.last_failure_code.value
            ),
        )

        reason: ApodUnavailableReason | None = None
        availability: ApodAvailability
        content: ApodContentProjection | None = None
        if not snapshot.status.state.enabled:
            availability = "unavailable"
            reason = "provider_disabled"
        elif cache is None or snapshot.status.cache_state is CacheState.MISSING:
            availability = "unavailable"
            reason = "no_cached_content"
        elif snapshot.status.cache_state is CacheState.EXPIRED:
            availability = "unavailable"
            reason = "cached_content_expired"
        else:
            availability = "fresh" if snapshot.status.cache_state is CacheState.FRESH else "stale"
            content = _content_projection(snapshot)
        return ApodProjection(
            availability=availability,
            unavailable_reason=reason,
            content=content,
            freshness=freshness,
            source=source,
        )


def _official_apod_url(snapshot: ProviderSnapshot) -> str:
    value = snapshot.config.source_manifest.source_page_url
    if value is None:
        raise ProviderSnapshotReadError()
    return str(value)


def _content_projection(snapshot: ProviderSnapshot) -> ApodContentProjection:
    cache = snapshot.status.cache
    if cache is None:
        raise ProviderSnapshotReadError()
    if (
        cache.provider_code != snapshot.config.provider_code
        or cache.cache_key != snapshot.config.cache_key
        or cache.schema_version != snapshot.config.source_schema_version
    ):
        raise ProviderSnapshotReadError()
    try:
        decoded = snapshot.payload_codec.decode(cache.normalized_payload)
    except (TypeError, ValueError):
        raise ProviderSnapshotReadError() from None
    if not isinstance(decoded, NasaApodNormalized):
        raise ProviderSnapshotReadError()
    try:
        validate_apod_public_compatibility(decoded)
    except (TypeError, ValueError):
        raise ProviderSnapshotReadError() from None
    return ApodContentProjection(
        date=decoded.date,
        title=decoded.title,
        explanation=decoded.explanation,
        media_type=decoded.media_type,
        copyright=decoded.copyright,
        service_version=decoded.service_version,
        apod_page_url=apod_page_url(decoded.date),
    )


NearEarthAvailability = Literal["fresh", "stale", "unavailable"]
NearEarthUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


@dataclass(frozen=True, slots=True)
class NearEarthEncounterProjection:
    """Public-safe projection of one normalized NeoWs encounter."""

    encounter_id: str
    object_id: str
    neo_reference_id: str
    name: str
    approach_date: str
    approach_time_text: str
    absolute_magnitude_h: float
    nominal_distance_km: float
    nominal_distance_lunar: float
    relative_velocity_km_s: float
    estimated_diameter_min_m: float
    estimated_diameter_max_m: float
    is_potentially_hazardous_asteroid: bool
    distance_uncertainty_status: Literal["not_provided_by_source"]
    time_uncertainty_status: Literal["not_provided_by_source"]


@dataclass(frozen=True, slots=True)
class NearEarthWindowProjection:
    """Exact cached feed dates, not a relative phrase such as 'next seven days'."""

    start_date: str
    end_date: str


@dataclass(frozen=True, slots=True)
class NearEarthFreshnessProjection:
    """Cache timing facts shown separately from the provider approach time."""

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


@dataclass(frozen=True, slots=True)
class NearEarthSourceProjection:
    """Reviewed NeoWs source and attribution metadata."""

    name: str
    official_documentation_url: str
    attribution_text: str


@dataclass(frozen=True, slots=True)
class NearEarthProjection:
    """Complete user-facing Near-Earth Objects projection."""

    availability: NearEarthAvailability
    unavailable_reason: NearEarthUnavailableReason | None
    window: NearEarthWindowProjection | None
    total_encounter_count: int
    returned_encounter_count: int
    encounters: tuple[NearEarthEncounterProjection, ...]
    freshness: NearEarthFreshnessProjection
    source: NearEarthSourceProjection


class NearEarthReadService:
    """Project only durable validated NeoWs state; this service cannot fetch NASA."""

    def __init__(self, reader: ProviderSnapshotReader) -> None:
        self._reader = reader

    async def read(self) -> NearEarthProjection:
        """Read the cache/status snapshot and retain no provider payload or links."""
        snapshot = await self._reader.read(NEOWS_PROVIDER_CODE)
        if not isinstance(snapshot, ProviderSnapshot):
            raise ProviderSnapshotReadError()
        if snapshot.config.provider_code != NEOWS_PROVIDER_CODE:
            raise ProviderSnapshotReadError()
        source = NearEarthSourceProjection(
            name=snapshot.config.source_manifest.source_name,
            official_documentation_url=str(
                snapshot.config.source_manifest.official_documentation_url
            ),
            attribution_text=snapshot.config.source_manifest.attribution_text,
        )
        cache = snapshot.status.cache
        freshness = NearEarthFreshnessProjection(
            cache_state=snapshot.status.cache_state,
            retrieved_at=None if cache is None else cache.fetched_at,
            fresh_until=None if cache is None else cache.fresh_until,
            stale_until=None if cache is None else cache.stale_until,
            last_refresh_failure_code=(
                None
                if snapshot.status.state.last_failure_code is None
                else snapshot.status.state.last_failure_code.value
            ),
        )

        reason: NearEarthUnavailableReason | None = None
        availability: NearEarthAvailability
        if not snapshot.status.state.enabled:
            availability = "unavailable"
            reason = "provider_disabled"
        elif cache is None or snapshot.status.cache_state is CacheState.MISSING:
            availability = "unavailable"
            reason = "no_cached_content"
        elif snapshot.status.cache_state is CacheState.EXPIRED:
            availability = "unavailable"
            reason = "cached_content_expired"
        else:
            availability = "fresh" if snapshot.status.cache_state is CacheState.FRESH else "stale"
            normalized = _near_earth_normalized(snapshot)
            encounters = tuple(
                _near_earth_encounter_projection(encounter)
                for encounter in normalized.encounters[:NEOWS_PUBLIC_ENCOUNTER_LIMIT]
            )
            return NearEarthProjection(
                availability=availability,
                unavailable_reason=None,
                window=NearEarthWindowProjection(
                    start_date=normalized.window_start_date,
                    end_date=normalized.window_end_date,
                ),
                total_encounter_count=len(normalized.encounters),
                returned_encounter_count=len(encounters),
                encounters=encounters,
                freshness=freshness,
                source=source,
            )
        return NearEarthProjection(
            availability=availability,
            unavailable_reason=reason,
            window=None,
            total_encounter_count=0,
            returned_encounter_count=0,
            encounters=(),
            freshness=freshness,
            source=source,
        )


def _near_earth_normalized(snapshot: ProviderSnapshot) -> NasaNeowsNormalized:
    cache = snapshot.status.cache
    if cache is None:
        raise ProviderSnapshotReadError()
    if (
        cache.provider_code != snapshot.config.provider_code
        or cache.cache_key != snapshot.config.cache_key
        or cache.schema_version != snapshot.config.source_schema_version
    ):
        raise ProviderSnapshotReadError()
    try:
        decoded = snapshot.payload_codec.decode(cache.normalized_payload)
    except (TypeError, ValueError):
        raise ProviderSnapshotReadError() from None
    if not isinstance(decoded, NasaNeowsNormalized):
        raise ProviderSnapshotReadError()
    return decoded


def _near_earth_encounter_projection(
    encounter: NasaNeowsEncounter,
) -> NearEarthEncounterProjection:
    return NearEarthEncounterProjection(
        encounter_id=neows_encounter_id(encounter.neo_reference_id, encounter.approach_date),
        object_id=neows_object_id(encounter.neo_reference_id),
        neo_reference_id=encounter.neo_reference_id,
        name=encounter.name,
        approach_date=encounter.approach_date,
        approach_time_text=encounter.approach_time_text,
        absolute_magnitude_h=encounter.absolute_magnitude_h,
        nominal_distance_km=encounter.nominal_distance_km,
        nominal_distance_lunar=encounter.nominal_distance_lunar,
        relative_velocity_km_s=encounter.relative_velocity_km_s,
        estimated_diameter_min_m=encounter.estimated_diameter_min_m,
        estimated_diameter_max_m=encounter.estimated_diameter_max_m,
        is_potentially_hazardous_asteroid=encounter.is_potentially_hazardous_asteroid,
        distance_uncertainty_status="not_provided_by_source",
        time_uncertainty_status="not_provided_by_source",
    )


SpaceWeatherAvailability = Literal["fresh", "stale", "unavailable"]
SpaceWeatherUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


@dataclass(frozen=True, slots=True)
class SpaceWeatherScaleProjection:
    """One source-defined NOAA R/S/G category without cross-family scoring."""

    level: int
    text: str | None


@dataclass(frozen=True, slots=True)
class SpaceWeatherScalesProjection:
    """Current-period NOAA scale categories and their provider time text."""

    date_text: str
    time_text: str
    radio_blackout: SpaceWeatherScaleProjection
    solar_radiation: SpaceWeatherScaleProjection
    geomagnetic: SpaceWeatherScaleProjection


@dataclass(frozen=True, slots=True)
class SpaceWeatherKpProjection:
    """Public Kp projection preserving observed, estimated, and predicted rows."""

    time_text: str
    kp: float
    status: Literal["observed", "estimated", "predicted"]
    noaa_scale: str | None


@dataclass(frozen=True, slots=True)
class SpaceWeatherSolarWindProjection:
    """Public solar-wind measurements with explicit source units."""

    speed_time_utc: str | None
    proton_speed_km_s: float | None
    field_time_utc: str | None
    bt_nt: float | None
    bz_gsm_nt: float | None


@dataclass(frozen=True, slots=True)
class SpaceWeatherNotificationProjection:
    """One source notification rendered as bounded plain text."""

    product_id: str
    issue_time_text: str
    message: str


@dataclass(frozen=True, slots=True)
class SpaceWeatherImpactProjection:
    """Concise NOAA-sourced family context, not a Lumina risk score."""

    family: Literal["R", "S", "G"]
    summary: str


@dataclass(frozen=True, slots=True)
class SpaceWeatherAuroraProjection:
    """Fixed official NOAA model link with no ingested grid or local promise."""

    mode: Literal["official_link"]
    official_url: str
    label: str
    explanation: str


@dataclass(frozen=True, slots=True)
class SpaceWeatherFreshnessProjection:
    """Lumina retrieval and cache deadlines separate from source timestamps."""

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


@dataclass(frozen=True, slots=True)
class SpaceWeatherSourceProjection:
    """Reviewed NOAA attribution and documentation."""

    name: str
    official_documentation_url: str
    attribution_text: str


@dataclass(frozen=True, slots=True)
class SpaceWeatherProjection:
    """Complete user-facing atomic Space Weather projection."""

    availability: SpaceWeatherAvailability
    unavailable_reason: SpaceWeatherUnavailableReason | None
    scales: SpaceWeatherScalesProjection | None
    latest_observed_kp: SpaceWeatherKpProjection | None
    latest_estimated_kp: SpaceWeatherKpProjection | None
    forecast_kp: tuple[SpaceWeatherKpProjection, ...]
    solar_wind: SpaceWeatherSolarWindProjection | None
    latest_notifications: tuple[SpaceWeatherNotificationProjection, ...]
    impacts: tuple[SpaceWeatherImpactProjection, ...]
    freshness: SpaceWeatherFreshnessProjection
    source: SpaceWeatherSourceProjection
    aurora: SpaceWeatherAuroraProjection


class SpaceWeatherReadService:
    """Project only the durable last-known-good NOAA SWPC snapshot."""

    def __init__(self, reader: ProviderSnapshotReader) -> None:
        self._reader = reader

    async def read(self) -> SpaceWeatherProjection:
        """Read cached SWPC data without any upstream network capability."""
        snapshot = await self._reader.read(SWPC_PROVIDER_CODE)
        if not isinstance(snapshot, ProviderSnapshot):
            raise ProviderSnapshotReadError()
        if snapshot.config.provider_code != SWPC_PROVIDER_CODE:
            raise ProviderSnapshotReadError()
        source = SpaceWeatherSourceProjection(
            name=snapshot.config.source_manifest.source_name,
            official_documentation_url=str(
                snapshot.config.source_manifest.official_documentation_url
            ),
            attribution_text=snapshot.config.source_manifest.attribution_text,
        )
        cache = snapshot.status.cache
        freshness = SpaceWeatherFreshnessProjection(
            cache_state=snapshot.status.cache_state,
            retrieved_at=None if cache is None else cache.fetched_at,
            fresh_until=None if cache is None else cache.fresh_until,
            stale_until=None if cache is None else cache.stale_until,
            last_refresh_failure_code=(
                None
                if snapshot.status.state.last_failure_code is None
                else snapshot.status.state.last_failure_code.value
            ),
        )
        aurora = SpaceWeatherAuroraProjection(
            mode="official_link",
            official_url=SWPC_AURORA_OFFICIAL_URL,
            label="NOAA Aurora 30-Minute Forecast",
            explanation=(
                "NOAA's OVATION-based product is short-range model guidance for auroral "
                "location and intensity. It does not guarantee visibility from a particular "
                "place; daylight, clouds, local conditions, and model uncertainty still matter."
            ),
        )
        impacts = _space_weather_impacts()
        if not snapshot.status.state.enabled:
            return _unavailable_space_weather(
                "provider_disabled", freshness, source, aurora, impacts
            )
        if cache is None or snapshot.status.cache_state is CacheState.MISSING:
            return _unavailable_space_weather(
                "no_cached_content", freshness, source, aurora, impacts
            )
        if snapshot.status.cache_state is CacheState.EXPIRED:
            return _unavailable_space_weather(
                "cached_content_expired", freshness, source, aurora, impacts
            )
        normalized = _space_weather_normalized(snapshot)
        return SpaceWeatherProjection(
            availability="fresh" if snapshot.status.cache_state is CacheState.FRESH else "stale",
            unavailable_reason=None,
            scales=_scales_projection(normalized.scales),
            latest_observed_kp=_latest_kp(normalized.kp_rows, "observed"),
            latest_estimated_kp=_latest_kp(normalized.kp_rows, "estimated"),
            forecast_kp=tuple(
                _kp_projection(row) for row in normalized.kp_rows if row.status == "predicted"
            )[:SWPC_KP_PUBLIC_FORECAST_LIMIT],
            solar_wind=_solar_wind_projection(
                normalized.solar_wind_speed,
                normalized.solar_wind_field,
            ),
            latest_notifications=tuple(
                _notification_projection(notification) for notification in normalized.notifications
            )[:SWPC_PUBLIC_NOTIFICATION_LIMIT],
            impacts=impacts,
            freshness=freshness,
            source=source,
            aurora=aurora,
        )


def _unavailable_space_weather(
    reason: SpaceWeatherUnavailableReason,
    freshness: SpaceWeatherFreshnessProjection,
    source: SpaceWeatherSourceProjection,
    aurora: SpaceWeatherAuroraProjection,
    impacts: tuple[SpaceWeatherImpactProjection, ...],
) -> SpaceWeatherProjection:
    return SpaceWeatherProjection(
        availability="unavailable",
        unavailable_reason=reason,
        scales=None,
        latest_observed_kp=None,
        latest_estimated_kp=None,
        forecast_kp=(),
        solar_wind=None,
        latest_notifications=(),
        impacts=impacts,
        freshness=freshness,
        source=source,
        aurora=aurora,
    )


def _space_weather_normalized(snapshot: ProviderSnapshot) -> SwpcNormalized:
    cache = snapshot.status.cache
    if cache is None:
        raise ProviderSnapshotReadError()
    if (
        cache.provider_code != snapshot.config.provider_code
        or cache.cache_key != snapshot.config.cache_key
        or cache.schema_version != snapshot.config.source_schema_version
    ):
        raise ProviderSnapshotReadError()
    try:
        decoded = snapshot.payload_codec.decode(cache.normalized_payload)
    except (TypeError, ValueError):
        raise ProviderSnapshotReadError() from None
    if not isinstance(decoded, SwpcNormalized):
        raise ProviderSnapshotReadError()
    return decoded


def _scales_projection(value: SwpcScales) -> SpaceWeatherScalesProjection:
    return SpaceWeatherScalesProjection(
        date_text=value.date_text,
        time_text=value.time_text,
        radio_blackout=_scale_projection(value.radio_blackout),
        solar_radiation=_scale_projection(value.solar_radiation),
        geomagnetic=_scale_projection(value.geomagnetic),
    )


def _scale_projection(value: SwpcScaleState) -> SpaceWeatherScaleProjection:
    return SpaceWeatherScaleProjection(level=value.level, text=value.text)


def _kp_projection(value: SwpcKpRow) -> SpaceWeatherKpProjection:
    return SpaceWeatherKpProjection(
        time_text=value.time_text,
        kp=value.kp,
        status=value.status,
        noaa_scale=value.noaa_scale,
    )


def _latest_kp(
    rows: tuple[SwpcKpRow, ...],
    status: Literal["observed", "estimated"],
) -> SpaceWeatherKpProjection | None:
    candidates = [row for row in rows if row.status == status]
    return None if not candidates else _kp_projection(candidates[-1])


def _solar_wind_projection(
    speed: SwpcSolarWindSpeed,
    field: SwpcSolarWindField,
) -> SpaceWeatherSolarWindProjection:
    return SpaceWeatherSolarWindProjection(
        speed_time_utc=speed.time_utc,
        proton_speed_km_s=speed.proton_speed_km_s,
        field_time_utc=field.time_utc,
        bt_nt=field.bt_nt,
        bz_gsm_nt=field.bz_gsm_nt,
    )


def _notification_projection(value: SwpcNotification) -> SpaceWeatherNotificationProjection:
    return SpaceWeatherNotificationProjection(
        product_id=value.product_id,
        issue_time_text=value.issue_time_text,
        message=value.message,
    )


def _space_weather_impacts() -> tuple[SpaceWeatherImpactProjection, ...]:
    return (
        SpaceWeatherImpactProjection(
            family="R",
            summary="Radio blackouts can degrade HF radio and some navigation signals.",
        ),
        SpaceWeatherImpactProjection(
            family="S",
            summary=(
                "Solar radiation storms can affect spacecraft systems, polar HF radio, "
                "and navigation; NOAA also describes radiation concerns in specific "
                "high-altitude, high-latitude aviation contexts."
            ),
        ),
        SpaceWeatherImpactProjection(
            family="G",
            summary=(
                "Geomagnetic storms can affect power systems, spacecraft operations, "
                "radio and navigation, and auroral activity."
            ),
        ),
    )


__all__ = [
    "ApodAvailability",
    "ApodContentProjection",
    "ApodFreshnessProjection",
    "ApodProjection",
    "ApodReadService",
    "ApodSourceProjection",
    "ApodUnavailableReason",
    "NearEarthAvailability",
    "NearEarthEncounterProjection",
    "NearEarthFreshnessProjection",
    "NearEarthProjection",
    "NearEarthReadService",
    "NearEarthSourceProjection",
    "NearEarthUnavailableReason",
    "NearEarthWindowProjection",
    "SpaceWeatherAvailability",
    "SpaceWeatherAuroraProjection",
    "SpaceWeatherFreshnessProjection",
    "SpaceWeatherImpactProjection",
    "SpaceWeatherKpProjection",
    "SpaceWeatherNotificationProjection",
    "SpaceWeatherProjection",
    "SpaceWeatherReadService",
    "SpaceWeatherScaleProjection",
    "SpaceWeatherScalesProjection",
    "SpaceWeatherSolarWindProjection",
    "SpaceWeatherSourceProjection",
    "SpaceWeatherUnavailableReason",
]
