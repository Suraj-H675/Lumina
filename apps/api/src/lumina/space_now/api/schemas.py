"""Public APOD Daily Visual response schemas."""

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
