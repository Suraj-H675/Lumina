from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path

import pytest
from lumina.astronomy.domain.eclipse_simulator import (
    EclipseSimulatorInput,
    EclipseSimulatorModelError,
    _disk_overlap_fraction,
    calculate_eclipse_simulator,
    load_reviewed_eclipse_artifact,
)


def _dallas(at_utc: datetime = datetime(2024, 4, 8, 18, 42, tzinfo=UTC)) -> EclipseSimulatorInput:
    return EclipseSimulatorInput(
        at_utc=at_utc,
        latitude_deg=32.7767,
        longitude_deg=-96.7970,
        elevation_m=130.0,
    )


def _albuquerque(
    at_utc: datetime = datetime(2023, 10, 14, 16, 35, tzinfo=UTC),
) -> EclipseSimulatorInput:
    return EclipseSimulatorInput(
        at_utc=at_utc,
        latitude_deg=35.0844,
        longitude_deg=-106.6504,
        elevation_m=1619.0,
    )


def _minutes_between(left: datetime, right: datetime) -> float:
    return abs((left - right).total_seconds()) / 60.0


def test_dallas_2024_reference_is_total() -> None:
    result = calculate_eclipse_simulator(_dallas())

    assert result.instant.phase == "total"
    assert result.instant.shadow_region == "umbra"
    assert result.instant.obscuration_fraction == 1.0
    assert result.instant.moon_angular_radius_deg > result.instant.sun_angular_radius_deg
    assert result.instant.center_separation_deg < (
        result.instant.moon_angular_radius_deg - result.instant.sun_angular_radius_deg
    )
    assert result.instant.sun_above_geometric_horizon is True
    assert result.local_event is not None
    assert result.local_event.classification == "total"


def test_dallas_2024_shoulder_is_partial() -> None:
    result = calculate_eclipse_simulator(_dallas(datetime(2024, 4, 8, 18, 0, tzinfo=UTC)))

    assert result.instant.phase == "partial"
    assert result.instant.shadow_region == "penumbra"
    assert 0.0 < result.instant.obscuration_fraction < 1.0
    assert result.local_event is not None
    assert result.local_event.classification == "total"


def test_dallas_next_day_has_no_eclipse() -> None:
    result = calculate_eclipse_simulator(_dallas(datetime(2024, 4, 9, 18, 42, tzinfo=UTC)))

    assert result.instant.phase == "none"
    assert result.instant.shadow_region == "outside"
    assert result.instant.obscuration_fraction == 0.0
    assert result.local_event is None


def test_albuquerque_2023_reference_is_annular() -> None:
    result = calculate_eclipse_simulator(_albuquerque())

    assert result.instant.phase == "annular"
    assert result.instant.shadow_region == "antumbra"
    assert 0.0 < result.instant.obscuration_fraction < 1.0
    assert result.instant.sun_angular_radius_deg > result.instant.moon_angular_radius_deg
    assert result.local_event is not None
    assert result.local_event.classification == "annular"


def test_dallas_contacts_match_nasa_rounded_city_table() -> None:
    event = calculate_eclipse_simulator(_dallas()).local_event
    assert event is not None
    assert event.central_begin_utc is not None
    assert event.central_end_utc is not None

    nasa = {
        "partial_begin": datetime(2024, 4, 8, 17, 23, tzinfo=UTC),
        "central_begin": datetime(2024, 4, 8, 18, 40, tzinfo=UTC),
        "maximum": datetime(2024, 4, 8, 18, 42, tzinfo=UTC),
        "central_end": datetime(2024, 4, 8, 18, 44, tzinfo=UTC),
        "partial_end": datetime(2024, 4, 8, 20, 2, tzinfo=UTC),
    }
    assert _minutes_between(event.partial_begin_utc, nasa["partial_begin"]) <= 2.0
    assert _minutes_between(event.central_begin_utc, nasa["central_begin"]) <= 2.0
    assert _minutes_between(event.maximum_utc, nasa["maximum"]) <= 2.0
    assert _minutes_between(event.central_end_utc, nasa["central_end"]) <= 2.0
    assert _minutes_between(event.partial_end_utc, nasa["partial_end"]) <= 2.0


def test_albuquerque_contacts_match_nasa_rounded_city_table() -> None:
    event = calculate_eclipse_simulator(_albuquerque()).local_event
    assert event is not None
    assert event.central_begin_utc is not None
    assert event.central_end_utc is not None

    nasa = {
        "partial_begin": datetime(2023, 10, 14, 15, 13, tzinfo=UTC),
        "central_begin": datetime(2023, 10, 14, 16, 34, tzinfo=UTC),
        "maximum": datetime(2023, 10, 14, 16, 35, tzinfo=UTC),
        "central_end": datetime(2023, 10, 14, 16, 39, tzinfo=UTC),
        "partial_end": datetime(2023, 10, 14, 18, 9, tzinfo=UTC),
    }
    assert _minutes_between(event.partial_begin_utc, nasa["partial_begin"]) <= 2.0
    assert _minutes_between(event.central_begin_utc, nasa["central_begin"]) <= 2.0
    assert _minutes_between(event.maximum_utc, nasa["maximum"]) <= 3.0
    assert _minutes_between(event.central_end_utc, nasa["central_end"]) <= 2.0
    assert _minutes_between(event.partial_end_utc, nasa["partial_end"]) <= 2.0


def test_disk_overlap_limiting_cases() -> None:
    assert _disk_overlap_fraction(1.0, 0.5, 2.0) == 0.0
    assert _disk_overlap_fraction(1.0, 1.1, 0.0) == 1.0
    assert _disk_overlap_fraction(1.0, 0.5, 0.0) == pytest.approx(0.25)
    partial = _disk_overlap_fraction(1.0, 0.5, 1.0)
    assert 0.0 < partial < 0.25


def test_horizon_state_is_separate_from_phase() -> None:
    daytime_none = calculate_eclipse_simulator(_dallas(datetime(2024, 4, 9, 18, 42, tzinfo=UTC)))
    nighttime_none = calculate_eclipse_simulator(_dallas(datetime(2024, 4, 9, 6, 0, tzinfo=UTC)))

    assert daytime_none.instant.phase == nighttime_none.instant.phase == "none"
    assert daytime_none.instant.sun_above_geometric_horizon is True
    assert nighttime_none.instant.sun_above_geometric_horizon is False


def test_calculation_is_deterministic() -> None:
    inputs = _dallas(datetime(2024, 4, 9, 18, 42, tzinfo=UTC))
    assert calculate_eclipse_simulator(inputs) == calculate_eclipse_simulator(inputs)


@pytest.mark.parametrize(
    "input_factory",
    [
        lambda: EclipseSimulatorInput(
            at_utc=datetime(2024, 4, 8, 18, 42),
            latitude_deg=32.7,
            longitude_deg=-96.8,
            elevation_m=100.0,
        ),
        lambda: EclipseSimulatorInput(
            at_utc=datetime(2024, 4, 8, 18, 42, tzinfo=timezone(timedelta(hours=5, minutes=30))),
            latitude_deg=32.7,
            longitude_deg=-96.8,
            elevation_m=100.0,
        ),
        lambda: _dallas(datetime(1973, 1, 1, 23, 59, 59, tzinfo=UTC)),
        lambda: _dallas(datetime(2027, 8, 28, 0, 0, tzinfo=UTC)),
        lambda: EclipseSimulatorInput(
            at_utc=datetime(2024, 4, 8, 18, 42, tzinfo=UTC),
            latitude_deg=91.0,
            longitude_deg=0.0,
            elevation_m=0.0,
        ),
        lambda: EclipseSimulatorInput(
            at_utc=datetime(2024, 4, 8, 18, 42, tzinfo=UTC),
            latitude_deg=0.0,
            longitude_deg=181.0,
            elevation_m=0.0,
        ),
        lambda: EclipseSimulatorInput(
            at_utc=datetime(2024, 4, 8, 18, 42, tzinfo=UTC),
            latitude_deg=float("nan"),
            longitude_deg=0.0,
            elevation_m=0.0,
        ),
        lambda: EclipseSimulatorInput(
            at_utc=datetime(2024, 4, 8, 18, 42, tzinfo=UTC),
            latitude_deg=0.0,
            longitude_deg=0.0,
            elevation_m=9000.1,
        ),
    ],
)
def test_input_domain_rejects_unsupported_states(input_factory: object) -> None:
    with pytest.raises(EclipseSimulatorModelError):
        input_factory()  # type: ignore[operator]


def test_reviewed_artifact_is_strict() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_eclipse_artifact(repository_root=repository_root)

    assert artifact["model_version"] == "eclipse-simulator-v1"
    sources = artifact["sources"]
    assert isinstance(sources, list)
    source_ids = {source["id"] for source in sources if isinstance(source, dict)}
    assert source_ids == {
        "astropy-solar-system-ephemerides",
        "erfa-moon98",
        "iau-2015-resolution-b3",
        "nasa-nssdc-moon-fact-sheet",
        "nasa-eclipse-geometry",
        "nasa-eclipse-safety",
        "nasa-2024-eclipse-where-when",
        "nasa-2023-eclipse-where-when",
    }


def test_reviewed_artifact_rejects_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads((repository_root / "data/seed/eclipse-simulator-v1.json").read_text())
    artifact["constants"]["MOON_RADIUS_KM"] = 2000.0
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "eclipse-simulator-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(EclipseSimulatorModelError):
        load_reviewed_eclipse_artifact(repository_root=tmp_path)
