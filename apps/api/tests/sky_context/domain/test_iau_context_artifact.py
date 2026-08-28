"""Scientific acceptance tests for the pinned Phase 2E context products."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest
from lumina.sky_context.domain.iau_context_artifact import (
    CONSTELLATION_ARTIFACT_BYTES,
    CONSTELLATION_ARTIFACT_PATH,
    CONSTELLATION_ARTIFACT_SHA256,
    CONSTELLATION_PART_COUNT,
    CONSTELLATION_VERTEX_COUNT,
    NAMED_ANCHOR_ARTIFACT_BYTES,
    NAMED_ANCHOR_ARTIFACT_PATH,
    NAMED_ANCHOR_ARTIFACT_SHA256,
    NAMED_ANCHOR_ROW_COUNT,
    IAUContextArtifactRejected,
    parse_constellation_artifact,
    parse_named_anchor_artifact,
    validate_constellation_artifact,
    validate_iau_context_artifacts,
    validate_target_memberships,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _canonical(document: object) -> bytes:
    return (
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False) + "\n"
    ).encode("utf-8")


def _named_document() -> dict[str, object]:
    return cast(
        dict[str, object],
        json.loads((_REPOSITORY_ROOT / NAMED_ANCHOR_ARTIFACT_PATH).read_text(encoding="utf-8")),
    )


def _constellation_document() -> dict[str, object]:
    return cast(
        dict[str, object],
        json.loads((_REPOSITORY_ROOT / CONSTELLATION_ARTIFACT_PATH).read_text(encoding="utf-8")),
    )


def test_phase_2e_artifacts_are_exactly_pinned_and_join_phase_2d() -> None:
    named, constellations = validate_iau_context_artifacts()
    named_bytes = (_REPOSITORY_ROOT / NAMED_ANCHOR_ARTIFACT_PATH).read_bytes()
    constellation_bytes = (_REPOSITORY_ROOT / CONSTELLATION_ARTIFACT_PATH).read_bytes()

    assert len(named.rows) == NAMED_ANCHOR_ROW_COUNT == 236
    assert len(constellations.constellations) == 88
    assert len(constellations.target_memberships) == 5
    assert len(named_bytes) == NAMED_ANCHOR_ARTIFACT_BYTES == 79_245
    assert len(constellation_bytes) == CONSTELLATION_ARTIFACT_BYTES == 236_885
    assert hashlib.sha256(named_bytes).hexdigest() == NAMED_ANCHOR_ARTIFACT_SHA256
    assert hashlib.sha256(constellation_bytes).hexdigest() == CONSTELLATION_ARTIFACT_SHA256
    assert sum(len(item.boundary_parts) for item in constellations.constellations) == (
        CONSTELLATION_PART_COUNT
    )
    assert (
        sum(
            len(part.vertices)
            for item in constellations.constellations
            for part in item.boundary_parts
        )
        == CONSTELLATION_VERTEX_COUNT
    )
    assert {
        item.target_slug: item.constellation_abbreviation
        for item in constellations.target_memberships
    } == {
        "51-pegasi": "Peg",
        "hd-209458": "Peg",
        "k2-18": "Leo",
        "kepler-186": "Cyg",
        "kepler-452": "Cyg",
    }
    anchors = cast(list[dict[str, object]], _named_document()["anchors"])
    assert all(
        "right_ascension_degrees" not in item and "declination_degrees" not in item
        for item in anchors
    )


@pytest.mark.parametrize(
    "change",
    [
        lambda document: document["anchors"][0].update({"iau_name": ""}),
        lambda document: document["anchors"][1].update({"hip_id": 0}),
        lambda document: document["anchors"][2].update({"date_approved": "2026-02-30"}),
        lambda document: document["anchors"][3].update(
            {"gaia_crossmatch_angular_distance_arcsec": -1}
        ),
        lambda document: document["anchors"][4].update({"gaia_crossmatch_neighbour_count": 2}),
        lambda document: document["anchors"][5].update({"gaia_crossmatch_flag": 1}),
        lambda document: document["anchors"][6].update({"iau_constellation_abbreviation": "Not"}),
        lambda document: document["anchors"][7].update(
            {"gaia_crossmatch_angular_distance_arcsec": "not-a-number"}
        ),
    ],
    ids=(
        "empty-name",
        "nonpositive-hip",
        "invalid-date",
        "negative-distance",
        "multiple-neighbours",
        "ambiguous-flag",
        "unknown-constellation",
        "invalid-distance-type",
    ),
)
def test_named_anchor_parser_rejects_malformed_rows(
    change: Callable[[dict[str, object]], object],
) -> None:
    document = _named_document()
    change(document)
    with pytest.raises(IAUContextArtifactRejected):
        parse_named_anchor_artifact(_canonical(document))


def test_constellation_artifact_has_exact_official_regions_and_serpens_parts() -> None:
    review = validate_constellation_artifact()
    assert [item.abbreviation for item in review.constellations] == sorted(
        item.abbreviation for item in review.constellations
    )
    assert len({item.abbreviation for item in review.constellations}) == 88
    assert {item.abbreviation for item in review.constellations} == {
        item.abbreviation
        for item in parse_constellation_artifact(
            (_REPOSITORY_ROOT / CONSTELLATION_ARTIFACT_PATH).read_bytes()
        ).constellations
    }
    serpens = next(item for item in review.constellations if item.abbreviation == "Ser")
    assert len(serpens.boundary_parts) == 2
    assert all(
        -90 <= vertex.declination_degrees <= 90 and 0 <= vertex.right_ascension_degrees < 360
        for item in review.constellations
        for part in item.boundary_parts
        for vertex in part.vertices
    )


@pytest.mark.parametrize(
    "change",
    [
        lambda document: document["constellations"][-1].update({"abbreviation": "Nope"}),
        lambda document: document["constellations"][0]["boundary_parts"][0]["vertices"].pop(),
        lambda document: document["target_memberships"][-1].pop("target_slug"),
        lambda document: document["target_memberships"][-1].update(
            {"constellation_abbreviation": "Nope"}
        ),
    ],
    ids=(
        "unknown-abbreviation",
        "malformed-boundary",
        "malformed-mapping",
        "unknown-target-region",
    ),
)
def test_constellation_parser_rejects_malformed_geometry_or_mapping(
    change: Callable[[dict[str, object]], object],
) -> None:
    document = _constellation_document()
    change(document)
    with pytest.raises(IAUContextArtifactRejected):
        parse_constellation_artifact(_canonical(document))


def test_target_membership_validation_rejects_unknown_target_and_coordinate_drift() -> None:
    document = _constellation_document()
    memberships = cast(list[dict[str, object]], document["target_memberships"])
    memberships[-1]["target_slug"] = "unknown-target"
    review = parse_constellation_artifact(_canonical(document))
    with pytest.raises(IAUContextArtifactRejected):
        validate_target_memberships(review, repository_root=_REPOSITORY_ROOT)

    document = _constellation_document()
    memberships = cast(list[dict[str, object]], document["target_memberships"])
    memberships[-1]["right_ascension_degrees"] = (
        cast(float, memberships[-1]["right_ascension_degrees"]) + 1
    )
    review = parse_constellation_artifact(_canonical(document))
    with pytest.raises(IAUContextArtifactRejected):
        validate_target_memberships(review, repository_root=_REPOSITORY_ROOT)
