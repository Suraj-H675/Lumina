import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TransitMethodCalculationResponse } from "@lumina/api-client";

import { TransitMethodView } from "../src/components/transit-method-view";
import {
  DEFAULT_TRANSIT_METHOD_STATE,
  type TransitMethodState,
} from "../src/lib/simulations/transit-method";
import { TRANSIT_DEFAULT_RESULT, transitResponseFor } from "./transit-method-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/transit-method");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(
  initialCalculation: TransitMethodCalculationResponse | null = TRANSIT_DEFAULT_RESULT,
  initialStateInvalid = false,
) {
  return render(
    <TransitMethodView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={DEFAULT_TRANSIT_METHOD_STATE}
      initialStateInvalid={initialStateInvalid}
    />,
  );
}

describe("TransitMethodView", () => {
  it("renders canonical outputs, an accessible returned light curve, limitations, and sources", async () => {
    const { container } = renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Transit Method Lab" })).toBeVisible();
    expect(screen.getByText("Full transit")).toBeVisible();
    expect(screen.getByRole("img", { name: "Returned relative-flux light curve" })).toBeVisible();
    expect(screen.getByText(/no detectability score/i)).toBeVisible();
    expect(screen.getByText(/No limb darkening/i)).toBeInTheDocument();
    expect(screen.getByText(/Analytic Lightcurves for Planetary Transit Searches/i)).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted echoed API state to the share URL", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const state: TransitMethodState = {
        ...DEFAULT_TRANSIT_METHOD_STATE,
        inclination_deg: Number(url.searchParams.get("inclination_deg")),
      };
      return Promise.resolve(
        new Response(JSON.stringify(transitResponseFor(state)), {
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
    await user.type(inclination, "89");
    await user.click(screen.getByRole("button", { name: "Calculate transit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("state")).toContain(
        '"inclination_deg":89',
      ),
    );
    expect(screen.getByText(/inclination 89°/i)).toBeVisible();
  });

  it("retains the last canonical result when the API rejects relationally invalid state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const planetRadius = screen.getByRole("spinbutton", { name: /Planet radius/i });
    await user.clear(planetRadius);
    await user.type(planetRadius, "1000000000000");
    await user.click(screen.getByRole("button", { name: "Calculate transit" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/canonical Transit Method model rejected this configuration/i),
    ).toBeVisible();
    expect(screen.getByText("Full transit")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("never fabricates a browser result when no canonical calculation is available", () => {
    renderView(null);
    expect(screen.getByRole("heading", { name: "No canonical result available" })).toBeVisible();
    expect(
      screen.queryByRole("img", { name: "Returned relative-flux light curve" }),
    ).not.toBeInTheDocument();
  });

  it("rejects empty numeric drafts instead of coercing them to zero", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const stellarRadius = screen.getByRole("spinbutton", { name: /Stellar radius/i });
    await user.clear(stellarRadius);
    await user.click(screen.getByRole("button", { name: "Calculate transit" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/empty, non-finite, or outside/i)).toBeVisible();
  });
});
