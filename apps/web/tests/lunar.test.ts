import * as Astronomy from "astronomy-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

import {
  ASTROMETRY_DATASET_CODE,
  DECLINATION_QUANTITY_CODE,
  DEGREES_UNIT_CODE,
  RIGHT_ASCENSION_QUANTITY_CODE,
  computeObservationPlan,
  extractCoordinatePairs,
} from "../src/lib/observation/domain";
import {
  calculateAngularSeparation,
  calculateMoonHorizontalPosition,
  computeLunarConditions,
  formatIlluminationPercentage,
  minimumTargetMoonSeparationDuringDarkness,
  moonPhaseLabel,
} from "../src/lib/observation/lunar";

const source = {
  dataset: {
    code: ASTROMETRY_DATASET_CODE,
    name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "gaia-source-record-3910747531814692736",
};

function coordinateDetail(): EntityDetailResponse {
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

const location = { latitude: 12.972, longitude: 77.594 } as const;
const selectedInstant = new Date("2026-08-27T00:00:00Z");

afterEach(() => vi.restoreAllMocks());

describe("lunar observation domain", () => {
  it("uses Astronomy Engine illumination fractions and sensible display precision", () => {
    const fractions = [new Date("2026-08-27T00:00:00Z"), new Date("2026-08-28T00:00:00Z")].map(
      (instant) => Astronomy.Illumination(Astronomy.Body.Moon, instant).phase_fraction,
    );

    expect(fractions.every((fraction) => fraction >= 0 && fraction <= 1)).toBe(true);
    expect(formatIlluminationPercentage(0)).toBe("0%");
    expect(formatIlluminationPercentage(0.63482914)).toBe("63%");
    expect(formatIlluminationPercentage(1)).toBe("100%");
    expect(formatIlluminationPercentage(Number.NaN)).toBe("Unavailable");
  });

  it("maps Moon phase angles through deterministic waxing and waning boundaries", () => {
    expect(moonPhaseLabel(0)).toBe("New");
    expect(moonPhaseLabel(22.5)).toBe("Waxing crescent");
    expect(moonPhaseLabel(90)).toBe("First quarter");
    expect(moonPhaseLabel(180)).toBe("Full");
    expect(moonPhaseLabel(270)).toBe("Third quarter");
    expect(moonPhaseLabel(337.5)).toBe("New");
    expect(moonPhaseLabel(Number.NaN)).toBeNull();
  });

  it("returns valid topocentric Moon horizontal coordinates, including below-horizon states", () => {
    const position = calculateMoonHorizontalPosition(location, selectedInstant);
    expect(position).not.toBeNull();
    expect(position?.altitude).toBeGreaterThanOrEqual(-90);
    expect(position?.altitude).toBeLessThanOrEqual(90);
    expect(position?.azimuth).toBeGreaterThanOrEqual(0);
    expect(position?.azimuth).toBeLessThan(360);
    expect(position?.altitude).toBeLessThan(0);
    expect(calculateMoonHorizontalPosition(location, new Date("invalid"))).toBeNull();
  });

  it("calculates spherical angular separation and clamps numerical drift", () => {
    const position = (altitude: number, azimuth: number) => ({ altitude, azimuth });
    expect(calculateAngularSeparation(position(0, 0), position(0, 0))).toBeCloseTo(0, 10);
    expect(calculateAngularSeparation(position(0, 0), position(0, 180))).toBeCloseTo(180, 10);
    expect(calculateAngularSeparation(position(0, 0), position(0, 90))).toBeCloseTo(90, 10);
    expect(calculateAngularSeparation(position(91, 0), position(0, 0))).toBeNull();
  });

  it("composes selected lunar facts with the planner samples", () => {
    const coordinate = extractCoordinatePairs(coordinateDetail())[0];
    expect(coordinate).toBeDefined();
    const plan = computeObservationPlan(
      coordinate!,
      location,
      "2026-08-27",
      new Date("2026-08-27T23:00:00Z"),
    );
    expect(plan).not.toBeNull();
    const lunar = computeLunarConditions(
      coordinate!,
      location,
      selectedInstant,
      plan!.night.astronomicalDarkness,
      plan!.samples,
    );
    expect(lunar).not.toBeNull();
    expect(lunar?.selected.targetSeparationDegrees).toBeGreaterThanOrEqual(0);
    expect(lunar?.selected.targetSeparationDegrees).toBeLessThanOrEqual(180);
    expect(lunar?.minimumSeparationDuringDarkness).toBeGreaterThanOrEqual(0);
    expect(lunar?.minimumSeparationDuringDarkness).toBeLessThanOrEqual(180);
    expect(
      minimumTargetMoonSeparationDuringDarkness(coordinate!, location, null, plan!.samples),
    ).toBeNull();
  });

  it("fails safely when the astronomy engine cannot return a Moon position", () => {
    vi.spyOn(Astronomy, "Equator").mockImplementation(() => {
      throw new Error("fixture astronomy failure");
    });
    const coordinate = extractCoordinatePairs(coordinateDetail())[0];
    expect(coordinate).toBeDefined();
    expect(computeLunarConditions(coordinate!, location, selectedInstant, null, [])).toBeNull();
  });
});
