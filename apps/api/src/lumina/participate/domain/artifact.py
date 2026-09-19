"""Strict loader for the reviewed Phase 8A Participate v1 content artifact."""

from __future__ import annotations

import json
import pkgutil
from collections.abc import Mapping
from pathlib import Path
from typing import Final
from urllib.parse import urlparse

PARTICIPATE_ARTIFACT_VERSION: Final = 1
PARTICIPATE_MODEL_VERSION: Final = "participate-v1"
PARTICIPATE_SCHEMA_VERSION: Final = 1
PARTICIPATE_ARTIFACT_PATH: Final = "data/seed/participate-v1.json"
PARTICIPATE_PACKAGED_ARTIFACT_PATH: Final = "data/participate-v1.json"

_SOURCE_URLS: Final = {
    "nasa-citizen-science-directory": "https://science.nasa.gov/citizen-science/",
    "nasa-galaxy-zoo": "https://science.nasa.gov/citizen-science/galaxy-zoo/",
    "nasa-planet-hunters-tess": ("https://science.nasa.gov/citizen-science/planet-hunters-tess/"),
    "nasa-daily-minor-planet": ("https://science.nasa.gov/citizen-science/daily-minor-planet/"),
    "nasa-redshift-wrangler": ("https://science.nasa.gov/citizen-science/redshift-wrangler/"),
    "nasa-active-asteroids": ("https://science.nasa.gov/citizen-science/active-asteroids/"),
    "nasa-cloudspotting-mars": ("https://science.nasa.gov/citizen-science/cloudspotting/"),
    "zooniverse-panoptes-docs": "https://zooniverse.github.io/panoptes/",
    "zooniverse-youth-privacy": "https://www.zooniverse.org/youth_privacy",
    "nasa-eclipse-safety": "https://science.nasa.gov/eclipses/safety/",
    "nasa-spectroscope-activity": (
        "https://science.nasa.gov/learn/heat/resource/astronomers-toolbox-spectroscope-activity/"
    ),
    "nasa-jpl-scale-solar-system": (
        "https://www.jpl.nasa.gov/edu/resources/project/make-a-scale-solar-system/"
    ),
    "nasa-lro-lunar-activities": "https://science.nasa.gov/mission/lro/lunar-activities/",
    "nasa-moon-phases": "https://moon.nasa.gov/resources/54/phases-of-the-moon/",
    "nasa-shadow-sundial": (
        "https://science.nasa.gov/learn/heat/resource/create-a-sundial-activity/"
    ),
    "nasa-meteor-showers": (
        "https://science.nasa.gov/solar-system/meteors-meteorites/meteor-showers/"
    ),
    "nasa-skywatching": "https://science.nasa.gov/skywatching/",
    "nasa-space-place-starfinder": "https://spaceplace.nasa.gov/starfinder/en/",
    "in-the-sky-planisphere": "https://in-the-sky.org/planisphere/index.php",
}

_PROJECTS: Final = {
    "galaxy-zoo": {
        "title": "Galaxy Zoo",
        "panoptes_project_id": 5733,
        "panoptes_slug": "zookeeper/galaxy-zoo",
        "external_url": "https://www.zooniverse.org/projects/zookeeper/galaxy-zoo",
        "source_ids": ["nasa-galaxy-zoo"],
    },
    "planet-hunters-tess": {
        "title": "Planet Hunters TESS",
        "panoptes_project_id": 7929,
        "panoptes_slug": "nora-dot-eisner/planet-hunters-tess",
        "external_url": ("https://www.zooniverse.org/projects/nora-dot-eisner/planet-hunters-tess"),
        "source_ids": ["nasa-planet-hunters-tess"],
    },
    "daily-minor-planet": {
        "title": "The Daily Minor Planet",
        "panoptes_project_id": 19413,
        "panoptes_slug": "fulsdavid/the-daily-minor-planet",
        "external_url": ("https://www.zooniverse.org/projects/fulsdavid/the-daily-minor-planet"),
        "source_ids": ["nasa-daily-minor-planet"],
    },
    "redshift-wrangler": {
        "title": "Redshift Wrangler",
        "panoptes_project_id": 13175,
        "panoptes_slug": "jeyhansk/redshift-wrangler",
        "external_url": ("https://www.zooniverse.org/projects/jeyhansk/redshift-wrangler"),
        "source_ids": ["nasa-redshift-wrangler"],
    },
    "active-asteroids": {
        "title": "Active Asteroids",
        "panoptes_project_id": 6801,
        "panoptes_slug": "orionnau/active-asteroids",
        "external_url": "https://www.zooniverse.org/projects/orionnau/active-asteroids",
        "source_ids": ["nasa-active-asteroids"],
    },
    "cloudspotting-on-mars": {
        "title": "Cloudspotting on Mars",
        "panoptes_project_id": 13718,
        "panoptes_slug": "marek-slipski/cloudspotting-on-mars",
        "external_url": ("https://www.zooniverse.org/projects/marek-slipski/cloudspotting-on-mars"),
        "source_ids": ["nasa-cloudspotting-mars"],
    },
}

_CHALLENGE_IDS: Final = (
    "january-moon-journal",
    "february-same-sky-revisit",
    "march-changing-shadow-log",
    "april-meteor-count",
    "may-horizon-map",
    "june-twilight-transition-log",
    "july-moon-landmark-comparison",
    "august-wide-sky-scan",
    "september-apparent-sky-motion",
    "october-dark-adaptation-comparison",
    "november-moon-light-dark-sketch",
    "december-repeat-and-compare",
)

_ACTIVITY_IDS: Final = (
    "paper-planisphere",
    "pinhole-projector",
    "moon-phase-model",
    "simple-spectroscope",
    "scale-solar-system",
    "shadow-tracking",
    "meteor-counts",
)

_FILTERS: Final = {
    "time": [
        "a_few_min",
        "about_10_min",
        "five_to_fifteen_min",
        "about_15_min",
    ],
    "device": ["web_device", "mobile_or_computer", "tablet_explicit"],
    "skill_focus": [
        "visual_classification",
        "light_curve_reading",
        "candidate_image_validation",
        "spectroscopy_data",
        "plot_reading",
    ],
}

_PROVIDER_CONTRACT: Final = {
    "provider_code": "zooniverse-panoptes",
    "api_origin": "https://www.zooniverse.org",
    "component_path_template": "/api/projects/{project_id}",
    "component_max_bytes": 32768,
    "snapshot_max_bytes": 196608,
    "refresh_interval_seconds": 21600,
    "fresh_ttl_seconds": 28800,
    "stale_if_error_seconds": 259200,
    "project_ids": [5733, 7929, 19413, 13175, 6801, 13718],
    "dynamic_fields": ["id", "slug", "private", "live", "updated_at"],
}


class ParticipateArtifactError(ValueError):
    """Raised when the reviewed Participate artifact leaves the frozen v1 contract."""


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ParticipateArtifactError()
        result[key] = value
    return result


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, Mapping) or any(not isinstance(key, str) for key in value):
        raise ParticipateArtifactError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise ParticipateArtifactError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ParticipateArtifactError()
    return value


def _string_list(value: object, *, allow_empty: bool = False) -> list[str]:
    if not isinstance(value, list) or (not value and not allow_empty):
        raise ParticipateArtifactError()
    result: list[str] = []
    for item in value:
        result.append(_string(item))
    return result


def _https_url(value: object) -> str:
    url = _string(value)
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.port
    ):
        raise ParticipateArtifactError()
    return url


def _validate_source(value: object) -> str:
    source = _mapping(value)
    _exact_keys(
        source,
        frozenset({"id", "title", "organization", "url", "claim_scope"}),
    )
    source_id = _string(source["id"])
    if source_id not in _SOURCE_URLS or _https_url(source["url"]) != _SOURCE_URLS[source_id]:
        raise ParticipateArtifactError()
    _string(source["title"])
    _string(source["organization"])
    _string(source["claim_scope"])
    return source_id


def _validate_project(value: object, source_ids: set[str]) -> str:
    project = _mapping(value)
    _exact_keys(
        project,
        frozenset(
            {
                "id",
                "title",
                "science_area",
                "summary",
                "task_type",
                "time_filter",
                "time_label",
                "device_filters",
                "device_label",
                "skill_focus",
                "knowledge_note",
                "panoptes_project_id",
                "panoptes_slug",
                "external_url",
                "source_ids",
            }
        ),
    )
    project_id = _string(project["id"])
    expected = _PROJECTS.get(project_id)
    if expected is None:
        raise ParticipateArtifactError()
    if (
        project["title"] != expected["title"]
        or project["panoptes_project_id"] != expected["panoptes_project_id"]
        or project["panoptes_slug"] != expected["panoptes_slug"]
        or project["external_url"] != expected["external_url"]
        or project["source_ids"] != expected["source_ids"]
    ):
        raise ParticipateArtifactError()
    _https_url(project["external_url"])
    if project["science_area"] not in {"astrophysics", "solar_system"}:
        raise ParticipateArtifactError()
    if project["task_type"] not in {"examining_images", "examining_data"}:
        raise ParticipateArtifactError()
    if project["time_filter"] not in _FILTERS["time"]:
        raise ParticipateArtifactError()
    devices = _string_list(project["device_filters"])
    if len(set(devices)) != len(devices) or any(item not in _FILTERS["device"] for item in devices):
        raise ParticipateArtifactError()
    if project["skill_focus"] not in _FILTERS["skill_focus"]:
        raise ParticipateArtifactError()
    for key in ("summary", "time_label", "device_label", "knowledge_note"):
        _string(project[key])
    if "No prior knowledge" not in _string(project["knowledge_note"]):
        raise ParticipateArtifactError()
    refs = _string_list(project["source_ids"])
    if any(ref not in source_ids for ref in refs):
        raise ParticipateArtifactError()
    return project_id


def _validate_challenge(value: object, source_ids: set[str]) -> tuple[str, int]:
    challenge = _mapping(value)
    _exact_keys(
        challenge,
        frozenset(
            {
                "id",
                "month",
                "title",
                "summary",
                "duration_label",
                "steps",
                "safety",
                "valid_limit_note",
                "source_ids",
            }
        ),
    )
    challenge_id = _string(challenge["id"])
    if challenge_id not in _CHALLENGE_IDS:
        raise ParticipateArtifactError()
    month = challenge["month"]
    if isinstance(month, bool) or not isinstance(month, int) or not 1 <= month <= 12:
        raise ParticipateArtifactError()
    for key in ("title", "summary", "duration_label", "valid_limit_note"):
        _string(challenge[key])
    steps = _string_list(challenge["steps"])
    safety = _string_list(challenge["safety"])
    if len(steps) < 3 or len(safety) < 2:
        raise ParticipateArtifactError()
    refs = _string_list(challenge["source_ids"])
    if any(ref not in source_ids for ref in refs):
        raise ParticipateArtifactError()
    text = " ".join([_string(challenge["summary"]), *steps, *safety]).lower()
    if "telescope" in text or "binocular" in text:
        raise ParticipateArtifactError()
    if challenge_id == "march-changing-shadow-log" and "never stare" not in text:
        raise ParticipateArtifactError()
    if (
        challenge_id == "april-meteor-count"
        and "count of zero is valid" not in _string(challenge["valid_limit_note"]).lower()
    ):
        raise ParticipateArtifactError()
    return challenge_id, month


def _validate_external_resource(value: object, activity_id: str) -> None:
    if activity_id != "paper-planisphere":
        if value is not None:
            raise ParticipateArtifactError()
        return
    resource = _mapping(value)
    _exact_keys(resource, frozenset({"label", "url"}))
    _string(resource["label"])
    if _https_url(resource["url"]) != _SOURCE_URLS["in-the-sky-planisphere"]:
        raise ParticipateArtifactError()


def _validate_activity(value: object, source_ids: set[str]) -> str:
    activity = _mapping(value)
    _exact_keys(
        activity,
        frozenset(
            {
                "id",
                "title",
                "age_guidance",
                "skill_guidance",
                "duration_label",
                "materials",
                "steps",
                "safety",
                "learning_objective",
                "expected_observation",
                "cleanup",
                "adult_supervision_note",
                "limitations",
                "source_ids",
                "external_resource",
            }
        ),
    )
    activity_id = _string(activity["id"])
    if activity_id not in _ACTIVITY_IDS:
        raise ParticipateArtifactError()
    for key in (
        "title",
        "age_guidance",
        "skill_guidance",
        "duration_label",
        "learning_objective",
        "expected_observation",
        "cleanup",
        "adult_supervision_note",
    ):
        _string(activity[key])
    materials = _string_list(activity["materials"])
    steps = _string_list(activity["steps"])
    safety = _string_list(activity["safety"])
    limitations = _string_list(activity["limitations"])
    if not materials or len(steps) < 3 or len(safety) < 2 or not limitations:
        raise ParticipateArtifactError()
    refs = _string_list(activity["source_ids"])
    if any(ref not in source_ids for ref in refs):
        raise ParticipateArtifactError()
    _validate_external_resource(activity["external_resource"], activity_id)
    safety_text = " ".join(safety).lower()
    limitations_text = " ".join(limitations).lower()
    if activity_id == "paper-planisphere" and (
        "latitude" not in limitations_text or "equator" not in limitations_text
    ):
        raise ParticipateArtifactError()
    if activity_id == "pinhole-projector" and (
        "never look at the sun through the pinhole" not in safety_text
        or "never look directly at the sun" not in safety_text
    ):
        raise ParticipateArtifactError()
    if activity_id == "simple-spectroscope" and (
        "never point the spectroscope at the sun" not in safety_text
        or "never look at the sun directly" not in safety_text
    ):
        raise ParticipateArtifactError()
    if activity_id == "shadow-tracking" and "never stare" not in safety_text:
        raise ParticipateArtifactError()
    return activity_id


def load_reviewed_participate_artifact(*, repository_root: Path | None = None) -> dict[str, object]:
    """Load and strictly validate the reviewed source artifact or packaged mirror."""

    try:
        if repository_root is None:
            raw = pkgutil.get_data("lumina", PARTICIPATE_PACKAGED_ARTIFACT_PATH)
            if raw is None:
                raise ParticipateArtifactError()
            source_text = raw.decode("utf-8", errors="strict")
        else:
            source_text = (repository_root / PARTICIPATE_ARTIFACT_PATH).read_text(encoding="utf-8")
        decoded = json.loads(
            source_text,
            object_pairs_hook=_duplicate_key_rejector,
        )
    except (
        OSError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        ParticipateArtifactError,
    ):
        raise ParticipateArtifactError() from None

    artifact = _mapping(decoded)
    _exact_keys(
        artifact,
        frozenset(
            {
                "artifact_version",
                "model_version",
                "schema_version",
                "generated_at",
                "definition",
                "filters",
                "projects",
                "provider_contract",
                "challenges",
                "activities",
                "sources",
            }
        ),
    )
    if (
        artifact["artifact_version"] != PARTICIPATE_ARTIFACT_VERSION
        or artifact["model_version"] != PARTICIPATE_MODEL_VERSION
        or artifact["schema_version"] != PARTICIPATE_SCHEMA_VERSION
    ):
        raise ParticipateArtifactError()
    _string(artifact["generated_at"])

    definition = _mapping(artifact["definition"])
    _exact_keys(
        definition,
        frozenset(
            {
                "slug",
                "title",
                "status",
                "version",
                "summary",
                "external_handoff_notice",
                "privacy_note",
                "status_unavailable_label",
                "stale_status_label",
                "references",
            }
        ),
    )
    if (
        definition["slug"] != "participate"
        or definition["title"] != "Participate"
        or definition["status"] != "ready"
        or definition["version"] != 1
    ):
        raise ParticipateArtifactError()
    for key in (
        "summary",
        "external_handoff_notice",
        "privacy_note",
        "status_unavailable_label",
        "stale_status_label",
    ):
        _string(definition[key])
    if "leaving Lumina" not in _string(
        definition["external_handoff_notice"]
    ) or "Zooniverse" not in _string(definition["external_handoff_notice"]):
        raise ParticipateArtifactError()

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(_SOURCE_URLS):
        raise ParticipateArtifactError()
    source_ids = [_validate_source(source) for source in sources]
    if source_ids != list(_SOURCE_URLS) or len(set(source_ids)) != len(source_ids):
        raise ParticipateArtifactError()
    if definition["references"] != source_ids:
        raise ParticipateArtifactError()
    source_id_set = set(source_ids)

    filters = _mapping(artifact["filters"])
    if dict(filters) != _FILTERS:
        raise ParticipateArtifactError()

    projects = artifact["projects"]
    if not isinstance(projects, list) or len(projects) != len(_PROJECTS):
        raise ParticipateArtifactError()
    project_ids = [_validate_project(project, source_id_set) for project in projects]
    if project_ids != list(_PROJECTS):
        raise ParticipateArtifactError()

    provider_contract = _mapping(artifact["provider_contract"])
    if dict(provider_contract) != _PROVIDER_CONTRACT:
        raise ParticipateArtifactError()

    challenges = artifact["challenges"]
    if not isinstance(challenges, list) or len(challenges) != len(_CHALLENGE_IDS):
        raise ParticipateArtifactError()
    challenge_pairs = [_validate_challenge(item, source_id_set) for item in challenges]
    if [item[0] for item in challenge_pairs] != list(_CHALLENGE_IDS):
        raise ParticipateArtifactError()
    if [item[1] for item in challenge_pairs] != list(range(1, 13)):
        raise ParticipateArtifactError()

    activities = artifact["activities"]
    if not isinstance(activities, list) or len(activities) != len(_ACTIVITY_IDS):
        raise ParticipateArtifactError()
    activity_ids = [_validate_activity(item, source_id_set) for item in activities]
    if activity_ids != list(_ACTIVITY_IDS):
        raise ParticipateArtifactError()
    return dict(artifact)


__all__ = [
    "PARTICIPATE_ARTIFACT_PATH",
    "PARTICIPATE_ARTIFACT_VERSION",
    "PARTICIPATE_MODEL_VERSION",
    "PARTICIPATE_PACKAGED_ARTIFACT_PATH",
    "PARTICIPATE_SCHEMA_VERSION",
    "ParticipateArtifactError",
    "load_reviewed_participate_artifact",
]
