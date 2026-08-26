import { describe, expect, it } from "vitest";

import type {
  EntityDetailResponse,
  EntityQuantityResponse,
  QuantityReference,
} from "@lumina/api-client";

import { buildCompareModel, type CompareObjectState } from "../src/lib/compare-model";

const QUANTITY_NAMES: Record<string, string> = {
  gaia_bp_mean_magnitude: "Gaia integrated BP mean magnitude (Vega scale)",
  gaia_g_mean_magnitude: "Gaia G-band mean magnitude (Vega scale)",
  gaia_rp_mean_magnitude: "Gaia integrated RP mean magnitude (Vega scale)",
  stellar_effective_temperature: "Stellar effective temperature",
};

function quantity(code: string): QuantityReference {
  return { code, name: QUANTITY_NAMES[code] ?? code };
}

function measuredEntry(
  code: string,
  value: string,
  unitSymbol = "mag",
  measurementCount = 1,
): EntityQuantityResponse {
  return {
    current_selection: {
      measurement: {
        id: `11111111-2222-5333-8444-${code.length.toString().padStart(12, "0")}`,
        original_unit: `${unitSymbol}-orig`,
        original_value: value,
        source: {
          dataset: { code: "gaia-source", name: "Gaia Data Release 3", release_version: "dr3" },
          provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
          source_record_id: "10000000-0000-5000-8000-000000000000",
        },
        unit: { code: unitSymbol, name: unitSymbol, symbol: unitSymbol },
        value,
      },
      selection: {
        explanation: "Reviewed canonical selection.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-15T08:23:59Z",
        version: "1",
      },
    },
    measurement_count: measurementCount,
    quantity: quantity(code),
  };
}

function unselectedEntry(code: string): EntityQuantityResponse {
  return {
    current_selection: null,
    measurement_count: 2,
    quantity: quantity(code),
  };
}

function detail(overrides: Partial<EntityDetailResponse>): EntityDetailResponse {
  return {
    canonical_name: "Object",
    entity_type: "star",
    id: "26f4b667-ecd9-524d-8121-29508723715a",
    quantities: [],
    ...overrides,
  };
}

function okState(
  slug: string,
  entries: Array<EntityQuantityResponse>,
  name = slug,
): CompareObjectState {
  return {
    detail: detail({ canonical_name: name, quantities: entries }),
    kind: "ok",
    slug,
  };
}

describe("buildCompareModel", () => {
  it("aligns rows by the canonical quantity code across objects", () => {
    const model = buildCompareModel([
      okState("a", [measuredEntry("gaia_g_mean_magnitude", "12.4")]),
      okState("b", [measuredEntry("gaia_g_mean_magnitude", "13.39")]),
    ]);

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.quantityCode).toBe("gaia_g_mean_magnitude");
    // Same semantic row for both objects; each keeps its own value.
    expect(
      model.rows[0]?.cells.map((cell) => (cell.kind === "value" ? cell.measurement.value : null)),
    ).toEqual(["12.4", "13.39"]);
  });

  it("keeps the union of quantities and marks missing cells as unavailable", () => {
    const model = buildCompareModel([
      okState("a", [
        measuredEntry("gaia_g_mean_magnitude", "12.4"),
        measuredEntry("stellar_effective_temperature", "3500", "K"),
      ]),
      okState("b", [measuredEntry("gaia_g_mean_magnitude", "13.39")]),
    ]);

    expect(model.rows.map((row) => row.quantityCode)).toEqual([
      "gaia_g_mean_magnitude",
      "stellar_effective_temperature",
    ]);
    // Both objects report the G magnitude; only "a" has the temperature.
    expect(model.rows[0]?.cells[0]).toMatchObject({ kind: "value" });
    expect(model.rows[0]?.cells[1]).toMatchObject({ kind: "value" });
    expect(model.rows[1]?.cells[0]).toMatchObject({ kind: "value" });
    expect(model.rows[1]?.cells[1]).toEqual({ kind: "unavailable" });
  });

  it("orders rows by the presentation map first, then deterministic code order", () => {
    const model = buildCompareModel([
      okState("a", [
        measuredEntry("zzz_custom_quantity", "1"),
        measuredEntry("gaia_rp_mean_magnitude", "3"),
        measuredEntry("gaia_bp_mean_magnitude", "2"),
      ]),
    ]);

    expect(model.rows.map((row) => row.quantityCode)).toEqual([
      "gaia_bp_mean_magnitude",
      "gaia_rp_mean_magnitude",
      "zzz_custom_quantity",
    ]);
  });

  it("keeps competing measurements visible through measurement_count", () => {
    const model = buildCompareModel([
      okState("a", [measuredEntry("gaia_parallax", "26.24", "mas", 3)]),
    ]);

    const cell = model.rows[0]?.cells[0];
    expect(cell).toMatchObject({
      kind: "value",
      measurementCount: 3,
      measurement: { value: "26.24" },
    });
    // The canonical selection is displayed because the accepted contract
    // defines one; nothing about the other measurements is hidden away.
  });

  it("renders tracked-but-unselected quantities as their own cell state", () => {
    const model = buildCompareModel([okState("a", [unselectedEntry("gaia_g_mean_magnitude")])]);
    expect(model.rows[0]?.cells[0]).toEqual({ kind: "unmeasured" });
  });

  it("preserves each object's actual units without conversion", () => {
    const model = buildCompareModel([
      okState("a", [measuredEntry("gaia_g_mean_magnitude", "12.4", "mag")]),
      okState("b", [measuredEntry("gaia_g_mean_magnitude", "3500", "K")]),
    ]);

    const cells = model.rows[0]?.cells ?? [];
    expect(cells[0]).toMatchObject({ kind: "value", measurement: { unitSymbol: "mag" } });
    expect(cells[1]).toMatchObject({ kind: "value", measurement: { unitSymbol: "K" } });
  });

  it("attaches provenance labels to every value cell", () => {
    const model = buildCompareModel([
      okState("a", [measuredEntry("gaia_g_mean_magnitude", "12.4")]),
    ]);
    const cell = model.rows[0]?.cells[0];
    expect(cell?.kind === "value" && cell.measurement.sourceLabel).toContain("ESA Gaia Archive");
    expect(cell?.kind === "value" && cell.measurement.sourceLabel).toContain("dr3");
  });

  it("represents unknown and unavailable slots in every row without crashing", () => {
    const model = buildCompareModel([
      okState("k2-18", [measuredEntry("gaia_g_mean_magnitude", "12.4")], "K2-18"),
      { kind: "unknown", slug: "ghost" },
      { kind: "unavailable" },
    ]);

    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.cells).toEqual([
      expect.objectContaining({ kind: "value" }),
      { kind: "unknown", slug: "ghost" },
      { kind: "unavailable" },
    ]);
  });

  it("produces no rows when nothing loaded", () => {
    const model = buildCompareModel([{ kind: "unavailable" }, { kind: "unknown", slug: "x" }]);
    expect(model.rows).toEqual([]);
  });
});
