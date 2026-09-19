import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RelativityVisualizationsView } from "../src/components/relativity-visualizations-view";
import { DEFAULT_RELATIVITY_VISUALIZATIONS_STATE } from "../src/lib/simulations/relativity-visualizations";
import {
  RELATIVITY_VISUALIZATIONS_BETA_08_RESULT,
  RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT,
} from "./relativity-visualizations-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/relativity-visualizations");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(invalid = false) {
  return render(
    <RelativityVisualizationsView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={RELATIVITY_VISUALIZATIONS_DEFAULT_RESULT}
      initialState={DEFAULT_RELATIVITY_VISUALIZATIONS_STATE}
      initialStateInvalid={invalid}
    />,
  );
}

describe("RelativityVisualizationsView", () => {
  it("renders returned science, frame caveats, light-cone teaching, provenance, and accessibility", async () => {
    const { container } = renderView();
    expect(
      screen.getByRole("heading", { level: 1, name: "Relativity Visualizations" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Reviewed normalized special-relativity light-cone diagram",
      }),
    ).toBeVisible();
    expect(screen.getByText("12.5", { exact: false })).toBeVisible();
    expect(screen.getByText("80", { exact: false })).toBeVisible();
    expect(screen.getByText("-0.75", { exact: false })).toBeVisible();
    expect(screen.getByText(/not a photographic appearance/i)).toBeVisible();
    expect(screen.getByText(/not a user-input calculation/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Open Black-Hole \/ Relativity Lab/i }),
    ).toHaveAttribute("href", "/lab/black-hole-relativity");
    expect(screen.getByRole("link", { name: /5.3 Time Dilation/i })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact Python-owned result", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(RELATIVITY_VISUALIZATIONS_BETA_08_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const beta = screen.getByLabelText("Relative speed as fraction of c");
    await user.clear(beta);
    await user.type(beta, "0.8");
    await user.click(screen.getByRole("button", { name: "Calculate special relativity" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const state = new URL(window.location.href).searchParams.get("state");
      expect(state).not.toBeNull();
      const decoded = JSON.parse(state!);
      expect(decoded.model_version).toBe("relativity-visualizations-v1");
      expect(decoded.relative_speed_fraction_c).toBe(0.8);
    });
    expect(screen.getAllByText(/1\.333333/)[0]).toBeVisible();
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(RELATIVITY_VISUALIZATIONS_BETA_08_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const beta = screen.getByLabelText("Relative speed as fraction of c");
    await user.clear(beta);
    await user.type(beta, "0.8");
    await user.click(screen.getByRole("button", { name: "Calculate special relativity" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const accepted = new URL(window.location.href).searchParams.get("state");
    expect(accepted).not.toBeNull();

    await user.clear(beta);
    await user.type(beta, "0.9");
    await user.click(screen.getByRole("button", { name: "Calculate special relativity" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(
      screen.getByText(/canonical Relativity Visualizations model rejected this state/i),
    ).toBeVisible();
    expect(screen.getAllByText(/1\.333333/)[0]).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBe(accepted);
  });

  it("rejects beta at c locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const beta = screen.getByLabelText("Relative speed as fraction of c");
    await user.clear(beta);
    await user.type(beta, "1");
    const submit = screen.getByRole("button", { name: "Calculate special relativity" });
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/outside the reviewed special-relativity v1 domain/i)).toBeVisible();
  });
});
