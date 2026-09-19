"""Strict public response schemas for Phase 8A Participate v1."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, StrictBool, StrictInt, StrictStr

from lumina.provenance.domain.runtime import CacheState

ScienceArea = Literal["astrophysics", "solar_system"]
TaskType = Literal["examining_images", "examining_data"]
TimeFilter = Literal[
    "a_few_min",
    "about_10_min",
    "five_to_fifteen_min",
    "about_15_min",
]
DeviceFilter = Literal["web_device", "mobile_or_computer", "tablet_explicit"]
SkillFocus = Literal[
    "visual_classification",
    "light_curve_reading",
    "candidate_image_validation",
    "spectroscopy_data",
    "plot_reading",
]
ProjectStatus = Literal["active", "inactive", "unavailable"]
Availability = Literal["fresh", "stale", "unavailable"]


class _StrictResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ParticipateDefinitionResponse(_StrictResponse):
    slug: Literal["participate"]
    title: Literal["Participate"]
    status: Literal["ready"]
    version: Literal[1]
    summary: StrictStr
    external_handoff_notice: StrictStr
    privacy_note: StrictStr
    status_unavailable_label: StrictStr
    stale_status_label: StrictStr
    references: tuple[StrictStr, ...]


class ParticipateFiltersResponse(_StrictResponse):
    time: tuple[TimeFilter, ...]
    device: tuple[DeviceFilter, ...]
    skill_focus: tuple[SkillFocus, ...]


class ParticipateProjectResponse(_StrictResponse):
    id: StrictStr
    title: StrictStr
    science_area: ScienceArea
    summary: StrictStr
    task_type: TaskType
    time_filter: TimeFilter
    time_label: StrictStr
    device_filters: tuple[DeviceFilter, ...]
    device_label: StrictStr
    skill_focus: SkillFocus
    knowledge_note: StrictStr
    external_url: StrictStr
    source_ids: tuple[StrictStr, ...]
    status: ProjectStatus
    status_stale: StrictBool
    source_updated_at: StrictStr | None


class ParticipateChallengeResponse(_StrictResponse):
    id: StrictStr
    month: StrictInt
    title: StrictStr
    summary: StrictStr
    duration_label: StrictStr
    steps: tuple[StrictStr, ...]
    safety: tuple[StrictStr, ...]
    valid_limit_note: StrictStr
    source_ids: tuple[StrictStr, ...]


class ParticipateExternalResourceResponse(_StrictResponse):
    label: StrictStr
    url: StrictStr


class ParticipateActivityResponse(_StrictResponse):
    id: StrictStr
    title: StrictStr
    age_guidance: StrictStr
    skill_guidance: StrictStr
    duration_label: StrictStr
    materials: tuple[StrictStr, ...]
    steps: tuple[StrictStr, ...]
    safety: tuple[StrictStr, ...]
    learning_objective: StrictStr
    expected_observation: StrictStr
    cleanup: StrictStr
    adult_supervision_note: StrictStr
    limitations: tuple[StrictStr, ...]
    source_ids: tuple[StrictStr, ...]
    external_resource: ParticipateExternalResourceResponse | None


class ParticipateSourceResponse(_StrictResponse):
    id: StrictStr
    title: StrictStr
    organization: StrictStr
    url: StrictStr
    claim_scope: StrictStr


class ParticipateFreshnessResponse(_StrictResponse):
    availability: Availability
    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: StrictStr | None


class ParticipateResponse(_StrictResponse):
    model_version: Literal["participate-v1"]
    schema_version: Literal[1]
    definition: ParticipateDefinitionResponse
    filters: ParticipateFiltersResponse
    projects: tuple[ParticipateProjectResponse, ...]
    challenges: tuple[ParticipateChallengeResponse, ...]
    activities: tuple[ParticipateActivityResponse, ...]
    sources: tuple[ParticipateSourceResponse, ...]
    freshness: ParticipateFreshnessResponse


__all__ = [
    "ParticipateActivityResponse",
    "ParticipateChallengeResponse",
    "ParticipateDefinitionResponse",
    "ParticipateExternalResourceResponse",
    "ParticipateFiltersResponse",
    "ParticipateFreshnessResponse",
    "ParticipateProjectResponse",
    "ParticipateResponse",
    "ParticipateSourceResponse",
]
