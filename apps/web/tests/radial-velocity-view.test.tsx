import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RadialVelocityCalculationResponse } from "@lumina/api-client";

import { RadialVelocityView } from "../src/components/radial-velocity-view";
import {
  DEFAULT_RADIAL_VELOCITY_STATE,
  type RadialVelocityState,
} from "../src/lib/simulations/radial-velocity";
import {
  RADIAL_VELOCITY_DEFAULT_RESULT,
  radialVelocityResponseFor,
} from "./radial-velocity-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/radial-velocity");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(
  initialCalculation: RadialVelocityCalculationResponse | null = RADIAL_VELOCITY_DEFAULT_RESULT,
  initialStateInvalid = false,
) {
  return render(
    <RadialVelocityView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={DEFAULT_RADIAL_VELOCITY_STATE}
      initialStateInvalid={initialStateInvalid}
    />,
  );
}

describe("RadialVelocityView", () => {
  it("renders canonical outputs, an accessible returned curve, limitations, and sources", async () => {
    const { container } = renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Radial Velocity Lab" })).toBeVisible();
    expect(screen.getByText(/RV semi-amplitude K/i)).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Returned stellar radial-velocity curve" }),
    ).toBeVisible();
    expect(screen.getByText(/related, not identical/i)).toBeVisible();
    expect(screen.getByText(/No stellar activity/i)).toBeInTheDocument();
    expect(screen.getByText(/Exoplanet Detection Methods/i)).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted echoed API state to the share URL", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const state: RadialVelocityState = {
        ...DEFAULT_RADIAL_VELOCITY_STATE,
        inclination_deg: Number(url.searchParams.get("inclination_deg")),
      };
      return Promise.resolve(
        new Response(JSON.stringify(radialVelocityResponseFor(state)), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const inclination = screen.getByRole("spinbutton", { name: /Inclination/i });
    await user.clear(inclination);
    await user.type(inclination, "40");
    await user.click(screen.getByRole("button", { name: "Calculate radial velocity" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("state")).toContain(
        '"inclination_deg":40',
      ),
    );
    expect(screen.getByText(/inclination 40°/i)).toBeVisible();
  });

  it("retains the last canonical result when the API rejects the state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const companionMass = screen.getByRole("spinbutton", { name: /Companion mass/i });
    await user.clear(companionMass);
    await user.type(companionMass, "1e29");
    await user.click(screen.getByRole("button", { name: "Calculate radial velocity" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/canonical Radial Velocity model rejected this configuration/i),
    ).toBeVisible();
    expect(screen.getByText(/RV semi-amplitude K/i)).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("never fabricates a browser result when no canonical calculation is available", () => {
    renderView(null);
    expect(screen.getByRole("heading", { name: "No canonical result available" })).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "Returned stellar radial-velocity curve" }),
    ).not.toBeInTheDocument();
  });

  it("rejects empty numeric drafts instead of coercing them to zero", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const stellarMass = screen.getByRole("spinbutton", { name: /Stellar mass/i });
    await user.clear(stellarMass);
    await user.click(screen.getByRole("button", { name: "Calculate radial velocity" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/empty, non-finite, outside/i)).toBeVisible();
  });
});
