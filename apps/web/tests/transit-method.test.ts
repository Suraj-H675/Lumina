import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRANSIT_METHOD_STATE,
  TRANSIT_METHOD_SHARE_STATE_MAX_CHARS,
  buildTransitLightCurveVisual,
  decodeTransitMethodState,
  encodeTransitMethodState,
  transitMethodRequestEndpoint,
  validateTransitMethodArtifact,
  validateTransitMethodCalculationResult,
  validateTransitMethodState,
} from "../src/lib/simulations/transit-method";
import { TRANSIT_DEFAULT_RESULT } from "./transit-method-fixture";

describe("Transit Method web contract", () => {
  it("round-trips one exact versioned share state", () => {
    const encoded = encodeTransitMethodState(DEFAULT_TRANSIT_METHOD_STATE);
    expect(encoded.length).toBeLessThan(TRANSIT_METHOD_SHARE_STATE_MAX_CHARS);
    expect(decodeTransitMethodState(encoded)).toEqual(DEFAULT_TRANSIT_METHOD_STATE);
    expect(decodeTransitMethodState(` ${encoded}`)).toBeNull();
  });

  it("rejects malformed, additive, and coarse out-of-range share state", () => {
    expect(validateTransitMethodState({ ...DEFAULT_TRANSIT_METHOD_STATE, extra: true })).toBeNull();
    expect(
      validateTransitMethodState({ ...DEFAULT_TRANSIT_METHOD_STATE, stellar_radius_m: 0 }),
    ).toBeNull();
    expect(
      validateTransitMethodState({ ...DEFAULT_TRANSIT_METHOD_STATE, inclination_deg: 91 }),
    ).toBeNull();
    expect(
      decodeTransitMethodState("x".repeat(TRANSIT_METHOD_SHARE_STATE_MAX_CHARS + 1)),
    ).toBeNull();
  });

  it("builds the canonical API request without deriving transit physics", () => {
    const endpoint = transitMethodRequestEndpoint(DEFAULT_TRANSIT_METHOD_STATE);
    const url = new URL(endpoint.path, "http://test");
    expect(url.pathname).toBe("/api/v1/simulations/transit-method");
    expect([...url.searchParams.keys()].sort()).toEqual(
      [
        "inclination_deg",
        "orbital_period_s",
        "planet_radius_m",
        "semi_major_axis_m",
        "stellar_radius_m",
      ].sort(),
    );
    expect("maxResponseBytes" in endpoint).toBe(false);
  });

  it("accepts an exact generated result and normalizes only returned plot values", () => {
    expect(
      validateTransitMethodCalculationResult(DEFAULT_TRANSIT_METHOD_STATE, TRANSIT_DEFAULT_RESULT),
    ).toEqual(TRANSIT_DEFAULT_RESULT);
    const visual = buildTransitLightCurveVisual(TRANSIT_DEFAULT_RESULT);
    expect(visual?.points).toHaveLength(301);
    expect(visual?.path.startsWith("M")).toBe(true);
    expect(visual?.minimum_flux).toBe(0.99);
  });

  it("rejects forged echoes, additive payloads, reversed times, and incoherent classification nullability", () => {
    expect(
      validateTransitMethodCalculationResult(DEFAULT_TRANSIT_METHOD_STATE, {
        ...TRANSIT_DEFAULT_RESULT,
        inputs: { ...TRANSIT_DEFAULT_RESULT.inputs, inclination_deg: 80 },
      }),
    ).toBeNull();
    expect(
      validateTransitMethodCalculationResult(DEFAULT_TRANSIT_METHOD_STATE, {
        ...TRANSIT_DEFAULT_RESULT,
        extra: true,
      }),
    ).toBeNull();
    expect(
      validateTransitMethodCalculationResult(DEFAULT_TRANSIT_METHOD_STATE, {
        ...TRANSIT_DEFAULT_RESULT,
        light_curve: [...TRANSIT_DEFAULT_RESULT.light_curve].reverse(),
      }),
    ).toBeNull();
    expect(
      validateTransitMethodCalculationResult(DEFAULT_TRANSIT_METHOD_STATE, {
        ...TRANSIT_DEFAULT_RESULT,
        classification: "grazing",
      }),
    ).toBeNull();
  });

  it("rejects obvious artifact mutation", async () => {
    const artifact = structuredClone(
      (await import("../../../data/seed/transit-method-v1.json")).default,
    );
    artifact.model_version = "invented";
    expect(() => validateTransitMethodArtifact(artifact)).toThrow();
  });
});
