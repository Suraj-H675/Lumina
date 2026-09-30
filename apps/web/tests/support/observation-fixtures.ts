import type { EntityDetailResponse } from "@nova-lumina/api-client";

import {
  ASTROMETRY_DATASET_CODE,
  DECLINATION_QUANTITY_CODE,
  DEGREES_UNIT_CODE,
  RIGHT_ASCENSION_QUANTITY_CODE,
} from "../../src/lib/observation/domain";

export function k2_18AstrometryDetail(): EntityDetailResponse {
  const source = {
    dataset: {
      code: ASTROMETRY_DATASET_CODE,
      name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
      release_version: "dr3",
    },
    provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
    source_record_id: "gaia-source-record-3910747531814692736",
  };
  const measurement = (code: string, value: string) => ({
    current_selection: {
      measurement: {
        id: `${code}-measurement`,
        original_unit: DEGREES_UNIT_CODE,
        original_value: value,
        source,
        unit: { code: DEGREES_UNIT_CODE, name: "degree", symbol: "deg" },
        value,
      },
      selection: {
        explanation: "Only reviewed measurement for this quantity.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-27T00:00:00Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });
  return {
    canonical_name: "K2-18",
    entity_type: "star",
    id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
    quantities: [
      measurement(RIGHT_ASCENSION_QUANTITY_CODE, "172.5601297577743"),
      measurement(DECLINATION_QUANTITY_CODE, "7.58781312214569"),
    ],
  };
}
