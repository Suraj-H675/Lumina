from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import pytest
from lumina.participate.domain.artifact import (
    PARTICIPATE_ARTIFACT_PATH,
    PARTICIPATE_PACKAGED_ARTIFACT_PATH,
    ParticipateArtifactError,
    load_reviewed_participate_artifact,
)


def _repository_root() -> Path:
    return Path(__file__).resolve().parents[5]


def _artifact() -> dict[str, Any]:
    return cast(
        dict[str, Any],
        json.loads((_repository_root() / PARTICIPATE_ARTIFACT_PATH).read_text()),
    )


def _write(tmp_path: Path, artifact: dict[str, Any]) -> None:
    target = tmp_path / PARTICIPATE_ARTIFACT_PATH
    target.parent.mkdir(parents=True)
    target.write_text(json.dumps(artifact), encoding="utf-8")


def test_reviewed_participate_artifact_matches_frozen_v1_contract() -> None:
    artifact = load_reviewed_participate_artifact(repository_root=_repository_root())

    assert artifact["model_version"] == "participate-v1"
    projects = artifact["projects"]
    challenges = artifact["challenges"]
    activities = artifact["activities"]
    sources = artifact["sources"]
    assert isinstance(projects, list)
    assert isinstance(challenges, list)
    assert isinstance(activities, list)
    assert isinstance(sources, list)
    assert len(projects) == 6
    assert len(challenges) == 12
    assert len(activities) == 7
    assert len(sources) == 19


def test_packaged_runtime_artifact_is_byte_identical_and_loads_through_same_validator() -> None:
    repository_root = _repository_root()
    reviewed = (repository_root / PARTICIPATE_ARTIFACT_PATH).read_bytes()
    packaged = (
        repository_root / "apps/api/src/lumina" / PARTICIPATE_PACKAGED_ARTIFACT_PATH
    ).read_bytes()

    assert packaged == reviewed
    assert load_reviewed_participate_artifact() == load_reviewed_participate_artifact(
        repository_root=repository_root
    )


def test_project_identities_are_exact_and_ordered() -> None:
    artifact = load_reviewed_participate_artifact(repository_root=_repository_root())
    projects = artifact["projects"]
    assert isinstance(projects, list)
    assert [
        (
            project["id"],
            project["panoptes_project_id"],
            project["panoptes_slug"],
        )
        for project in projects
    ] == [
        ("galaxy-zoo", 5733, "zookeeper/galaxy-zoo"),
        ("planet-hunters-tess", 7929, "nora-dot-eisner/planet-hunters-tess"),
        ("daily-minor-planet", 19413, "fulsdavid/the-daily-minor-planet"),
        ("redshift-wrangler", 13175, "jeyhansk/redshift-wrangler"),
        ("active-asteroids", 6801, "orionnau/active-asteroids"),
        (
            "cloudspotting-on-mars",
            13718,
            "marek-slipski/cloudspotting-on-mars",
        ),
    ]


def test_challenges_cover_each_calendar_month_once() -> None:
    artifact = load_reviewed_participate_artifact(repository_root=_repository_root())
    challenges = artifact["challenges"]
    assert isinstance(challenges, list)
    assert [challenge["month"] for challenge in challenges] == list(range(1, 13))
    assert len({challenge["id"] for challenge in challenges}) == 12


def test_activities_match_the_required_phase_8a_set() -> None:
    artifact = load_reviewed_participate_artifact(repository_root=_repository_root())
    activities = artifact["activities"]
    assert isinstance(activities, list)
    assert [activity["id"] for activity in activities] == [
        "paper-planisphere",
        "pinhole-projector",
        "moon-phase-model",
        "simple-spectroscope",
        "scale-solar-system",
        "shadow-tracking",
        "meteor-counts",
    ]


def test_provider_contract_keeps_existing_framework_limits_intact() -> None:
    artifact = load_reviewed_participate_artifact(repository_root=_repository_root())
    provider = artifact["provider_contract"]
    assert isinstance(provider, dict)
    assert provider == {
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


@pytest.mark.parametrize(
    ("source_id", "replacement"),
    [
        ("nasa-galaxy-zoo", "https://example.com/galaxy-zoo"),
        ("zooniverse-panoptes-docs", "https://example.com/api"),
        ("in-the-sky-planisphere", "https://example.com/planisphere"),
    ],
)
def test_artifact_rejects_source_url_drift(
    tmp_path: Path,
    source_id: str,
    replacement: str,
) -> None:
    artifact = _artifact()
    source = next(source for source in artifact["sources"] if source["id"] == source_id)
    source["url"] = replacement
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("panoptes_project_id", 999999),
        ("panoptes_slug", "invented/project"),
        ("external_url", "https://www.zooniverse.org/projects/invented/project"),
        ("source_ids", ["nasa-citizen-science-directory"]),
    ],
)
def test_artifact_rejects_pinned_project_identity_drift(
    tmp_path: Path,
    field: str,
    replacement: object,
) -> None:
    artifact = _artifact()
    artifact["projects"][0][field] = replacement
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


@pytest.mark.parametrize(
    ("field", "replacement"),
    [
        ("component_max_bytes", 65536),
        ("snapshot_max_bytes", 1048576),
        ("refresh_interval_seconds", 60),
        ("fresh_ttl_seconds", 60),
        ("stale_if_error_seconds", 999999),
        ("project_ids", [5733]),
        ("dynamic_fields", ["id", "display_name", "description"]),
    ],
)
def test_artifact_rejects_provider_contract_expansion(
    tmp_path: Path,
    field: str,
    replacement: object,
) -> None:
    artifact = _artifact()
    artifact["provider_contract"][field] = replacement
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_challenge_month_or_order_drift(tmp_path: Path) -> None:
    artifact = _artifact()
    artifact["challenges"][0]["month"] = 2
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_optics_in_observing_challenges(tmp_path: Path) -> None:
    artifact = _artifact()
    artifact["challenges"][7]["steps"][0] = "Use binoculars to scan a broad part of the sky."
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_removed_pinhole_solar_safety(tmp_path: Path) -> None:
    artifact = _artifact()
    activity = next(
        activity for activity in artifact["activities"] if activity["id"] == "pinhole-projector"
    )
    activity["safety"] = [
        "Use the projector carefully.",
        "Ask for help if needed.",
    ]
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_removed_spectroscope_solar_safety(tmp_path: Path) -> None:
    artifact = _artifact()
    activity = next(
        activity for activity in artifact["activities"] if activity["id"] == "simple-spectroscope"
    )
    activity["safety"] = [
        "Use safe light sources.",
        "Handle scissors carefully.",
    ]
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_planisphere_latitude_or_external_link_drift(
    tmp_path: Path,
) -> None:
    artifact = _artifact()
    activity = next(
        activity for activity in artifact["activities"] if activity["id"] == "paper-planisphere"
    )
    activity["limitations"] = ["Use the chart anywhere."]
    activity["external_resource"]["url"] = "https://example.com/planisphere.pdf"
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_external_resource_on_other_activity(tmp_path: Path) -> None:
    artifact = _artifact()
    activity = next(
        activity for activity in artifact["activities"] if activity["id"] == "meteor-counts"
    )
    activity["external_resource"] = {
        "label": "Unexpected",
        "url": "https://example.com/",
    }
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_filter_vocabulary_drift(tmp_path: Path) -> None:
    artifact = _artifact()
    artifact["filters"]["skill_focus"].append("expert_only")
    _write(tmp_path, artifact)
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)


def test_artifact_rejects_duplicate_json_keys(tmp_path: Path) -> None:
    target = tmp_path / PARTICIPATE_ARTIFACT_PATH
    target.parent.mkdir(parents=True)
    target.write_text('{"artifact_version":1,"artifact_version":1}', encoding="utf-8")
    with pytest.raises(ParticipateArtifactError):
        load_reviewed_participate_artifact(repository_root=tmp_path)
