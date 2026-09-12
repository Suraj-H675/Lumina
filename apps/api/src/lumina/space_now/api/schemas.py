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
