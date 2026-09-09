import { describe, expect, it } from "vitest";

import scaleExplorerArtifact from "../../../data/seed/scale-explorer-v1.json";

import {
  DEFAULT_SCALE_EXPLORER_STATE,
  SCALE_EXPLORER_DEFINITION,
  SCALE_EXPLORER_MODEL_VERSION,
  SCALE_EXPLORER_NODES,
  SCALE_EXPLORER_SOURCES,
  SCALE_EXPLORER_VALIDATION_FIXTURES,
  buildScaleExplorerModel,
  calculateScaleExplorerRatio,
  canonicalSizeMetres,
  decodeScaleExplorerState,
  encodeScaleExplorerState,
  validateScaleExplorerArtifact,
  validateScaleExplorerState,
} from "../src/lib/simulations/scale-explorer";

function node(id: string) {
  const result = SCALE_EXPLORER_NODES.find((entry) => entry.id === id);
  if (result === undefined) throw new Error(`test node ${id} is missing`);
  return result;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("test artifact record expected");
  }
  return value as Record<string, unknown>;
}

function arrayItem(value: unknown, predicate: (item: Record<string, unknown>) => boolean) {
  if (!Array.isArray(value)) throw new Error("test artifact array expected");
  const item = value.find((candidate) => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      return false;
    }
    return predicate(candidate as Record<string, unknown>);
  });
  if (item === undefined) throw new Error("test artifact item expected");
  return record(item);
}

function clonedArtifact(): Record<string, unknown> {
  return structuredClone(scaleExplorerArtifact) as unknown as Record<string, unknown>;
}

describe("Scale Explorer model", () => {
  it("publishes the bounded curated lab definition and complete node metadata", () => {
    expect(SCALE_EXPLORER_DEFINITION).toMatchObject({
      slug: "scale-explorer",
      title: "Scale Explorer",
      content_type: "interactive-simulation",
      language: "en",
      status: "ready",
      version: 1,
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      share_schema_version: 1,
    });
    expect(SCALE_EXPLORER_DEFINITION.reviewed_by).toEqual(["Luna (primary engineer)"]);
    expect(SCALE_EXPLORER_DEFINITION.reviewed_at).toBe("2026-09-02T09:12:28Z");
    expect(SCALE_EXPLORER_DEFINITION.updated_at).toBe("2026-09-02T09:12:28Z");
    expect(SCALE_EXPLORER_DEFINITION.learning_objectives.length).toBeGreaterThan(0);
    expect(SCALE_EXPLORER_DEFINITION.assumptions.length).toBeGreaterThan(0);
    expect(SCALE_EXPLORER_DEFINITION.limitations.length).toBeGreaterThan(0);
    expect(SCALE_EXPLORER_NODES.length).toBeGreaterThanOrEqual(10);
    expect(SCALE_EXPLORER_NODES[0]?.id).toBe("moon");
    expect(SCALE_EXPLORER_NODES.at(-1)?.id).toBe("observable-universe");
    expect(
      SCALE_EXPLORER_NODES.every(
        (entry) =>
          entry.comparison.kind.length > 0 &&
          entry.transition_explanation.text.length > 0 &&
          entry.transition_explanation.source_ids.length > 0 &&
          entry.source_ids.length > 0 &&
          entry.entity_links.length > 0 &&
          entry.entity_links.every((link) => link.kind.length > 0),
      ),
    ).toBe(true);
    expect(SCALE_EXPLORER_DEFINITION.calculation_module.characteristic_size).toMatchObject({
      algorithm_id: "scale-characteristic-size-v1",
      algorithm_version: 1,
      output_unit: "m",
    });
    expect(SCALE_EXPLORER_DEFINITION.calculation_module.derived_comparison).toMatchObject({
      algorithm_id: "scale-relative-ratio-v1",
      algorithm_version: 1,
      output_unit: "dimensionless ratio",
    });
    expect(SCALE_EXPLORER_VALIDATION_FIXTURES.length).toBeGreaterThanOrEqual(3);
    expect(SCALE_EXPLORER_DEFINITION.validation_fixtures).toEqual(
      SCALE_EXPLORER_VALIDATION_FIXTURES.map((fixture) => fixture.id),
    );
  });

  it("resolves every node and definition reference to a reviewed source record", () => {
    const sourceIds = new Set(SCALE_EXPLORER_SOURCES.map((source) => source.id));

    expect(
      SCALE_EXPLORER_NODES.every((entry) =>
        entry.source_ids.every((sourceId) => sourceIds.has(sourceId)),
      ),
    ).toBe(true);
    expect(
      SCALE_EXPLORER_NODES.every((entry) =>
        entry.transition_explanation.source_ids.every((sourceId) => sourceIds.has(sourceId)),
      ),
    ).toBe(true);
    expect(node("mercury").transition_explanation.source_ids).toEqual([
      "nasa-solar-system-sizes",
      "nasa-moon-lithograph",
    ]);
    expect(node("sun").transition_explanation.source_ids).toEqual([
      "nasa-sun-facts",
      "nasa-solar-system-sizes",
    ]);
    expect(node("mercury").transition_explanation.derived_quantity).toMatchObject({
      algorithm_id: "scale-relative-ratio-v1",
      algorithm_version: 1,
      input_node_ids: ["mercury", "moon"],
      input_source_ids: ["nasa-solar-system-sizes", "nasa-moon-lithograph"],
      input_unit: "m",
      output_unit: "dimensionless ratio",
      test_references: ["scale-explorer-transition-ratio-known-cases"],
    });
    expect(node("neptune").transition_explanation.derived_quantity).toMatchObject({
      input_node_ids: ["neptune", "earth"],
      input_source_ids: ["nasa-solar-system-sizes"],
    });
    expect(node("sun").transition_explanation.derived_quantity).toMatchObject({
      input_node_ids: ["sun", "jupiter"],
      input_source_ids: ["nasa-sun-facts", "nasa-solar-system-sizes"],
    });
    expect(node("milky-way")).toMatchObject({
      name: "Milky Way galaxy",
      source_quantity: "width",
      characteristic_quantity: "width",
    });
    expect(SCALE_EXPLORER_DEFINITION.references.every((sourceId) => sourceIds.has(sourceId))).toBe(
      true,
    );
    expect(SCALE_EXPLORER_SOURCES.every((source) => source.url.startsWith("https://"))).toBe(true);
  });

  it("keeps reviewed known cases in their stated characteristic-size units", () => {
    // Independent expected values: NASA's reviewed source values as captured
    // by each node's source_value/source_unit fields and the stated diameter
    // derivation. These literals are not calculated from the implementation.
    expect(canonicalSizeMetres(node("moon"))).toBe(3_475_000);
    expect(canonicalSizeMetres(node("earth"))).toBe(12_742_000);
    expect(canonicalSizeMetres(node("sun"))).toBe(1_400_000_000);
    expect(canonicalSizeMetres(node("milky-way"))).toBeCloseTo(9.46e20, -16);
    expect(canonicalSizeMetres(node("observable-universe")) / 8.7032e26).toBeCloseTo(1, 12);
  });

  it("passes every published validation fixture", () => {
    for (const fixture of SCALE_EXPLORER_VALIDATION_FIXTURES) {
      const model = buildScaleExplorerModel({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        node_id: fixture.node_id,
        version: 1,
      });
      expect(
        Math.abs(model.selected.characteristic_size_m - fixture.expected_characteristic_size_m),
        fixture.purpose,
      ).toBeLessThanOrEqual(fixture.tolerance_m);
      if (fixture.expected_position_percent !== undefined) {
        expect(
          Math.abs(model.selected.position_percent - fixture.expected_position_percent),
          fixture.purpose,
        ).toBeLessThanOrEqual(fixture.position_tolerance_percent ?? 0);
      }
      if (fixture.expected_comparison !== undefined) {
        expect(model.selected.comparison.kind, fixture.purpose).toBe("calculated-ratio");
        expect(model.selected.comparison.reference_node_id, fixture.purpose).toBe(
          fixture.expected_comparison.reference_node_id,
        );
        const actualRatio = model.selected.comparison.ratio;
        expect(actualRatio, fixture.purpose).toBeDefined();
        expect(
          Math.abs((actualRatio ?? Number.NaN) - fixture.expected_comparison.expected_ratio),
          fixture.purpose,
        ).toBeLessThanOrEqual(
          fixture.expected_comparison.expected_ratio *
            fixture.expected_comparison.ratio_relative_tolerance,
        );
      }
    }
  });

  it("returns a deterministic log-positioned result without treating nodes as locations", () => {
    const model = buildScaleExplorerModel(DEFAULT_SCALE_EXPLORER_STATE);

    expect(model.model_version).toBe(SCALE_EXPLORER_MODEL_VERSION);
    expect(model.selected.node.id).toBe("earth");
    expect(model.selected.position_percent).toBeGreaterThan(0);
    expect(model.selected.position_percent).toBeLessThan(100);
    expect(model.nodes[0]?.position_percent).toBe(0);
    expect(model.nodes.at(-1)?.position_percent).toBe(100);
    expect(
      model.nodes.every(
        (entry, index, entries) =>
          index === 0 || entry.position_percent > (entries[index - 1]?.position_percent ?? -1),
      ),
    ).toBe(true);
    expect(
      model.nodes.every(
        (entry, index, entries) =>
          index === 0 ||
          entry.characteristic_size_m > (entries[index - 1]?.characteristic_size_m ?? -1),
      ),
    ).toBe(true);
    expect(
      model.nodes.every(
        (entry) =>
          Number.isFinite(entry.characteristic_size_m) &&
          Number.isFinite(entry.position_percent) &&
          entry.position_percent >= 0 &&
          entry.position_percent <= 100,
      ),
    ).toBe(true);
    expect(
      model.nodes
        .filter((entry) => entry.comparison.kind === "calculated-ratio")
        .every(
          (entry) =>
            entry.comparison.ratio !== undefined &&
            Number.isFinite(entry.comparison.ratio) &&
            entry.comparison.ratio > 0,
        ),
    ).toBe(true);
    expect(model).toEqual(buildScaleExplorerModel(DEFAULT_SCALE_EXPLORER_STATE));
    expect(model.selected.previous?.node.id).toBe("venus");
    expect(model.selected.next?.node.id).toBe("neptune");
  });

  it("keeps an independently worked interior logarithmic position", () => {
    const earth = buildScaleExplorerModel({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: "earth",
      version: 1,
    });

    // Independent worked example using the curated endpoint sizes: the Earth
    // position is 2.766265122941635% on the base-10 normalized track. This
    // deliberately does not use a production fixture or node index.
    expect(earth.selected.position_percent).toBeCloseTo(2.766265122941635, 12);
    expect(earth.selected.position_percent).not.toBeCloseTo((4 / 12) * 100, 3);
  });

  it("validates numeric transition claims against their explicit ratio contracts", () => {
    const knownCases = [
      {
        node_id: "mercury" as const,
        reference_node_id: "moon" as const,
        expected_ratio: 1.40431654676259,
      },
      {
        node_id: "neptune" as const,
        reference_node_id: "earth" as const,
        expected_ratio: 3.864699419243447,
      },
      {
        node_id: "sun" as const,
        reference_node_id: "jupiter" as const,
        expected_ratio: 10.012730471599605,
      },
    ];

    for (const knownCase of knownCases) {
      const claim = node(knownCase.node_id).transition_explanation.derived_quantity;
      expect(claim).toBeDefined();
      expect(
        calculateScaleExplorerRatio(knownCase.node_id, knownCase.reference_node_id),
      ).toBeCloseTo(knownCase.expected_ratio, 12);
      expect(claim?.valid_domain).toMatch(/finite and greater than zero/i);
      expect(claim?.numerical_tolerance).toMatch(/1e-12/);
      expect(claim?.generated_at).toBe("2026-09-02T09:12:28Z");
    }
  });

  it("computes versioned, source-linked comparison results from structured definitions", () => {
    const milkyWay = buildScaleExplorerModel({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: "milky-way",
      version: 1,
    });
    expect(milkyWay.selected.comparison).toMatchObject({
      kind: "calculated-ratio",
      algorithm_id: "scale-relative-ratio-v1",
      algorithm_version: 1,
      input_node_ids: ["milky-way", "earth"],
      input_source_ids: ["nasa-milky-way-size", "nasa-light-year", "nasa-solar-system-sizes"],
      reference_node_id: "earth",
      unit: "dimensionless",
    });
    expect(milkyWay.selected.comparison.ratio).toBeGreaterThan(7e13);
    expect(milkyWay.selected.comparison.ratio).toBeLessThan(8e13);
    expect(milkyWay.selected.comparison.text).toMatch(/74 trillion/i);

    const observableUniverse = buildScaleExplorerModel({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: "observable-universe",
      version: 1,
    });
    expect(observableUniverse.selected.comparison.ratio).toBe(920_000);
    expect(observableUniverse.selected.comparison.text).toMatch(/920,000×.*Milky Way/i);

    const earth = buildScaleExplorerModel(DEFAULT_SCALE_EXPLORER_STATE);
    expect(earth.selected.comparison).toMatchObject({
      kind: "contextual",
      algorithm_id: "authored-context-v1",
      algorithm_version: 1,
      input_node_ids: ["earth"],
      unit: "not-applicable",
    });
  });

  it("selects safe adjacent boundaries for the first and last curated nodes", () => {
    const first = buildScaleExplorerModel({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: "moon",
      version: 1,
    });
    const last = buildScaleExplorerModel({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: "observable-universe",
      version: 1,
    });
    expect(first.selected.previous).toBeUndefined();
    expect(first.selected.next?.node.id).toBe("mercury");
    expect(last.selected.previous?.node.id).toBe("milky-way");
    expect(last.selected.next).toBeUndefined();
  });

  it("accepts only the versioned minimum state shape", () => {
    expect(validateScaleExplorerState(DEFAULT_SCALE_EXPLORER_STATE)).toEqual(
      DEFAULT_SCALE_EXPLORER_STATE,
    );
    expect(
      validateScaleExplorerState({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: "moon",
      }),
    ).toEqual({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      version: 1,
      node_id: "moon",
    });
    expect(
      validateScaleExplorerState({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: "observable-universe",
      }),
    ).toEqual({
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      version: 1,
      node_id: "observable-universe",
    });
    expect(validateScaleExplorerState({ version: 0, node_id: "earth" })).toBeNull();
    expect(
      validateScaleExplorerState({
        model_version: "scale-explorer-v0",
        version: 1,
        node_id: "earth",
      }),
    ).toBeNull();
    expect(validateScaleExplorerState({ version: 1, node_id: "not-a-node" })).toBeNull();
    expect(
      validateScaleExplorerState({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: Number.NaN,
      }),
    ).toBeNull();
    expect(
      validateScaleExplorerState({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: "moon",
        extra: true,
      }),
    ).toBeNull();
    expect(validateScaleExplorerState({ version: 1, node_id: "" })).toBeNull();
    expect(validateScaleExplorerState(null)).toBeNull();
    expect(validateScaleExplorerState(["moon"])).toBeNull();
  });

  it("round-trips the canonical share representation and rejects unsafe state input", () => {
    const state = {
      model_version: SCALE_EXPLORER_MODEL_VERSION,
      node_id: "earth" as const,
      version: 1 as const,
    };
    const encoded = encodeScaleExplorerState(state);

    expect(encoded).toBe('{"model_version":"scale-explorer-v1","node_id":"earth","version":1}');
    expect(decodeScaleExplorerState(encoded)).toEqual(state);
    for (const entry of SCALE_EXPLORER_NODES) {
      const nodeState = {
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        node_id: entry.id,
        version: 1,
      } as const;
      expect(decodeScaleExplorerState(encodeScaleExplorerState(nodeState))).toEqual(nodeState);
    }
    expect(decodeScaleExplorerState("not-json")).toBeNull();
    expect(decodeScaleExplorerState('{"node_id":"earth","version":2}')).toBeNull();
    expect(
      decodeScaleExplorerState(
        '{"model_version":"scale-explorer-v1","node_id":"earth","version":1,"x":1}',
      ),
    ).toBeNull();
    expect(
      decodeScaleExplorerState(
        '{"model_version":"scale-explorer-v1","node_id":"not-a-node","version":1}',
      ),
    ).toBeNull();
    expect(
      decodeScaleExplorerState(
        '{"model_version":"scale-explorer-v1","node_id":"earth","version":1,"version":1}',
      ),
    ).toBeNull();
    expect(
      decodeScaleExplorerState(
        '{"version":1,"node_id":"earth","model_version":"scale-explorer-v1"}',
      ),
    ).toBeNull();
    expect(
      decodeScaleExplorerState(
        ' {"model_version":"scale-explorer-v1","node_id":"earth","version":1}',
      ),
    ).toBeNull();
    expect(decodeScaleExplorerState(" ".repeat(257))).toBeNull();
    expect(decodeScaleExplorerState([encoded])).toBeNull();
  });

  it("fails safely at the model boundary for out-of-range or malformed state", () => {
    expect(() =>
      buildScaleExplorerModel({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: "before-minimum",
      }),
    ).toThrow("SCALE_EXPLORER_STATE_INVALID");
    expect(() =>
      buildScaleExplorerModel({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: "after-maximum",
      }),
    ).toThrow("SCALE_EXPLORER_STATE_INVALID");
    expect(() =>
      buildScaleExplorerModel({
        model_version: SCALE_EXPLORER_MODEL_VERSION,
        version: 1,
        node_id: "earth",
        extra: "nope",
      }),
    ).toThrow("SCALE_EXPLORER_STATE_INVALID");
  });

  it("rejects non-finite numeric values at the calculation boundary", () => {
    expect(() => canonicalSizeMetres({ ...node("earth"), source_value: Number.NaN })).toThrow(
      "SCALE_EXPLORER_MODEL_INVALID",
    );
    expect(() =>
      canonicalSizeMetres({ ...node("earth"), source_value: Number.POSITIVE_INFINITY }),
    ).toThrow("SCALE_EXPLORER_MODEL_INVALID");
  });

  it("rejects tampered reviewed artifact fields before exposing the browser model", () => {
    const mutations: ReadonlyArray<{
      name: string;
      mutate: (artifact: Record<string, unknown>) => void;
    }> = [
      {
        name: "ratio",
        mutate: (artifact) => {
          const pair = arrayItem(
            artifact.pairwise_ratios,
            (item) => item.selected_node_id === "milky-way" && item.reference_node_id === "earth",
          );
          pair.ratio = 999;
        },
      },
      {
        name: "position",
        mutate: (artifact) => {
          const nodeValue = arrayItem(artifact.nodes, (item) => item.id === "earth");
          nodeValue.display_position_percent = 99;
        },
      },
      {
        name: "definition",
        mutate: (artifact) => {
          record(artifact.definition).status = "draft";
        },
      },
      {
        name: "source",
        mutate: (artifact) => {
          arrayItem(artifact.sources, (item) => item.id === "nasa-solar-system-sizes").id =
            "unreviewed-source";
        },
      },
      {
        name: "source-title",
        mutate: (artifact) => {
          arrayItem(artifact.sources, (item) => item.id === "nasa-solar-system-sizes").title =
            "A different official page";
        },
      },
      {
        name: "source-url",
        mutate: (artifact) => {
          arrayItem(artifact.sources, (item) => item.id === "nasa-solar-system-sizes").url =
            "https://science.nasa.gov/sun/facts/";
        },
      },
      {
        name: "fixture",
        mutate: (artifact) => {
          const fixture = arrayItem(
            artifact.validation_fixtures,
            (item) => item.id === "scale-explorer-characteristic-size-known-cases",
          );
          fixture.expected_characteristic_size_m = 3_475_001;
        },
      },
    ];

    for (const mutation of mutations) {
      const artifact = clonedArtifact();
      mutation.mutate(artifact);
      expect(() => validateScaleExplorerArtifact(artifact), mutation.name).toThrow(
        "SCALE_EXPLORER_MODEL_INVALID",
      );
    }
  });
});
