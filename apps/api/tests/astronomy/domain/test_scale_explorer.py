from __future__ import annotations

import json
import math
from decimal import Decimal, localcontext
from pathlib import Path
from typing import cast

import pytest
from astropy import units as u
from lumina.astronomy.domain.scale_explorer import (
    LIGHT_YEAR_METRES_APPROX,
    RELATIVE_ARITHMETIC_TOLERANCE,
    ScaleExplorerInput,
    ScaleExplorerModelError,
    ScaleSourceQuantity,
    ScaleUnit,
    build_scale_explorer_model,
    characteristic_size_metres,
    load_reviewed_scale_explorer_inputs,
    logarithmic_position_percent,
    relative_size_ratio,
    scale_quantity,
)

_REPOSITORY_ROOT = Path(__file__).resolve().parents[5]

_INDEPENDENT_SOURCE_CASES: tuple[tuple[str, float, str, str, str, float], ...] = (
    ("moon", 3_475.0, "km", "diameter", "nasa-moon-lithograph", 3_475_000.0),
    ("mercury", 2_440.0, "km", "radius", "nasa-solar-system-sizes", 4_880_000.0),
    ("mars", 3_390.0, "km", "radius", "nasa-solar-system-sizes", 6_780_000.0),
    ("venus", 6_052.0, "km", "radius", "nasa-solar-system-sizes", 12_104_000.0),
    ("earth", 6_371.0, "km", "radius", "nasa-solar-system-sizes", 12_742_000.0),
    ("neptune", 24_622.0, "km", "radius", "nasa-solar-system-sizes", 49_244_000.0),
    ("uranus", 25_362.0, "km", "radius", "nasa-solar-system-sizes", 50_724_000.0),
    ("saturn", 58_232.0, "km", "radius", "nasa-solar-system-sizes", 116_464_000.0),
    ("jupiter", 69_911.0, "km", "radius", "nasa-solar-system-sizes", 139_822_000.0),
    ("sun", 1_400_000.0, "km", "diameter", "nasa-sun-facts", 1_400_000_000.0),
    ("milky-way", 100_000.0, "ly", "width", "nasa-milky-way-size", 9.46e20),
    (
        "observable-universe",
        92_000_000_000.0,
        "ly",
        "extent",
        "nasa-observable-universe-size",
        8.7032e26,
    ),
)


def _independent_artifact() -> dict[str, object]:
    return cast(
        dict[str, object],
        json.loads(
            (_REPOSITORY_ROOT / "data/seed/scale-explorer-v1.json").read_text(encoding="utf-8")
        ),
    )


def _independent_string(mapping: dict[str, object], key: str) -> str:
    value = mapping[key]
    assert isinstance(value, str)
    return value


def _independent_decimal(mapping: dict[str, object], key: str) -> Decimal:
    value = mapping[key]
    assert isinstance(value, (int, float)) and not isinstance(value, bool)
    return Decimal(str(value))


def _independent_characteristic_size_m(
    node: dict[str, object], light_year_metres: Decimal
) -> Decimal:
    unit = _independent_string(node, "source_unit")
    factor = Decimal(1_000) if unit == "km" else light_year_metres
    size = _independent_decimal(node, "source_value") * factor
    if _independent_string(node, "source_quantity") == "radius":
        size *= Decimal(2)
    return size


def _independent_log_position_percent(size: Decimal, minimum: Decimal, maximum: Decimal) -> Decimal:
    with localcontext() as context:
        context.prec = 50
        return (size.ln() - minimum.ln()) / (maximum.ln() - minimum.ln()) * Decimal(100)


def test_reviewed_artifact_matches_the_python_model() -> None:
    inputs = load_reviewed_scale_explorer_inputs(repository_root=_REPOSITORY_ROOT)
    calculated = build_scale_explorer_model(inputs)

    assert len(calculated) == 12
    assert calculated[0].id == "moon"
    assert calculated[-1].id == "observable-universe"
    assert calculated[0].position_percent == 0.0
    assert calculated[-1].position_percent == 100.0


def test_known_characteristic_sizes_use_independent_reviewed_values() -> None:
    moon = ScaleExplorerInput("moon", scale_quantity(3_475, "km"), "diameter", "diameter")
    earth = ScaleExplorerInput("earth", scale_quantity(6_371, "km"), "radius", "diameter")
    sun = ScaleExplorerInput("sun", scale_quantity(1_400_000, "km"), "diameter", "diameter")
    milky_way = ScaleExplorerInput("milky-way", scale_quantity(100_000, "ly"), "width", "width")
    observable = ScaleExplorerInput(
        "observable-universe",
        scale_quantity(92_000_000_000, "ly"),
        "extent",
        "observable-extent",
    )

    assert characteristic_size_metres(moon) == 3_475_000
    assert characteristic_size_metres(earth) == 12_742_000
    assert characteristic_size_metres(sun) == 1_400_000_000
    assert characteristic_size_metres(milky_way) == LIGHT_YEAR_METRES_APPROX * 100_000
    assert characteristic_size_metres(observable) == LIGHT_YEAR_METRES_APPROX * 92_000_000_000


def test_every_reviewed_node_matches_an_independent_source_case() -> None:
    artifact = _independent_artifact()
    raw_nodes = artifact["nodes"]
    assert isinstance(raw_nodes, list)
    nodes_by_id = {
        _independent_string(node, "id"): node for node in raw_nodes if isinstance(node, dict)
    }
    assert len(nodes_by_id) == len(_INDEPENDENT_SOURCE_CASES)

    for (
        node_id,
        source_value,
        source_unit,
        source_quantity,
        source_id,
        expected_size,
    ) in _INDEPENDENT_SOURCE_CASES:
        node = nodes_by_id[node_id]
        assert _independent_decimal(node, "source_value") == Decimal(str(source_value))
        assert _independent_string(node, "source_unit") == source_unit
        assert _independent_string(node, "source_quantity") == source_quantity
        source_ids = node["source_ids"]
        assert isinstance(source_ids, list)
        assert source_id in source_ids
        assert float(
            _independent_decimal(node, "calculated_characteristic_size_m")
        ) == pytest.approx(expected_size, rel=RELATIVE_ARITHMETIC_TOLERANCE)


def test_independent_decimal_cross_check_recalculates_the_complete_artifact() -> None:
    artifact = _independent_artifact()
    validation = artifact["scientific_validation"]
    assert isinstance(validation, dict)
    assert validation["id"] == "scale-explorer-independent-validation-v1"
    tools = validation["tools"]
    assert isinstance(tools, list) and len(tools) == 1
    assert isinstance(tools[0], dict)
    assert tools[0]["name"] == "Python decimal"

    raw_nodes = artifact["nodes"]
    assert isinstance(raw_nodes, list) and raw_nodes
    nodes = [node for node in raw_nodes if isinstance(node, dict)]
    assert len(nodes) == len(raw_nodes)
    light_year_metres = _independent_decimal(artifact, "light_year_metres_approx")
    independent_sizes = {
        _independent_string(node, "id"): _independent_characteristic_size_m(node, light_year_metres)
        for node in nodes
    }
    minimum = independent_sizes[_independent_string(nodes[0], "id")]
    maximum = independent_sizes[_independent_string(nodes[-1], "id")]

    for node in nodes:
        node_id = _independent_string(node, "id")
        expected_size = independent_sizes[node_id]
        assert float(expected_size) == pytest.approx(
            float(_independent_decimal(node, "calculated_characteristic_size_m")),
            rel=1e-12,
        )
        expected_position = _independent_log_position_percent(expected_size, minimum, maximum)
        assert float(expected_position) == pytest.approx(
            float(_independent_decimal(node, "display_position_percent")),
            rel=1e-12,
            abs=1e-12,
        )

    raw_pairs = artifact["pairwise_ratios"]
    assert isinstance(raw_pairs, list)
    for pair in raw_pairs:
        assert isinstance(pair, dict)
        selected = independent_sizes[_independent_string(pair, "selected_node_id")]
        reference = independent_sizes[_independent_string(pair, "reference_node_id")]
        with localcontext() as context:
            context.prec = 50
            expected_ratio = selected / reference
        assert float(expected_ratio) == pytest.approx(
            float(_independent_decimal(pair, "ratio")), rel=1e-12
        )


def test_ratio_and_log_position_known_cases_are_source_independent() -> None:
    assert relative_size_ratio(
        scale_quantity(4_880_000, "m"), scale_quantity(3_475_000, "m")
    ) == pytest.approx(1.40431654676259, rel=RELATIVE_ARITHMETIC_TOLERANCE)
    assert relative_size_ratio(
        scale_quantity(49_244_000, "m"), scale_quantity(12_742_000, "m")
    ) == pytest.approx(3.864699419243447, rel=RELATIVE_ARITHMETIC_TOLERANCE)
    assert relative_size_ratio(
        scale_quantity(1_400_000_000, "m"), scale_quantity(139_822_000, "m")
    ) == pytest.approx(10.012730471599605, rel=RELATIVE_ARITHMETIC_TOLERANCE)
    assert logarithmic_position_percent(
        scale_quantity(12_742_000, "m"),
        scale_quantity(3_475_000, "m"),
        scale_quantity(8.7032e26, "m"),
    ) == pytest.approx(2.766265122941635, rel=RELATIVE_ARITHMETIC_TOLERANCE)


def test_model_properties_hold_for_every_reviewed_node_pair() -> None:
    inputs = load_reviewed_scale_explorer_inputs(repository_root=_REPOSITORY_ROOT)
    model = build_scale_explorer_model(inputs)

    assert all(math.isfinite(node.characteristic_size_m) for node in model)
    assert all(0 <= node.position_percent <= 100 for node in model)
    assert all(
        left.characteristic_size_m < right.characteristic_size_m
        and left.position_percent < right.position_percent
        for left, right in zip(model, model[1:], strict=False)
    )
    for selected in model:
        for reference in model:
            if selected.id == reference.id:
                continue
            ratio = relative_size_ratio(selected.characteristic_size, reference.characteristic_size)
            reciprocal = relative_size_ratio(
                reference.characteristic_size, selected.characteristic_size
            )
            assert math.isfinite(ratio) and ratio > 0
            assert ratio * reciprocal == pytest.approx(1.0, rel=RELATIVE_ARITHMETIC_TOLERANCE)


@pytest.mark.parametrize(
    "source_value",
    [0.0, -1.0, math.nan, math.inf, -math.inf],
)
def test_invalid_source_values_fail_closed(source_value: float) -> None:
    with pytest.raises(ScaleExplorerModelError):
        node = ScaleExplorerInput(
            "invalid", scale_quantity(source_value, "km"), "diameter", "diameter"
        )
        characteristic_size_metres(node)


def test_invalid_model_ranges_fail_closed() -> None:
    with pytest.raises(ScaleExplorerModelError):
        logarithmic_position_percent(
            scale_quantity(1.0, "m"), scale_quantity(1.0, "m"), scale_quantity(1.0, "m")
        )
    with pytest.raises(ScaleExplorerModelError):
        scale_quantity(0.0, "m")
    with pytest.raises(ScaleExplorerModelError):
        scale_quantity(1.0, cast(ScaleUnit, "kg"))


def test_unit_conversion_properties_hold_for_positive_values() -> None:
    for value in (0.25, 1.0, 2.0, 1_000.0):
        kilometres = scale_quantity(value, "km")
        light_years = scale_quantity(value, "ly")
        assert kilometres.to_value(u.m) == value * 1_000.0
        assert light_years.to_value(u.m) == value * LIGHT_YEAR_METRES_APPROX
        assert relative_size_ratio(
            kilometres, scale_quantity(value * 1_000.0, "m")
        ) == pytest.approx(1.0, rel=RELATIVE_ARITHMETIC_TOLERANCE)
        assert kilometres.to_value(u.m) == kilometres.to_value(u.m)


def test_ratio_reciprocity_and_logarithmic_monotonicity_are_deterministic() -> None:
    small = scale_quantity(1.0, "m")
    middle = scale_quantity(10.0, "m")
    large = scale_quantity(100.0, "m")
    assert relative_size_ratio(small, large) * relative_size_ratio(large, small) == pytest.approx(
        1.0, rel=RELATIVE_ARITHMETIC_TOLERANCE
    )
    positions = [
        logarithmic_position_percent(size, small, large) for size in (small, middle, large)
    ]
    assert positions == [0.0, 50.0, 100.0]
    assert positions == [
        logarithmic_position_percent(size, small, large) for size in (small, middle, large)
    ]


def test_input_boundary_rejects_incompatible_units_and_quantity_labels() -> None:
    with pytest.raises(ScaleExplorerModelError):
        ScaleExplorerInput("invalid", scale_quantity(1.0, "m"), "diameter", "diameter")
    with pytest.raises(ScaleExplorerModelError):
        ScaleExplorerInput("invalid", scale_quantity(1.0, "km"), "radius", "width")
    with pytest.raises(ScaleExplorerModelError):
        ScaleExplorerInput("not-a-curated-node", scale_quantity(1.0, "km"), "diameter", "diameter")
    with pytest.raises(ScaleExplorerModelError):
        ScaleExplorerInput(
            "earth", scale_quantity(1.0, "km"), cast(ScaleSourceQuantity, []), "diameter"
        )


def test_model_requires_the_complete_authoritative_node_order() -> None:
    earth = ScaleExplorerInput("earth", scale_quantity(6_371, "km"), "radius", "diameter")
    with pytest.raises(ScaleExplorerModelError):
        build_scale_explorer_model((earth,))


def test_scale_quantity_rejects_string_numeric_values() -> None:
    with pytest.raises(ScaleExplorerModelError):
        scale_quantity(cast(float, "1.0"), "km")


def test_oversized_values_fail_with_the_stable_model_error() -> None:
    with pytest.raises(ScaleExplorerModelError):
        scale_quantity(cast(float, 10**400), "km")


def _write_artifact(root: Path, artifact: dict[str, object]) -> None:
    path = root / "data/seed/scale-explorer-v1.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(artifact), encoding="utf-8")


def test_reviewed_artifact_mutations_fail_closed(tmp_path: Path) -> None:
    for mutation in ("ratio", "position", "definition", "source", "fixture"):
        artifact = _independent_artifact()
        if mutation == "ratio":
            pairs = artifact["pairwise_ratios"]
            assert isinstance(pairs, list)
            pair = next(
                value
                for value in pairs
                if isinstance(value, dict)
                and value.get("selected_node_id") == "mercury"
                and value.get("reference_node_id") == "moon"
            )
            assert isinstance(pair, dict)
            pair["ratio"] = 999.0
        elif mutation == "position":
            nodes = artifact["nodes"]
            assert isinstance(nodes, list)
            node = next(
                value for value in nodes if isinstance(value, dict) and value.get("id") == "earth"
            )
            assert isinstance(node, dict)
            node["display_position_percent"] = 99.0
        elif mutation == "definition":
            definition = artifact["definition"]
            assert isinstance(definition, dict)
            definition["status"] = "draft"
        elif mutation == "source":
            sources = artifact["sources"]
            assert isinstance(sources, list)
            source = sources[0]
            assert isinstance(source, dict)
            source["id"] = "unreviewed-source"
        else:
            fixtures = artifact["validation_fixtures"]
            assert isinstance(fixtures, list)
            fixture = fixtures[0]
            assert isinstance(fixture, dict)
            fixture["expected_characteristic_size_m"] = 3_475_001

        _write_artifact(tmp_path, artifact)
        with pytest.raises(ScaleExplorerModelError):
            load_reviewed_scale_explorer_inputs(repository_root=tmp_path)
