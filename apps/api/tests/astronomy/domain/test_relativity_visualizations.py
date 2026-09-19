from __future__ import annotations

import json
import math
from itertools import pairwise
from pathlib import Path

import pytest
from lumina.astronomy.domain.relativity_visualizations import (
    MAX_PROPER_LENGTH_M,
    MAX_PROPER_TIME_S,
    MAX_RELATIVE_SPEED_FRACTION_C,
    MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
    MIN_PROPER_LENGTH_M,
    MIN_PROPER_TIME_S,
    MIN_RELATIVE_SPEED_FRACTION_C,
    MIN_SIMULTANEOUS_EVENT_SEPARATION_M,
    SPEED_OF_LIGHT_M_S,
    RelativityVisualizationsInput,
    RelativityVisualizationsModelError,
    calculate_relativity_visualizations,
    load_reviewed_relativity_visualizations_artifact,
)


def _input(
    *,
    relative_speed_fraction_c: float = 0.6,
    proper_time_s: float = 10.0,
    proper_length_m: float = 100.0,
    simultaneous_event_separation_m: float = SPEED_OF_LIGHT_M_S,
) -> RelativityVisualizationsInput:
    return RelativityVisualizationsInput(
        relative_speed_fraction_c=relative_speed_fraction_c,
        proper_time_s=proper_time_s,
        proper_length_m=proper_length_m,
        simultaneous_event_separation_m=simultaneous_event_separation_m,
    )


def test_exact_beta_point_six_reference_case() -> None:
    result = calculate_relativity_visualizations(_input())
    assert result.relative_speed_m_s == pytest.approx(0.6 * SPEED_OF_LIGHT_M_S, rel=0, abs=1e-8)
    assert result.lorentz_factor == pytest.approx(1.25, rel=0, abs=1e-15)
    assert result.dilated_time_s == pytest.approx(12.5, rel=0, abs=1e-14)
    assert result.contracted_length_m == pytest.approx(80.0, rel=0, abs=1e-13)
    assert result.simultaneity_offset_s == pytest.approx(-0.75, rel=0, abs=1e-15)


def test_zero_speed_is_identity_and_preserves_simultaneity() -> None:
    result = calculate_relativity_visualizations(_input(relative_speed_fraction_c=0.0))
    assert result.relative_speed_m_s == 0.0
    assert result.lorentz_factor == 1.0
    assert result.dilated_time_s == 10.0
    assert result.contracted_length_m == 100.0
    assert result.simultaneity_offset_s == 0.0
    assert "remain simultaneous" in result.simultaneity_interpretation


def test_zero_separation_preserves_simultaneity_at_nonzero_speed() -> None:
    result = calculate_relativity_visualizations(_input(simultaneous_event_separation_m=0.0))
    assert result.simultaneity_offset_s == 0.0
    assert "remain simultaneous" in result.simultaneity_interpretation


def test_maximum_speed_bound_remains_finite() -> None:
    result = calculate_relativity_visualizations(
        _input(
            relative_speed_fraction_c=MAX_RELATIVE_SPEED_FRACTION_C,
            proper_time_s=MAX_PROPER_TIME_S,
            proper_length_m=MAX_PROPER_LENGTH_M,
            simultaneous_event_separation_m=MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
        )
    )
    assert all(
        math.isfinite(value)
        for value in (
            result.relative_speed_m_s,
            result.lorentz_factor,
            result.dilated_time_s,
            result.contracted_length_m,
            result.simultaneity_offset_s,
        )
    )
    assert result.lorentz_factor > 7.0
    assert result.relative_speed_m_s < SPEED_OF_LIGHT_M_S
    assert result.simultaneity_offset_s < 0.0


@pytest.mark.parametrize("beta", [0.0, 0.1, 0.3, 0.6, 0.8, 0.95, 0.99])
def test_time_dilation_and_length_contraction_ordering(beta: float) -> None:
    result = calculate_relativity_visualizations(_input(relative_speed_fraction_c=beta))
    assert result.lorentz_factor >= 1.0
    assert result.dilated_time_s >= result.inputs.proper_time_s
    assert 0.0 < result.contracted_length_m <= result.inputs.proper_length_m
    if beta > 0.0:
        assert result.lorentz_factor > 1.0
        assert result.dilated_time_s > result.inputs.proper_time_s
        assert result.contracted_length_m < result.inputs.proper_length_m


def test_gamma_is_monotonic_over_representative_reviewed_samples() -> None:
    betas = [0.0, 0.1, 0.3, 0.6, 0.8, 0.95, 0.99]
    gammas = [
        calculate_relativity_visualizations(_input(relative_speed_fraction_c=beta)).lorentz_factor
        for beta in betas
    ]
    assert gammas == sorted(gammas)
    assert all(right > left for left, right in pairwise(gammas))


@pytest.mark.parametrize("beta", [0.1, 0.6, 0.99])
def test_positive_beta_and_positive_separation_make_b_earlier_in_s_prime(beta: float) -> None:
    result = calculate_relativity_visualizations(_input(relative_speed_fraction_c=beta))
    assert result.simultaneity_offset_s < 0.0
    assert "B at +x occurs earlier" in result.simultaneity_interpretation


def test_fixed_beta_inputs_scale_linearly() -> None:
    base = calculate_relativity_visualizations(_input())
    doubled = calculate_relativity_visualizations(
        _input(
            proper_time_s=20.0,
            proper_length_m=200.0,
            simultaneous_event_separation_m=2.0 * SPEED_OF_LIGHT_M_S,
        )
    )
    assert doubled.lorentz_factor == base.lorentz_factor
    assert doubled.dilated_time_s == pytest.approx(2.0 * base.dilated_time_s, rel=0, abs=1e-14)
    assert doubled.contracted_length_m == pytest.approx(
        2.0 * base.contracted_length_m, rel=0, abs=1e-13
    )
    assert doubled.simultaneity_offset_s == pytest.approx(
        2.0 * base.simultaneity_offset_s, rel=0, abs=1e-15
    )


def test_model_notes_keep_frame_and_scope_boundaries_explicit() -> None:
    result = calculate_relativity_visualizations(_input())
    assert "same position" in result.time_dilation_note
    assert "simultaneous endpoint positions" in result.length_contraction_note
    assert "not a photographic appearance" in result.length_contraction_note
    assert "fixed reviewed normalized" in result.light_cone_note
    assert "general relativity" in result.model_note
    assert "gravitational-redshift calculations" in result.model_note


def test_result_is_exactly_deterministic() -> None:
    inputs = _input()
    assert calculate_relativity_visualizations(inputs) == calculate_relativity_visualizations(
        inputs
    )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("relative_speed_fraction_c", -0.001),
        ("relative_speed_fraction_c", 0.990001),
        ("proper_time_s", MIN_PROPER_TIME_S / 10.0),
        ("proper_time_s", MAX_PROPER_TIME_S * 10.0),
        ("proper_length_m", MIN_PROPER_LENGTH_M / 10.0),
        ("proper_length_m", MAX_PROPER_LENGTH_M * 10.0),
        ("simultaneous_event_separation_m", -1.0),
        (
            "simultaneous_event_separation_m",
            MAX_SIMULTANEOUS_EVENT_SEPARATION_M + 1.0,
        ),
        ("relative_speed_fraction_c", float("nan")),
        ("proper_time_s", float("inf")),
        ("proper_length_m", float("-inf")),
        ("relative_speed_fraction_c", True),
        ("proper_time_s", True),
    ],
)
def test_input_domain_rejects_invalid_states(field: str, value: object) -> None:
    kwargs: dict[str, object] = {
        "relative_speed_fraction_c": 0.6,
        "proper_time_s": 10.0,
        "proper_length_m": 100.0,
        "simultaneous_event_separation_m": SPEED_OF_LIGHT_M_S,
    }
    kwargs[field] = value
    with pytest.raises(RelativityVisualizationsModelError):
        RelativityVisualizationsInput(**kwargs)  # type: ignore[arg-type]


@pytest.mark.parametrize("value", [None, "0.6", [], {}, object()])
def test_numeric_input_types_are_strict(value: object) -> None:
    with pytest.raises(RelativityVisualizationsModelError):
        RelativityVisualizationsInput(
            relative_speed_fraction_c=value,  # type: ignore[arg-type]
            proper_time_s=10.0,
            proper_length_m=100.0,
            simultaneous_event_separation_m=SPEED_OF_LIGHT_M_S,
        )


def test_public_boundaries_are_accepted_exactly() -> None:
    result = calculate_relativity_visualizations(
        RelativityVisualizationsInput(
            relative_speed_fraction_c=MIN_RELATIVE_SPEED_FRACTION_C,
            proper_time_s=MIN_PROPER_TIME_S,
            proper_length_m=MIN_PROPER_LENGTH_M,
            simultaneous_event_separation_m=MIN_SIMULTANEOUS_EVENT_SEPARATION_M,
        )
    )
    assert result.lorentz_factor == 1.0
    calculate_relativity_visualizations(
        RelativityVisualizationsInput(
            relative_speed_fraction_c=MAX_RELATIVE_SPEED_FRACTION_C,
            proper_time_s=MAX_PROPER_TIME_S,
            proper_length_m=MAX_PROPER_LENGTH_M,
            simultaneous_event_separation_m=MAX_SIMULTANEOUS_EVENT_SEPARATION_M,
        )
    )


def test_calculation_requires_validated_input_type() -> None:
    with pytest.raises(RelativityVisualizationsModelError):
        calculate_relativity_visualizations(object())  # type: ignore[arg-type]


def test_reviewed_artifact_is_strict_and_matches_frozen_contract() -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = load_reviewed_relativity_visualizations_artifact(repository_root=repository_root)
    assert artifact["model_version"] == "relativity-visualizations-v1"
    constants = artifact["constants"]
    assert isinstance(constants, dict)
    assert constants["SPEED_OF_LIGHT_M_S"] == SPEED_OF_LIGHT_M_S
    light_cone = artifact["light_cone"]
    assert isinstance(light_cone, dict)
    assert len(light_cone["segments"]) == 4


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("SPEED_OF_LIGHT_M_S", 299_792_457.0),
        ("MAX_RELATIVE_SPEED_FRACTION_C", 0.999),
        ("MIN_PROPER_TIME_S", 0.0),
    ],
)
def test_reviewed_artifact_rejects_constant_mutation(
    tmp_path: Path,
    key: str,
    value: object,
) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads(
        (repository_root / "data/seed/relativity-visualizations-v1.json").read_text()
    )
    artifact["constants"][key] = value
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "relativity-visualizations-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(RelativityVisualizationsModelError):
        load_reviewed_relativity_visualizations_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_source_light_cone_or_preset_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads(
        (repository_root / "data/seed/relativity-visualizations-v1.json").read_text()
    )
    artifact["sources"][0]["url"] = "https://example.com/not-reviewed"
    artifact["light_cone"]["segments"][0]["x1"] = -0.9
    artifact["preset"]["relative_speed_fraction_c"] = 1.0
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "relativity-visualizations-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(RelativityVisualizationsModelError):
        load_reviewed_relativity_visualizations_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_reference_validation_mutation(tmp_path: Path) -> None:
    repository_root = Path(__file__).resolve().parents[5]
    artifact = json.loads(
        (repository_root / "data/seed/relativity-visualizations-v1.json").read_text()
    )
    artifact["scientific_validation"]["reference_validation_case"]["expected"]["lorentz_factor"] = (
        1.3
    )
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "relativity-visualizations-v1.json").write_text(json.dumps(artifact))
    with pytest.raises(RelativityVisualizationsModelError):
        load_reviewed_relativity_visualizations_artifact(repository_root=tmp_path)


def test_reviewed_artifact_rejects_duplicate_json_keys(tmp_path: Path) -> None:
    target = tmp_path / "data/seed"
    target.mkdir(parents=True)
    (target / "relativity-visualizations-v1.json").write_text(
        '{"artifact_version":1,"artifact_version":1}'
    )
    with pytest.raises(RelativityVisualizationsModelError):
        load_reviewed_relativity_visualizations_artifact(repository_root=tmp_path)
