import * as Astronomy from "astronomy-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import { computeObservationPlan, extractCoordinatePairs } from "../src/lib/observation/domain";
import {
  calculateAngularSeparation,
  calculateMoonHorizontalPosition,
  computeLunarConditions,
  minimumTargetMoonSeparationDuringDarkness,
  moonPhase,
} from "../src/lib/observation/lunar";
import { k2_18AstrometryDetail } from "./support/observation-fixtures";

const location = { latitude: 12.972, longitude: 77.594 } as const;
const selectedInstant = new Date("2026-08-27T00:00:00Z");

afterEach(() => vi.restoreAllMocks());

describe("lunar observation domain", () => {
  it("uses Astronomy Engine illumination fractions within the physical 0..1 domain", () => {
    const fractions = [new Date("2026-08-27T00:00:00Z"), new Date("2026-08-28T00:00:00Z")].map(
      (instant) => Astronomy.Illumination(Astronomy.Body.Moon, instant).phase_fraction,
    );

    expect(fractions.every((fraction) => fraction >= 0 && fraction <= 1)).toBe(true);
  });

  it("maps Moon phase angles through deterministic waxing and waning boundaries", () => {
    expect(moonPhase(0)).toBe("new");
    expect(moonPhase(22.5)).toBe("waxingCrescent");
    expect(moonPhase(90)).toBe("firstQuarter");
    expect(moonPhase(180)).toBe("full");
    expect(moonPhase(270)).toBe("thirdQuarter");
    expect(moonPhase(337.5)).toBe("new");
    expect(moonPhase(Number.NaN)).toBeNull();
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
    const coordinate = extractCoordinatePairs(k2_18AstrometryDetail())[0];
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
    const coordinate = extractCoordinatePairs(k2_18AstrometryDetail())[0];
    expect(coordinate).toBeDefined();
    expect(computeLunarConditions(coordinate!, location, selectedInstant, null, [])).toBeNull();
  });
});
