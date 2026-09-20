import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { OrbitSandboxCalculationResponse } from "@lumina/api-client";

import { OrbitSandboxNoScript } from "../src/components/orbit-sandbox-no-script";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
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
  trajectory: [
    { time_s: 0, x_m: 7000000, y_m: 0, distance_m: 7000000, speed_m_s: 7546 },
    { time_s: 10, x_m: 6999594, y_m: 75459, distance_m: 7000000, speed_m_s: 7546 },
  ],
  max_specific_energy_drift_fraction: 1e-10,
  max_specific_angular_momentum_drift_fraction: 1e-15,
};

describe("OrbitSandboxNoScript", () => {
  it("keeps the canonical result, equations, limitations, and reviewed sources available", () => {
    const markup = renderToStaticMarkup(
      <OrbitSandboxNoScript
        initialCalculation={RESULT}
        initialState={DEFAULT_ORBIT_SANDBOX_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.orbitSandbox}
      />,
    );

    expect(markup).toContain("Canonical result");
    expect(markup).toContain("Phase 7 / Orbit Sandbox");
    expect(markup).toContain("orbit-sandbox-v1");
    expect(markup).toContain("Specific orbital energy");
    expect(markup).toContain("Collision time in requested window");
    expect(markup).toContain("Bound");
    expect(markup).toContain("velocity verlet position");
    expect(markup).toContain("No n-body perturbations");
    expect(markup).toContain("Fundamental Physical Constants");
  });

  it("reports invalid shared state and unavailable calculation without fabricating output", () => {
    const markup = renderToStaticMarkup(
      <OrbitSandboxNoScript
        initialCalculation={null}
        initialState={DEFAULT_ORBIT_SANDBOX_STATE}
        initialStateInvalid
        locale={DEFAULT_LOCALE}
        messages={enMessages.simulationLabs.orbitSandbox}
      />,
    );

    expect(markup).toContain("Shared orbit state rejected");
    expect(markup).toContain("Calculation unavailable");
    expect(markup).toContain("No substitute or browser-generated orbit was fabricated");
    expect(markup).not.toContain("Max specific-energy drift");
  });
});
