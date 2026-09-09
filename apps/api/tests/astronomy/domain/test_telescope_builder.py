from __future__ import annotations

import json
from pathlib import Path
from typing import cast

import lumina.astronomy.domain.telescope_builder as telescope_builder
import pytest
from lumina.astronomy.domain.telescope_builder import (
    OpticalModifierKind,
    TelescopeBuilderInput,
    TelescopeBuilderModelError,
    TelescopeType,
    calculate_telescope_builder,
    load_reviewed_telescope_builder_artifact,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
_ANGLE_TOLERANCE = 1e-9
_LENGTH_TOLERANCE = 1e-9
_RATIO_RELATIVE_TOLERANCE = 1e-12


def _input(
    *,
    aperture: float = 100.0,
    telescope_focal_length: float = 1000.0,
    telescope_type: str = "refractor",
    eyepiece_focal_length: float = 20.0,
    apparent_field: float = 50.0,
    modifier_kind: str = "none",
    modifier_factor: float = 1.0,
    target_size: float = 30.0,
) -> TelescopeBuilderInput:
    return TelescopeBuilderInput(
        aperture_mm=aperture,
        telescope_focal_length_mm=telescope_focal_length,
        telescope_type=cast(TelescopeType, telescope_type),
        eyepiece_focal_length_mm=eyepiece_focal_length,
        eyepiece_apparent_field_deg=apparent_field,
        optical_modifier_kind=cast(OpticalModifierKind, modifier_kind),
        optical_modifier_factor=modifier_factor,
        target_angular_size_arcmin=target_size,
    )


def test_default_case_matches_reviewed_literal_fixture() -> None:
    result = calculate_telescope_builder(_input())

    assert result.native_focal_ratio == pytest.approx(10.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert result.effective_focal_ratio == pytest.approx(10.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert result.effective_focal_length_mm == pytest.approx(1000.0, abs=_LENGTH_TOLERANCE)
    assert result.magnification_x == pytest.approx(50.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert result.approx_true_field_deg == pytest.approx(1.0, abs=_ANGLE_TOLERANCE)
    assert result.exit_pupil_mm == pytest.approx(2.0, abs=_LENGTH_TOLERANCE)
    assert result.dawes_limit_arcsec == pytest.approx(1.16, abs=_ANGLE_TOLERANCE)
    assert result.rayleigh_limit_arcsec == pytest.approx(1.3840368499, abs=_ANGLE_TOLERANCE)
    assert result.ideal_light_gathering_ratio_vs_7mm_pupil == pytest.approx(
        204.0816326531,
        rel=_RATIO_RELATIVE_TOLERANCE,
    )
    assert result.target_angular_size_deg == pytest.approx(0.5, abs=_ANGLE_TOLERANCE)
    assert result.target_field_fraction == pytest.approx(0.5, abs=_RATIO_RELATIVE_TOLERANCE)
    assert result.target_fit == "fits"
    assert result.warning_codes == ()


def test_focal_modifier_changes_focal_length_derived_outputs_only() -> None:
    default = calculate_telescope_builder(_input())
    barlow = calculate_telescope_builder(_input(modifier_kind="barlow", modifier_factor=2.0))
    reducer = calculate_telescope_builder(_input(modifier_kind="reducer", modifier_factor=0.5))

    assert barlow.effective_focal_length_mm == pytest.approx(2000.0, abs=_LENGTH_TOLERANCE)
    assert barlow.native_focal_ratio == pytest.approx(10.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert barlow.effective_focal_ratio == pytest.approx(20.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert barlow.magnification_x == pytest.approx(100.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert barlow.approx_true_field_deg == pytest.approx(0.5, abs=_ANGLE_TOLERANCE)
    assert barlow.exit_pupil_mm == pytest.approx(1.0, abs=_LENGTH_TOLERANCE)
    assert barlow.target_field_fraction == pytest.approx(1.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert barlow.target_fit == "fits"
    assert reducer.effective_focal_length_mm == pytest.approx(500.0, abs=_LENGTH_TOLERANCE)
    assert reducer.effective_focal_ratio == pytest.approx(5.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert reducer.magnification_x == pytest.approx(25.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert reducer.approx_true_field_deg == pytest.approx(2.0, abs=_ANGLE_TOLERANCE)
    assert reducer.exit_pupil_mm == pytest.approx(4.0, abs=_LENGTH_TOLERANCE)
    assert reducer.target_field_fraction == pytest.approx(0.25, rel=_RATIO_RELATIVE_TOLERANCE)
    for modified in (barlow, reducer):
        assert modified.dawes_limit_arcsec == default.dawes_limit_arcsec
        assert modified.rayleigh_limit_arcsec == default.rayleigh_limit_arcsec
        assert modified.ideal_light_gathering_ratio_vs_7mm_pupil == (
            default.ideal_light_gathering_ratio_vs_7mm_pupil
        )


def test_aperture_scaling_preserves_magnification_and_scales_reference_limits() -> None:
    result = calculate_telescope_builder(_input(aperture=200.0))

    assert result.magnification_x == pytest.approx(50.0, abs=_RATIO_RELATIVE_TOLERANCE)
    assert result.approx_true_field_deg == pytest.approx(1.0, abs=_ANGLE_TOLERANCE)
    assert result.exit_pupil_mm == pytest.approx(4.0, abs=_LENGTH_TOLERANCE)
    assert result.dawes_limit_arcsec == pytest.approx(0.58, abs=_ANGLE_TOLERANCE)
    assert result.rayleigh_limit_arcsec == pytest.approx(0.69201842496, abs=_ANGLE_TOLERANCE)
    assert result.ideal_light_gathering_ratio_vs_7mm_pupil == pytest.approx(
        816.3265306122,
        rel=_RATIO_RELATIVE_TOLERANCE,
    )


def test_warning_thresholds_are_strict_and_valid_configurations_are_not_rejected() -> None:
    high = calculate_telescope_builder(_input(eyepiece_focal_length=4.0))
    boundary = calculate_telescope_builder(_input(eyepiece_focal_length=5.0))
    large = calculate_telescope_builder(
        _input(telescope_focal_length=500.0, eyepiece_focal_length=50.0)
    )

    assert high.magnification_x == pytest.approx(250.0)
    assert high.exit_pupil_mm == pytest.approx(0.4)
    assert high.warning_codes == (
        "high_magnification_guideline",
        "very_small_exit_pupil",
    )
    assert boundary.magnification_x == pytest.approx(200.0)
    assert boundary.exit_pupil_mm == pytest.approx(0.5)
    assert boundary.warning_codes == ()
    assert large.magnification_x == pytest.approx(10.0)
    assert large.exit_pupil_mm == pytest.approx(10.0)
    assert large.warning_codes == ("exit_pupil_exceeds_reference_pupil",)


def test_target_fit_is_only_scalar_angular_extent_geometry() -> None:
    result = calculate_telescope_builder(_input(target_size=120.0))

    assert result.target_angular_size_deg == pytest.approx(2.0)
    assert result.target_field_fraction == pytest.approx(2.0)
    assert result.target_fit == "does_not_fit"


def test_telescope_type_is_numeric_output_invariant() -> None:
    results = [
        calculate_telescope_builder(_input(telescope_type=telescope_type))
        for telescope_type in ("refractor", "reflector", "catadioptric")
    ]
    numeric_attributes = (
        "effective_focal_length_mm",
        "native_focal_ratio",
        "effective_focal_ratio",
        "magnification_x",
        "approx_true_field_deg",
        "exit_pupil_mm",
        "dawes_limit_arcsec",
        "rayleigh_limit_arcsec",
        "ideal_light_gathering_ratio_vs_7mm_pupil",
        "target_angular_size_deg",
        "target_field_fraction",
        "target_fit",
        "warning_codes",
    )
    for attribute in numeric_attributes:
        assert [getattr(result, attribute) for result in results] == [
            getattr(results[0], attribute)
        ] * 3


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("aperture_mm", 19.999),
        ("telescope_focal_length_mm", 99.999),
        ("eyepiece_focal_length_mm", 0.999),
        ("eyepiece_apparent_field_deg", 29.999),
        ("target_angular_size_arcmin", 0.009),
        ("telescope_type", "invented"),
        ("optical_modifier_kind", "barlow-and-reducer"),
    ],
)
def test_invalid_inputs_raise_one_sanitized_domain_error(field: str, value: object) -> None:
    values: dict[str, object] = {
        "aperture_mm": 100.0,
        "telescope_focal_length_mm": 1000.0,
        "telescope_type": "refractor",
        "eyepiece_focal_length_mm": 20.0,
        "eyepiece_apparent_field_deg": 50.0,
        "optical_modifier_kind": "none",
        "optical_modifier_factor": 1.0,
        "target_angular_size_arcmin": 30.0,
    }
    values[field] = value

    with pytest.raises(TelescopeBuilderModelError, match="^TELESCOPE_BUILDER_MODEL_INVALID$"):
        TelescopeBuilderInput(**values)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "values",
    [
        {"optical_modifier_kind": "none", "optical_modifier_factor": 1.1},
        {"optical_modifier_kind": "barlow", "optical_modifier_factor": 1.0},
        {"optical_modifier_kind": "reducer", "optical_modifier_factor": 0.99},
        {
            "aperture_mm": 20.0,
            "telescope_focal_length_mm": 100.0,
            "eyepiece_focal_length_mm": 60.0,
            "optical_modifier_kind": "reducer",
            "optical_modifier_factor": 0.5,
        },
        {"aperture_mm": True},
        {"aperture_mm": float("nan")},
        {"aperture_mm": float("inf")},
    ],
)
def test_relational_nonfinite_and_boolean_inputs_are_rejected(values: dict[str, object]) -> None:
    with pytest.raises(TelescopeBuilderModelError, match="^TELESCOPE_BUILDER_MODEL_INVALID$"):
        TelescopeBuilderInput(
            aperture_mm=cast(float, values.get("aperture_mm", 100.0)),
            telescope_focal_length_mm=cast(
                float,
                values.get("telescope_focal_length_mm", 1000.0),
            ),
            telescope_type=cast(TelescopeType, values.get("telescope_type", "refractor")),
            eyepiece_focal_length_mm=cast(
                float,
                values.get("eyepiece_focal_length_mm", 20.0),
            ),
            eyepiece_apparent_field_deg=cast(
                float,
                values.get("eyepiece_apparent_field_deg", 50.0),
            ),
            optical_modifier_kind=cast(
                OpticalModifierKind,
                values.get("optical_modifier_kind", "none"),
            ),
            optical_modifier_factor=cast(
                float,
                values.get("optical_modifier_factor", 1.0),
            ),
            target_angular_size_arcmin=cast(
                float,
                values.get("target_angular_size_arcmin", 30.0),
            ),
        )


def test_reviewed_artifact_freezes_source_id_url_and_official_title_bindings() -> None:
    artifact = load_reviewed_telescope_builder_artifact(repository_root=_REPOSITORY_ROOT)
    source_records = cast(list[dict[str, object]], artifact["sources"])
    sources = {cast(str, source["id"]): source for source in source_records}

    expected = {
        "openstax-telescopes": (
            "https://openstax.org/books/astronomy/pages/6-1-telescopes",
            "6.1 Telescopes",
        ),
        "openstax-circular-apertures": (
            "https://openstax.org/books/university-physics-volume-3/pages/4-5-circular-apertures-and-resolution",
            "4.5 Circular Apertures and Resolution",
        ),
        "sky-telescope-dawes": (
            "https://skyandtelescope.org/stargazing-and-observing/pushing-limits-a-spring-sky-double-star-romp/",
            "Pushing Limits: A Spring Sky Double Star Romp",
        ),
        "celestron-astronomy-glossary": (
            "https://www.celestron.com/blogs/knowledgebase/astronomy-glossary-of-terms",
            "Astronomy Glossary of Terms",
        ),
        "wwu-astropages-telescopes": (
            "https://astro101.wwu.edu/a101_telescopes.html",
            "Telescopes",
        ),
        "celestron-exit-pupil": (
            "https://www.celestron.com/blogs/knowledgebase/what-is-exit-pupil-and-eye-relief-for-sport-optics",
            "What is Exit Pupil and Eye Relief for Sport Optics?",
        ),
        "sky-telescope-magnification": (
            "https://skyandtelescope.org/astronomy-equipment/choosing-your-telescopes-magnification/",
            "How to Choose Your Telescope Magnification",
        ),
    }
    assert {key: (value["url"], value["title"]) for key, value in sources.items()} == expected


def test_reviewed_artifact_source_metadata_mutations_fail_closed(tmp_path: Path) -> None:
    for field, value in (
        ("organization_or_authors", "Tampered source"),
        ("accessed_at", "2099-01-01"),
        ("dataset_or_release", "Tampered release"),
        ("record_reference", "Tampered record"),
        ("retrieved_at", "2099-01-01"),
        ("data_date", "Tampered date"),
        ("terms_or_licence", "Tampered licence"),
        ("citation", "Tampered citation"),
        ("claim_scope", "Tampered claim scope"),
        ("source_type", "technical-reference"),
    ):
        artifact = json.loads(
            (_REPOSITORY_ROOT / "data/seed/telescope-builder-v1.json").read_text(encoding="utf-8")
        )
        artifact["sources"][0][field] = value
        destination = tmp_path / "data/seed/telescope-builder-v1.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(artifact), encoding="utf-8")

        with pytest.raises(TelescopeBuilderModelError, match="^TELESCOPE_BUILDER_MODEL_INVALID$"):
            load_reviewed_telescope_builder_artifact(repository_root=tmp_path)


def test_artifact_duplicate_source_ids_cannot_be_accepted(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = _REPOSITORY_ROOT / "data/seed/telescope-builder-v1.json"
    artifact = json.loads(source.read_text(encoding="utf-8"))
    artifact["sources"][1]["id"] = artifact["sources"][0]["id"]
    destination = tmp_path / "data/seed/telescope-builder-v1.json"
    destination.parent.mkdir(parents=True)
    destination.write_text(json.dumps(artifact), encoding="utf-8")

    monkeypatch.setattr(
        telescope_builder,
        "TELESCOPE_BUILDER_ARTIFACT_PATH",
        "data/seed/telescope-builder-v1.json",
    )
    with pytest.raises(TelescopeBuilderModelError, match="^TELESCOPE_BUILDER_MODEL_INVALID$"):
        telescope_builder.load_reviewed_telescope_builder_artifact(repository_root=tmp_path)
