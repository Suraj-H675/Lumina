"""Validation and deterministic presentation transforms for H-R Explorer v1.

H-R Explorer consumes a reviewed, offline Gaia DR3 artifact.  The module does
not infer stellar properties: Gaia/FLAME source values remain source values.
It owns the artifact boundary, FLAME stage grouping, deterministic curation
rules, and the disclosed coordinate transforms used to validate the view.
There is no provider, web, persistence, or browser dependency here.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

HR_DIAGRAM_MODEL_VERSION: Final = "hr-diagram-explorer-v1"
HR_DIAGRAM_SCHEMA_VERSION: Final = 1
HR_DIAGRAM_ARTIFACT_VERSION: Final = 1
HR_DIAGRAM_SHARE_SCHEMA_VERSION: Final = 1
HR_DIAGRAM_ARTIFACT_PATH: Final = "data/seed/hr-diagram-explorer-v1.json"
HR_DIAGRAM_DATASET_ID: Final = "gaia-dr3-four-cluster-curated-v1"
HR_DIAGRAM_RECORD_COUNT: Final = 128
HR_DIAGRAM_RECORDS_PER_CLUSTER: Final = 32

PHYSICAL_TEMPERATURE_MIN_K: Final = 2500.0
PHYSICAL_TEMPERATURE_MAX_K: Final = 50000.0
PHYSICAL_LUMINOSITY_MIN_LSUN: Final = 1e-3
PHYSICAL_LUMINOSITY_MAX_LSUN: Final = 1e5
CMD_COLOUR_MIN_MAG: Final = -0.5
CMD_COLOUR_MAX_MAG: Final = 4.0
CMD_ABSOLUTE_MAGNITUDE_MIN: Final = -5.0
CMD_ABSOLUTE_MAGNITUDE_MAX: Final = 15.0

Cluster = Literal["pleiades", "hyades", "praesepe", "m67"]
SpectralClass = Literal["O", "B", "A", "F", "G", "K", "M"]
StageGroup = Literal["main_sequence", "turnoff_transition", "red_giant_branch"]

CLUSTERS: Final[tuple[Cluster, ...]] = ("pleiades", "hyades", "praesepe", "m67")
SPECTRAL_CLASSES: Final[tuple[SpectralClass, ...]] = ("O", "B", "A", "F", "G", "K", "M")
STAGE_GROUPS: Final[tuple[StageGroup, ...]] = (
    "main_sequence",
    "turnoff_transition",
    "red_giant_branch",
)
CLUSTER_LABELS: Final[dict[Cluster, str]] = {
    "pleiades": "Pleiades",
    "hyades": "Hyades",
    "praesepe": "Praesepe",
    "m67": "M 67",
}
CLUSTER_CATALOGUE_IDS: Final[dict[Cluster, int]] = {
    "pleiades": 4423,
    "hyades": 4424,
    "praesepe": 4598,
    "m67": 4606,
}
CLUSTER_ACCEPTED_NAMES: Final[dict[Cluster, str]] = {
    "pleiades": "Melotte_22",
    "hyades": "Melotte_25",
    "praesepe": "NGC_2632",
    "m67": "NGC_2682",
}

EXPECTED_SOURCE_METADATA: Final[dict[str, tuple[str, str]]] = {
    "gaia-dr3-main-source-catalogue": (
        "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_main_source_catalogue/ssec_dm_gaia_source.html",
        "20.1.1 gaia_source",
    ),
    "gaia-dr3-astrophysical-parameters": (
        "https://gea.esac.esa.int/archive/documentation/GDR3/Gaia_archive/chap_datamodel/sec_dm_astrophysical_parameter_tables/ssec_dm_astrophysical_parameters.html",
        "20.2.1 astrophysical_parameters",
    ),
    "gaia-dr3-documentation": (
        "https://gea.esac.esa.int/archive/documentation/GDR3/",
        "Gaia Data Release 3 Documentation release 1.3",
    ),
    "hunt-reffert-2024-vizier-members": (
        "https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A%2BA/686/A42",
        "Improving the open cluster census. III. : J/A+A/686/A42",
    ),
    "esa-gaia-hr-diagram": (
        "https://www.esa.int/ESA_Multimedia/Images/2018/04/Gaia_s_Hertzsprung-Russell_diagram",
        "Gaia’s Hertzsprung-Russell diagram",
    ),
}
OFFICIAL_SOURCE_HOSTS: Final[frozenset[str]] = frozenset(
    {"cdsarc.cds.unistra.fr", "gea.esac.esa.int", "www.esa.int"}
)

RECORD_KEYS: Final[frozenset[str]] = frozenset(
    {
        "star_id",
        "gaia_source_id",
        "designation",
        "cluster",
        "cluster_label",
        "membership",
        "spectral_class",
        "flags_esphs",
        "evolstage_flame",
        "flags_flame",
        "stage_group",
        "phot_g_mean_mag",
        "bp_rp_mag",
        "parallax_mas",
        "parallax_error_mas",
        "teff_k_p16",
        "teff_k_p50",
        "teff_k_p84",
        "luminosity_lsun_p16",
        "luminosity_lsun_p50",
        "luminosity_lsun_p84",
        "mg_gspphot_mag_p16",
        "mg_gspphot_mag_p50",
        "mg_gspphot_mag_p84",
        "ag_gspphot_mag",
        "ag_gspphot_mag_p16",
        "ag_gspphot_mag_p84",
        "ebpminrp_gspphot_mag",
        "ebpminrp_gspphot_mag_p16",
        "ebpminrp_gspphot_mag_p84",
        "source_fields",
        "provenance",
    }
)


class HRDiagramExplorerModelError(ValueError):
    """Raised when the reviewed H-R artifact or its model inputs are invalid."""

    def __init__(self) -> None:
        super().__init__("HR_DIAGRAM_MODEL_INVALID")


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise HRDiagramExplorerModelError()
        result[key] = value
    return result


def _mapping(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        raise HRDiagramExplorerModelError()
    return value


def _exact_keys(value: Mapping[str, object], expected: frozenset[str]) -> None:
    if frozenset(value) != expected:
        raise HRDiagramExplorerModelError()


def _string(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise HRDiagramExplorerModelError()
    return value


def _finite_number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise HRDiagramExplorerModelError()
    try:
        number = float(value)
    except (OverflowError, TypeError, ValueError):
        raise HRDiagramExplorerModelError() from None
    if not math.isfinite(number):
        raise HRDiagramExplorerModelError()
    return number


def _finite_optional_number(value: object) -> None:
    if value is not None:
        _finite_number(value)


def stage_group_for_evolstage(value: object) -> StageGroup:
    """Map Gaia's integer FLAME stage to the frozen Lumina educational group."""

    if isinstance(value, bool) or not isinstance(value, int):
        raise HRDiagramExplorerModelError()
    if 100 <= value < 360:
        return "main_sequence"
    if 360 <= value < 490:
        return "turnoff_transition"
    if 490 <= value <= 1290:
        return "red_giant_branch"
    raise HRDiagramExplorerModelError()


def spectral_quality_is_eligible(flags_esphs: object) -> bool:
    """Return whether Gaia's second ESP-HS flag digit means primary probability > 0.5."""

    return isinstance(flags_esphs, str) and len(flags_esphs) >= 2 and flags_esphs[1] in "1234"


def _display_domain(value: float, minimum: float, maximum: float) -> None:
    if not minimum <= value <= maximum:
        raise HRDiagramExplorerModelError()


def _validate_interval(mapping: Mapping[str, object], lower: str, central: str, upper: str) -> None:
    lower_value = _finite_number(mapping[lower])
    central_value = _finite_number(mapping[central])
    upper_value = _finite_number(mapping[upper])
    if not lower_value < central_value < upper_value:
        raise HRDiagramExplorerModelError()


def validate_record(record: object) -> None:
    """Validate one exact source-backed record at the artifact boundary."""

    mapping = _mapping(record)
    _exact_keys(mapping, RECORD_KEYS)
    source_id = _string(mapping["gaia_source_id"])
    if not source_id.isdecimal() or int(source_id) <= 0:
        raise HRDiagramExplorerModelError()
    if mapping["star_id"] != f"gaia-dr3-{source_id}":
        raise HRDiagramExplorerModelError()
    _string(mapping["designation"])

    cluster = mapping["cluster"]
    if cluster not in CLUSTERS:
        raise HRDiagramExplorerModelError()
    cluster_value = cluster
    if mapping["cluster_label"] != CLUSTER_LABELS[cluster_value]:
        raise HRDiagramExplorerModelError()
    membership = _mapping(mapping["membership"])
    _exact_keys(
        membership,
        frozenset(
            {"catalogue", "catalogue_id", "accepted_name", "inrj", "inrt", "membership_probability"}
        ),
    )
    if (
        membership["catalogue"] != "Hunt & Reffert 2024"
        or membership["catalogue_id"] != CLUSTER_CATALOGUE_IDS[cluster_value]
        or membership["accepted_name"] != CLUSTER_ACCEPTED_NAMES[cluster_value]
        or membership["inrj"] not in {0, 1}
        or membership["inrt"] not in {0, 1}
    ):
        raise HRDiagramExplorerModelError()
    probability = _finite_number(membership["membership_probability"])
    if not 0.0 <= probability <= 1.0:
        raise HRDiagramExplorerModelError()

    spectral_class = mapping["spectral_class"]
    if spectral_class not in SPECTRAL_CLASSES or not spectral_quality_is_eligible(
        mapping["flags_esphs"]
    ):
        raise HRDiagramExplorerModelError()
    _string(mapping["flags_esphs"])
    _string(mapping["flags_flame"])
    stage_value = mapping["evolstage_flame"]
    if isinstance(stage_value, bool) or not isinstance(stage_value, int):
        raise HRDiagramExplorerModelError()
    if mapping["stage_group"] != stage_group_for_evolstage(stage_value):
        raise HRDiagramExplorerModelError()

    for key in (
        "phot_g_mean_mag",
        "bp_rp_mag",
        "parallax_mas",
        "parallax_error_mas",
        "teff_k_p16",
        "teff_k_p50",
        "teff_k_p84",
        "luminosity_lsun_p16",
        "luminosity_lsun_p50",
        "luminosity_lsun_p84",
        "mg_gspphot_mag_p16",
        "mg_gspphot_mag_p50",
        "mg_gspphot_mag_p84",
    ):
        _finite_number(mapping[key])
    _validate_interval(mapping, "teff_k_p16", "teff_k_p50", "teff_k_p84")
    _validate_interval(mapping, "luminosity_lsun_p16", "luminosity_lsun_p50", "luminosity_lsun_p84")
    _validate_interval(mapping, "mg_gspphot_mag_p16", "mg_gspphot_mag_p50", "mg_gspphot_mag_p84")
    if _finite_number(mapping["luminosity_lsun_p16"]) <= 0:
        raise HRDiagramExplorerModelError()
    _display_domain(
        _finite_number(mapping["teff_k_p50"]),
        PHYSICAL_TEMPERATURE_MIN_K,
        PHYSICAL_TEMPERATURE_MAX_K,
    )
    _display_domain(
        _finite_number(mapping["luminosity_lsun_p50"]),
        PHYSICAL_LUMINOSITY_MIN_LSUN,
        PHYSICAL_LUMINOSITY_MAX_LSUN,
    )
    _display_domain(_finite_number(mapping["bp_rp_mag"]), CMD_COLOUR_MIN_MAG, CMD_COLOUR_MAX_MAG)
    _display_domain(
        _finite_number(mapping["mg_gspphot_mag_p50"]),
        CMD_ABSOLUTE_MAGNITUDE_MIN,
        CMD_ABSOLUTE_MAGNITUDE_MAX,
    )
    for key in (
        "ag_gspphot_mag",
        "ag_gspphot_mag_p16",
        "ag_gspphot_mag_p84",
        "ebpminrp_gspphot_mag",
        "ebpminrp_gspphot_mag_p16",
        "ebpminrp_gspphot_mag_p84",
    ):
        _finite_optional_number(mapping[key])

    source_fields = _mapping(mapping["source_fields"])
    _exact_keys(
        source_fields, frozenset({"gaia_source", "astrophysical_parameters", "cluster_membership"})
    )
    expected_gaia_source = [
        "source_id",
        "designation",
        "phot_g_mean_mag",
        "bp_rp",
        "parallax",
        "parallax_error",
    ]
    expected_astrophysical = [
        "teff_gspphot",
        "teff_gspphot_lower",
        "teff_gspphot_upper",
        "lum_flame",
        "lum_flame_lower",
        "lum_flame_upper",
        "mg_gspphot",
        "mg_gspphot_lower",
        "mg_gspphot_upper",
        "spectraltype_esphs",
        "flags_esphs",
        "evolstage_flame",
        "flags_flame",
        "ag_gspphot",
        "ag_gspphot_lower",
        "ag_gspphot_upper",
        "ebpminrp_gspphot",
        "ebpminrp_gspphot_lower",
        "ebpminrp_gspphot_upper",
    ]
    if source_fields != {
        "gaia_source": expected_gaia_source,
        "astrophysical_parameters": expected_astrophysical,
        "cluster_membership": ["ID", "Name", "GaiaDR3", "inrj", "inrt", "Prob"],
    }:
        raise HRDiagramExplorerModelError()
    provenance = _mapping(mapping["provenance"])
    _exact_keys(
        provenance,
        frozenset({"gaia_source", "gaia_astrophysical_parameters", "cluster_membership"}),
    )
    if provenance != {
        "gaia_source": "gaia-dr3-main-source-catalogue",
        "gaia_astrophysical_parameters": "gaia-dr3-astrophysical-parameters",
        "cluster_membership": "hunt-reffert-2024-vizier-members",
    }:
        raise HRDiagramExplorerModelError()


def canonical_record_fingerprint(records: Sequence[Mapping[str, object]]) -> str:
    """Return the reviewed SHA-256 fingerprint for an ordered record sequence."""

    try:
        encoded = json.dumps(
            list(records), ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")
    except (TypeError, ValueError):
        raise HRDiagramExplorerModelError() from None
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def select_curated_records(
    records: Sequence[Mapping[str, object]], *, per_cluster: int = HR_DIAGRAM_RECORDS_PER_CLUSTER
) -> tuple[Mapping[str, object], ...]:
    """Apply the frozen round-robin (stage, spectral class) selection algorithm."""

    if isinstance(per_cluster, bool) or not isinstance(per_cluster, int) or per_cluster <= 0:
        raise HRDiagramExplorerModelError()
    cells: dict[Cluster, dict[tuple[StageGroup, SpectralClass], list[Mapping[str, object]]]] = {
        cluster: defaultdict(list) for cluster in CLUSTERS
    }
    for record in records:
        mapping = _mapping(record)
        cluster = mapping.get("cluster")
        spectral_class = mapping.get("spectral_class")
        stage_group = mapping.get("stage_group")
        source_id = mapping.get("gaia_source_id")
        if (
            cluster not in CLUSTERS
            or spectral_class not in SPECTRAL_CLASSES
            or stage_group not in STAGE_GROUPS
            or not isinstance(source_id, str)
            or not source_id.isdecimal()
        ):
            raise HRDiagramExplorerModelError()
        cells[cluster][(stage_group, spectral_class)].append(record)

    selected: list[Mapping[str, object]] = []
    for cluster in CLUSTERS:
        cluster_selected: list[Mapping[str, object]] = []
        for values in cells[cluster].values():
            values.sort(key=lambda item: int(cast(str, item["gaia_source_id"])))
        while len(cluster_selected) < per_cluster:
            added = False
            for stage_group in STAGE_GROUPS:
                for spectral_class in SPECTRAL_CLASSES:
                    values = cells[cluster].get((stage_group, spectral_class), [])
                    if len(cluster_selected) < per_cluster and values:
                        cluster_selected.append(values.pop(0))
                        added = True
            if not added:
                raise HRDiagramExplorerModelError()
        selected.extend(
            sorted(cluster_selected, key=lambda item: int(cast(str, item["gaia_source_id"])))
        )
    return tuple(selected)


def _coordinate_fraction(
    value: object, minimum: float, maximum: float, *, logarithmic: bool
) -> float:
    numeric = _finite_number(value)
    _display_domain(numeric, minimum, maximum)
    if logarithmic:
        numerator = math.log10(numeric) - math.log10(minimum)
        denominator = math.log10(maximum) - math.log10(minimum)
    else:
        numerator = numeric - minimum
        denominator = maximum - minimum
    fraction = numerator / denominator
    if not math.isfinite(fraction) or not 0.0 <= fraction <= 1.0:
        raise HRDiagramExplorerModelError()
    return fraction


def physical_temperature_x_fraction(value: object) -> float:
    """Return the reversed physical-HR temperature x coordinate (0=left)."""

    return 1.0 - _coordinate_fraction(
        value, PHYSICAL_TEMPERATURE_MIN_K, PHYSICAL_TEMPERATURE_MAX_K, logarithmic=True
    )


def physical_luminosity_y_fraction(value: object) -> float:
    """Return the screen y fraction for physical luminosity (0=top)."""

    return 1.0 - _coordinate_fraction(
        value, PHYSICAL_LUMINOSITY_MIN_LSUN, PHYSICAL_LUMINOSITY_MAX_LSUN, logarithmic=True
    )


def cmd_colour_x_fraction(value: object) -> float:
    """Return the ordinary linear CMD colour x coordinate (0=left)."""

    return _coordinate_fraction(value, CMD_COLOUR_MIN_MAG, CMD_COLOUR_MAX_MAG, logarithmic=False)


def cmd_magnitude_y_fraction(value: object) -> float:
    """Return the reversed screen y fraction for CMD absolute magnitude (0=top)."""

    return _coordinate_fraction(
        value, CMD_ABSOLUTE_MAGNITUDE_MIN, CMD_ABSOLUTE_MAGNITUDE_MAX, logarithmic=False
    )


def validate_share_state(state: object, *, selected_star_ids: frozenset[str]) -> None:
    """Validate the exact scientific share-state shape without applying defaults."""

    mapping = _mapping(state)
    _exact_keys(
        mapping,
        frozenset(
            {
                "version",
                "model_version",
                "view",
                "selected_star_id",
                "spectral_classes",
                "stage_groups",
                "clusters",
            }
        ),
    )
    if (
        mapping["version"] != HR_DIAGRAM_SHARE_SCHEMA_VERSION
        or mapping["model_version"] != HR_DIAGRAM_MODEL_VERSION
    ):
        raise HRDiagramExplorerModelError()
    if (
        mapping["view"] not in {"physical_hr", "gaia_cmd"}
        or mapping["selected_star_id"] not in selected_star_ids
    ):
        raise HRDiagramExplorerModelError()
    for key, allowed in (
        ("spectral_classes", SPECTRAL_CLASSES),
        ("stage_groups", STAGE_GROUPS),
        ("clusters", CLUSTERS),
    ):
        values = mapping[key]
        if not isinstance(values, list) or len(values) != len(set(values)):
            raise HRDiagramExplorerModelError()
        if any(value not in allowed for value in values):
            raise HRDiagramExplorerModelError()
        if tuple(values) != tuple(value for value in allowed if value in values):
            raise HRDiagramExplorerModelError()


def _validate_source(source: object) -> str:
    mapping = _mapping(source)
    source_keys = frozenset(
        {
            "id",
            "title",
            "organization_or_authors",
            "url",
            "accessed_at",
            "dataset_or_release",
            "record_reference",
            "retrieved_at",
            "data_date",
            "terms_or_licence",
            "citation",
            "claim_scope",
            "source_type",
        }
    )
    _exact_keys(mapping, source_keys)
    source_id = _string(mapping["id"])
    expected = EXPECTED_SOURCE_METADATA.get(source_id)
    if expected is None or mapping["url"] != expected[0] or mapping["title"] != expected[1]:
        raise HRDiagramExplorerModelError()
    source_url = _string(mapping["url"])
    parsed = urlparse(source_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in OFFICIAL_SOURCE_HOSTS
        or parsed.username
        or parsed.password
        or parsed.fragment
    ):
        raise HRDiagramExplorerModelError()
    if mapping["source_type"] not in {"official-agency", "official-education", "catalogue"}:
        raise HRDiagramExplorerModelError()
    for key in source_keys - {"id", "title", "url", "source_type"}:
        _string(mapping[key])
    return source_id


def _validate_artifact_definition(definition: Mapping[str, object]) -> None:
    expected_keys = frozenset(
        {
            "slug",
            "title",
            "content_type",
            "language",
            "status",
            "version",
            "audience_modes",
            "reviewed_by",
            "reviewed_at",
            "updated_at",
            "model_version",
            "dataset_id",
            "data_release",
            "learning_objectives",
            "prerequisite_concepts",
            "source_fields",
            "uncertainty_semantics",
            "default_state",
            "default_selected_star_id",
            "views",
            "filters",
            "stage_groups",
            "selection_method",
            "calculation_module",
            "output_schema",
            "visualization_module",
            "assumptions",
            "limitations",
            "references",
            "share_schema_version",
        }
    )
    _exact_keys(definition, expected_keys)
    if (
        definition["slug"] != "hr-diagram-explorer"
        or definition["title"] != "H-R Diagram Explorer"
        or definition["content_type"] != "interactive-dataset-explorer"
        or definition["language"] != "en"
        or definition["status"] != "ready"
        or definition["version"] != 1
        or definition["model_version"] != HR_DIAGRAM_MODEL_VERSION
        or definition["dataset_id"] != HR_DIAGRAM_DATASET_ID
        or definition["share_schema_version"] != HR_DIAGRAM_SHARE_SCHEMA_VERSION
    ):
        raise HRDiagramExplorerModelError()
    for key in (
        "reviewed_at",
        "updated_at",
        "data_release",
        "uncertainty_semantics",
        "visualization_module",
    ):
        _string(definition[key])
    for key in (
        "audience_modes",
        "reviewed_by",
        "learning_objectives",
        "prerequisite_concepts",
        "output_schema",
        "assumptions",
        "limitations",
        "references",
    ):
        values = definition[key]
        if (
            not isinstance(values, list)
            or not values
            or not all(isinstance(value, str) and value for value in values)
        ):
            raise HRDiagramExplorerModelError()
    if definition["audience_modes"] != ["explorer", "student", "deep-dive"]:
        raise HRDiagramExplorerModelError()
    _mapping(definition["source_fields"])
    _mapping(definition["views"])
    _mapping(definition["filters"])
    _mapping(definition["selection_method"])
    _mapping(definition["calculation_module"])
    _validate_state_shape(_mapping(definition["default_state"]))


def _validate_state_shape(state: Mapping[str, object]) -> None:
    _exact_keys(
        state,
        frozenset(
            {
                "version",
                "model_version",
                "view",
                "selected_star_id",
                "spectral_classes",
                "stage_groups",
                "clusters",
            }
        ),
    )
    if (
        state["version"] != HR_DIAGRAM_SHARE_SCHEMA_VERSION
        or state["model_version"] != HR_DIAGRAM_MODEL_VERSION
    ):
        raise HRDiagramExplorerModelError()
    if state["view"] not in {"physical_hr", "gaia_cmd"} or not isinstance(
        state["selected_star_id"], str
    ):
        raise HRDiagramExplorerModelError()
    for key in ("spectral_classes", "stage_groups", "clusters"):
        if not isinstance(state[key], list):
            raise HRDiagramExplorerModelError()


def load_reviewed_hr_diagram_artifact(*, repository_root: Path) -> dict[str, object]:
    """Load and validate the checked-in static H-R Explorer artifact."""

    path = repository_root / HR_DIAGRAM_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_duplicate_key_rejector
        )
    except (OSError, json.JSONDecodeError, HRDiagramExplorerModelError):
        raise HRDiagramExplorerModelError() from None
    artifact = _mapping(decoded)
    _exact_keys(
        artifact,
        frozenset(
            {
                "artifact_version",
                "model_version",
                "schema_version",
                "share_schema_version",
                "generated_at",
                "definition",
                "sources",
                "cluster_provenance",
                "dataset",
                "validation_fixtures",
                "source_spot_checks",
                "stars",
                "scientific_validation",
            }
        ),
    )
    if (
        artifact["artifact_version"] != HR_DIAGRAM_ARTIFACT_VERSION
        or artifact["model_version"] != HR_DIAGRAM_MODEL_VERSION
        or artifact["schema_version"] != HR_DIAGRAM_SCHEMA_VERSION
        or artifact["share_schema_version"] != HR_DIAGRAM_SHARE_SCHEMA_VERSION
    ):
        raise HRDiagramExplorerModelError()
    _string(artifact["generated_at"])
    definition = _mapping(artifact["definition"])
    _validate_artifact_definition(definition)

    sources = artifact["sources"]
    if not isinstance(sources, list) or len(sources) != len(EXPECTED_SOURCE_METADATA):
        raise HRDiagramExplorerModelError()
    if {_validate_source(source) for source in sources} != set(EXPECTED_SOURCE_METADATA):
        raise HRDiagramExplorerModelError()

    cluster_provenance = artifact["cluster_provenance"]
    if not isinstance(cluster_provenance, list) or [
        item.get("value") for item in map(_mapping, cluster_provenance)
    ] != list(CLUSTERS):
        raise HRDiagramExplorerModelError()
    for item, cluster in zip(cluster_provenance, CLUSTERS, strict=True):
        mapping = _mapping(item)
        _exact_keys(
            mapping,
            frozenset(
                {
                    "value",
                    "label",
                    "accepted_name",
                    "catalogue_id",
                    "alternative_names",
                    "resolution",
                }
            ),
        )
        if (
            mapping["value"] != cluster
            or mapping["label"] != CLUSTER_LABELS[cluster]
            or mapping["accepted_name"] != CLUSTER_ACCEPTED_NAMES[cluster]
            or mapping["catalogue_id"] != CLUSTER_CATALOGUE_IDS[cluster]
        ):
            raise HRDiagramExplorerModelError()
        if (
            not isinstance(mapping["alternative_names"], list)
            or not mapping["alternative_names"]
            or not all(isinstance(value, str) and value for value in mapping["alternative_names"])
        ):
            raise HRDiagramExplorerModelError()
        _string(mapping["resolution"])

    dataset = _mapping(artifact["dataset"])
    for key in (
        "identifier",
        "release",
        "canonical_order",
        "statistical_claim",
        "source_record_fingerprint",
        "fingerprint_method",
    ):
        _string(dataset[key])
    if (
        dataset["identifier"] != HR_DIAGRAM_DATASET_ID
        or dataset["record_count"] != HR_DIAGRAM_RECORD_COUNT
        or dataset["per_cluster_count"] != HR_DIAGRAM_RECORDS_PER_CLUSTER
        or dataset["field_star_population"] is not False
    ):
        raise HRDiagramExplorerModelError()

    raw_stars = artifact["stars"]
    if not isinstance(raw_stars, list) or len(raw_stars) != HR_DIAGRAM_RECORD_COUNT:
        raise HRDiagramExplorerModelError()
    for star in raw_stars:
        validate_record(star)
    star_ids = [cast(str, _mapping(star)["star_id"]) for star in raw_stars]
    if len(set(star_ids)) != len(star_ids):
        raise HRDiagramExplorerModelError()
    expected_order = sorted(
        raw_stars,
        key=lambda star: (
            CLUSTERS.index(cast(Cluster, _mapping(star)["cluster"])),
            int(cast(str, _mapping(star)["gaia_source_id"])),
        ),
    )
    if raw_stars != expected_order:
        raise HRDiagramExplorerModelError()
    fingerprint = canonical_record_fingerprint(cast(Sequence[Mapping[str, object]], raw_stars))
    if dataset["source_record_fingerprint"] != fingerprint:
        raise HRDiagramExplorerModelError()
    per_cluster = {
        cluster: sum(_mapping(star)["cluster"] == cluster for star in raw_stars)
        for cluster in CLUSTERS
    }
    if per_cluster != {cluster: HR_DIAGRAM_RECORDS_PER_CLUSTER for cluster in CLUSTERS}:
        raise HRDiagramExplorerModelError()

    default_id = definition["default_selected_star_id"]
    if default_id != "gaia-dr3-598546371788334080" or default_id not in star_ids:
        raise HRDiagramExplorerModelError()
    default_candidates = sorted(
        (
            star
            for star in raw_stars
            if _mapping(star)["cluster"] == "m67"
            and _mapping(star)["spectral_class"] == "G"
            and _mapping(star)["stage_group"] == "main_sequence"
        ),
        key=lambda star: int(cast(str, _mapping(star)["gaia_source_id"])),
    )
    if not default_candidates or _mapping(default_candidates[0])["star_id"] != default_id:
        raise HRDiagramExplorerModelError()
    default_state = _mapping(definition["default_state"])
    if default_state != {
        "version": HR_DIAGRAM_SHARE_SCHEMA_VERSION,
        "model_version": HR_DIAGRAM_MODEL_VERSION,
        "view": "physical_hr",
        "selected_star_id": default_id,
        "spectral_classes": list(SPECTRAL_CLASSES),
        "stage_groups": list(STAGE_GROUPS),
        "clusters": list(CLUSTERS),
    }:
        raise HRDiagramExplorerModelError()
    validate_share_state(default_state, selected_star_ids=frozenset(star_ids))

    validation = _mapping(artifact["validation_fixtures"])
    _exact_keys(
        validation,
        frozenset(
            {
                "dataset_counts",
                "default_selected_star_id",
                "physical_temperature_endpoints",
                "physical_luminosity_endpoints",
                "cmd_colour_endpoints",
                "cmd_magnitude_endpoints",
                "stage_boundaries",
                "fingerprint",
                "source_spot_check_star_ids",
                "per_cluster_counts",
            }
        ),
    )
    expected_validation_counts = {
        "dataset_counts": {
            "clusters": {"pleiades": 32, "hyades": 32, "praesepe": 32, "m67": 32},
            "stage_groups": {
                "main_sequence": 78,
                "turnoff_transition": 39,
                "red_giant_branch": 11,
            },
            "spectral_classes": {"O": 0, "B": 6, "A": 16, "F": 21, "G": 31, "K": 36, "M": 18},
        },
        "per_cluster_counts": {
            "pleiades": {
                "stage_groups": {
                    "main_sequence": 21,
                    "turnoff_transition": 9,
                    "red_giant_branch": 2,
                },
                "spectral_classes": {"O": 0, "B": 4, "A": 4, "F": 4, "G": 6, "K": 8, "M": 6},
            },
            "hyades": {
                "stage_groups": {
                    "main_sequence": 20,
                    "turnoff_transition": 10,
                    "red_giant_branch": 2,
                },
                "spectral_classes": {"O": 0, "B": 1, "A": 4, "F": 5, "G": 10, "K": 8, "M": 4},
            },
            "praesepe": {
                "stage_groups": {
                    "main_sequence": 19,
                    "turnoff_transition": 10,
                    "red_giant_branch": 3,
                },
                "spectral_classes": {"O": 0, "B": 0, "A": 4, "F": 5, "G": 7, "K": 10, "M": 6},
            },
            "m67": {
                "stage_groups": {
                    "main_sequence": 18,
                    "turnoff_transition": 10,
                    "red_giant_branch": 4,
                },
                "spectral_classes": {"O": 0, "B": 1, "A": 4, "F": 7, "G": 8, "K": 10, "M": 2},
            },
        },
    }
    if any(validation[key] != expected for key, expected in expected_validation_counts.items()):
        raise HRDiagramExplorerModelError()
    if validation["physical_temperature_endpoints"] != {"50000": 0, "2500": 1}:
        raise HRDiagramExplorerModelError()
    if validation["physical_luminosity_endpoints"] != {"100000": 0, "0.001": 1}:
        raise HRDiagramExplorerModelError()
    if validation["cmd_colour_endpoints"] != {"-0.5": 0, "4.0": 1}:
        raise HRDiagramExplorerModelError()
    if validation["cmd_magnitude_endpoints"] != {"-5": 0, "15": 1}:
        raise HRDiagramExplorerModelError()
    if validation["stage_boundaries"] != {
        "100": "main_sequence",
        "359": "main_sequence",
        "360": "turnoff_transition",
        "489": "turnoff_transition",
        "490": "red_giant_branch",
        "1290": "red_giant_branch",
        "99": "invalid",
        "1291": "invalid",
    }:
        raise HRDiagramExplorerModelError()
    _string(validation["fingerprint"])
    if (
        validation["fingerprint"] != fingerprint
        or validation["default_selected_star_id"] != default_id
        or validation["source_spot_check_star_ids"]
        != [
            "gaia-dr3-45022222315428608",
            "gaia-dr3-43615122310787840",
            "gaia-dr3-602814843431122816",
            "gaia-dr3-598546371788334080",
        ]
    ):
        raise HRDiagramExplorerModelError()
    source_spot_checks = artifact["source_spot_checks"]
    if not isinstance(source_spot_checks, list) or len(source_spot_checks) != len(CLUSTERS):
        raise HRDiagramExplorerModelError()
    record_by_id = {cast(str, _mapping(star)["star_id"]): _mapping(star) for star in raw_stars}
    spot_clusters: set[Cluster] = set()
    for item in source_spot_checks:
        mapping = _mapping(item)
        _exact_keys(
            mapping,
            frozenset(
                {
                    "cluster",
                    "star_id",
                    "gaia_source_id",
                    "gaia_fields",
                    "membership_fields",
                    "verification",
                }
            ),
        )
        spot_cluster = mapping["cluster"]
        star_id = mapping["star_id"]
        gaia_source_id = mapping["gaia_source_id"]
        if (
            spot_cluster not in CLUSTERS
            or star_id not in star_ids
            or not isinstance(star_id, str)
            or not isinstance(gaia_source_id, str)
            or gaia_source_id != star_id[len("gaia-dr3-") :]
        ):
            raise HRDiagramExplorerModelError()
        spot_cluster_value = spot_cluster
        spot_star_id = star_id
        if (
            spot_cluster_value in spot_clusters
            or record_by_id[spot_star_id]["cluster"] != spot_cluster
        ):
            raise HRDiagramExplorerModelError()
        spot_clusters.add(spot_cluster_value)
        spot_record = record_by_id[spot_star_id]
        gaia_fields = _mapping(mapping["gaia_fields"])
        if gaia_fields != {
            "source_id": gaia_source_id,
            "designation": spot_record["designation"],
            "phot_g_mean_mag": spot_record["phot_g_mean_mag"],
            "bp_rp": spot_record["bp_rp_mag"],
            "parallax": spot_record["parallax_mas"],
            "parallax_error": spot_record["parallax_error_mas"],
            "teff_gspphot_lower": spot_record["teff_k_p16"],
            "teff_gspphot": spot_record["teff_k_p50"],
            "teff_gspphot_upper": spot_record["teff_k_p84"],
            "lum_flame_lower": spot_record["luminosity_lsun_p16"],
            "lum_flame": spot_record["luminosity_lsun_p50"],
            "lum_flame_upper": spot_record["luminosity_lsun_p84"],
            "mg_gspphot_lower": spot_record["mg_gspphot_mag_p16"],
            "mg_gspphot": spot_record["mg_gspphot_mag_p50"],
            "mg_gspphot_upper": spot_record["mg_gspphot_mag_p84"],
            "spectraltype_esphs": spot_record["spectral_class"],
            "flags_esphs": spot_record["flags_esphs"],
            "evolstage_flame": spot_record["evolstage_flame"],
            "flags_flame": spot_record["flags_flame"],
        }:
            raise HRDiagramExplorerModelError()
        membership_fields = _mapping(mapping["membership_fields"])
        membership = _mapping(spot_record["membership"])
        if membership_fields != {
            "ID": CLUSTER_CATALOGUE_IDS[spot_cluster_value],
            "GaiaDR3": gaia_source_id,
            "inrj": membership["inrj"],
            "inrt": membership["inrt"],
            "Prob": membership["membership_probability"],
        }:
            raise HRDiagramExplorerModelError()
        _string(mapping["verification"])
    if spot_clusters != set(CLUSTERS):
        raise HRDiagramExplorerModelError()

    scientific_validation = _mapping(artifact["scientific_validation"])
    _exact_keys(
        scientific_validation,
        frozenset(
            {
                "id",
                "checked_at",
                "method",
                "tools",
                "source_ids",
                "spot_check_source_ids",
                "test_references",
            }
        ),
    )
    if scientific_validation["id"] != "hr-diagram-explorer-gaia-dr3-independent-validation-v1":
        raise HRDiagramExplorerModelError()
    for key in ("checked_at", "method"):
        _string(scientific_validation[key])
    if scientific_validation["source_ids"] != list(EXPECTED_SOURCE_METADATA) or not isinstance(
        scientific_validation["spot_check_source_ids"], list
    ):
        raise HRDiagramExplorerModelError()
    tools = scientific_validation["tools"]
    if not isinstance(tools, list) or not tools:
        raise HRDiagramExplorerModelError()
    for tool in tools:
        tool_mapping = _mapping(tool)
        _exact_keys(tool_mapping, frozenset({"name", "version", "role"}))
        for key in ("name", "version", "role"):
            _string(tool_mapping[key])
    return artifact


__all__ = [
    "CLUSTERS",
    "CLUSTER_ACCEPTED_NAMES",
    "CLUSTER_CATALOGUE_IDS",
    "CLUSTER_LABELS",
    "CMD_ABSOLUTE_MAGNITUDE_MAX",
    "CMD_ABSOLUTE_MAGNITUDE_MIN",
    "CMD_COLOUR_MAX_MAG",
    "CMD_COLOUR_MIN_MAG",
    "EXPECTED_SOURCE_METADATA",
    "HR_DIAGRAM_ARTIFACT_PATH",
    "HR_DIAGRAM_ARTIFACT_VERSION",
    "HR_DIAGRAM_DATASET_ID",
    "HR_DIAGRAM_MODEL_VERSION",
    "HR_DIAGRAM_RECORD_COUNT",
    "HR_DIAGRAM_RECORDS_PER_CLUSTER",
    "HR_DIAGRAM_SCHEMA_VERSION",
    "HR_DIAGRAM_SHARE_SCHEMA_VERSION",
    "HRDiagramExplorerModelError",
    "PHYSICAL_LUMINOSITY_MAX_LSUN",
    "PHYSICAL_LUMINOSITY_MIN_LSUN",
    "PHYSICAL_TEMPERATURE_MAX_K",
    "PHYSICAL_TEMPERATURE_MIN_K",
    "SPECTRAL_CLASSES",
    "STAGE_GROUPS",
    "canonical_record_fingerprint",
    "cmd_colour_x_fraction",
    "cmd_magnitude_y_fraction",
    "load_reviewed_hr_diagram_artifact",
    "physical_luminosity_y_fraction",
    "physical_temperature_x_fraction",
    "select_curated_records",
    "spectral_quality_is_eligible",
    "stage_group_for_evolstage",
    "validate_record",
    "validate_share_state",
]
