"""Read-only Participate projection over reviewed content and cached Panoptes status."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, cast

from lumina.participate.domain.artifact import (
    PARTICIPATE_MODEL_VERSION,
    PARTICIPATE_SCHEMA_VERSION,
    load_reviewed_participate_artifact,
)
from lumina.provenance.application.read import (
    ProviderSnapshot,
    ProviderSnapshotReader,
    ProviderSnapshotReadError,
)
from lumina.provenance.domain.citizen_science import PanoptesNormalized
from lumina.provenance.domain.runtime import PANOPTES_PROVIDER_CODE, CacheState

ParticipateAvailability = Literal["fresh", "stale", "unavailable"]
ParticipateProjectStatus = Literal["active", "inactive", "unavailable"]


@dataclass(frozen=True, slots=True)
class ParticipateProjectProjection:
    id: str
    title: str
    science_area: str
    summary: str
    task_type: str
    time_filter: str
    time_label: str
    device_filters: tuple[str, ...]
    device_label: str
    skill_focus: str
    knowledge_note: str
    external_url: str
    source_ids: tuple[str, ...]
    status: ParticipateProjectStatus
    status_stale: bool
    source_updated_at: str | None


@dataclass(frozen=True, slots=True)
class ParticipateFreshnessProjection:
    availability: ParticipateAvailability
    cache_state: CacheState
    retrieved_at: datetime | None
    fresh_until: datetime | None
    stale_until: datetime | None
    last_refresh_failure_code: str | None


@dataclass(frozen=True, slots=True)
class ParticipateProjection:
    model_version: str
    schema_version: int
    definition: dict[str, object]
    filters: dict[str, object]
    projects: tuple[ParticipateProjectProjection, ...]
    challenges: tuple[dict[str, object], ...]
    activities: tuple[dict[str, object], ...]
    sources: tuple[dict[str, object], ...]
    freshness: ParticipateFreshnessProjection


class ParticipateReadService:
    """Combine immutable reviewed content with one durable provider snapshot."""

    def __init__(self, reader: ProviderSnapshotReader) -> None:
        self._reader = reader
        self._artifact = load_reviewed_participate_artifact()

    async def read(self) -> ParticipateProjection:
        """Return reviewed content plus cached status without upstream network capability."""

        snapshot = await self._reader.read(PANOPTES_PROVIDER_CODE)
        if not isinstance(snapshot, ProviderSnapshot):
            raise ProviderSnapshotReadError()
        if snapshot.config.provider_code != PANOPTES_PROVIDER_CODE:
            raise ProviderSnapshotReadError()

        cache = snapshot.status.cache
        availability: ParticipateAvailability
        normalized: PanoptesNormalized | None = None
        if (
            not snapshot.status.state.enabled
            or cache is None
            or snapshot.status.cache_state in {CacheState.MISSING, CacheState.EXPIRED}
        ):
            availability = "unavailable"
        else:
            availability = "fresh" if snapshot.status.cache_state is CacheState.FRESH else "stale"
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
            if not isinstance(decoded, PanoptesNormalized):
                raise ProviderSnapshotReadError()
            normalized = decoded

        freshness = ParticipateFreshnessProjection(
            availability=availability,
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
        projects = self._project_projections(normalized, availability)
        return ParticipateProjection(
            model_version=PARTICIPATE_MODEL_VERSION,
            schema_version=PARTICIPATE_SCHEMA_VERSION,
            definition=_dict(self._artifact["definition"]),
            filters=_dict(self._artifact["filters"]),
            projects=projects,
            challenges=tuple(_dict(item) for item in _list_of_dicts(self._artifact["challenges"])),
            activities=tuple(_dict(item) for item in _list_of_dicts(self._artifact["activities"])),
            sources=tuple(_dict(item) for item in _list_of_dicts(self._artifact["sources"])),
            freshness=freshness,
        )

    def _project_projections(
        self,
        normalized: PanoptesNormalized | None,
        availability: ParticipateAvailability,
    ) -> tuple[ParticipateProjectProjection, ...]:
        status_by_id = (
            {} if normalized is None else {item.project_id: item for item in normalized.projects}
        )
        result: list[ParticipateProjectProjection] = []
        for item in _list_of_dicts(self._artifact["projects"]):
            project_id = _int(item["panoptes_project_id"])
            dynamic = status_by_id.get(project_id)
            if dynamic is None or availability == "unavailable":
                status: ParticipateProjectStatus = "unavailable"
                source_updated_at = None
            else:
                status = "active" if dynamic.live and not dynamic.private else "inactive"
                source_updated_at = dynamic.updated_at
            result.append(
                ParticipateProjectProjection(
                    id=_str(item["id"]),
                    title=_str(item["title"]),
                    science_area=_str(item["science_area"]),
                    summary=_str(item["summary"]),
                    task_type=_str(item["task_type"]),
                    time_filter=_str(item["time_filter"]),
                    time_label=_str(item["time_label"]),
                    device_filters=tuple(_list_of_strings(item["device_filters"])),
                    device_label=_str(item["device_label"]),
                    skill_focus=_str(item["skill_focus"]),
                    knowledge_note=_str(item["knowledge_note"]),
                    external_url=_str(item["external_url"]),
                    source_ids=tuple(_list_of_strings(item["source_ids"])),
                    status=status,
                    status_stale=availability == "stale" and dynamic is not None,
                    source_updated_at=source_updated_at,
                )
            )
        return tuple(result)


def _dict(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError("Participate artifact object is invalid")
    return dict(cast(dict[str, object], value))


def _list_of_dicts(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError("Participate artifact list is invalid")
    return cast(list[dict[str, object]], value)


def _list_of_strings(value: object) -> list[str]:
    if not isinstance(value, list) or any(type(item) is not str for item in value):
        raise ValueError("Participate artifact text list is invalid")
    return cast(list[str], value)


def _str(value: object) -> str:
    if type(value) is not str:
        raise ValueError("Participate artifact text is invalid")
    return value


def _int(value: object) -> int:
    if type(value) is not int:
        raise ValueError("Participate artifact integer is invalid")
    return value


__all__ = [
    "ParticipateAvailability",
    "ParticipateFreshnessProjection",
    "ParticipateProjectProjection",
    "ParticipateProjectStatus",
    "ParticipateProjection",
    "ParticipateReadService",
]
