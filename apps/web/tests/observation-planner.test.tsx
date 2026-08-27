import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

const { pushMock, replaceMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

import { ObservationPlanner } from "../src/components/observation-planner";

const source = {
  dataset: {
    code: "gaia-source-astrometry",
    name: "Gaia Data Release 3 main source catalogue — reviewed astrometry slice",
    release_version: "dr3",
  },
  provider: { code: "esa-gaia", name: "ESA Gaia Archive" },
  source_record_id: "gaia-source-record-3910747531814692736",
};

function plannerDetail(): EntityDetailResponse {
  const measurement = (code: string, value: string) => ({
    current_selection: {
      measurement: {
        id: `${code}-measurement`,
        original_unit: "deg",
        original_value: value,
        source,
        unit: { code: "deg", name: "degree", symbol: "deg" },
        value,
      },
      selection: {
        explanation: "Only reviewed measurement for this quantity.",
        rule: "single-reviewed-measurement",
        selected_at: "2026-08-27T00:00:00Z",
        version: "1",
      },
    },
    measurement_count: 1,
    quantity: { code, name: code },
  });
  return {
    canonical_name: "K2-18",
    entity_type: "star",
    id: "403d0e71-8d81-5c52-abad-c4666c1b5cd6",
    quantities: [
      measurement("gaia_icrs_right_ascension", "172.5601297577743"),
      measurement("gaia_icrs_declination", "7.58781312214569"),
    ],
  };
}

function renderPlanner(detail: EntityDetailResponse | null = plannerDetail()) {
  return render(
    <ObservationPlanner
      detail={detail}
      initialDate="2026-08-27"
      slug={detail === null ? null : "k2-18"}
      targetUnavailable={false}
    />,
  );
}

afterEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  vi.restoreAllMocks();
});

describe("ObservationPlanner", () => {
  it("starts with a target, night controls, and an intentional location request", () => {
    renderPlanner();

    expect(screen.getByRole("heading", { level: 1, name: "K2-18" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Use my location" })).toBeVisible();
    expect(screen.getByLabelText(/night of/i)).toHaveValue("2026-08-27");
    expect(screen.getByRole("heading", { name: /add a location to calculate/i })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Observation geometry" })).not.toBeInTheDocument();
  });

  it("rejects out-of-range manual coordinates and then calculates a valid plan", async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "91");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/latitude from/i);

    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "12.972");
    expect(screen.getByLabelText("Latitude")).toHaveValue("12.972");
    expect(screen.getByLabelText("Longitude")).toHaveValue("77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /target stays below|highest during/i }),
      ).toBeVisible(),
    );
    expect(screen.getByText(/altitude through the night/i)).toBeVisible();
    expect(
      screen.getByText(/Gaia DR3 catalogue position at reference epoch J2016.0/i),
    ).toBeVisible();
    expect(screen.getByText(/Times shown in/)).toBeVisible();
  });

  it("keeps geolocation explicit and leaves manual fallback after denial", async () => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ code: 1, message: "denied" } as GeolocationPositionError),
      },
    });
    const user = userEvent.setup();
    renderPlanner();

    await user.click(screen.getByRole("button", { name: "Use my location" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/permission was denied/i);
    expect(screen.getByLabelText("Latitude")).toBeVisible();
    expect(screen.getByLabelText("Longitude")).toBeVisible();
  });

  it("shows a truthful unavailable state when the target has no accepted coordinate pair", () => {
    renderPlanner({
      canonical_name: "No Coordinate Fixture",
      entity_type: "star",
      id: "00000000-0000-5000-8000-000000000001",
      quantities: [],
    });

    expect(screen.getByRole("heading", { name: "Observation planning unavailable" })).toBeVisible();
    expect(screen.getByText(/has not estimated or substituted coordinates/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Use my location" })).not.toBeInTheDocument();
  });

  it("passes an accessibility scan for the empty-location state", async () => {
    const { container } = renderPlanner();
    expect((await axe(container)).violations).toEqual([]);
  });
});
