import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImpactSimulatorView } from "../src/components/impact-simulator-view";
import { DEFAULT_IMPACT_SIMULATOR_STATE } from "../src/lib/simulations/impact-simulator";
import {
  IMPACT_SIMULATOR_DEFAULT_RESULT,
  IMPACT_SIMULATOR_DIAMETER_2000_RESULT,
} from "./impact-simulator-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/impact-simulator");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(invalid = false) {
  return render(
    <ImpactSimulatorView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={IMPACT_SIMULATOR_DEFAULT_RESULT}
      initialState={DEFAULT_IMPACT_SIMULATOR_STATE}
      initialStateInvalid={invalid}
    />,
  );
}

describe("ImpactSimulatorView", () => {
  it("renders returned science, uncertainty, provenance, and accessible alternatives", async () => {
    const { container } = renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Impact Simulator" })).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Returned crater and ejecta relative scale" }),
    ).toBeVisible();
    expect(screen.getAllByText(/20,661\.64/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a complete statistical confidence interval/i)).toBeVisible();
    expect(screen.getByText(/not a blast-damage equivalence/i)).toBeVisible();
    expect(screen.getByText(/browser does not calculate impact energy/i)).toBeVisible();
    expect(screen.getByText(/Collins et al\. \(2005\) Eq\. 21/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Earth Impact Effects Program/i })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact Python-owned result", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(IMPACT_SIMULATOR_DIAMETER_2000_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const diameter = screen.getByLabelText("Impactor diameter m");
    await user.clear(diameter);
    await user.type(diameter, "2000");
    await user.click(screen.getByRole("button", { name: "Calculate teaching model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const state = new URL(window.location.href).searchParams.get("state");
      expect(state).not.toBeNull();
      const decoded = JSON.parse(state!);
      expect(decoded.model_version).toBe("impact-simulator-v1");
      expect(decoded.diameter_m).toBe(2000);
    });
    expect(screen.getAllByText(/26,624\.77/).length).toBeGreaterThan(0);
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const diameter = screen.getByLabelText("Impactor diameter m");
    await user.clear(diameter);
    await user.type(diameter, "2000");
    await user.click(screen.getByRole("button", { name: "Calculate teaching model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/canonical Impact Simulator rejected this state/i)).toBeVisible();
    expect(screen.getAllByText(/20,661\.64/).length).toBeGreaterThan(0);
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects out-of-domain drafts locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const diameter = screen.getByLabelText("Impactor diameter m");
    await user.clear(diameter);
    await user.type(diameter, "1499");
    const submit = screen.getByRole("button", { name: "Calculate teaching model" });
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/outside the reviewed large solid-rock v1 domain/i)).toBeVisible();
  });
});
