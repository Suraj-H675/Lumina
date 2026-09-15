from __future__ import annotations

import math
from pathlib import Path

import pytest
from lumina.astronomy.domain.voyager_trajectory import (
    VOYAGER_RAW_PATH,
    VoyagerTrajectoryModelError,
    build_voyager_trajectory_artifact,
    load_voyager_trajectory_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]


def _samples(payload: dict[str, object]) -> list[dict[str, object]]:
    samples = payload["trajectory_samples"]
    assert isinstance(samples, list)
    return samples  # type: ignore[return-value]


def test_committed_artifact_matches_exact_pinned_horizons_model() -> None:
    assert load_voyager_trajectory_artifact(
        repository_root=_REPOSITORY_ROOT
    ) == build_voyager_trajectory_artifact(repository_root=_REPOSITORY_ROOT)


def test_milestones_are_source_separate_from_horizons_samples() -> None:
    payload = build_voyager_trajectory_artifact(repository_root=_REPOSITORY_ROOT)
    milestones = payload["milestones"]
    assert isinstance(milestones, list)
    assert milestones[0] == {
        "date": "1977-09-05",
        "title": "Launch",
        "detail": "Voyager 1 launched from Cape Canaveral at 12:56:01 UT.",
        "source_id": "nasa-voyager-1-mission",
    }
    assert milestones[-1]["date"] == "2012-08-25"
    raw = payload["raw_snapshot"]
    assert isinstance(raw, dict)
    assert raw["start_tdb"] == "1977-09-06T00:00:00"


def test_trajectory_has_fifty_yearly_sun_centered_ecliptic_samples() -> None:
    payload = build_voyager_trajectory_artifact(repository_root=_REPOSITORY_ROOT)
    samples = _samples(payload)
    assert len(samples) == 50
    assert samples[0]["epoch_tdb"] == "A.D. 1977-Sep-06 00:00:00.0000"
    assert samples[-1]["epoch_tdb"] == "A.D. 2026-Sep-06 00:00:00.0000"
    assert samples[0]["x_au"] == 0.9679318511236246
    assert samples[-1]["z_au"] == 98.85326993344566


def test_radius_is_derived_from_xyz_and_grows_to_interstellar_scale() -> None:
    samples = _samples(build_voyager_trajectory_artifact(repository_root=_REPOSITORY_ROOT))
    for sample in (samples[0], samples[10], samples[-1]):
        expected = math.sqrt(
            float(sample["x_au"]) ** 2 + float(sample["y_au"]) ** 2 + float(sample["z_au"]) ** 2
        )
        assert math.isclose(float(sample["radius_au"]), expected, rel_tol=0, abs_tol=1e-12)
    assert float(samples[-1]["radius_au"]) > 170


def test_model_states_projection_sampling_and_trajectory_provenance_limits() -> None:
    payload = build_voyager_trajectory_artifact(repository_root=_REPOSITORY_ROOT)
    definition = payload["definition"]
    assert isinstance(definition, dict)
    limitations = " ".join(definition["limitations"])  # type: ignore[arg-type]
    assert "XY trajectory is a projection" in limitations
    assert "Annual sampling" in limitations
    assert "pre-1981 section as a rough patched-conic" in limitations
    assert "tracking data through 1992" in limitations


def test_tampered_horizons_snapshot_fails_closed(tmp_path: Path) -> None:
    source = _REPOSITORY_ROOT / VOYAGER_RAW_PATH
    target = tmp_path / VOYAGER_RAW_PATH
    target.parent.mkdir(parents=True)
    target.write_bytes(source.read_bytes() + b"tampered")
    with pytest.raises(VoyagerTrajectoryModelError):
        build_voyager_trajectory_artifact(repository_root=tmp_path)
