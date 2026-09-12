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
from lumina.provenance.domain.apod import NasaApodNormalized, apod_page_url
from lumina.provenance.domain.neows import (
    NEOWS_PUBLIC_ENCOUNTER_LIMIT,
    NasaNeowsEncounter,
    NasaNeowsNormalized,
    neows_encounter_id,
    neows_object_id,
)
from lumina.provenance.domain.runtime import APOD_PROVIDER_CODE, NEOWS_PROVIDER_CODE, CacheState

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
]
