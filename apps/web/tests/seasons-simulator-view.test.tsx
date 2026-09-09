import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SeasonsSimulatorView } from "../src/components/seasons-simulator-view";
import { DEFAULT_SEASONS_STATE } from "../src/lib/simulations/seasons-simulator";
import type { SeasonsCalculationResponse } from "@lumina/api-client";

const JUNE_RESULT: SeasonsCalculationResponse = {
  model_version: "seasons-simulator-v1",
  schema_version: 1,
  inputs: {
    axial_tilt_deg: 23.43928,
    orbital_position_deg: 90,
    latitude_deg: 40,
    eccentricity_preset: "earth",
  },
  solar_declination_deg: 23.43928,
  selected: {
    latitude_deg: 40,
    noon_solar_zenith_deg: 16.56072,
    noon_sun_altitude_deg: 73.43928,
    illumination_incidence_deg: 16.56072,
    day_length_hours: 14.8444511275,
    polar_state: "none",
  },
  comparison_latitude_deg: -40,
  opposite_hemisphere: {
    latitude_deg: -40,
    noon_solar_zenith_deg: 63.43928,
    noon_sun_altitude_deg: 26.56072,
    illumination_incidence_deg: 63.43928,
    day_length_hours: 9.1555488725,
    polar_state: "none",
  },
  eccentricity: 0.01671123,
  distance_over_semimajor_axis: 1.0162727707813541,
  relative_solar_flux: 0.9682319752100141,
};

function respondWith(result: SeasonsCalculationResponse): typeof fetch {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", "/lab/seasons-simulator");
  vi.stubGlobal("fetch", vi.fn(respondWith(JUNE_RESULT)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(initialStateInvalid = false) {
  return render(
    <SeasonsSimulatorView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={JUNE_RESULT}
      initialState={DEFAULT_SEASONS_STATE}
      initialStateInvalid={initialStateInvalid}
    />,
  );
}

describe("SeasonsSimulatorView", () => {
  it("renders numeric results, model disclosures, accessible diagrams, and sources", async () => {
    const { container } = renderView();

    expect(screen.getByRole("heading", { level: 1, name: "Seasons Simulator" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Canonical model result" })).toBeVisible();
    expect(screen.getByText("23.4°")).toBeVisible();
    expect(screen.getAllByText("73.4°")[0]).toBeVisible();
    expect(screen.getAllByText("14.8 h")[0]).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByTestId("seasons-orbit-figure")).toBeVisible();
    expect(screen.getByTestId("seasons-illumination-figure")).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Model, assumptions, validity, and provenance",
      }),
    ).toBeVisible();
    expect(screen.getByText(/NOAA's fractional-year declination polynomial is not/i)).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "What Causes the Seasons?" }).length,
    ).toBeGreaterThan(0);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("keeps the last valid result while manually entered invalid input is visible", async () => {
    const user = userEvent.setup();
    renderView();

    const tilt = screen.getByRole("spinbutton", { name: "Axial tilt" });
    await user.clear(tilt);
    await user.type(tilt, "91");

    expect(screen.getByRole("alert")).toHaveTextContent(/outside the v1 valid range/i);
    expect(screen.getAllByText("73.4°")[0]).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: "Canonical model result" })).toBeVisible();
  });

  it("performs a validated GET when a closed eccentricity preset changes", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("eccentricity_preset")).toBe("circular");
      const circular: SeasonsCalculationResponse = {
        ...JUNE_RESULT,
        inputs: { ...JUNE_RESULT.inputs, eccentricity_preset: "circular" },
        eccentricity: 0,
        distance_over_semimajor_axis: 1,
        relative_solar_flux: 1,
      };
      return Promise.resolve(
        new Response(JSON.stringify(circular), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText("Eccentricity context preset"), "circular");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/1.0000×/)[0]).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toContain(
      '"eccentricity_preset":"circular"',
    );
  });

  it("reports malformed incoming state and resets it explicitly", async () => {
    const user = userEvent.setup();
    renderView(true);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /shared Seasons Simulator state was not valid/i,
    );
    await user.click(screen.getByRole("button", { name: "Reset to default state" }));
    await waitFor(() =>
      expect(
        screen.queryByText(/shared Seasons Simulator state was not valid/i),
      ).not.toBeInTheDocument(),
    );
    expect(new URL(window.location.href).search).toBe("");
    expect(screen.getByRole("status")).toHaveTextContent(/reset to its June-solstice default/i);
  });

  it("keeps phase controls keyboard-operable and uses the disclosed phase labels", () => {
    renderView();

    const phaseSlider = screen.getByRole("slider", { name: "Orbital position slider" });
    phaseSlider.focus();
    fireEvent.change(phaseSlider, { target: { value: "270" } });

    expect(screen.getByRole("button", { name: "December solstice" })).toBeEnabled();
    expect(screen.getByRole("spinbutton", { name: "Orbital position" })).toHaveValue(270);
    expect(
      screen.getByText(/orbital position is a seasonal angle, not a calendar date/i),
    ).toBeVisible();
  });
});
