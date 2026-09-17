import { describe, expect, it, vi } from "vitest";

import type { OrbitSandboxCalculationResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { loadOrbitSandboxCalculation } from "../src/lib/server/orbit-sandbox";
import { DEFAULT_ORBIT_SANDBOX_STATE } from "../src/lib/simulations/orbit-sandbox";

const RESULT: OrbitSandboxCalculationResponse = {
  model_version: "orbit-sandbox-v1",
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
  classification: "bound",
  collision_time_s: null,
  trajectory: [{ time_s: 0, x_m: 7000000, y_m: 0, distance_m: 7000000, speed_m_s: 7546 }],
  max_specific_energy_drift_fraction: 0,
  max_specific_angular_momentum_drift_fraction: 0,
};

describe("Orbit Sandbox server loader", () => {
  it("encodes scientific notation and accepts only the exact echoed generated response", async () => {
    const requests: string[] = [];
    const result = await loadOrbitSandboxCalculation(DEFAULT_ORBIT_SANDBOX_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: ((input: RequestInfo | URL) => {
        requests.push(String(input));
        return Promise.resolve(
          new Response(JSON.stringify(RESULT), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }) as typeof fetch,
    });

    expect(result).toEqual({ data: RESULT, kind: "ok" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toContain("central_mass_kg=5.9722e%2B24");
  });

  it("fails closed on an additive scientific response", async () => {
    const result = await loadOrbitSandboxCalculation(DEFAULT_ORBIT_SANDBOX_STATE, {
      origin: "http://127.0.0.1:8000",
      fetchImplementation: (() =>
        Promise.resolve(
          new Response(JSON.stringify({ ...RESULT, invented: true }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        )) as typeof fetch,
    });

    expect(result).toEqual({ kind: "unavailable" });
  });
});
