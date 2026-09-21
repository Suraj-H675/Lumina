import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EclipseSimulatorView } from "../src/components/eclipse-simulator-view";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import { DEFAULT_ECLIPSE_SIMULATOR_STATE } from "../src/lib/simulations/eclipse-simulator";
import {
  ECLIPSE_DALLAS_NONE_RESULT,
  ECLIPSE_DALLAS_TOTAL_RESULT,
} from "./eclipse-simulator-fixture";

beforeEach(() => {
  window.history.replaceState(null, "", "/lab/eclipse-simulator");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderView(initialCalculation = ECLIPSE_DALLAS_TOTAL_RESULT, invalid = false) {
  return render(
    <EclipseSimulatorView
      apiOrigin="http://127.0.0.1:8000"
      initialCalculation={initialCalculation}
      initialState={DEFAULT_ECLIPSE_SIMULATOR_STATE}
      initialStateInvalid={invalid}
      locale={DEFAULT_LOCALE}
      messages={enMessages.simulationLabs.eclipseSimulator}
    />,
  );
}

describe("EclipseSimulatorView", () => {
  it("keeps safety, returned geometry, timing caveat, and provenance accessible", async () => {
    const { container } = renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Eclipse Simulator" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Solar-viewing safety" })).toBeVisible();
    expect(screen.getByText("umbra")).toBeVisible();
    expect(screen.getByText(/whole UTC minutes/i)).toBeVisible();
    expect(screen.getByText(/presentation-only apparent-disk sketch/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /NASA.*viewing safety/i })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });

  it("commits only an accepted exact echoed state", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(ECLIPSE_DALLAS_NONE_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const utc = screen.getByLabelText("UTC date and time");
    await user.clear(utc);
    await user.type(utc, "2024-04-09T18:42");
    await user.click(screen.getByRole("button", { name: "Calculate eclipse geometry" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(new URL(window.location.href).searchParams.get("state")).toContain(
        '"at_utc":"2024-04-09T18:42:00Z"',
      ),
    );
    expect(screen.getByText("outside")).toBeVisible();
    expect(screen.getByText(/No local eclipse event is returned/i)).toBeVisible();
  });

  it("retains the last canonical result after a 422", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 422 })));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    await user.clear(screen.getByLabelText("Elevation m"));
    await user.type(screen.getByLabelText("Elevation m"), "131");
    await user.click(screen.getByRole("button", { name: "Calculate eclipse geometry" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/canonical Eclipse Simulator rejected this state/i)).toBeVisible();
    expect(screen.getByText("umbra")).toBeVisible();
    expect(new URL(window.location.href).searchParams.get("state")).toBeNull();
  });

  it("rejects invalid drafts locally without an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderView();

    const latitude = screen.getByLabelText("Latitude deg");
    await user.clear(latitude);
    await user.click(screen.getByRole("button", { name: "Calculate eclipse geometry" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/outside the reviewed v1 range/i)).toBeVisible();
  });

  it("localizes interface chrome without rewriting returned timing or safety provenance", () => {
    const messages = {
      ...enMessages.simulationLabs.eclipseSimulator,
      header: {
        ...enMessages.simulationLabs.eclipseSimulator.header,
        title: "Localized Eclipse Simulator",
      },
      result: {
        ...enMessages.simulationLabs.eclipseSimulator.result,
        labels: {
          ...enMessages.simulationLabs.eclipseSimulator.result.labels,
          obscuration: "Localized obscuration",
        },
      },
    };

    render(
      <EclipseSimulatorView
        apiOrigin="http://127.0.0.1:8000"
        initialCalculation={ECLIPSE_DALLAS_TOTAL_RESULT}
        initialState={DEFAULT_ECLIPSE_SIMULATOR_STATE}
        initialStateInvalid={false}
        locale={DEFAULT_LOCALE}
        messages={messages}
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Localized Eclipse Simulator" }),
    ).toBeVisible();
    expect(screen.getByText("Localized obscuration")).toBeVisible();
    expect(screen.getByText(ECLIPSE_DALLAS_TOTAL_RESULT.timing_note)).toBeVisible();
    expect(screen.getByRole("link", { name: /NASA.*viewing safety/i })).toBeVisible();
  });
});
