import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanetarySystemBuilderView } from "../src/components/planetary-system-builder-view";
import { DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE } from "../src/lib/simulations/planetary-system-builder";
import {
  PLANETARY_SYSTEM_BUILDER_AXIS_08_RESULT,
  PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT,
} from "./planetary-system-builder-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/planetary-system-builder");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(invalid = false) {
  return render(
    <PlanetarySystemBuilderView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={PLANETARY_SYSTEM_BUILDER_DEFAULT_RESULT}
      initialState={DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE}
      initialStateInvalid={invalid}
    />,
  );
}

describe("PlanetarySystemBuilderView", () => {
  it("renders returned system science, limitations, provenance, and accessible alternatives", async () => {
    const { container } = renderView();
    expect(
      screen.getByRole("heading", { level: 1, name: "Planetary System Builder" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: /Returned planetary-system placement diagram/i }),
    ).toBeVisible();
    expect(screen.getByText(/does not establish habitability or life/i)).toBeVisible();
    expect(screen.getByText(/not a whole-system stability result/i)).toBeVisible();
    expect(screen.getByText(/browser does not calculate Keplerian periods/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Habitable Zones Around Main-Sequence Stars/i }),
    ).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact Python-owned result", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(PLANETARY_SYSTEM_BUILDER_AXIS_08_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const firstAxis = screen.getByLabelText("Planet 1 semimajor axis AU");
    await user.clear(firstAxis);
    await user.type(firstAxis, "0.8");
    await user.click(screen.getByRole("button", { name: "Calculate system" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const state = new URL(window.location.href).searchParams.get("state");
      expect(state).not.toBeNull();
      const decoded = JSON.parse(state!);
      expect(decoded.model_version).toBe("planetary-system-builder-v1");
      expect(decoded.planets[0]).toEqual({ mass_mearth: 1, semi_major_axis_au: 0.8 });
    });
    expect(screen.getByText(/261\.356/)).toBeVisible();
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const firstAxis = screen.getByLabelText("Planet 1 semimajor axis AU");
    await user.clear(firstAxis);
    await user.type(firstAxis, "0.8");
    await user.click(screen.getByRole("button", { name: "Calculate system" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/canonical Planetary System Builder rejected this state/i),
    ).toBeVisible();
    expect(screen.getByText(/213\.916/)).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects invalid ordered drafts locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const firstAxis = screen.getByLabelText("Planet 1 semimajor axis AU");
    await user.clear(firstAxis);
    await user.type(firstAxis, "1");
    await user.click(screen.getByRole("button", { name: "Calculate system" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Semimajor axes must already be strictly increasing/i)).toBeVisible();
  });
});
