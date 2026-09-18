import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StellarLaboratoryView } from "../src/components/stellar-laboratory-view";
import { DEFAULT_STELLAR_LABORATORY_STATE } from "../src/lib/simulations/stellar-laboratory";
import {
  STELLAR_LABORATORY_DEFAULT_RESULT,
  STELLAR_LABORATORY_TEN_SOLAR_MASS_RESULT,
} from "./stellar-laboratory-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/stellar-laboratory");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(initialCalculation = STELLAR_LABORATORY_DEFAULT_RESULT, invalid = false) {
  return render(
    <StellarLaboratoryView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={DEFAULT_STELLAR_LABORATORY_STATE}
      initialStateInvalid={invalid}
    />,
  );
}

describe("StellarLaboratoryView", () => {
  it("renders returned properties, categorical lifecycle, uncertainty, and sources accessibly", async () => {
    const { container } = renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Stellar Laboratory" })).toBeVisible();
    expect(screen.getByText("Typical luminosity")).toBeVisible();
    expect(screen.getAllByText("carbon-oxygen white dwarf")).toHaveLength(2);
    expect(screen.getByText(/not an age-resolved evolutionary track/i)).toBeVisible();
    expect(screen.getByText(/boundaries may change/i)).toBeVisible();
    expect(
      screen.getByRole("link", {
        name: /Interrelated Main-Sequence Mass-Luminosity, Mass-Radius and Mass-Effective Temperature Relations/i,
      }),
    ).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted echoed API state to the share URL", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(STELLAR_LABORATORY_TEN_SOLAR_MASS_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const mass = screen.getByRole("spinbutton", { name: /Initial stellar mass/i });
    await user.clear(mass);
    await user.type(mass, "10");
    await user.click(screen.getByRole("button", { name: "Calculate stellar model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("state")).toContain(
        '"initial_mass_msun":10',
      ),
    );
    expect(screen.getAllByText("neutron star")).toHaveLength(2);
  });

  it("retains the last canonical result when the API rejects a valid-range state", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const mass = screen.getByRole("spinbutton", { name: /Initial stellar mass/i });
    await user.clear(mass);
    await user.type(mass, "2");
    await user.click(screen.getByRole("button", { name: "Calculate stellar model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/canonical Stellar Laboratory model rejected this mass/i),
    ).toBeVisible();
    expect(screen.getAllByText("carbon-oxygen white dwarf")).toHaveLength(2);
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects empty or out-of-range drafts before requesting the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();
    const mass = screen.getByRole("spinbutton", { name: /Initial stellar mass/i });

    await user.clear(mass);
    await user.click(screen.getByRole("button", { name: "Calculate stellar model" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/empty, non-finite, or outside/i)).toBeVisible();

    await user.type(mass, "40");
    await user.click(screen.getByRole("button", { name: "Calculate stellar model" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
