from __future__ import annotations

import json
from pathlib import Path

import pytest
from lumina.astronomy.domain.exoplanet_systems import (
    EXOPLANET_RAW_PATH,
    ExoplanetSystemModelError,
    build_exoplanet_system_artifact,
    load_exoplanet_system_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _systems(payload: dict[str, object]) -> list[dict[str, object]]:
    systems = payload["systems"]
    assert isinstance(systems, list)
    return systems  # type: ignore[return-value]


def test_committed_artifact_is_exact_deterministic_model_output() -> None:
    assert load_exoplanet_system_artifact(
        repository_root=_REPOSITORY_ROOT
    ) == build_exoplanet_system_artifact(repository_root=_REPOSITORY_ROOT)


def test_snapshot_contains_exact_five_reviewed_hosts_and_ten_planets() -> None:
    systems = _systems(build_exoplanet_system_artifact(repository_root=_REPOSITORY_ROOT))
    assert [(system["display_name"], system["archive_planet_count"]) for system in systems] == [
        ("51 Pegasi", 1),
        ("HD 209458", 1),
        ("K2-18", 2),
        ("Kepler-186", 5),
        ("Kepler-452", 1),
    ]
    assert sum(len(system["planets"]) for system in systems) == 10


def test_known_values_and_parameter_level_references_are_preserved() -> None:
    systems = _systems(build_exoplanet_system_artifact(repository_root=_REPOSITORY_ROOT))
    kepler_186 = next(system for system in systems if system["display_name"] == "Kepler-186")
    planets = kepler_186["planets"]
    assert isinstance(planets, list)
    planet_f = next(planet for planet in planets if planet["name"] == "Kepler-186 f")
    assert planet_f["semimajor_axis_au"] == 0.432
    assert planet_f["orbital_period_days"] == 129.9441
    assert planet_f["semimajor_axis_reference"]["text"] == "Torres et al. 2015"
    assert planet_f["orbital_period_reference"]["text"] == "Torres et al. 2015"

    hd_209458 = next(system for system in systems if system["display_name"] == "HD 209458")
    planet = hd_209458["planets"][0]
    assert planet["semimajor_axis_reference"]["text"] == "Bonomo et al. 2017"
    assert planet["orbital_period_reference"]["text"] == "Stassun et al. 2017"


def test_layout_is_shared_bounded_and_never_encodes_current_position() -> None:
    payload = build_exoplanet_system_artifact(repository_root=_REPOSITORY_ROOT)
    systems = _systems(payload)
    positions = [
        planet[field]
        for system in systems
        for planet in system["planets"]
        for field in ("linear_position_percent", "log_position_percent")
    ]
    assert all(0 <= float(position) <= 100 for position in positions)
    definition = payload["definition"]
    assert isinstance(definition, dict)
    limitations = " ".join(definition["limitations"])  # type: ignore[arg-type]
    assert "not the planet's current star distance" in limitations
    assert "not orbital phase or sky position" in limitations
    assert "PSCompPars is composite" in limitations


def test_raw_snapshot_checksum_fails_closed(tmp_path: Path) -> None:
    raw_source = _REPOSITORY_ROOT / EXOPLANET_RAW_PATH
    raw_target = tmp_path / EXOPLANET_RAW_PATH
    raw_target.parent.mkdir(parents=True)
    raw_target.write_bytes(raw_source.read_bytes() + b"tampered")
    with pytest.raises(ExoplanetSystemModelError):
        build_exoplanet_system_artifact(repository_root=tmp_path)


def test_committed_json_does_not_embed_archive_html() -> None:
    payload = load_exoplanet_system_artifact(repository_root=_REPOSITORY_ROOT)
    serialized = json.dumps(payload)
    assert "<a " not in serialized
    assert "href=" not in serialized
