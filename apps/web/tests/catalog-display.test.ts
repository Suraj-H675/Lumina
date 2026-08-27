import { describe, expect, it } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

import {
  entityTypeLabel,
  formatMeasurementValue,
  objectMetaLine,
  objectProvenanceRows,
  objectTitle,
} from "../src/lib/catalog-display";

const K2_18_ID = "403d0e71-8d81-5c52-abad-c4666c1b5cd6";

function quantityEntry(
  overrides: Partial<EntityDetailResponse["quantities"][number]> = {},
): EntityDetailResponse["quantities"][number] {
  return {
    current_selection: {
      measurement: {
        id: "11111111-2222-5333-8444-555555555555",
        original_unit: "mag",
        original_value: "12.400764",
        source: {
          dataset: {
            code: "gaia-source",
            name: "Gaia Data Release 3 main source catalogue",
            release_version: "dr3",
          },
          provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
          source_record_id: "2835207319109249920",
        },
        unit: { code: "mag", name: "magnitude", symbol: "mag" },
        value: "12.400764",
      },
      selection: {
        explanation: "Only reviewed measurement for this quantity in the accepted slice.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-15T08:23:59Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity: { code: "gaia_g_mean_magnitude", name: "Gaia G-band mean magnitude (Vega scale)" },
    ...overrides,
  };
}

function starDetail(overrides: Partial<EntityDetailResponse> = {}): EntityDetailResponse {
  return {
    canonical_name: "51 Pegasi",
    entity_type: "star",
    id: K2_18_ID,
    quantities: [quantityEntry()],
    ...overrides,
  };
}

describe("formatMeasurementValue", () => {
  it("renders bounded readable values without inventing precision", () => {
    expect(formatMeasurementValue("14.583239")).toBe("14.5832");
    expect(formatMeasurementValue("0.129")).toBe("0.129");
    expect(formatMeasurementValue("12")).toBe("12");
  });

  it("does not round exact high-precision catalogue values through Number", () => {
    expect(formatMeasurementValue("9007199254740993.1234")).toBe("9007199254740993.1234");
    expect(formatMeasurementValue("1e+100")).toBe("1e+100");
  });
});

describe("entityTypeLabel", () => {
  it("humanizes the closed vocabulary", () => {
    expect(entityTypeLabel("star")).toBe("Star");
    expect(entityTypeLabel("dwarf_planet")).toBe("Dwarf planet");
    expect(entityTypeLabel("exoplanet")).toBe("Exoplanet");
  });
});

describe("objectTitle", () => {
  it("uses the canonical name as identity", () => {
    expect(objectTitle(starDetail())).toBe("51 Pegasi");
  });
});

describe("objectMetaLine", () => {
  it("states the type and how many measured quantities exist", () => {
    expect(objectMetaLine(starDetail({ quantities: [quantityEntry()] }))).toBe(
      "Star · 1 measured quantity",
    );
    expect(objectMetaLine(starDetail({ quantities: [quantityEntry(), quantityEntry()] }))).toBe(
      "Star · 2 measured quantities",
    );
  });

  it("stays honest when nothing is measured yet", () => {
    expect(objectMetaLine(starDetail({ quantities: [] }))).toBe("Star");
  });
});

describe("objectProvenanceRows", () => {
  it("derives one deduplicated row per source record", () => {
    const rows = objectProvenanceRows(starDetail());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      datasetName: "Gaia Data Release 3 main source catalogue",
      providerName: "ESA Gaia Archive",
      quantityNames: ["Gaia G-band mean magnitude (Vega scale)"],
      recordId: "2835207319109249920",
      releaseVersion: "dr3",
    });
  });

  it("returns an empty list when no selected measurement carries provenance", () => {
    expect(objectProvenanceRows(starDetail({ quantities: [] }))).toEqual([]);
  });
});
