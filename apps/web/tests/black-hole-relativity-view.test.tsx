import { axe } from "jest-axe";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlackHoleRelativityView } from "../src/components/black-hole-relativity-view";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { BlackHoleRelativityMessages } from "../src/lib/i18n/messages/types";
import { DEFAULT_BLACK_HOLE_RELATIVITY_STATE } from "../src/lib/simulations/black-hole-relativity";
import {
  BLACK_HOLE_RELATIVITY_DEFAULT_RESULT,
  BLACK_HOLE_RELATIVITY_RADIUS_4_RESULT,
} from "./black-hole-relativity-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/black-hole-relativity");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(
  invalid = false,
  messages: BlackHoleRelativityMessages = enMessages.simulationLabs.blackHoleRelativity,
) {
  return render(
    <BlackHoleRelativityView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={BLACK_HOLE_RELATIVITY_DEFAULT_RESULT}
      initialState={DEFAULT_BLACK_HOLE_RELATIVITY_STATE}
      initialStateInvalid={invalid}
      locale={DEFAULT_LOCALE}
      messages={messages}
    />,
  );
}

describe("BlackHoleRelativityView", () => {
  it("renders returned landmarks, frame caveats, provenance, and accessible alternatives", async () => {
    const { container } = renderView();
    expect(
      screen.getByRole("heading", { level: 1, name: "Black-Hole / Relativity Lab" }),
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Returned Schwarzschild landmark areal-radius schematic" }),
    ).toBeVisible();
    expect(screen.getAllByText(/29,532\.5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/not freely falling/i)).toBeVisible();
    expect(screen.getByText(/not proper radial distance, ray tracing/i)).toBeVisible();
    expect(screen.getByText(/browser does not calculate relativity results/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /IAU 2015 Resolution B3/i })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact Python-owned result", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(BLACK_HOLE_RELATIVITY_RADIUS_4_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const radius = screen.getByLabelText("Static observer radius in Schwarzschild radii");
    await user.clear(radius);
    await user.type(radius, "4");
    await user.click(screen.getByRole("button", { name: "Calculate Schwarzschild model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const state = new URL(window.location.href).searchParams.get("state");
      expect(state).not.toBeNull();
      const decoded = JSON.parse(state!);
      expect(decoded.model_version).toBe("black-hole-relativity-v1");
      expect(decoded.static_observer_radius_rs).toBe(4);
    });
    expect(screen.getAllByText(/0\.1547005/).length).toBeGreaterThan(0);
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const radius = screen.getByLabelText("Static observer radius in Schwarzschild radii");
    await user.clear(radius);
    await user.type(radius, "4");
    await user.click(screen.getByRole("button", { name: "Calculate Schwarzschild model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(/canonical Black-Hole \/ Relativity Lab rejected this state/i),
    ).toBeVisible();
    expect(screen.getAllByText(/0\.4142136/).length).toBeGreaterThan(0);
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects horizon and inside-horizon drafts locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const radius = screen.getByLabelText("Static observer radius in Schwarzschild radii");
    await user.clear(radius);
    await user.type(radius, "1");
    const submit = screen.getByRole("button", { name: "Calculate Schwarzschild model" });
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/outside the reviewed Schwarzschild v1 domain/i)).toBeVisible();
  });

  it("localizes interface chrome without rewriting returned Schwarzschild science or sources", () => {
    const messages: BlackHoleRelativityMessages = {
      ...enMessages.simulationLabs.blackHoleRelativity,
      header: {
        ...enMessages.simulationLabs.blackHoleRelativity.header,
        title: "Fixture Schwarzschild Lab",
      },
      result: {
        ...enMessages.simulationLabs.blackHoleRelativity.result,
        metrics: {
          ...enMessages.simulationLabs.blackHoleRelativity.result.metrics,
          redshift: "Fixture redshift label",
        },
      },
    };

    renderView(false, messages);

    expect(
      screen.getByRole("heading", { level: 1, name: "Fixture Schwarzschild Lab" }),
    ).toBeVisible();
    expect(screen.getByText("Fixture redshift label")).toBeVisible();
    expect(screen.getByText(/not freely falling/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /IAU 2015 Resolution B3/i })).toBeVisible();
  });
});
