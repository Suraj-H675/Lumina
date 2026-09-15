"""Public Space Now response schemas for APOD and Near-Earth Objects."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from lumina.provenance.domain.runtime import CacheState

ApodAvailability = Literal["fresh", "stale", "unavailable"]
ApodUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]

NearEarthAvailability = Literal["fresh", "stale", "unavailable"]
NearEarthUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]
NearEarthUncertaintyStatus = Literal["not_provided_by_source"]


class ApodContentResponse(BaseModel):
    """Safe APOD content without provider media URLs."""

    model_config = ConfigDict(extra="forbid")

    date: str
    title: str
    explanation: str
    media_type: Literal["image", "video"]
    copyright: str | None
    service_version: Literal["v1"]
    apod_page_url: str


class ApodFreshnessResponse(BaseModel):
    """Cache timing separate from the provider's APOD content date."""

    model_config = ConfigDict(extra="forbid")

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


class ApodSourceResponse(BaseModel):
    """Reviewed source and attribution metadata."""

    model_config = ConfigDict(extra="forbid")

    name: str
    official_url: str
    api_documentation_url: str
    media_usage_url: str
    attribution_text: str


class ApodResponse(BaseModel):
    """Versioned public projection for the current/latest Daily Visual."""

    model_config = ConfigDict(extra="forbid")

    availability: ApodAvailability
    unavailable_reason: ApodUnavailableReason | None
    content: ApodContentResponse | None
    freshness: ApodFreshnessResponse
    source: ApodSourceResponse


class NearEarthWindowResponse(BaseModel):
    """The exact seven-date window represented by the cached feed."""

    model_config = ConfigDict(extra="forbid")

    start_date: str
    end_date: str


class NearEarthEncounterResponse(BaseModel):
    """One public-safe Earth close-approach event."""

    model_config = ConfigDict(extra="forbid")

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
    distance_uncertainty_status: NearEarthUncertaintyStatus
    time_uncertainty_status: NearEarthUncertaintyStatus


class NearEarthFreshnessResponse(BaseModel):
    """Cache timing kept separate from the provider approach time."""

    model_config = ConfigDict(extra="forbid")

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


class NearEarthSourceResponse(BaseModel):
    """Reviewed NeoWs source and attribution metadata."""

    model_config = ConfigDict(extra="forbid")

    name: str
    official_documentation_url: str
    attribution_text: str


class NearEarthResponse(BaseModel):
    """Versioned public projection for the current NeoWs approach feed."""

    model_config = ConfigDict(extra="forbid")

    availability: NearEarthAvailability
    unavailable_reason: NearEarthUnavailableReason | None
    window: NearEarthWindowResponse | None
    total_encounter_count: int
    returned_encounter_count: int
    encounters: tuple[NearEarthEncounterResponse, ...]
    freshness: NearEarthFreshnessResponse
    source: NearEarthSourceResponse


SpaceWeatherAvailability = Literal["fresh", "stale", "unavailable"]
SpaceWeatherUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


class SpaceWeatherScaleResponse(BaseModel):
    """One literal NOAA R/S/G scale value and source description."""

    model_config = ConfigDict(extra="forbid")

    level: int
    text: str | None


class SpaceWeatherScalesResponse(BaseModel):
    """Current-period NOAA scales kept as three separate families."""

    model_config = ConfigDict(extra="forbid")

    date_text: str
    time_text: str
    radio_blackout: SpaceWeatherScaleResponse
    solar_radiation: SpaceWeatherScaleResponse
    geomagnetic: SpaceWeatherScaleResponse


class SpaceWeatherKpRowResponse(BaseModel):
    """One Kp value with NOAA's source status preserved."""

    model_config = ConfigDict(extra="forbid")

    time_text: str
    kp: float
    status: Literal["observed", "estimated", "predicted"]
    noaa_scale: str | None


class SpaceWeatherKpResponse(BaseModel):
    """Observed, estimated, and predicted Kp facts without merging them."""

    model_config = ConfigDict(extra="forbid")

    latest_observed: SpaceWeatherKpRowResponse | None
    latest_estimated: SpaceWeatherKpRowResponse | None
    forecast: tuple[SpaceWeatherKpRowResponse, ...]


class SpaceWeatherSolarWindResponse(BaseModel):
    """Solar-wind source measurements with visible units represented by field names."""

    model_config = ConfigDict(extra="forbid")

    speed_time_utc: str | None
    proton_speed_km_s: float | None
    field_time_utc: str | None
    bt_nt: float | None
    bz_gsm_nt: float | None


class SpaceWeatherNotificationResponse(BaseModel):
    """Bounded provider text; no derived active/severity classification."""

    model_config = ConfigDict(extra="forbid")

    product_id: str
    issue_time_text: str
    message: str


class SpaceWeatherImpactResponse(BaseModel):
    """Concise source-bound family context, not a Lumina risk score."""

    model_config = ConfigDict(extra="forbid")

    family: Literal["R", "S", "G"]
    summary: str


class SpaceWeatherAuroraResponse(BaseModel):
    """Official NOAA aurora link and model limitation explanation."""

    model_config = ConfigDict(extra="forbid")

    mode: Literal["official_link"]
    official_url: str
    label: str
    explanation: str


class SpaceWeatherFreshnessResponse(BaseModel):
    """Lumina cache timing separate from NOAA source times."""

    model_config = ConfigDict(extra="forbid")

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


class SpaceWeatherSourceResponse(BaseModel):
    """NOAA attribution and human-facing documentation link."""

    model_config = ConfigDict(extra="forbid")

    name: str
    official_documentation_url: str
    attribution_text: str


class SpaceWeatherResponse(BaseModel):
    """Versioned public projection for one atomic NOAA SWPC snapshot."""

    model_config = ConfigDict(extra="forbid")

    availability: SpaceWeatherAvailability
    unavailable_reason: SpaceWeatherUnavailableReason | None
    scales: SpaceWeatherScalesResponse | None
    kp: SpaceWeatherKpResponse
    solar_wind: SpaceWeatherSolarWindResponse | None
    latest_notifications: tuple[SpaceWeatherNotificationResponse, ...]
    impacts: tuple[SpaceWeatherImpactResponse, ...]
    freshness: SpaceWeatherFreshnessResponse
    source: SpaceWeatherSourceResponse
    aurora: SpaceWeatherAuroraResponse


LaunchAvailability = Literal["fresh", "stale", "unavailable"]
LaunchUnavailableReason = Literal[
    "provider_disabled",
    "no_cached_content",
    "cached_content_expired",
]


class LaunchStatusResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    abbreviation: str


class LaunchTimingResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    net_utc: str
    precision_id: int
    precision_name: str
    precision_abbreviation: str
    window_start_utc: str | None
    window_end_utc: str | None
    provider_updated_at: str
    countdown_eligible: bool
    calendar_eligible: bool


class LaunchAgencyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str


class LaunchVehicleResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    configuration_id: int
    name: str
    full_name: str
    variant: str | None


class LaunchMissionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
    mission_type: str | None
    description: str | None
    orbit_name: str | None
    orbit_abbreviation: str | None
    destination_body: str | None
    agency_names: tuple[str, ...]


class LaunchSiteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pad_id: int
    pad_name: str
    location_name: str | None
    country_name: str | None
    country_code: str | None


class LaunchItemResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    launch_id: str
    slug: str
    name: str
    status: LaunchStatusResponse
    timing: LaunchTimingResponse
    agency: LaunchAgencyResponse | None
    vehicle: LaunchVehicleResponse | None
    mission: LaunchMissionResponse | None
    site: LaunchSiteResponse | None
    official_page_url: str | None
    official_webcast_url: str | None
    webcast_live: bool


class LaunchFreshnessResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None
    snapshot_latest_updated_utc: str | None


class LaunchSourceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    official_documentation_url: str
    terms_url: str
    attribution_text: str


class LaunchListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    availability: LaunchAvailability
    unavailable_reason: LaunchUnavailableReason | None
    total_launch_count: int
    returned_launch_count: int
    launches: tuple[LaunchItemResponse, ...]
    active_mission_launch_ids: tuple[str, ...]
    freshness: LaunchFreshnessResponse
    source: LaunchSourceResponse


class LaunchDetailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    availability: LaunchAvailability
    unavailable_reason: LaunchUnavailableReason | None
    launch: LaunchItemResponse | None
    freshness: LaunchFreshnessResponse
    source: LaunchSourceResponse
