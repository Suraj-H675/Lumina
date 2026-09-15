import { describe, expect, it } from "vitest";

import {
  SYSTEM_COMPARE_ARTIFACT,
  SYSTEM_COMPARE_DEFINITION,
  SYSTEM_COMPARE_EXOPLANET_ITEMS,
  SYSTEM_COMPARE_ITEMS,
  SYSTEM_COMPARE_SOLAR_ITEMS,
  SYSTEM_COMPARE_VOYAGER_ITEMS,
  systemCompareItemById,
  systemComparePosition,
} from "../src/lib/visualizations/system-scale-compare";

describe("Phase 5B System Scale Compare reviewed composition", () => {
  it("loads the exact 68-item cross-model inventory with closed category counts", () => {
    expect(SYSTEM_COMPARE_ARTIFACT.model_version).toBe("system-scale-compare-v1");
    expect(SYSTEM_COMPARE_ITEMS).toHaveLength(68);
    expect(SYSTEM_COMPARE_SOLAR_ITEMS).toHaveLength(8);
    expect(SYSTEM_COMPARE_EXOPLANET_ITEMS).toHaveLength(10);
    expect(SYSTEM_COMPARE_VOYAGER_ITEMS).toHaveLength(50);
    expect(SYSTEM_COMPARE_DEFINITION.default_item_ids).toEqual([
      "solar:earth",
      "exoplanet:kepler-452-b",
      "voyager:2026",
    ]);
  });

  it("keeps default references numerically comparable but scientifically distinct", () => {
    expect(systemCompareItemById("solar:earth")).toMatchObject({
      quantity_label: "Mean distance from the Sun",
      value_au: 1,
    });
    expect(systemCompareItemById("exoplanet:kepler-452-b")).toMatchObject({
      quantity_label: "Orbit semi-major axis",
      value_au: 1.046,
    });
    expect(systemCompareItemById("voyager:2026")).toMatchObject({
      quantity_label: "Heliocentric position-vector magnitude",
    });
    expect(SYSTEM_COMPARE_DEFINITION.limitations.join(" ")).toMatch(/distinct quantities/i);
    expect(SYSTEM_COMPARE_DEFINITION.limitations.join(" ")).toMatch(/does not rank, score/i);
  });

  it("uses only precomputed bounded shared-scale positions and implemented detail routes", () => {
    for (const item of SYSTEM_COMPARE_ITEMS) {
      expect(systemComparePosition(item, "log")).toBeGreaterThanOrEqual(0);
      expect(systemComparePosition(item, "log")).toBeLessThanOrEqual(100);
      expect(systemComparePosition(item, "linear")).toBeGreaterThan(0);
      expect(systemComparePosition(item, "linear")).toBeLessThanOrEqual(100);
      expect(item.detail_href).toMatch(
        /^\/explore\/(solar-system|exoplanet-systems|missions\/voyager-1)$/u,
      );
    }
  });
});
