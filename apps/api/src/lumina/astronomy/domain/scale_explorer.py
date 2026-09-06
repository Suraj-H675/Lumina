"""Pure, deterministic calculations for the Scale Explorer model.

The browser renders a reviewed static output artifact so the interactive route remains useful
without a network request. This module owns the scientific transformation that produced and
validates that artifact: unit normalization, characteristic-size derivation, logarithmic display
position, and relative-size ratios. It has no web, persistence, provider, or framework dependency.
"""

from __future__ import annotations

import json
import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal, cast
from urllib.parse import urlparse

from astropy import units as u
from astropy.units import Quantity, UnitConversionError

SCALE_EXPLORER_MODEL_VERSION: Final = "scale-explorer-v1"
SCALE_EXPLORER_SCHEMA_VERSION: Final = 1
SCALE_EXPLORER_ARTIFACT_VERSION: Final = 2
SCALE_EXPLORER_ARTIFACT_PATH: Final = "data/seed/scale-explorer-v1.json"
LIGHT_YEAR_METRES_APPROX: Final = 9.46e15
RELATIVE_ARITHMETIC_TOLERANCE: Final = 1e-12

# Keep the reviewed model's deliberately rounded light-year normalization while retaining
# Astropy's dimensional arithmetic at the astronomy-domain boundary.
SCALE_LIGHT_YEAR_UNIT = u.def_unit("lumina_ly", LIGHT_YEAR_METRES_APPROX * u.m)

ScaleSourceUnit = Literal["km", "ly"]
ScaleUnit = Literal["m", "km", "ly"]
ScaleSourceQuantity = Literal["radius", "diameter", "width", "extent"]
ScaleCharacteristicQuantity = Literal["diameter", "width", "observable-extent"]

_NODE_IDS: Final = (
    "moon",
    "mercury",
    "mars",
    "venus",
    "earth",
    "neptune",
    "uranus",
    "saturn",
    "jupiter",
    "sun",
    "milky-way",
    "observable-universe",
)
_SOURCE_IDS: Final = (
    "nasa-solar-system-sizes",
    "nasa-moon-lithograph",
    "nasa-sun-facts",
    "nasa-milky-way-size",
    "nasa-observable-universe-size",
    "nasa-light-year",
)
_OFFICIAL_SOURCE_HOSTS: Final = frozenset({"science.nasa.gov", "www.nasa.gov"})


class ScaleExplorerModelError(ValueError):
    """Raised when an input or reviewed artifact violates the model contract."""

    def __init__(self) -> None:
        super().__init__("SCALE_EXPLORER_MODEL_INVALID")


def _unit_for_name(unit: ScaleUnit) -> object:
    if unit == "m":
        return u.m
    if unit == "km":
        return u.km
    if unit == "ly":
        return SCALE_LIGHT_YEAR_UNIT
    raise ScaleExplorerModelError()


def _finite_positive_metres(quantity: Quantity) -> float:
    if not isinstance(quantity, Quantity) or not quantity.isscalar:
        raise ScaleExplorerModelError()
    try:
        metres = float(quantity.to_value(u.m))
    except (OverflowError, TypeError, UnitConversionError, ValueError):
        raise ScaleExplorerModelError() from None
    if not math.isfinite(metres) or metres <= 0:
        raise ScaleExplorerModelError()
    return metres


def scale_quantity(value: float, unit: ScaleUnit) -> Quantity:
    """Create a finite positive Astropy length using the reviewed model units."""

    if not isinstance(unit, str) or unit not in {"m", "km", "ly"}:
        raise ScaleExplorerModelError()
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ScaleExplorerModelError()
    try:
        numeric_value = float(value)
        quantity = Quantity(numeric_value, _unit_for_name(unit))
    except (OverflowError, TypeError, UnitConversionError, ValueError):
        raise ScaleExplorerModelError() from None
    _finite_positive_metres(quantity)
    return quantity


def _expected_characteristic_quantity(
    source_quantity: ScaleSourceQuantity,
) -> ScaleCharacteristicQuantity:
    if source_quantity == "radius" or source_quantity == "diameter":
        return "diameter"
    if source_quantity == "width":
        return "width"
    if source_quantity == "extent":
        return "observable-extent"
    raise ScaleExplorerModelError()


@dataclass(frozen=True, slots=True)
class ScaleExplorerInput:
    """One reviewed, unit-aware source value before model calculation."""

    id: str
    source: Quantity
    source_quantity: ScaleSourceQuantity
    characteristic_quantity: ScaleCharacteristicQuantity

    def __post_init__(self) -> None:
        if not isinstance(self.id, str) or not self.id:
            raise ScaleExplorerModelError()
        if self.id not in _NODE_IDS:
            raise ScaleExplorerModelError()
        if not isinstance(self.source, Quantity):
            raise ScaleExplorerModelError()
        if self.source.unit != u.km and self.source.unit != SCALE_LIGHT_YEAR_UNIT:
            raise ScaleExplorerModelError()
        _finite_positive_metres(self.source)
        if not isinstance(self.source_quantity, str) or self.source_quantity not in {
            "radius",
            "diameter",
            "width",
            "extent",
        }:
            raise ScaleExplorerModelError()
        if not isinstance(self.characteristic_quantity, str):
            raise ScaleExplorerModelError()
        if self.characteristic_quantity != _expected_characteristic_quantity(self.source_quantity):
            raise ScaleExplorerModelError()


@dataclass(frozen=True, slots=True)
class ScaleExplorerCalculatedNode:
    """One calculated node output consumed by a renderer or validation test."""

    id: str
    characteristic_size: Quantity
    position_percent: float

    @property
    def characteristic_size_m(self) -> float:
        """Return metres at the serialized/artifact boundary."""

        return _finite_positive_metres(self.characteristic_size)


def characteristic_size(node: ScaleExplorerInput) -> Quantity:
    """Derive the node's labelled characteristic size while retaining its unit."""

    source_metres = node.source.to(u.m)
    if node.source_quantity == "radius":
        try:
            characteristic_size = source_metres * 2.0
        except (OverflowError, TypeError, ValueError):
            raise ScaleExplorerModelError() from None
    elif node.source_quantity in {"diameter", "width", "extent"}:
        characteristic_size = source_metres
    else:
        raise ScaleExplorerModelError()
    _finite_positive_metres(characteristic_size)
    return characteristic_size


def characteristic_size_metres(node: ScaleExplorerInput) -> float:
    """Return one derived characteristic size in metres for an artifact boundary."""

    return _finite_positive_metres(characteristic_size(node))


def logarithmic_position_percent(
    characteristic_size: Quantity,
    minimum_size: Quantity,
    maximum_size: Quantity,
) -> float:
    """Return the normalized base-10 display coordinate for a positive size."""

    characteristic_size_m = _finite_positive_metres(characteristic_size)
    minimum_size_m = _finite_positive_metres(minimum_size)
    maximum_size_m = _finite_positive_metres(maximum_size)
    if (
        maximum_size_m <= minimum_size_m
        or not minimum_size_m <= characteristic_size_m <= maximum_size_m
    ):
        raise ScaleExplorerModelError()
    if characteristic_size_m == minimum_size_m:
        return 0.0
    if characteristic_size_m == maximum_size_m:
        return 100.0
    denominator = math.log10(maximum_size_m) - math.log10(minimum_size_m)
    if not math.isfinite(denominator) or denominator <= 0:
        raise ScaleExplorerModelError()
    position = (
        (math.log10(characteristic_size_m) - math.log10(minimum_size_m)) / denominator * 100.0
    )
    if not math.isfinite(position) or not 0.0 <= position <= 100.0:
        raise ScaleExplorerModelError()
    return position


def relative_size_ratio(selected_size: Quantity, reference_size: Quantity) -> float:
    """Return a positive dimensionless selected/reference characteristic-size ratio."""

    selected_size_m = _finite_positive_metres(selected_size)
    reference_size_m = _finite_positive_metres(reference_size)
    ratio = selected_size_m / reference_size_m
    if not math.isfinite(ratio) or ratio <= 0:
        raise ScaleExplorerModelError()
    return ratio


def build_scale_explorer_model(
    inputs: Sequence[ScaleExplorerInput],
) -> tuple[ScaleExplorerCalculatedNode, ...]:
    """Calculate all nodes in their reviewed increasing-size order."""

    if not inputs or tuple(node.id for node in inputs) != _NODE_IDS:
        raise ScaleExplorerModelError()
    sizes = tuple(characteristic_size(node) for node in inputs)
    size_metres = tuple(_finite_positive_metres(size) for size in sizes)
    if any(
        current <= previous for previous, current in zip(size_metres, size_metres[1:], strict=False)
    ):
        raise ScaleExplorerModelError()
    minimum_size = sizes[0]
    maximum_size = sizes[-1]
    return tuple(
        ScaleExplorerCalculatedNode(
            id=node.id,
            characteristic_size=size,
            position_percent=logarithmic_position_percent(size, minimum_size, maximum_size),
        )
        for node, size in zip(inputs, sizes, strict=True)
    )


def _duplicate_key_rejector(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ScaleExplorerModelError()
        result[key] = value
    return result


def _load_artifact(repository_root: Path) -> dict[str, object]:
    path = repository_root / SCALE_EXPLORER_ARTIFACT_PATH
    try:
        decoded = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_duplicate_key_rejector
        )
    except (OSError, json.JSONDecodeError, ScaleExplorerModelError):
        raise ScaleExplorerModelError() from None
    if not isinstance(decoded, dict):
        raise ScaleExplorerModelError()
    return decoded


def _mapping(value: object) -> Mapping[str, object]:
    if not isinstance(value, dict):
        raise ScaleExplorerModelError()
    return value


def _list(value: object) -> list[object]:
    if not isinstance(value, list):
        raise ScaleExplorerModelError()
    return value


def _string(mapping: Mapping[str, object], key: str) -> str:
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise ScaleExplorerModelError()
    return value


def _is_https_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        return (
            parsed.scheme == "https"
            and parsed.hostname in _OFFICIAL_SOURCE_HOSTS
            and parsed.username is None
            and parsed.password is None
            and parsed.port is None
        )
    except ValueError:
        return False


def _string_list(value: object) -> tuple[str, ...]:
    values = _list(value)
    result = tuple(item for item in values if isinstance(item, str) and item)
    if len(result) != len(values):
        raise ScaleExplorerModelError()
    return result


def _has_only_keys(mapping: Mapping[str, object], keys: Sequence[str]) -> bool:
    return set(mapping) == set(keys)


def _has_no_unknown_keys(mapping: Mapping[str, object], keys: Sequence[str]) -> bool:
    return set(mapping).issubset(set(keys))


def _has_required_keys(mapping: Mapping[str, object], keys: Sequence[str]) -> bool:
    return all(key in mapping for key in keys)


def _finite_number(mapping: Mapping[str, object], key: str) -> float:
    value = mapping.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ScaleExplorerModelError()
    try:
        number = float(value)
    except (OverflowError, ValueError):
        raise ScaleExplorerModelError() from None
    if not math.isfinite(number):
        raise ScaleExplorerModelError()
    return number


def _input_from_artifact(node_value: object) -> tuple[ScaleExplorerInput, float, float]:
    node = _mapping(node_value)
    node_id = _string(node, "id")
    source_unit_value = _string(node, "source_unit")
    source_quantity_value = _string(node, "source_quantity")
    characteristic_quantity_value = _string(node, "characteristic_quantity")
    if source_unit_value not in {"km", "ly"}:
        raise ScaleExplorerModelError()
    if source_quantity_value not in {"radius", "diameter", "width", "extent"}:
        raise ScaleExplorerModelError()
    if characteristic_quantity_value not in {"diameter", "width", "observable-extent"}:
        raise ScaleExplorerModelError()
    node_input = ScaleExplorerInput(
        id=node_id,
        source=scale_quantity(
            _finite_number(node, "source_value"),
            cast(ScaleSourceUnit, source_unit_value),
        ),
        source_quantity=cast(ScaleSourceQuantity, source_quantity_value),
        characteristic_quantity=cast(ScaleCharacteristicQuantity, characteristic_quantity_value),
    )
    return (
        node_input,
        _finite_number(node, "calculated_characteristic_size_m"),
        _finite_number(node, "display_position_percent"),
    )


def _validate_algorithm_metadata(
    value: object,
    *,
    algorithm_id: str,
    output_unit: str,
    test_references: Sequence[str],
) -> None:
    metadata = _mapping(value)
    if not _has_only_keys(
        metadata,
        (
            "algorithm_id",
            "algorithm_version",
            "inputs",
            "output_unit",
            "valid_domain",
            "numerical_tolerance",
            "test_references",
            "generated_at",
        ),
    ) or (
        _string(metadata, "algorithm_id") != algorithm_id
        or metadata.get("algorithm_version") != 1
        or not _string(metadata, "inputs")
        or _string(metadata, "output_unit") != output_unit
        or not _string(metadata, "valid_domain")
        or not _string(metadata, "numerical_tolerance")
        or _string_list(metadata.get("test_references")) != tuple(test_references)
        or not _string(metadata, "generated_at")
    ):
        raise ScaleExplorerModelError()


def load_reviewed_scale_explorer_inputs(
    *, repository_root: Path | None = None
) -> tuple[ScaleExplorerInput, ...]:
    """Load and validate the reviewed static artifact's scientific input slice."""

    root = Path(__file__).resolve().parents[6] if repository_root is None else repository_root
    artifact = _load_artifact(root)
    if not _has_only_keys(
        artifact,
        (
            "artifact_version",
            "model_version",
            "schema_version",
            "light_year_metres_approx",
            "generated_at",
            "definition",
            "sources",
            "nodes",
            "pairwise_ratios",
            "validation_fixtures",
            "scientific_validation",
        ),
    ):
        raise ScaleExplorerModelError()
    if (
        artifact.get("artifact_version") != SCALE_EXPLORER_ARTIFACT_VERSION
        or artifact.get("model_version") != SCALE_EXPLORER_MODEL_VERSION
        or artifact.get("schema_version") != SCALE_EXPLORER_SCHEMA_VERSION
        or _finite_number(artifact, "light_year_metres_approx") != LIGHT_YEAR_METRES_APPROX
    ):
        raise ScaleExplorerModelError()

    definition = _mapping(artifact.get("definition"))
    if not _has_only_keys(
        definition,
        (
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
            "learning_objectives",
            "prerequisite_concepts",
            "input_schema",
            "default_preset",
            "calculation_module",
            "output_schema",
            "visualization_module",
            "assumptions",
            "limitations",
            "references",
            "validation_fixtures",
            "share_schema_version",
        ),
    ) or (
        _string(definition, "slug") != "scale-explorer"
        or _string(definition, "title") != "Scale Explorer"
        or _string(definition, "content_type") != "interactive-simulation"
        or _string(definition, "language") != "en"
        or _string(definition, "status") != "ready"
        or definition.get("version") != 1
        or _string_list(definition.get("audience_modes")) != ("explorer", "student", "deep-dive")
        or not _string_list(definition.get("reviewed_by"))
        or not _string(definition, "reviewed_at")
        or not _string(definition, "updated_at")
        or _string(definition, "model_version") != SCALE_EXPLORER_MODEL_VERSION
        or not _string_list(definition.get("learning_objectives"))
        or not _string_list(definition.get("prerequisite_concepts"))
        or _string(definition, "default_preset") != "earth"
        or not _string_list(definition.get("output_schema"))
        or not _string(definition, "visualization_module")
        or not _string_list(definition.get("assumptions"))
        or not _string_list(definition.get("limitations"))
        or not _string_list(definition.get("references"))
        or not _string_list(definition.get("validation_fixtures"))
        or definition.get("share_schema_version") != SCALE_EXPLORER_SCHEMA_VERSION
    ):
        raise ScaleExplorerModelError()
    input_schema = _mapping(definition.get("input_schema"))
    if not _has_only_keys(input_schema, ("name", "unit", "valid_values", "invalid_handling")) or (
        _string(input_schema, "name") != "selected_node_id"
        or _string(input_schema, "unit") != "curated node identifier"
        or _string_list(input_schema.get("valid_values")) != _NODE_IDS
        or not _string(input_schema, "invalid_handling")
    ):
        raise ScaleExplorerModelError()
    calculation_module = _mapping(definition.get("calculation_module"))
    if not _has_only_keys(
        calculation_module,
        ("canonical_unit", "relationships", "characteristic_size", "derived_comparison"),
    ) or (
        _string(calculation_module, "canonical_unit") != "m"
        or not _string_list(calculation_module.get("relationships"))
    ):
        raise ScaleExplorerModelError()
    _validate_algorithm_metadata(
        calculation_module.get("characteristic_size"),
        algorithm_id="scale-characteristic-size-v1",
        output_unit="m",
        test_references=(
            "scale-explorer-characteristic-size-known-cases",
            "scale-explorer-independent-source-known-cases",
            "scale-explorer-log-endpoints-edge-cases",
        ),
    )
    _validate_algorithm_metadata(
        calculation_module.get("derived_comparison"),
        algorithm_id="scale-relative-ratio-v1",
        output_unit="dimensionless ratio",
        test_references=(
            "scale-explorer-derived-comparison-known-cases",
            "scale-explorer-log-endpoints-edge-cases",
        ),
    )

    scientific_validation = _mapping(artifact.get("scientific_validation"))
    if not _has_only_keys(
        scientific_validation,
        ("id", "checked_at", "method", "tools", "source_ids", "test_references"),
    ) or (
        _string(scientific_validation, "id") != "scale-explorer-independent-validation-v1"
        or not _string(scientific_validation, "checked_at")
        or not _string(scientific_validation, "method")
        or _string_list(scientific_validation.get("source_ids")) != _SOURCE_IDS
        or _string_list(scientific_validation.get("test_references"))
        != (
            "scale-explorer-independent-decimal-cross-check",
            "scale-explorer-independent-source-known-cases",
        )
    ):
        raise ScaleExplorerModelError()
    tools = _list(scientific_validation.get("tools"))
    if len(tools) != 1:
        raise ScaleExplorerModelError()
    tool = _mapping(tools[0])
    if not _has_only_keys(tool, ("name", "version", "role")) or (
        _string(tool, "name") != "Python decimal"
        or not _string(tool, "version")
        or not _string(tool, "role")
    ):
        raise ScaleExplorerModelError()

    if _string_list(definition.get("references")) != _SOURCE_IDS:
        raise ScaleExplorerModelError()

    source_values = _list(artifact.get("sources"))
    source_ids: list[str] = []
    for source_value in source_values:
        source = _mapping(source_value)
        if not _has_only_keys(
            source,
            (
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
            ),
        ) or (
            not _string(source, "id")
            or not _string(source, "title")
            or not _string(source, "organization_or_authors")
            or not _string(source, "url")
            or not _is_https_url(_string(source, "url"))
            or not _string(source, "accessed_at")
            or not _string(source, "dataset_or_release")
            or not _string(source, "record_reference")
            or not _string(source, "retrieved_at")
            or not _string(source, "data_date")
            or not _string(source, "terms_or_licence")
            or not _string(source, "citation")
            or not _string(source, "claim_scope")
            or _string(source, "source_type") not in {"official-agency", "official-education"}
        ):
            raise ScaleExplorerModelError()
        source_ids.append(_string(source, "id"))
    if tuple(source_ids) != _SOURCE_IDS or len(set(source_ids)) != len(source_ids):
        raise ScaleExplorerModelError()

    node_values = _list(artifact.get("nodes"))
    if tuple(_string(_mapping(value), "id") for value in node_values) != _NODE_IDS:
        raise ScaleExplorerModelError()
    node_keys = (
        "id",
        "name",
        "category",
        "source_value",
        "source_unit",
        "source_quantity",
        "characteristic_quantity",
        "display_value",
        "value_status",
        "source_basis",
        "comparison",
        "comparison_text",
        "transition_explanation",
        "entity_links",
        "source_ids",
        "calculated_characteristic_size_m",
        "display_position_percent",
    )
    for node_value in node_values:
        node = _mapping(node_value)
        if not _has_only_keys(node, node_keys):
            raise ScaleExplorerModelError()
        node_source_ids = _string_list(node.get("source_ids"))
        if not node_source_ids or any(source_id not in source_ids for source_id in node_source_ids):
            raise ScaleExplorerModelError()
        comparison = _mapping(node.get("comparison"))
        comparison_kind = _string(comparison, "kind")
        if comparison_kind == "contextual":
            if not _has_only_keys(comparison, ("kind", "text")) or not _string(comparison, "text"):
                raise ScaleExplorerModelError()
        elif comparison_kind == "ratio":
            if not _has_only_keys(comparison, ("kind", "reference_node_id")):
                raise ScaleExplorerModelError()
            reference_id = _string(comparison, "reference_node_id")
            if reference_id not in _NODE_IDS or reference_id == _string(node, "id"):
                raise ScaleExplorerModelError()
        else:
            raise ScaleExplorerModelError()
        transition = _mapping(node.get("transition_explanation"))
        if not _has_no_unknown_keys(transition, ("text", "source_ids", "derived_quantity")):
            raise ScaleExplorerModelError()
        if not _string(transition, "text") or not _string_list(transition.get("source_ids")):
            raise ScaleExplorerModelError()
        if any(
            source_id not in source_ids for source_id in _string_list(transition.get("source_ids"))
        ):
            raise ScaleExplorerModelError()
        derived_quantity = transition.get("derived_quantity")
        if derived_quantity is not None:
            derived = _mapping(derived_quantity)
            if not _has_only_keys(
                derived,
                (
                    "algorithm_id",
                    "algorithm_version",
                    "input_node_ids",
                    "input_source_ids",
                    "input_unit",
                    "output_unit",
                    "valid_domain",
                    "numerical_tolerance",
                    "test_references",
                    "generated_at",
                    "learner_facing_rounding",
                ),
            ):
                raise ScaleExplorerModelError()
            if (
                _string(derived, "algorithm_id") != "scale-relative-ratio-v1"
                or derived.get("algorithm_version") != 1
                or _string(derived, "input_unit") != "m"
                or _string(derived, "output_unit") != "dimensionless ratio"
                or not _string_list(derived.get("input_node_ids"))
                or not _string_list(derived.get("input_source_ids"))
                or not _string(derived, "valid_domain")
                or not _string(derived, "numerical_tolerance")
                or not _string_list(derived.get("test_references"))
                or not _string(derived, "generated_at")
                or not _string(derived, "learner_facing_rounding")
            ):
                raise ScaleExplorerModelError()
        links = _list(node.get("entity_links"))
        if not links:
            raise ScaleExplorerModelError()
        for link_value in links:
            link = _mapping(link_value)
            if not _has_only_keys(link, ("label", "href", "kind")) or (
                not _string(link, "label")
                or not _string(link, "href")
                or not _is_https_url(_string(link, "href"))
                or _string(link, "kind") not in {"entity-reference", "source-reference"}
            ):
                raise ScaleExplorerModelError()
        if not _string(node, "comparison_text") or not _string(node, "display_value"):
            raise ScaleExplorerModelError()
        if _string(node, "source_unit") not in {"km", "ly"}:
            raise ScaleExplorerModelError()
        if _string(node, "source_quantity") not in {"radius", "diameter", "width", "extent"}:
            raise ScaleExplorerModelError()
        if _string(node, "characteristic_quantity") not in {
            "diameter",
            "width",
            "observable-extent",
        }:
            raise ScaleExplorerModelError()
        if _string(node, "value_status") not in {
            "reported",
            "approximate",
            "derived-approximate",
            "model-based",
        }:
            raise ScaleExplorerModelError()

    fixture_values = _list(artifact.get("validation_fixtures"))
    fixture_ids: list[str] = []
    fixture_allowed_keys = (
        "id",
        "node_id",
        "expected_characteristic_size_m",
        "tolerance_m",
        "expected_position_percent",
        "position_tolerance_percent",
        "expected_comparison",
        "purpose",
    )
    for fixture_value in fixture_values:
        fixture = _mapping(fixture_value)
        if not _has_no_unknown_keys(fixture, fixture_allowed_keys) or not _has_required_keys(
            fixture,
            ("id", "node_id", "expected_characteristic_size_m", "tolerance_m", "purpose"),
        ):
            raise ScaleExplorerModelError()
        fixture_id = _string(fixture, "id")
        if fixture_id in fixture_ids:
            raise ScaleExplorerModelError()
        fixture_ids.append(fixture_id)
        if (
            _string(fixture, "node_id") not in _NODE_IDS
            or not math.isfinite(_finite_number(fixture, "expected_characteristic_size_m"))
            or _finite_number(fixture, "expected_characteristic_size_m") <= 0
            or not math.isfinite(_finite_number(fixture, "tolerance_m"))
            or _finite_number(fixture, "tolerance_m") < 0
            or not _string(fixture, "purpose")
        ):
            raise ScaleExplorerModelError()
        if "expected_position_percent" in fixture:
            position = _finite_number(fixture, "expected_position_percent")
            if position < 0 or position > 100:
                raise ScaleExplorerModelError()
            if (
                "position_tolerance_percent" in fixture
                and _finite_number(fixture, "position_tolerance_percent") < 0
            ):
                raise ScaleExplorerModelError()
        elif "position_tolerance_percent" in fixture:
            raise ScaleExplorerModelError()
        expected_comparison = fixture.get("expected_comparison")
        if expected_comparison is not None:
            comparison = _mapping(expected_comparison)
            if not _has_only_keys(
                comparison, ("reference_node_id", "expected_ratio", "ratio_relative_tolerance")
            ) or (
                _string(comparison, "reference_node_id") not in _NODE_IDS
                or _string(comparison, "reference_node_id") == _string(fixture, "node_id")
                or _finite_number(comparison, "expected_ratio") <= 0
                or _finite_number(comparison, "ratio_relative_tolerance") <= 0
            ):
                raise ScaleExplorerModelError()
    if not fixture_ids or tuple(_string_list(definition.get("validation_fixtures"))) != tuple(
        fixture_ids
    ):
        raise ScaleExplorerModelError()

    parsed = tuple(_input_from_artifact(value) for value in node_values)
    inputs = tuple(item[0] for item in parsed)
    calculated = build_scale_explorer_model(inputs)
    for (_, expected_size, expected_position), actual in zip(parsed, calculated, strict=True):
        if not math.isclose(
            actual.characteristic_size_m,
            expected_size,
            rel_tol=RELATIVE_ARITHMETIC_TOLERANCE,
            abs_tol=0.0,
        ) or not math.isclose(
            actual.position_percent,
            expected_position,
            rel_tol=RELATIVE_ARITHMETIC_TOLERANCE,
            abs_tol=0.0,
        ):
            raise ScaleExplorerModelError()
    calculated_by_id = {node.id: node for node in calculated}
    for fixture_value in fixture_values:
        fixture = _mapping(fixture_value)
        node_id = _string(fixture, "node_id")
        fixture_node = calculated_by_id.get(node_id)
        if fixture_node is None:
            raise ScaleExplorerModelError()
        expected_size = _finite_number(fixture, "expected_characteristic_size_m")
        size_tolerance = _finite_number(fixture, "tolerance_m")
        if not math.isclose(
            fixture_node.characteristic_size_m,
            expected_size,
            rel_tol=0.0,
            abs_tol=size_tolerance,
        ):
            raise ScaleExplorerModelError()
        if "expected_position_percent" in fixture:
            expected_position = _finite_number(fixture, "expected_position_percent")
            position_tolerance = _finite_number(fixture, "position_tolerance_percent")
            if not math.isclose(
                fixture_node.position_percent,
                expected_position,
                rel_tol=0.0,
                abs_tol=position_tolerance,
            ):
                raise ScaleExplorerModelError()
        expected_comparison = fixture.get("expected_comparison")
        if expected_comparison is not None:
            comparison = _mapping(expected_comparison)
            reference_id = _string(comparison, "reference_node_id")
            reference = calculated_by_id.get(reference_id)
            if reference is None:
                raise ScaleExplorerModelError()
            expected_ratio = _finite_number(comparison, "expected_ratio")
            ratio_tolerance = _finite_number(comparison, "ratio_relative_tolerance")
            if not math.isclose(
                relative_size_ratio(
                    fixture_node.characteristic_size, reference.characteristic_size
                ),
                expected_ratio,
                rel_tol=ratio_tolerance,
                abs_tol=0.0,
            ):
                raise ScaleExplorerModelError()
    _validate_pairwise_ratios(artifact, calculated)
    _validate_node_comparisons(artifact, calculated)
    _validate_transition_claims(artifact, calculated)
    return inputs


def _validate_pairwise_ratios(
    artifact: Mapping[str, object], calculated: Sequence[ScaleExplorerCalculatedNode]
) -> None:
    expected_pairs = {
        (selected.id, reference.id): relative_size_ratio(
            selected.characteristic_size, reference.characteristic_size
        )
        for selected in calculated
        for reference in calculated
        if selected.id != reference.id
    }
    pair_values = _list(artifact.get("pairwise_ratios"))
    actual_pairs: dict[tuple[str, str], float] = {}
    for pair_value in pair_values:
        pair = _mapping(pair_value)
        if not _has_only_keys(pair, ("selected_node_id", "reference_node_id", "ratio")):
            raise ScaleExplorerModelError()
        selected_id = _string(pair, "selected_node_id")
        reference_id = _string(pair, "reference_node_id")
        if (
            selected_id not in _NODE_IDS
            or reference_id not in _NODE_IDS
            or selected_id == reference_id
        ):
            raise ScaleExplorerModelError()
        key = (selected_id, reference_id)
        if key in actual_pairs:
            raise ScaleExplorerModelError()
        actual_pairs[key] = _finite_number(pair, "ratio")
    if set(actual_pairs) != set(expected_pairs):
        raise ScaleExplorerModelError()
    for key, expected in expected_pairs.items():
        actual = actual_pairs[key]
        if not math.isclose(actual, expected, rel_tol=RELATIVE_ARITHMETIC_TOLERANCE, abs_tol=0.0):
            raise ScaleExplorerModelError()


def _format_two_significant(value: float) -> str:
    if not math.isfinite(value) or value <= 0:
        raise ScaleExplorerModelError()
    order = math.floor(math.log10(value))
    decimal_places = max(0, 1 - order)
    rounded = round(value, decimal_places)
    if not math.isfinite(rounded) or rounded <= 0:
        raise ScaleExplorerModelError()
    if rounded.is_integer():
        return f"{rounded:,.0f}"
    return f"{rounded:,.{decimal_places}f}"


def _format_ratio(ratio: float) -> str:
    if ratio >= 1e12:
        return f"{_format_two_significant(ratio / 1e12)} trillion"
    return _format_two_significant(ratio)


def _comparison_reference_label(node: Mapping[str, object]) -> str:
    name = _string(node, "name")
    characteristic_quantity = _string(node, "characteristic_quantity")
    if characteristic_quantity == "width":
        return f"the {name}'s approximate width"
    if characteristic_quantity == "observable-extent":
        return f"the {name}'s observable-universe extent"
    if characteristic_quantity == "diameter":
        return f"{name}'s characteristic diameter"
    raise ScaleExplorerModelError()


def _artifact_nodes_by_id(artifact: Mapping[str, object]) -> dict[str, Mapping[str, object]]:
    nodes: dict[str, Mapping[str, object]] = {}
    for node_value in _list(artifact.get("nodes")):
        node = _mapping(node_value)
        node_id = _string(node, "id")
        if node_id in nodes or node_id not in _NODE_IDS:
            raise ScaleExplorerModelError()
        nodes[node_id] = node
    if tuple(nodes) != _NODE_IDS:
        raise ScaleExplorerModelError()
    return nodes


def _validate_node_comparisons(
    artifact: Mapping[str, object], calculated: Sequence[ScaleExplorerCalculatedNode]
) -> None:
    """Validate authored comparison definitions and their rounded learner-facing text."""

    nodes = _artifact_nodes_by_id(artifact)
    calculated_by_id = {node.id: node for node in calculated}
    if set(calculated_by_id) != set(_NODE_IDS):
        raise ScaleExplorerModelError()
    for node_id in _NODE_IDS:
        node = nodes[node_id]
        if "calculated_comparison" in node:
            raise ScaleExplorerModelError()
        comparison = _mapping(node.get("comparison"))
        comparison_kind = _string(comparison, "kind")
        comparison_text = _string(node, "comparison_text")
        if comparison_kind == "contextual":
            if comparison_text != _string(comparison, "text"):
                raise ScaleExplorerModelError()
            continue
        if comparison_kind != "ratio":
            raise ScaleExplorerModelError()
        reference_id = _string(comparison, "reference_node_id")
        if reference_id == node_id or reference_id not in calculated_by_id:
            raise ScaleExplorerModelError()
        ratio = relative_size_ratio(
            calculated_by_id[node_id].characteristic_size,
            calculated_by_id[reference_id].characteristic_size,
        )
        expected_text = (
            f"About {_format_ratio(ratio)}× {_comparison_reference_label(nodes[reference_id])}."
        )
        if comparison_text != expected_text:
            raise ScaleExplorerModelError()


def _validate_transition_claims(
    artifact: Mapping[str, object], calculated: Sequence[ScaleExplorerCalculatedNode]
) -> None:
    """Validate metadata and authored text for transitions that state calculated ratios."""

    nodes = _artifact_nodes_by_id(artifact)
    calculated_by_id = {node.id: node for node in calculated}
    source_ids_by_node = {
        node_id: _string_list(nodes[node_id].get("source_ids")) for node_id in _NODE_IDS
    }
    expected_phrases = {
        ("mercury", "moon"): (
            "about one-and-a-half Moon diameters",
            "about one-and-a-half",
            1.40431654676259,
        ),
        ("neptune", "earth"): (
            "nearly four Earth characteristic diameters",
            "nearly four",
            3.864699419243447,
        ),
        ("sun", "jupiter"): (
            "about ten times Jupiter's characteristic diameter",
            "about ten",
            10.012730471599605,
        ),
    }
    for node_id in _NODE_IDS:
        transition = _mapping(nodes[node_id].get("transition_explanation"))
        transition_text = _string(transition, "text")
        transition_source_ids = _string_list(transition.get("source_ids"))
        if not transition_source_ids:
            raise ScaleExplorerModelError()
        derived_value = transition.get("derived_quantity")
        if derived_value is None:
            continue
        derived = _mapping(derived_value)
        if (
            not _has_only_keys(
                derived,
                (
                    "algorithm_id",
                    "algorithm_version",
                    "input_node_ids",
                    "input_source_ids",
                    "input_unit",
                    "output_unit",
                    "valid_domain",
                    "numerical_tolerance",
                    "test_references",
                    "generated_at",
                    "learner_facing_rounding",
                ),
            )
            or _string(derived, "algorithm_id") != "scale-relative-ratio-v1"
            or derived.get("algorithm_version") != 1
            or _string(derived, "input_unit") != "m"
            or _string(derived, "output_unit") != "dimensionless ratio"
            or not _string(derived, "valid_domain")
            or not _string(derived, "numerical_tolerance")
            or not _string(derived, "generated_at").__contains__("T")
            or not _string(derived, "learner_facing_rounding")
            or not _string_list(derived.get("test_references"))
        ):
            raise ScaleExplorerModelError()
        input_node_ids = _string_list(derived.get("input_node_ids"))
        if (
            len(input_node_ids) != 2
            or len(set(input_node_ids)) != 2
            or input_node_ids[0] != node_id
            or input_node_ids[1] not in calculated_by_id
        ):
            raise ScaleExplorerModelError()
        reference_id = input_node_ids[1]
        expected_source_ids = tuple(
            dict.fromkeys((*source_ids_by_node[node_id], *source_ids_by_node[reference_id]))
        )
        if _string_list(derived.get("input_source_ids")) != expected_source_ids:
            raise ScaleExplorerModelError()
        if tuple(dict.fromkeys(transition_source_ids)) != expected_source_ids:
            raise ScaleExplorerModelError()
        ratio = relative_size_ratio(
            calculated_by_id[node_id].characteristic_size,
            calculated_by_id[reference_id].characteristic_size,
        )
        expected_phrase = expected_phrases.get((node_id, reference_id))
        if expected_phrase is None:
            raise ScaleExplorerModelError()
        if (
            not math.isfinite(ratio)
            or ratio <= 0
            or not math.isclose(
                ratio,
                expected_phrase[2],
                rel_tol=RELATIVE_ARITHMETIC_TOLERANCE,
                abs_tol=0.0,
            )
        ):
            raise ScaleExplorerModelError()
        if expected_phrase is None or expected_phrase[0] not in transition_text:
            raise ScaleExplorerModelError()
        if expected_phrase[1] not in _string(derived, "learner_facing_rounding"):
            raise ScaleExplorerModelError()
