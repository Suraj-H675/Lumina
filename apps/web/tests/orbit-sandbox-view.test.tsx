import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ORBIT_SANDBOX_MAX_RESPONSE_BYTES,
  type OrbitSandboxCalculationResponse,
} from "@lumina/api-client";

import { OrbitSandboxView } from "../src/components/orbit-sandbox-view";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { OrbitSandboxMessages } from "../src/lib/i18n/messages/types";
import {
  DEFAULT_ORBIT_SANDBOX_STATE,
  buildOrbitVisualTransform,
  orbitSandboxRequestEndpoint,
  type OrbitSandboxState,
} from "../src/lib/simulations/orbit-sandbox";

const DEFAULT_RESULT: OrbitSandboxCalculationResponse = {
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

function responseFor(state: OrbitSandboxState): OrbitSandboxCalculationResponse {
  return {
    ...DEFAULT_RESULT,
    inputs: {
      central_mass_kg: state.central_mass_kg,
      central_radius_m: state.central_radius_m,
      orbiting_body_mass_kg: state.orbiting_body_mass_kg,
      position_x_m: state.position_x_m,
      position_y_m: state.position_y_m,
      velocity_x_m_s: state.velocity_x_m_s,
      velocity_y_m_s: state.velocity_y_m_s,
      duration_s: state.duration_s,
      time_step_s: state.time_step_s,
    },
  };
}

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/orbit-sandbox");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(
  initialCalculation: OrbitSandboxCalculationResponse | null = DEFAULT_RESULT,
  initialStateInvalid = false,
  messages: OrbitSandboxMessages = enMessages.simulationLabs.orbitSandbox,
) {
  return render(
    <OrbitSandboxView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={DEFAULT_ORBIT_SANDBOX_STATE}
      initialStateInvalid={initialStateInvalid}
      locale={DEFAULT_LOCALE}
      messages={messages}
    />,
  );
}

describe("OrbitSandboxView", () => {
  it("renders canonical outputs, an accessible returned trajectory, limitations, and sources", async () => {
    expect(buildOrbitVisualTransform(DEFAULT_RESULT)).not.toBeNull();
    const { container } = renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Orbit Sandbox" })).toBeVisible();
    expect(screen.getByText("Bound")).toBeVisible();
    expect(screen.getByRole("img", { name: "Returned relative trajectory" })).toBeVisible();
    expect(screen.getAllByText(/not to physical scale/i)).toHaveLength(2);
    expect(screen.getByText(/No n-body perturbations/i)).toBeInTheDocument();
    expect(screen.getByText(/Fundamental Physical Constants/i)).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("encodes scientific notation safely and commits only the accepted echoed API state", async () => {
    const endpoint = orbitSandboxRequestEndpoint(DEFAULT_ORBIT_SANDBOX_STATE);
    expect(endpoint.path).toContain("central_mass_kg=5.9722e%2B24");
    expect(endpoint.maxResponseBytes).toBe(ORBIT_SANDBOX_MAX_RESPONSE_BYTES);

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const state: OrbitSandboxState = {
        ...DEFAULT_ORBIT_SANDBOX_STATE,
        duration_s: Number(url.searchParams.get("duration_s")),
      };
      return Promise.resolve(
        new Response(JSON.stringify(responseFor(state)), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const duration = screen.getByRole("spinbutton", { name: /Simulation duration/i });
    await user.clear(duration);
    await user.type(duration, "5000");
    await user.click(screen.getByRole("button", { name: "Calculate orbit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("state")).toContain(
        '"duration_s":5000',
      ),
    );
    expect(screen.getByText(/5,000 s duration/i)).toBeVisible();
  });

  it("retains the last canonical result when the API rejects a relationally invalid state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const step = screen.getByRole("spinbutton", { name: /Integration time step/i });
    await user.clear(step);
    await user.type(step, "100");
    await user.click(screen.getByRole("button", { name: "Calculate orbit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/canonical Orbit Sandbox rejected this configuration/i)).toBeVisible();
    expect(screen.getByText("Bound")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("never fabricates a browser result when no canonical calculation is available", () => {
    renderView(null);
    expect(screen.getByRole("heading", { name: "No canonical result available" })).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "Returned relative trajectory" }),
    ).not.toBeInTheDocument();
  });

  it("rejects empty numeric drafts instead of coercing them to zero", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const secondaryMass = screen.getByRole("spinbutton", { name: /Secondary mass/i });
    await user.clear(secondaryMass);
    await user.click(screen.getByRole("button", { name: "Calculate orbit" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/empty, non-finite, or outside/i)).toBeVisible();
  });

  it("localizes interface state without rewriting reviewed model or source content", () => {
    const messages: OrbitSandboxMessages = {
      ...enMessages.simulationLabs.orbitSandbox,
      classification: {
        ...enMessages.simulationLabs.orbitSandbox.classification,
        bound: "Fixture bound label",
      },
      header: {
        ...enMessages.simulationLabs.orbitSandbox.header,
        title: "Fixture Orbit Sandbox",
      },
      result: {
        ...enMessages.simulationLabs.orbitSandbox.result,
        labels: {
          ...enMessages.simulationLabs.orbitSandbox.result.labels,
          classification: "Fixture classification",
        },
      },
    };

    renderView(DEFAULT_RESULT, false, messages);

    expect(screen.getByRole("heading", { level: 1, name: "Fixture Orbit Sandbox" })).toBeVisible();
    expect(screen.getByText("Fixture classification")).toBeVisible();
    expect(screen.getByText("Fixture bound label")).toBeVisible();
    expect(screen.getByText(/No n-body perturbations/i)).toBeInTheDocument();
    expect(screen.getByText(/Fundamental Physical Constants/i)).toBeVisible();
  });
});
