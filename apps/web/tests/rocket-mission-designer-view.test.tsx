import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RocketMissionDesignerView } from "../src/components/rocket-mission-designer-view";
import { DEFAULT_ROCKET_MISSION_DESIGNER_STATE } from "../src/lib/simulations/rocket-mission-designer";
import {
  ROCKET_MISSION_DESIGNER_DEFAULT_RESULT,
  ROCKET_MISSION_DESIGNER_PAYLOAD_6000_RESULT,
} from "./rocket-mission-designer-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/rocket-mission-designer");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(invalid = false) {
  return render(
    <RocketMissionDesignerView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={ROCKET_MISSION_DESIGNER_DEFAULT_RESULT}
      initialState={DEFAULT_ROCKET_MISSION_DESIGNER_STATE}
      initialStateInvalid={invalid}
    />,
  );
}

describe("RocketMissionDesignerView", () => {
  it("renders returned staged science, caveats, provenance, and accessible alternatives", async () => {
    const { container } = renderView();
    expect(
      screen.getByRole("heading", { level: 1, name: "Rocket / Mission Designer" }),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Returned payload sensitivity plot" })).toBeVisible();
    expect(screen.getAllByText(/10,004\.97/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not a mission delta-v requirement/i)).toBeVisible();
    expect(screen.getByText(/browser does not calculate payload delta-v/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /Ideal Rocket Equation/i })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact Python-owned result", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(ROCKET_MISSION_DESIGNER_PAYLOAD_6000_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const payload = screen.getByLabelText("Payload mass kg");
    await user.clear(payload);
    await user.type(payload, "6000");
    await user.click(screen.getByRole("button", { name: "Calculate ideal model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const state = new URL(window.location.href).searchParams.get("state");
      expect(state).not.toBeNull();
      const decoded = JSON.parse(state!);
      expect(decoded.model_version).toBe("rocket-mission-designer-v1");
      expect(decoded.payload_mass_kg).toBe(6000);
    });
    expect(screen.getAllByText(/9,785\.613/).length).toBeGreaterThan(0);
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const payload = screen.getByLabelText("Payload mass kg");
    await user.clear(payload);
    await user.type(payload, "6000");
    await user.click(screen.getByRole("button", { name: "Calculate ideal model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/canonical Rocket \/ Mission Designer rejected this state/i),
    ).toBeVisible();
    expect(screen.getAllByText(/10,004\.97/).length).toBeGreaterThan(0);
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects out-of-domain drafts locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const isp = screen.getByLabelText("Stage 1 specific impulse s");
    await user.clear(isp);
    await user.type(isp, "501");
    const submit = screen.getByRole("button", { name: "Calculate ideal model" });
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/outside the reviewed v1 input bounds/i)).toBeVisible();
  });
});
