from __future__ import annotations

import json
from pathlib import Path

import pytest
from lumina.astronomy.domain.system_scale_compare import (
    EXOPLANET_ARTIFACT_PATH,
    SYSTEM_COMPARE_ARTIFACT_PATH,
    SystemScaleCompareModelError,
    build_system_scale_compare_artifact,
    load_system_scale_compare_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _items(payload: dict[str, object]) -> list[dict[str, object]]:
    items = payload["items"]
    assert isinstance(items, list)
    return items  # type: ignore[return-value]


def test_committed_composition_is_exact_deterministic_output() -> None:
    assert load_system_scale_compare_artifact(
        repository_root=_REPOSITORY_ROOT
    ) == build_system_scale_compare_artifact(repository_root=_REPOSITORY_ROOT)


def test_composition_contains_exact_reviewed_category_counts() -> None:
    items = _items(build_system_scale_compare_artifact(repository_root=_REPOSITORY_ROOT))
    assert len(items) == 68
    assert sum(item["kind"] == "solar-mean-distance" for item in items) == 8
    assert sum(item["kind"] == "exoplanet-semimajor-axis" for item in items) == 10
    assert sum(item["kind"] == "voyager-radius" for item in items) == 50


def test_default_references_keep_distinct_quantity_semantics() -> None:
    payload = build_system_scale_compare_artifact(repository_root=_REPOSITORY_ROOT)
    items = {item["id"]: item for item in _items(payload)}
    assert items["solar:earth"]["value_au"] == 1.0
    assert items["solar:earth"]["quantity_label"] == "Mean distance from the Sun"
    assert items["exoplanet:kepler-452-b"]["value_au"] == 1.046
    assert items["exoplanet:kepler-452-b"]["quantity_label"] == "Orbit semi-major axis"
    assert float(items["voyager:2026"]["value_au"]) > 170
    assert items["voyager:2026"]["quantity_label"] == "Heliocentric position-vector magnitude"
    assert {item["detail_href"] for item in items.values()} == {
        "/explore/solar-system",
        "/explore/exoplanet-systems",
        "/explore/missions/voyager-1",
    }


def test_shared_axis_is_bounded_and_earth_reference_ratio_is_unit_arithmetic_only() -> None:
    payload = build_system_scale_compare_artifact(repository_root=_REPOSITORY_ROOT)
    items = _items(payload)
    assert all(0 < float(item["linear_position_percent"]) <= 100 for item in items)
    assert all(0 <= float(item["log_position_percent"]) <= 100 for item in items)
    assert all(float(item["earth_reference_ratio"]) == float(item["value_au"]) for item in items)
    definition = payload["definition"]
    assert isinstance(definition, dict)
    limits = " ".join(definition["limitations"])  # type: ignore[arg-type]
    assert "distinct quantities" in limits
    assert "does not make the quantities interchangeable" in limits
    assert "does not rank, score, recommend" in limits


def test_composition_fails_closed_when_upstream_model_version_drifts(tmp_path: Path) -> None:
    for relative in (
        "data/seed/solar-system-distance-v1.json",
        "data/seed/exoplanet-system-layout-v1.json",
        "data/seed/voyager-1-trajectory-v1.json",
    ):
        source = _REPOSITORY_ROOT / relative
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    exoplanet_path = tmp_path / EXOPLANET_ARTIFACT_PATH
    payload = json.loads(exoplanet_path.read_text(encoding="utf-8"))
    payload["model_version"] = "unexpected-v2"
    exoplanet_path.write_text(json.dumps(payload), encoding="utf-8")
    with pytest.raises(SystemScaleCompareModelError):
        build_system_scale_compare_artifact(repository_root=tmp_path)


def test_artifact_path_is_not_overwritten_by_test_fixture() -> None:
    assert (_REPOSITORY_ROOT / SYSTEM_COMPARE_ARTIFACT_PATH).is_file()
