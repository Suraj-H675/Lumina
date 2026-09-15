"""Cache-only Launch Center projections for Launch Library 2 snapshots."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from lumina.provenance.application.read import (
    ProviderSnapshot,
    ProviderSnapshotReader,
    ProviderSnapshotReadError,
)
from lumina.provenance.domain.launch_library import (
    LL2_ACTIVE_MISSION_LIMIT,
    LL2_PUBLIC_LAUNCH_LIMIT,
    Ll2Launch,
    Ll2Normalized,
    launch_calendar_eligible,
    launch_countdown_eligible,
    launch_is_terminal,
)
from lumina.provenance.domain.runtime import LL2_PROVIDER_CODE, CacheState

LaunchAvailability = Literal["fresh", "stale", "unavailable"]
LaunchUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


@dataclass(frozen=True, slots=True)
class LaunchStatusProjection:
    id: int
    name: str
    abbreviation: str


@dataclass(frozen=True, slots=True)
class LaunchTimingProjection:
    net_utc: str
    precision_id: int
    precision_name: str
    precision_abbreviation: str
    window_start_utc: str | None
    window_end_utc: str | None
    provider_updated_at: str
    countdown_eligible: bool
    calendar_eligible: bool


@dataclass(frozen=True, slots=True)
class LaunchAgencyProjection:
    id: int
    name: str


@dataclass(frozen=True, slots=True)
class LaunchVehicleProjection:
    configuration_id: int
    name: str
    full_name: str
    variant: str | None


@dataclass(frozen=True, slots=True)
class LaunchMissionProjection:
    id: int
    name: str
    mission_type: str | None
    description: str | None
    orbit_name: str | None
    orbit_abbreviation: str | None
    destination_body: str | None
    agency_names: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class LaunchSiteProjection:
    pad_id: int
    pad_name: str
    location_name: str | None
    country_name: str | None
    country_code: str | None


@dataclass(frozen=True, slots=True)
class LaunchProjection:
    launch_id: str
    slug: str
    name: str
    status: LaunchStatusProjection
    timing: LaunchTimingProjection
    agency: LaunchAgencyProjection | None
    vehicle: LaunchVehicleProjection | None
    mission: LaunchMissionProjection | None
    site: LaunchSiteProjection | None
    official_page_url: str | None
    official_webcast_url: str | None
    webcast_live: bool


@dataclass(frozen=True, slots=True)
class LaunchFreshnessProjection:
    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None
    snapshot_latest_updated_utc: str | None


@dataclass(frozen=True, slots=True)
class LaunchSourceProjection:
    name: str
    official_documentation_url: str
    terms_url: str
    attribution_text: str


@dataclass(frozen=True, slots=True)
class LaunchListProjection:
    availability: LaunchAvailability
    unavailable_reason: LaunchUnavailableReason | None
    total_launch_count: int
    returned_launch_count: int
    launches: tuple[LaunchProjection, ...]
    active_mission_launch_ids: tuple[str, ...]
    freshness: LaunchFreshnessProjection
    source: LaunchSourceProjection


class LaunchReadService:
    """Project only durable validated LL2 state; this service cannot fetch upstream."""

    def __init__(self, reader: ProviderSnapshotReader) -> None:
        self._reader = reader

    async def read(self) -> LaunchListProjection:
        return _list_projection(await self._snapshot())

    async def read_one(
        self, launch_id: str
    ) -> tuple[LaunchListProjection, LaunchProjection | None]:
        snapshot = await self._snapshot()
        projection = _list_projection(snapshot)
        if projection.availability == "unavailable":
            return projection, None
        normalized = _normalized(snapshot)
        for launch in normalized.launches:
            if launch.launch_id == launch_id:
                return projection, _project_launch(launch)
        return projection, None

    async def _snapshot(self) -> ProviderSnapshot:
        snapshot = await self._reader.read(LL2_PROVIDER_CODE)
        if (
            not isinstance(snapshot, ProviderSnapshot)
            or snapshot.config.provider_code != LL2_PROVIDER_CODE
        ):
            raise ProviderSnapshotReadError()
        return snapshot


def _list_projection(snapshot: ProviderSnapshot) -> LaunchListProjection:
    source = _source(snapshot)
    cache = snapshot.status.cache
    base_freshness = LaunchFreshnessProjection(
        cache_state=snapshot.status.cache_state,
        retrieved_at=None if cache is None else cache.fetched_at,
        fresh_until=None if cache is None else cache.fresh_until,
        stale_until=None if cache is None else cache.stale_until,
        last_refresh_failure_code=(
            None
            if snapshot.status.state.last_failure_code is None
            else snapshot.status.state.last_failure_code.value
        ),
        snapshot_latest_updated_utc=None,
    )
    unavailable = _unavailable_reason(snapshot)
    if unavailable is not None:
        return LaunchListProjection(
            availability="unavailable",
            unavailable_reason=unavailable,
            total_launch_count=0,
            returned_launch_count=0,
            launches=(),
            active_mission_launch_ids=(),
            freshness=base_freshness,
            source=source,
        )

    normalized = _normalized(snapshot)
    projected = tuple(_project_launch(item) for item in normalized.launches)
    public = projected[:LL2_PUBLIC_LAUNCH_LIMIT]
    active_ids = tuple(
        item.launch_id
        for item in normalized.launches[:LL2_PUBLIC_LAUNCH_LIMIT]
        if item.mission is not None and not launch_is_terminal(item)
    )[:LL2_ACTIVE_MISSION_LIMIT]
    return LaunchListProjection(
        availability="fresh" if snapshot.status.cache_state is CacheState.FRESH else "stale",
        unavailable_reason=None,
        total_launch_count=len(projected),
        returned_launch_count=len(public),
        launches=public,
        active_mission_launch_ids=active_ids,
        freshness=LaunchFreshnessProjection(
            cache_state=base_freshness.cache_state,
            retrieved_at=base_freshness.retrieved_at,
            fresh_until=base_freshness.fresh_until,
            stale_until=base_freshness.stale_until,
            last_refresh_failure_code=base_freshness.last_refresh_failure_code,
            snapshot_latest_updated_utc=normalized.snapshot_latest_updated_utc,
        ),
        source=source,
    )


def _unavailable_reason(snapshot: ProviderSnapshot) -> LaunchUnavailableReason | None:
    cache = snapshot.status.cache
    if not snapshot.status.state.enabled:
        return "provider_disabled"
    if cache is None or snapshot.status.cache_state is CacheState.MISSING:
        return "no_cached_content"
    if snapshot.status.cache_state is CacheState.EXPIRED:
        return "cached_content_expired"
    return None


def _normalized(snapshot: ProviderSnapshot) -> Ll2Normalized:
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
    if not isinstance(decoded, Ll2Normalized):
        raise ProviderSnapshotReadError()
    return decoded


def _source(snapshot: ProviderSnapshot) -> LaunchSourceProjection:
    manifest = snapshot.config.source_manifest
    return LaunchSourceProjection(
        name=manifest.source_name,
        official_documentation_url=str(manifest.official_documentation_url),
        terms_url=str(manifest.terms_or_licence_url),
        attribution_text=manifest.attribution_text,
    )


def _project_launch(value: Ll2Launch) -> LaunchProjection:
    agency = (
        None if value.agency is None else LaunchAgencyProjection(value.agency.id, value.agency.name)
    )
    vehicle = (
        None
        if value.vehicle is None
        else LaunchVehicleProjection(
            value.vehicle.configuration_id,
            value.vehicle.name,
            value.vehicle.full_name,
            value.vehicle.variant,
        )
    )
    mission = (
        None
        if value.mission is None
        else LaunchMissionProjection(
            value.mission.id,
            value.mission.name,
            value.mission.mission_type,
            value.mission.description,
            value.mission.orbit_name,
            value.mission.orbit_abbreviation,
            value.mission.destination_body,
            value.mission.agency_names,
        )
    )
    site = (
        None
        if value.site is None
        else LaunchSiteProjection(
            value.site.pad_id,
            value.site.pad_name,
            value.site.location_name,
            value.site.country_name,
            value.site.country_code,
        )
    )
    return LaunchProjection(
        launch_id=value.launch_id,
        slug=value.slug,
        name=value.name,
        status=LaunchStatusProjection(
            value.status.id, value.status.name, value.status.abbreviation
        ),
        timing=LaunchTimingProjection(
            net_utc=value.net_utc,
            precision_id=value.precision.id,
            precision_name=value.precision.name,
            precision_abbreviation=value.precision.abbreviation,
            window_start_utc=value.window_start_utc,
            window_end_utc=value.window_end_utc,
            provider_updated_at=value.last_updated_utc,
            countdown_eligible=launch_countdown_eligible(value),
            calendar_eligible=launch_calendar_eligible(value),
        ),
        agency=agency,
        vehicle=vehicle,
        mission=mission,
        site=site,
        official_page_url=value.official_page_url,
        official_webcast_url=value.official_webcast_url,
        webcast_live=value.webcast_live,
    )


__all__ = [
    "LaunchAgencyProjection",
    "LaunchAvailability",
    "LaunchFreshnessProjection",
    "LaunchListProjection",
    "LaunchMissionProjection",
    "LaunchProjection",
    "LaunchReadService",
    "LaunchSiteProjection",
    "LaunchSourceProjection",
    "LaunchStatusProjection",
    "LaunchTimingProjection",
    "LaunchUnavailableReason",
    "LaunchVehicleProjection",
]
