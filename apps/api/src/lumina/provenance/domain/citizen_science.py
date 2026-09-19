"""Lumina-owned normalized contracts for the Zooniverse Panoptes status snapshot."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Final

from .runtime import NormalizedPayload, ProviderPayloadCodec, validate_normalized_payload

PANOPTES_PROJECT_IDENTITIES: Final = (
    ("galaxy-zoo", 5733, "zookeeper/galaxy-zoo"),
    ("planet-hunters-tess", 7929, "nora-dot-eisner/planet-hunters-tess"),
    ("daily-minor-planet", 19413, "fulsdavid/the-daily-minor-planet"),
    ("redshift-wrangler", 13175, "jeyhansk/redshift-wrangler"),
    ("active-asteroids", 6801, "orionnau/active-asteroids"),
    ("cloudspotting-on-mars", 13718, "marek-slipski/cloudspotting-on-mars"),
)
PANOPTES_COMPONENT_IDS: Final = tuple(item[0] for item in PANOPTES_PROJECT_IDENTITIES)
PANOPTES_NORMALIZED_FIELDS: Final = ("projects", "source_evidence")

_IDENTITY_BY_COMPONENT: Final = {
    component_id: (project_id, slug)
    for component_id, project_id, slug in PANOPTES_PROJECT_IDENTITIES
}
_UTC_PATTERN: Final = re.compile(
    r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
    r"(?:\.[0-9]{1,6})?Z",
    re.ASCII,
)
_HASH_PATTERN: Final = re.compile(r"[0-9a-f]{64}", re.ASCII)


@dataclass(frozen=True, slots=True)
class PanoptesProjectStatus:
    """One exact public Panoptes project status row."""

    component_id: str
    project_id: int
    slug: str
    private: bool
    live: bool
    updated_at: str


@dataclass(frozen=True, slots=True)
class PanoptesSourceEvidence:
    """Checksum evidence for one exact component body."""

    component_id: str
    raw_sha256: str


@dataclass(frozen=True, slots=True)
class PanoptesNormalized:
    """Complete six-project atomic Panoptes snapshot."""

    projects: tuple[PanoptesProjectStatus, ...]
    source_evidence: tuple[PanoptesSourceEvidence, ...]


class PanoptesCodec(ProviderPayloadCodec):
    """Strictly encode/decode the bounded Panoptes cache representation."""

    def encode(self, normalized: object) -> NormalizedPayload:
        if type(normalized) is not PanoptesNormalized:
            raise ValueError("Panoptes normalized payload is invalid")
        _validate_normalized(normalized)
        encoded = {
            "projects": [
                {
                    "component_id": item.component_id,
                    "project_id": item.project_id,
                    "slug": item.slug,
                    "private": item.private,
                    "live": item.live,
                    "updated_at": item.updated_at,
                }
                for item in normalized.projects
            ],
            "source_evidence": [
                {
                    "component_id": item.component_id,
                    "raw_sha256": item.raw_sha256,
                }
                for item in normalized.source_evidence
            ],
        }
        return validate_normalized_payload(encoded)

    def decode(self, stored: object) -> PanoptesNormalized:
        if not isinstance(stored, Mapping) or set(stored) != {
            "projects",
            "source_evidence",
        }:
            raise ValueError("Panoptes stored payload is invalid")
        projects_raw = stored.get("projects")
        evidence_raw = stored.get("source_evidence")
        if not isinstance(projects_raw, list) or not isinstance(evidence_raw, list):
            raise ValueError("Panoptes stored payload is invalid")
        projects = tuple(_decode_project(item) for item in projects_raw)
        evidence = tuple(_decode_evidence(item) for item in evidence_raw)
        normalized = PanoptesNormalized(projects=projects, source_evidence=evidence)
        _validate_normalized(normalized)
        return normalized

    def accepts_replacement(
        self,
        current: NormalizedPayload | None,
        candidate: NormalizedPayload,
    ) -> bool:
        del current
        self.decode(candidate)
        return True


def _decode_project(value: object) -> PanoptesProjectStatus:
    if not isinstance(value, Mapping) or set(value) != {
        "component_id",
        "project_id",
        "slug",
        "private",
        "live",
        "updated_at",
    }:
        raise ValueError("Panoptes project cache row is invalid")
    if (
        type(value.get("component_id")) is not str
        or type(value.get("project_id")) is not int
        or type(value.get("slug")) is not str
        or type(value.get("private")) is not bool
        or type(value.get("live")) is not bool
        or type(value.get("updated_at")) is not str
    ):
        raise ValueError("Panoptes project cache row is invalid")
    return PanoptesProjectStatus(
        component_id=value["component_id"],
        project_id=value["project_id"],
        slug=value["slug"],
        private=value["private"],
        live=value["live"],
        updated_at=value["updated_at"],
    )


def _decode_evidence(value: object) -> PanoptesSourceEvidence:
    if not isinstance(value, Mapping) or set(value) != {"component_id", "raw_sha256"}:
        raise ValueError("Panoptes source evidence row is invalid")
    if type(value.get("component_id")) is not str or type(value.get("raw_sha256")) is not str:
        raise ValueError("Panoptes source evidence row is invalid")
    return PanoptesSourceEvidence(
        component_id=value["component_id"],
        raw_sha256=value["raw_sha256"],
    )


def _validate_normalized(value: PanoptesNormalized) -> None:
    if len(value.projects) != len(PANOPTES_PROJECT_IDENTITIES):
        raise ValueError("Panoptes project set is incomplete")
    if tuple(item.component_id for item in value.projects) != PANOPTES_COMPONENT_IDS:
        raise ValueError("Panoptes project order is invalid")
    for project in value.projects:
        expected = _IDENTITY_BY_COMPONENT.get(project.component_id)
        if expected is None or (project.project_id, project.slug) != expected:
            raise ValueError("Panoptes project identity is invalid")
        if type(project.private) is not bool or type(project.live) is not bool:
            raise ValueError("Panoptes project booleans are invalid")
        _validate_utc(project.updated_at)
    if len(value.source_evidence) != len(PANOPTES_PROJECT_IDENTITIES):
        raise ValueError("Panoptes source evidence is incomplete")
    if tuple(item.component_id for item in value.source_evidence) != PANOPTES_COMPONENT_IDS:
        raise ValueError("Panoptes source evidence order is invalid")
    for evidence in value.source_evidence:
        if _HASH_PATTERN.fullmatch(evidence.raw_sha256) is None:
            raise ValueError("Panoptes source checksum is invalid")


def _validate_utc(value: str) -> None:
    if _UTC_PATTERN.fullmatch(value) is None:
        raise ValueError("Panoptes UTC timestamp is invalid")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError:
        raise ValueError("Panoptes UTC timestamp is invalid") from None


__all__ = [
    "PANOPTES_COMPONENT_IDS",
    "PANOPTES_NORMALIZED_FIELDS",
    "PANOPTES_PROJECT_IDENTITIES",
    "PanoptesCodec",
    "PanoptesNormalized",
    "PanoptesProjectStatus",
    "PanoptesSourceEvidence",
]
