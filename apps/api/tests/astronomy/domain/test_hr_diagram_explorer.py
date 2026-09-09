from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest
from lumina.astronomy.domain.hr_diagram_explorer import (
    CLUSTERS,
    HR_DIAGRAM_RECORD_COUNT,
    HR_DIAGRAM_RECORDS_PER_CLUSTER,
    HRDiagramExplorerModelError,
    canonical_record_fingerprint,
    cmd_colour_x_fraction,
    cmd_magnitude_y_fraction,
    load_reviewed_hr_diagram_artifact,
    physical_luminosity_y_fraction,
    physical_temperature_x_fraction,
    select_curated_records,
    spectral_quality_is_eligible,
    stage_group_for_evolstage,
    validate_share_state,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]
_EXPECTED_FINGERPRINT = "sha256:3d1f2a32cee1f834bdd5c9f07162884789096385323a36bb3712a1f52659be9f"


def _artifact() -> dict[str, object]:
    return load_reviewed_hr_diagram_artifact(repository_root=_REPOSITORY_ROOT)


def test_reviewed_artifact_has_exact_curated_dataset_and_default() -> None:
    artifact = _artifact()
    stars = cast(list[dict[str, object]], artifact["stars"])
    dataset = cast(dict[str, object], artifact["dataset"])
    definition = cast(dict[str, object], artifact["definition"])

    assert len(stars) == HR_DIAGRAM_RECORD_COUNT
    assert dataset["source_record_fingerprint"] == _EXPECTED_FINGERPRINT
    assert definition["default_selected_star_id"] == "gaia-dr3-598546371788334080"
    assert [sum(star["cluster"] == cluster for star in stars) for cluster in CLUSTERS] == [
        HR_DIAGRAM_RECORDS_PER_CLUSTER
    ] * len(CLUSTERS)
    assert len({star["gaia_source_id"] for star in stars}) == HR_DIAGRAM_RECORD_COUNT
    assert canonical_record_fingerprint(stars) == _EXPECTED_FINGERPRINT
    assert definition["default_state"] == {
        "version": 1,
        "model_version": "hr-diagram-explorer-v1",
        "view": "physical_hr",
        "selected_star_id": "gaia-dr3-598546371788334080",
        "spectral_classes": ["O", "B", "A", "F", "G", "K", "M"],
        "stage_groups": ["main_sequence", "turnoff_transition", "red_giant_branch"],
        "clusters": ["pleiades", "hyades", "praesepe", "m67"],
    }


def test_source_metadata_is_bound_to_exact_reviewed_urls_and_titles() -> None:
    artifact = _artifact()
    sources = {
        cast(str, source["id"]): source
        for source in cast(list[dict[str, object]], artifact["sources"])
    }

    assert (
        sources["gaia-dr3-main-source-catalogue"]["url"],
        sources["gaia-dr3-main-source-catalogue"]["title"],
    ) == (
        "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html",
        "20.1.1 gaia_source",
    )
    assert (
        sources["gaia-dr3-astrophysical-parameters"]["url"],
        sources["gaia-dr3-astrophysical-parameters"]["title"],
    ) == (
        "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_astrophysical_parameter_tables/ssec_dm_astrophysical_parameters.html",
        "20.2.1 astrophysical_parameters",
    )
    assert (
        sources["hunt-reffert-2024-vizier-members"]["url"],
        sources["hunt-reffert-2024-vizier-members"]["title"],
    ) == (
        "https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A%2BA/686/A42",
        "Improving the open cluster census. III. : J/A+A/686/A42",
    )


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (100, "main_sequence"),
        (359, "main_sequence"),
        (360, "turnoff_transition"),
        (489, "turnoff_transition"),
        (490, "red_giant_branch"),
        (1290, "red_giant_branch"),
    ],
)
def test_flame_stage_boundaries_are_frozen(value: int, expected: str) -> None:
    assert stage_group_for_evolstage(value) == expected


@pytest.mark.parametrize("value", [99, 1291, True, 360.0])
def test_flame_stage_outside_contract_is_rejected(value: object) -> None:
    with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
        stage_group_for_evolstage(value)


def test_gaia_spectral_quality_rule_accepts_only_primary_probability_above_half() -> None:
    assert all(spectral_quality_is_eligible(flag) for flag in ("01", "11", "21", "31", "41", "94"))
    assert not any(
        spectral_quality_is_eligible(flag) for flag in ("05", "15", "90", "999", "", "9")
    )


def test_axis_endpoint_transforms_are_disclosed_and_reversed_where_required() -> None:
    assert physical_temperature_x_fraction(50000) == 0.0
    assert physical_temperature_x_fraction(2500) == 1.0
    assert physical_luminosity_y_fraction(1e5) == 0.0
    assert physical_luminosity_y_fraction(1e-3) == 1.0
    assert cmd_colour_x_fraction(-0.5) == 0.0
    assert cmd_colour_x_fraction(4.0) == 1.0
    assert cmd_magnitude_y_fraction(-5) == 0.0
    assert cmd_magnitude_y_fraction(15) == 1.0


def test_axis_interior_transforms_preserve_log_and_linear_semantics() -> None:
    assert physical_temperature_x_fraction(10000) == pytest.approx(0.5372435736804816)
    assert physical_luminosity_y_fraction(10) == pytest.approx(0.5)
    assert cmd_colour_x_fraction(1.25) == pytest.approx(0.3888888888888889)
    assert cmd_magnitude_y_fraction(0) == pytest.approx(0.25)


@pytest.mark.parametrize(
    "transform",
    [
        physical_temperature_x_fraction,
        physical_luminosity_y_fraction,
        cmd_colour_x_fraction,
        cmd_magnitude_y_fraction,
    ],
)
def test_axis_transforms_reject_nonfinite_or_outside_values(
    transform: Callable[[object], float],
) -> None:
    for value in (float("nan"), float("inf"), -float("inf")):
        with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
            transform(value)


def test_selection_round_robin_uses_stage_then_spectral_order_and_numeric_ids() -> None:
    records = []
    for cluster in CLUSTERS:
        records.extend(
            [
                {
                    "cluster": cluster,
                    "stage_group": "turnoff_transition",
                    "spectral_class": "G",
                    "gaia_source_id": "20",
                },
                {
                    "cluster": cluster,
                    "stage_group": "main_sequence",
                    "spectral_class": "K",
                    "gaia_source_id": "10",
                },
                {
                    "cluster": cluster,
                    "stage_group": "main_sequence",
                    "spectral_class": "A",
                    "gaia_source_id": "2",
                },
            ]
        )
    selected = select_curated_records(records, per_cluster=2)
    assert [(row["cluster"], row["gaia_source_id"]) for row in selected] == [
        (cluster, source_id) for cluster in CLUSTERS for source_id in ("2", "10")
    ]


def test_share_state_accepts_exact_default_and_rejects_extra_or_duplicate_values() -> None:
    artifact = _artifact()
    definition = cast(dict[str, object], artifact["definition"])
    state = cast(dict[str, object], definition["default_state"])
    star_ids = frozenset(
        cast(str, star["star_id"]) for star in cast(list[dict[str, object]], artifact["stars"])
    )

    validate_share_state(state, selected_star_ids=star_ids)
    invalid = dict(state)
    invalid["unexpected"] = True
    with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
        validate_share_state(invalid, selected_star_ids=star_ids)
    duplicate = dict(state)
    duplicate["spectral_classes"] = ["G", "G"]
    with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
        validate_share_state(duplicate, selected_star_ids=star_ids)


def test_source_title_tampering_fails_closed(tmp_path: Path) -> None:
    artifact = json.loads((_REPOSITORY_ROOT / "data/seed/hr-diagram-explorer-v1.json").read_text())
    artifact["sources"][0]["title"] = "A misleading title"
    seed = tmp_path / "data" / "seed"
    seed.mkdir(parents=True)
    (seed / "hr-diagram-explorer-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
        load_reviewed_hr_diagram_artifact(repository_root=tmp_path)


def test_source_metadata_tampering_fails_closed(tmp_path: Path) -> None:
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
        ("source_type", "official-education"),
    ):
        artifact = json.loads(
            (_REPOSITORY_ROOT / "data/seed/hr-diagram-explorer-v1.json").read_text(encoding="utf-8")
        )
        artifact["sources"][0][field] = value
        seed = tmp_path / "data" / "seed"
        seed.mkdir(parents=True, exist_ok=True)
        (seed / "hr-diagram-explorer-v1.json").write_text(json.dumps(artifact))

        with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
            load_reviewed_hr_diagram_artifact(repository_root=tmp_path)


def test_source_spot_check_value_tampering_fails_closed(tmp_path: Path) -> None:
    artifact = json.loads((_REPOSITORY_ROOT / "data/seed/hr-diagram-explorer-v1.json").read_text())
    artifact["source_spot_checks"][0]["gaia_fields"]["teff_gspphot"] += 1
    seed = tmp_path / "data" / "seed"
    seed.mkdir(parents=True)
    (seed / "hr-diagram-explorer-v1.json").write_text(json.dumps(artifact))

    with pytest.raises(HRDiagramExplorerModelError, match="^HR_DIAGRAM_MODEL_INVALID$"):
        load_reviewed_hr_diagram_artifact(repository_root=tmp_path)
