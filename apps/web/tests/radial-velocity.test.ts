import { describe, expect, it } from "vitest";

import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  RADIAL_VELOCITY_SHARE_STATE_MAX_CHARS,
  buildRadialVelocityVisual,
  decodeRadialVelocityState,
  encodeRadialVelocityState,
  radialVelocityRequestEndpoint,
  validateRadialVelocityArtifact,
  validateRadialVelocityCalculationResult,
  validateRadialVelocityState,
} from "../src/lib/simulations/radial-velocity";
import { RADIAL_VELOCITY_DEFAULT_RESULT } from "./radial-velocity-fixture";

describe("Radial Velocity web contract", () => {
  it("round-trips one exact versioned share state", () => {
    const encoded = encodeRadialVelocityState(DEFAULT_RADIAL_VELOCITY_STATE);
    expect(encoded.length).toBeLessThan(RADIAL_VELOCITY_SHARE_STATE_MAX_CHARS);
    expect(decodeRadialVelocityState(encoded)).toEqual(DEFAULT_RADIAL_VELOCITY_STATE);
    expect(decodeRadialVelocityState(` ${encoded}`)).toBeNull();
  });

  it("rejects additive, out-of-range, mass-ratio, and half-open-angle violations", () => {
    expect(
      validateRadialVelocityState({ ...DEFAULT_RADIAL_VELOCITY_STATE, extra: true }),
    ).toBeNull();
    expect(
      validateRadialVelocityState({ ...DEFAULT_RADIAL_VELOCITY_STATE, eccentricity: 0.96 }),
    ).toBeNull();
    expect(
      validateRadialVelocityState({
        ...DEFAULT_RADIAL_VELOCITY_STATE,
        planet_mass_kg: DEFAULT_RADIAL_VELOCITY_STATE.stellar_mass_kg,
      }),
    ).toBeNull();
    expect(
      validateRadialVelocityState({
        ...DEFAULT_RADIAL_VELOCITY_STATE,
        stellar_argument_of_periastron_deg: 360,
      }),
    ).toBeNull();
    expect(
      decodeRadialVelocityState("x".repeat(RADIAL_VELOCITY_SHARE_STATE_MAX_CHARS + 1)),
    ).toBeNull();
  });

  it("builds the canonical API request without deriving RV physics", () => {
    const endpoint = radialVelocityRequestEndpoint(DEFAULT_RADIAL_VELOCITY_STATE);
    const url = new URL(endpoint.path, "http://test");
    expect(url.pathname).toBe("/api/v1/simulations/radial-velocity");
    expect([...url.searchParams.keys()].sort()).toEqual(
      [
        "eccentricity",
        "inclination_deg",
        "mean_anomaly_at_epoch_deg",
        "orbital_period_s",
        "planet_mass_kg",
        "stellar_argument_of_periastron_deg",
        "stellar_mass_kg",
      ].sort(),
    );
    expect("maxResponseBytes" in endpoint).toBe(false);
  });

  it("accepts an exact generated result and normalizes only returned plot values", () => {
    expect(
      validateRadialVelocityCalculationResult(
        DEFAULT_RADIAL_VELOCITY_STATE,
        RADIAL_VELOCITY_DEFAULT_RESULT,
      ),
    ).toEqual(RADIAL_VELOCITY_DEFAULT_RESULT);
    const visual = buildRadialVelocityVisual(RADIAL_VELOCITY_DEFAULT_RESULT);
    expect(visual?.points).toHaveLength(301);
    expect(visual?.path.startsWith("M")).toBe(true);
    expect(visual?.minimum_velocity_m_s).toBe(-150);
    expect(visual?.maximum_velocity_m_s).toBe(150);
  });

  it("rejects forged echoes, additive payloads, reversed samples, and wrong terminal phase", () => {
    expect(
      validateRadialVelocityCalculationResult(DEFAULT_RADIAL_VELOCITY_STATE, {
        ...RADIAL_VELOCITY_DEFAULT_RESULT,
        inputs: { ...RADIAL_VELOCITY_DEFAULT_RESULT.inputs, inclination_deg: 40 },
      }),
    ).toBeNull();
    expect(
      validateRadialVelocityCalculationResult(DEFAULT_RADIAL_VELOCITY_STATE, {
        ...RADIAL_VELOCITY_DEFAULT_RESULT,
        extra: true,
      }),
    ).toBeNull();
    expect(
      validateRadialVelocityCalculationResult(DEFAULT_RADIAL_VELOCITY_STATE, {
        ...RADIAL_VELOCITY_DEFAULT_RESULT,
        curve: [...RADIAL_VELOCITY_DEFAULT_RESULT.curve].reverse(),
      }),
    ).toBeNull();
    expect(
      validateRadialVelocityCalculationResult(DEFAULT_RADIAL_VELOCITY_STATE, {
        ...RADIAL_VELOCITY_DEFAULT_RESULT,
        curve: RADIAL_VELOCITY_DEFAULT_RESULT.curve.map((point, index) =>
          index === 300 ? { ...point, orbital_phase: 0.99 } : point,
        ),
      }),
    ).toBeNull();
  });

  it("rejects obvious artifact mutation", async () => {
    const artifact = structuredClone(
      (await import("../../../data/seed/radial-velocity-v1.json")).default,
    );
    artifact.model_version = "invented";
    expect(() => validateRadialVelocityArtifact(artifact)).toThrow();
  });
});
