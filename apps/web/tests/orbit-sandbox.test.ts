import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORBIT_SANDBOX_STATE,
  ORBIT_SANDBOX_MODEL_VERSION,
  ORBIT_SANDBOX_SHARE_STATE_MAX_CHARS,
  buildOrbitVisualTransform,
  decodeOrbitSandboxState,
  encodeOrbitSandboxState,
  validateOrbitSandboxArtifact,
  validateOrbitSandboxCalculationResult,
  validateOrbitSandboxState,
} from "../src/lib/simulations/orbit-sandbox";

const result = {
  model_version: ORBIT_SANDBOX_MODEL_VERSION,
  schema_version: 1,
  inputs: {
    central_mass_kg: DEFAULT_ORBIT_SANDBOX_STATE.central_mass_kg,
    central_radius_m: DEFAULT_ORBIT_SANDBOX_STATE.central_radius_m,
    orbiting_body_mass_kg: DEFAULT_ORBIT_SANDBOX_STATE.orbiting_body_mass_kg,
    position_x_m: DEFAULT_ORBIT_SANDBOX_STATE.position_x_m,
    position_y_m: DEFAULT_ORBIT_SANDBOX_STATE.position_y_m,
    velocity_x_m_s: DEFAULT_ORBIT_SANDBOX_STATE.velocity_x_m_s,
    velocity_y_m_s: DEFAULT_ORBIT_SANDBOX_STATE.velocity_y_m_s,
    duration_s: DEFAULT_ORBIT_SANDBOX_STATE.duration_s,
    time_step_s: DEFAULT_ORBIT_SANDBOX_STATE.time_step_s,
  },
  gravitational_parameter_m3_s2: 398602544600000,
  reduced_mass_kg: null,
  specific_orbital_energy_j_per_kg: -28471610.32857143,
  orbital_energy_j: null,
  specific_angular_momentum_m2_per_s: 52822512361.68155,
  angular_momentum_kg_m2_per_s: null,
  eccentricity: 0,
  semi_major_axis_m: 7000000,
  period_s: 5828.501263698674,
  periapsis_m: 7000000,
  apoapsis_m: 7000000,
  classification: "bound" as const,
  collision_time_s: null,
  trajectory: [
    { time_s: 0, x_m: 7000000, y_m: 0, distance_m: 7000000, speed_m_s: 7546 },
    { time_s: 10, x_m: 6999594, y_m: 75459, distance_m: 7000000, speed_m_s: 7546 },
  ],
  max_specific_energy_drift_fraction: 1e-10,
  max_specific_angular_momentum_drift_fraction: 1e-15,
};

describe("Orbit Sandbox web contract", () => {
  it("round-trips one canonical exact share state", () => {
    const encoded = encodeOrbitSandboxState(DEFAULT_ORBIT_SANDBOX_STATE);
    expect(encoded.length).toBeLessThan(ORBIT_SANDBOX_SHARE_STATE_MAX_CHARS);
    expect(decodeOrbitSandboxState(encoded)).toEqual(DEFAULT_ORBIT_SANDBOX_STATE);
    expect(decodeOrbitSandboxState(` ${encoded}`)).toBeNull();
  });

  it("rejects malformed, additive, and coarse out-of-range share state", () => {
    expect(validateOrbitSandboxState({ ...DEFAULT_ORBIT_SANDBOX_STATE, extra: true })).toBeNull();
    expect(
      validateOrbitSandboxState({ ...DEFAULT_ORBIT_SANDBOX_STATE, central_mass_kg: 0 }),
    ).toBeNull();
    expect(
      validateOrbitSandboxState({ ...DEFAULT_ORBIT_SANDBOX_STATE, duration_s: Number.NaN }),
    ).toBeNull();
    expect(decodeOrbitSandboxState("x".repeat(ORBIT_SANDBOX_SHARE_STATE_MAX_CHARS + 1))).toBeNull();
  });

  it("accepts the generated result without recomputing orbital equations", () => {
    expect(validateOrbitSandboxCalculationResult(DEFAULT_ORBIT_SANDBOX_STATE, result)).toEqual(
      result,
    );
    const visual = buildOrbitVisualTransform(result);
    expect(visual?.points).toHaveLength(2);
    expect(visual?.path.startsWith("M")).toBe(true);
  });

  it("rejects forged echoes, additive payloads, trajectory reversal, and incoherent bound fields", () => {
    expect(
      validateOrbitSandboxCalculationResult(DEFAULT_ORBIT_SANDBOX_STATE, {
        ...result,
        inputs: { ...result.inputs, duration_s: 42 },
      }),
    ).toBeNull();
    expect(
      validateOrbitSandboxCalculationResult(DEFAULT_ORBIT_SANDBOX_STATE, {
        ...result,
        extra: true,
      }),
    ).toBeNull();
    expect(
      validateOrbitSandboxCalculationResult(DEFAULT_ORBIT_SANDBOX_STATE, {
        ...result,
        trajectory: [result.trajectory[1], result.trajectory[0]],
      }),
    ).toBeNull();
    expect(
      validateOrbitSandboxCalculationResult(DEFAULT_ORBIT_SANDBOX_STATE, {
        ...result,
        semi_major_axis_m: null,
      }),
    ).toBeNull();
  });

  it("rejects obvious artifact mutation", async () => {
    const artifact = structuredClone(
      (await import("../../../data/seed/orbit-sandbox-v1.json")).default,
    );
    artifact.model_version = "invented";
    expect(() => validateOrbitSandboxArtifact(artifact)).toThrow();
  });
});
