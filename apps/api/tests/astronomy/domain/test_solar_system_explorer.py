from __future__ import annotations

import math
from pathlib import Path
from typing import cast

import pytest
from lumina.astronomy.domain.solar_system_explorer import (
    SOLAR_SYSTEM_ARTIFACT_VERSION,
    SOLAR_SYSTEM_MODEL_VERSION,
    SOLAR_SYSTEM_SCHEMA_VERSION,
    PlanetDistanceInput,
    SolarSystemExplorerModelError,
    build_solar_system_distance_artifact,
    load_solar_system_distance_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _bodies(payload: dict[str, object]) -> list[dict[str, object]]:
    bodies = payload["bodies"]
    assert isinstance(bodies, list)
    return cast(list[dict[str, object]], bodies)


def test_reviewed_artifact_is_exact_deterministic_model_output() -> None:
    committed = load_solar_system_distance_artifact(repository_root=_REPOSITORY_ROOT)
    assert committed == build_solar_system_distance_artifact()
    assert committed["artifact_version"] == SOLAR_SYSTEM_ARTIFACT_VERSION
    assert committed["model_version"] == SOLAR_SYSTEM_MODEL_VERSION
    assert committed["schema_version"] == SOLAR_SYSTEM_SCHEMA_VERSION


def test_reviewed_body_order_and_distances_match_nasa_reference() -> None:
    bodies = _bodies(build_solar_system_distance_artifact())
    assert [body["id"] for body in bodies] == [
        "sun",
        "mercury",
        "venus",
        "earth",
        "mars",
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
    ]
    assert [body["mean_distance_au"] for body in bodies[1:]] == [
        0.387,
        0.723,
        1.0,
        1.524,
        5.2,
        9.58,
        19.2,
        30.05,
    ]


def test_linear_and_log_positions_are_monotonic_and_bounded() -> None:
    planets = _bodies(build_solar_system_distance_artifact())[1:]
    linear = [cast(float, body["linear_position_percent"]) for body in planets]
    logarithmic = [cast(float, body["log_position_percent"]) for body in planets]
    assert linear == sorted(linear)
    assert logarithmic == sorted(logarithmic)
    assert 0 < linear[0] < linear[-1] == 100.0
    assert logarithmic[0] == 0.0
    assert logarithmic[-1] == 100.0
    assert math.isclose(linear[2], 1 / 30.05 * 100, rel_tol=0, abs_tol=1e-12)


def test_model_explicitly_rejects_false_spatial_semantics() -> None:
    payload = build_solar_system_distance_artifact()
    definition = payload["definition"]
    assert isinstance(definition, dict)
    assumptions = " ".join(cast(list[str], definition["assumptions"]))
    limitations = " ".join(cast(list[str], definition["limitations"]))
    assert "does not compute or display current planetary positions" in assumptions
    assert "uniform presentation size" in assumptions
    assert "not an ephemeris" in limitations
    assert "logarithmic view intentionally distorts linear spacing" in limitations


def test_sources_are_https_nasa_and_claim_scope_is_bounded() -> None:
    payload = build_solar_system_distance_artifact()
    sources = payload["sources"]
    assert isinstance(sources, list)
    assert len(sources) == 2
    for source in sources:
        assert isinstance(source, dict)
        assert str(source["url"]).startswith("https://science.nasa.gov/")
        assert str(source["citation"])
        assert str(source["claim_scope"])


def test_invalid_reviewed_planet_input_fails_closed() -> None:
    with pytest.raises(SolarSystemExplorerModelError):
        PlanetDistanceInput("earth", "Earth", "terrestrial", 0.0, 8.3, "minutes")
    with pytest.raises(SolarSystemExplorerModelError):
        PlanetDistanceInput("pluto", "Pluto", "terrestrial", 39.0, 5.5, "hours")


def test_incomplete_or_reordered_planet_set_fails_closed() -> None:
    earth = PlanetDistanceInput("earth", "Earth", "terrestrial", 1.0, 8.3, "minutes")
    with pytest.raises(SolarSystemExplorerModelError):
        build_solar_system_distance_artifact((earth,))
