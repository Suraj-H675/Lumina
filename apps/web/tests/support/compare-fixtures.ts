import type { EntityDetailResponse } from "@lumina/api-client";

/**
 * Component-test fixtures shaped exactly like the accepted public entity
 * detail contract. Values are the reviewed Gaia DR3 photometry of the
 * accepted seed slice (see tests/e2e/support/status-stub-harness.mjs for the
 * source-of-truth note); they are test fixtures, never production data.
 */

function gaiaSource() {
  return {
    dataset: {
      code: "gaia-source",
      name: "Gaia Data Release 3 main source catalogue",
      release_version: "dr3",
    },
    provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
    source_record_id: "10000000-0000-5000-8000-000000000000",
  };
}

function magnitudeEntry(code: string, value: string) {
  return {
    current_selection: {
      measurement: {
        id: `22222222-3333-5444-8555-${value.replace(".", "").padStart(12, "0").slice(0, 12)}`,
        original_unit: "mag",
        original_value: value,
        source: gaiaSource(),
        unit: { code: "mag", name: "magnitude", symbol: "mag" },
        value,
      },
      selection: {
        explanation: "Only reviewed measurement for this quantity in the accepted slice.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-15T08:23:59Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity:
      code === "gaia_g_mean_magnitude"
        ? { code, name: "Gaia G-band mean magnitude (Vega scale)" }
        : code === "gaia_bp_mean_magnitude"
          ? { code, name: "Gaia integrated BP mean magnitude (Vega scale)" }
          : { code, name: "Gaia integrated RP mean magnitude (Vega scale)" },
  };
}

function starDetail(canonicalName: string, id: string): EntityDetailResponse {
  return {
    canonical_name: canonicalName,
    entity_type: "star",
    id,
    quantities: [],
  };
}

export const fixtureDetail = {
  hd209458: {
    ...starDetail("HD 209458", "26f4b667-ecd9-524d-8121-29508723715a"),
    quantities: [
      magnitudeEntry("gaia_g_mean_magnitude", "7.5212455"),
      magnitudeEntry("gaia_bp_mean_magnitude", "7.7932835"),
      magnitudeEntry("gaia_rp_mean_magnitude", "7.080288"),
    ],
  },
  kepler452: {
    ...starDetail("Kepler-452", "bfd42670-3013-598e-8eb5-5a1c084dd1a0"),
    quantities: [
      magnitudeEntry("gaia_g_mean_magnitude", "13.392909"),
      magnitudeEntry("gaia_bp_mean_magnitude", "13.772195"),
      magnitudeEntry("gaia_rp_mean_magnitude", "12.851425"),
    ],
  },
  k2_18: {
    ...starDetail("K2-18", "403d0e71-8d81-5c52-abad-c4666c1b5cd6"),
    quantities: [
      magnitudeEntry("gaia_g_mean_magnitude", "12.400764"),
      magnitudeEntry("gaia_bp_mean_magnitude", "13.71137"),
      magnitudeEntry("gaia_rp_mean_magnitude", "11.269744"),
    ],
  },
} as const satisfies Record<string, EntityDetailResponse>;
