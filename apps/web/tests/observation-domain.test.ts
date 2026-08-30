import { describe, expect, it } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

import {
  ASTROMETRY_DATASET_CODE,
  DECLINATION_QUANTITY_CODE,
  DEGREES_UNIT_CODE,
  GAIA_REFERENCE_EPOCH,
  MESSIER_DATASET_CODE,
  MESSIER_DECLINATION_QUANTITY_CODE,
  MESSIER_PROVIDER_CODE,
  MESSIER_REFERENCE_EPOCH,
  MESSIER_RELEASE,
  MESSIER_RIGHT_ASCENSION_QUANTITY_CODE,
  RIGHT_ASCENSION_QUANTITY_CODE,
  calculateHorizontalPosition,
  computeObservationPlan,
  extractCoordinatePairs,
  formatCompassDirection,
  isValidNightDate,
  localInstantForNightTime,
  parseFiniteDecimal,
  parseObserverLocationInputs,
  validateObserverLocation,
} from "../src/lib/observation/domain";

type TestSource = {
  dataset: {
    code: string;
    name: string;
    release_version: string;
  };
  provider: { code: string; name: string };
  source_record_id: string;
};

const messierSource: TestSource = {
  dataset: {
    code: MESSIER_DATASET_CODE,
    name: "Reviewed CDS SIMBAD Messier J2000 catalogue",
    release_version: MESSIER_RELEASE,
  },
  provider: { code: MESSIER_PROVIDER_CODE, name: "CDS SIMBAD" },
  source_record_id: "simbad-messier-source-31",
} as const;

const source: TestSource = {
  dataset: {
    code: ASTROMETRY_DATASET_CODE,
    name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "gaia-source-record-3910747531814692736",
} as const;

function detailWithCoordinates(
  overrides: Readonly<{
    dec?: string;
    decSource?: TestSource;
    decUnit?: string;
    ra?: string;
    raSource?: TestSource;
    raUnit?: string;
  }> = {},
): EntityDetailResponse {
  const measurement = (
    code: string,
    value: string,
    unit: string,
    measurementSource: TestSource,
  ) => ({
    current_selection: {
      measurement: {
        id: `${code}-measurement`,
        original_unit: unit,
        original_value: value,
        source: measurementSource,
        unit: { code: unit, name: unit, symbol: unit },
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
    quantity: {
      code,
      name: code,
    },
  });

  return {
    canonical_name: "K2-18",
    entity_type: "star",
    id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
    quantities: [
      measurement(
        RIGHT_ASCENSION_QUANTITY_CODE,
        overrides.ra ?? "172.5601297577743",
        overrides.raUnit ?? DEGREES_UNIT_CODE,
        overrides.raSource ?? source,
      ),
      measurement(
        DECLINATION_QUANTITY_CODE,
        overrides.dec ?? "7.58781312214569",
        overrides.decUnit ?? DEGREES_UNIT_CODE,
        overrides.decSource ?? source,
      ),
    ],
  };
}

function messierDetailWithCoordinates(
  overrides: Readonly<{ dec?: string; ra?: string }> = {},
): EntityDetailResponse {
  const measurement = (code: string, value: string) => ({
    current_selection: {
      measurement: {
        id: `${code}-measurement`,
        original_unit: DEGREES_UNIT_CODE,
        original_value: value,
        source: messierSource,
        unit: { code: DEGREES_UNIT_CODE, name: "degree", symbol: "°" },
        value,
      },
      selection: {
        explanation: "Selected from reviewed SIMBAD Messier J2000 v1.",
        rule: "simbad_messier_j2000",
        selected_at: "2026-08-30T00:00:00Z",
        version: "v1",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });

  return {
    canonical_name: "Messier 31",
    entity_type: "galaxy",
    id: "63f8a58a-a62b-5ae7-824b-35f3ebf1f6f0",
    quantities: [
      measurement(MESSIER_RIGHT_ASCENSION_QUANTITY_CODE, overrides.ra ?? "10.684708333333334"),
      measurement(MESSIER_DECLINATION_QUANTITY_CODE, overrides.dec ?? "41.26875"),
    ],
  };
}

describe("observation domain", () => {
  it("validates finite observer coordinates and rejects invalid ranges", () => {
    expect(validateObserverLocation({ latitude: 12.972, longitude: 77.594 })).toEqual({
      latitude: 12.972,
      longitude: 77.594,
    });
    expect(validateObserverLocation({ latitude: -90, longitude: 180 })).not.toBeNull();
    expect(validateObserverLocation({ latitude: 90.001, longitude: 0 })).toBeNull();
    expect(validateObserverLocation({ latitude: 0, longitude: -180.001 })).toBeNull();
    expect(validateObserverLocation({ latitude: Number.NaN, longitude: 0 })).toBeNull();
    expect(parseObserverLocationInputs("12.972", "77.594")).toEqual({
      latitude: 12.972,
      longitude: 77.594,
    });
    expect(parseObserverLocationInputs("", "77.594")).toBeNull();
    expect(parseObserverLocationInputs("Infinity", "77.594")).toBeNull();
    expect(parseObserverLocationInputs("91", "77.594")).toBeNull();
  });

  it("accepts decimal catalogue lexemes only and preserves conversion safety", () => {
    expect(parseFiniteDecimal("172.5601297577743")).toBe(172.5601297577743);
    expect(parseFiniteDecimal("-1.2e2")).toBe(-120);
    expect(parseFiniteDecimal("NaN")).toBeNull();
    expect(parseFiniteDecimal("Infinity")).toBeNull();
    expect(parseFiniteDecimal("12 degrees")).toBeNull();
  });

  it("pairs only the accepted Gaia RA and Dec measurements from one source record", () => {
    const pairs = extractCoordinatePairs(detailWithCoordinates());

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      declinationDegrees: 7.58781312214569,
      epoch: GAIA_REFERENCE_EPOCH,
      originalDeclination: "7.58781312214569",
      originalRightAscension: "172.5601297577743",
      rightAscensionDegrees: 172.5601297577743,
      sourceKey: expect.stringContaining(source.source_record_id),
    });
  });

  it("accepts a SIMBAD J2000 pair and validates RA with the active profile", () => {
    const pairs = extractCoordinatePairs(
      messierDetailWithCoordinates({ ra: "180", dec: "41.26875" }),
    );

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      epoch: MESSIER_REFERENCE_EPOCH,
      rightAscensionDegrees: 180,
      declinationDegrees: 41.26875,
      sourceKey: expect.stringContaining(messierSource.source_record_id),
    });
  });

  it("rejects invalid SIMBAD J2000 RA and Dec ranges", () => {
    expect(extractCoordinatePairs(messierDetailWithCoordinates({ ra: "360" }))).toEqual([]);
    expect(extractCoordinatePairs(messierDetailWithCoordinates({ ra: "-0.1" }))).toEqual([]);
    expect(extractCoordinatePairs(messierDetailWithCoordinates({ dec: "90.1" }))).toEqual([]);
    expect(extractCoordinatePairs(messierDetailWithCoordinates({ dec: "-90.1" }))).toEqual([]);
  });

  it("does not pair RA and Dec from different provenance records", () => {
    const pairs = extractCoordinatePairs(
      detailWithCoordinates({
        decSource: { ...source, source_record_id: "different-source-record" },
      }),
    );

    expect(pairs).toEqual([]);
  });

  it("keeps multiple complete provenance-backed coordinate pairs available", () => {
    const secondSource: TestSource = {
      ...source,
      source_record_id: "gaia-source-record-2835207319109249920",
    };
    const detail = detailWithCoordinates();
    const secondPairDetail: EntityDetailResponse = {
      ...detail,
      quantities: [
        ...detail.quantities,
        {
          ...detail.quantities[0]!,
          current_selection: {
            ...detail.quantities[0]!.current_selection!,
            measurement: {
              ...detail.quantities[0]!.current_selection!.measurement,
              id: "second-ra-measurement",
              source: secondSource,
              value: "344.3675708158258",
            },
          },
        },
        {
          ...detail.quantities[1]!,
          current_selection: {
            ...detail.quantities[1]!.current_selection!,
            measurement: {
              ...detail.quantities[1]!.current_selection!.measurement,
              id: "second-dec-measurement",
              source: secondSource,
              value: "20.769104345387106",
            },
          },
        },
      ],
    };

    expect(extractCoordinatePairs(secondPairDetail)).toHaveLength(2);
  });

  it("rejects unsupported units, invalid ranges, and non-astrometry sources", () => {
    expect(extractCoordinatePairs(detailWithCoordinates({ raUnit: "hour" }))).toEqual([]);
    expect(extractCoordinatePairs(detailWithCoordinates({ dec: "90.1" }))).toEqual([]);
    expect(
      extractCoordinatePairs(
        detailWithCoordinates({
          raSource: { ...source, dataset: { ...source.dataset, code: "gaia-source" } },
        }),
      ),
    ).toEqual([]);
  });

  it("uses the documented north-through-east azimuth convention", () => {
    for (const [azimuth, direction] of [
      [0, "N"],
      [90, "E"],
      [180, "S"],
      [270, "W"],
      [11.25, "NNE"],
      [348.75, "N"],
    ] as const) {
      expect(formatCompassDirection(azimuth)).toBe(direction);
    }

    const pair = extractCoordinatePairs(detailWithCoordinates())[0];
    expect(pair).toBeDefined();
    const polePosition = calculateHorizontalPosition(
      { ...pair!, declinationDegrees: 90, originalDeclination: "90" },
      { latitude: 45, longitude: 0 },
      new Date("2026-08-27T00:00:00Z"),
    );
    expect(polePosition?.altitude).toBeCloseTo(45, 0);
    expect(polePosition?.compass).toBe("N");
  });

  it("validates local night date semantics and absolute instant conversion", () => {
    expect(isValidNightDate("2026-08-27")).toBe(true);
    expect(isValidNightDate("2026-02-29")).toBe(false);
    expect(isValidNightDate("2026-8-27")).toBe(false);
    const instant = localInstantForNightTime("2026-08-27", "23:14");
    expect(instant).not.toBeNull();
    expect(instant?.getHours()).toBe(23);
    expect(instant?.getMinutes()).toBe(14);
  });

  it("computes a bounded plan with darkness, target position, events, and samples", () => {
    const pair = extractCoordinatePairs(detailWithCoordinates())[0];
    expect(pair).toBeDefined();
    const selected = localInstantForNightTime("2026-08-27", "23:00");
    expect(selected).not.toBeNull();
    const plan = computeObservationPlan(
      pair!,
      { latitude: 12.972, longitude: 77.594 },
      "2026-08-27",
      selected!,
    );

    expect(plan).not.toBeNull();
    expect(plan?.samples.length).toBeGreaterThanOrEqual(2);
    expect(plan?.samples.length).toBeLessThanOrEqual(100);
    expect(
      plan?.samples.every((sample) => sample.instant.getTime() >= (plan?.plotStart.getTime() ?? 0)),
    ).toBe(true);
    expect(plan?.samples.every((sample) => sample.altitude >= -90 && sample.altitude <= 90)).toBe(
      true,
    );
    expect(plan?.selected.position.altitude).toBeGreaterThanOrEqual(-90);
    expect(plan?.selected.position.altitude).toBeLessThanOrEqual(90);
    expect(plan?.night.astronomicalDusk.kind).toBe("time");
    expect(plan?.night.astronomicalDawn.kind).toBe("time");
    expect(plan?.night.astronomicalDarkness).not.toBeNull();
    expect(plan?.maxDuringDarkness).not.toBeNull();
  });

  it("keeps polar visibility semantic states honest", () => {
    const pair = extractCoordinatePairs(detailWithCoordinates())[0];
    expect(pair).toBeDefined();
    const selected = localInstantForNightTime("2026-08-27", "23:00");
    const circumpolar = computeObservationPlan(
      { ...pair!, declinationDegrees: 89, originalDeclination: "89" },
      { latitude: 80, longitude: 0 },
      "2026-08-27",
      selected!,
    );
    expect(circumpolar?.targetVisibility).toBe("circumpolar");
    expect(circumpolar?.targetEvents.rise.kind).toBe("circumpolar");
    expect(circumpolar?.targetEvents.set.kind).toBe("circumpolar");

    const neverRises = computeObservationPlan(
      { ...pair!, declinationDegrees: -89, originalDeclination: "-89" },
      { latitude: 80, longitude: 0 },
      "2026-08-27",
      selected!,
    );
    expect(neverRises?.targetVisibility).toBe("never-rises");
    expect(neverRises?.targetEvents.rise.kind).toBe("never-rises");
  });
});
