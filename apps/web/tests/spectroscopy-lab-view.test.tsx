import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpectroscopyLabView } from "../src/components/spectroscopy-lab-view";
import { DEFAULT_SPECTROSCOPY_STATE } from "../src/lib/simulations/spectroscopy-lab";
import {
  SPECTROSCOPY_CONTINUUM_RESULT,
  SPECTROSCOPY_DEFAULT_RESULT,
} from "./spectroscopy-lab-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/spectroscopy-lab");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(initialCalculation = SPECTROSCOPY_DEFAULT_RESULT, invalid = false) {
  return render(
    <SpectroscopyLabView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={DEFAULT_SPECTROSCOPY_STATE}
      initialStateInvalid={invalid}
    />,
  );
}

describe("SpectroscopyLabView", () => {
  it("keeps returned spectrum, source caveats, and controls accessible", async () => {
    const { container } = renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Spectroscopy Lab" })).toBeVisible();
    expect(screen.getByRole("img", { name: /Returned normalized spectrum/i })).toBeVisible();
    expect(screen.getByText("H-alpha representative")).toBeVisible();
    expect(screen.getByText(/browser does not calculate continuum/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /NIST Atomic Spectra Database/i })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact continuum state", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(SPECTROSCOPY_CONTINUUM_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText("Mode"), "continuum");
    const temperature = screen.getByLabelText("Temperature K");
    await user.clear(temperature);
    await user.type(temperature, "6000");
    await user.click(screen.getByRole("button", { name: "Calculate spectrum" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("state")).toContain(
        '"mode":"continuum"',
      ),
    );
    expect(screen.getByText(/Continuum mode returns no atomic fingerprint lines/i)).toBeVisible();
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const resolution = screen.getByLabelText("Resolving power R");
    await user.clear(resolution);
    await user.type(resolution, "400");
    await user.click(screen.getByRole("button", { name: "Calculate spectrum" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/canonical Spectroscopy Lab rejected this state/i)).toBeVisible();
    expect(screen.getByText("H-alpha representative")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects invalid drafts locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const temperature = screen.getByLabelText("Temperature K");
    await user.clear(temperature);
    await user.click(screen.getByRole("button", { name: "Calculate spectrum" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/empty or outside the reviewed v1 domain/i)).toBeVisible();
  });
});
