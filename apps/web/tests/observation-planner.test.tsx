import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { axe } from "jest-axe";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EntityDetailResponse } from "@lumina/api-client";

import { localDateString } from "../src/lib/observation/domain";
import {
  BRIGHT_STAR_CONTEXT_URL,
  resetBrightStarContextCacheForTests,
} from "../src/lib/observation/bright-star-context";
import {
  CONSTELLATION_CONTEXT_URL,
  NAMED_ANCHOR_CONTEXT_URL,
  resetIauContextCachesForTests,
} from "../src/lib/observation/iau-context";

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

const brightStarArtifact = readFileSync(resolve("public/data/gaia-dr3-bright-sky-context-v1.csv"));
const namedAnchorArtifact = readFileSync(
  resolve("public/data/iau-named-gaia-bright-anchors-v1.json"),
);
const constellationArtifact = readFileSync(
  resolve("public/data/iau-constellation-context-v1.json"),
);

function brightStarResponse(): Response {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(brightStarArtifact).buffer,
  } as Response;
}

function namedAnchorResponse(): Response {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(namedAnchorArtifact).buffer,
  } as Response;
}

function constellationResponse(): Response {
  return {
    ok: true,
    arrayBuffer: async () => Uint8Array.from(constellationArtifact).buffer,
  } as Response;
}

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

function renderPlanner(detail: EntityDetailResponse | null = plannerDetail(), date = "2026-08-27") {
  return render(
    <ObservationPlanner
      detail={detail}
      initialDate={date}
      slug={detail === null ? null : "k2-18"}
      targetUnavailable={false}
    />,
  );
}

beforeEach(() => {
  resetBrightStarContextCacheForTests();
  resetIauContextCachesForTests();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === BRIGHT_STAR_CONTEXT_URL) return brightStarResponse();
      if (String(input) === NAMED_ANCHOR_CONTEXT_URL) return namedAnchorResponse();
      if (String(input) === CONSTELLATION_CONTEXT_URL) return constellationResponse();
      throw new Error("Unexpected test network request");
    }),
  );
});

afterEach(() => {
  pushMock.mockReset();
  replaceMock.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it("shows lunar conditions after location entry without opting into weather", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    renderPlanner(undefined, localDateString(new Date()));

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByRole("heading", { name: "Lunar conditions" })).toBeVisible();
    expect(screen.getByText("Moon at selected time")).toBeVisible();
    expect(screen.getByText("Target separation")).toBeVisible();
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(BRIGHT_STAR_CONTEXT_URL);
  });

  it("shows the selected-time finder and updates its guidance with the planner time", async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByRole("heading", { name: "Sky Finder" })).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-guidance")).toHaveTextContent(
      /true azimuth|look up/i,
    );

    const selectedTime = screen.getByDisplayValue("22:00");
    await user.clear(selectedTime);
    await user.type(selectedTime, "12:00");

    expect(await screen.findByText("Look up")).toBeVisible();
    const finder = screen.getByRole("heading", { name: "Sky Finder" }).closest("section");
    expect(finder).not.toBeNull();
    expect(
      within(finder as HTMLElement).getByText(/above the geometric horizon/i, { selector: "dd" }),
    ).toBeVisible();
  });

  it("keeps the Moon independent and makes solar-system markers an accessible toggle", async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    const selectedTime = screen.getByDisplayValue("22:00");
    await user.clear(selectedTime);
    await user.type(selectedTime, "12:00");

    const toggle = await screen.findByRole("checkbox", { name: /show solar-system markers/i });
    expect(toggle).toBeChecked();
    expect(
      screen.getByRole("heading", { name: "Reference objects at selected time" }),
    ).toBeVisible();
    expect(screen.getByRole("listitem", { name: /^Moon:/ })).toBeVisible();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/reference markers are hidden/i)).toBeVisible();
    expect(screen.getByRole("listitem", { name: /^Moon:/ })).toBeVisible();
  });

  it("loads real bright-star context by default and toggles it truthfully", async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    const toggle = await screen.findByRole("checkbox", { name: /show bright-star context/i });
    expect(toggle).toBeChecked();
    expect(await screen.findByTestId("sky-finder-bright-star-layer")).toBeVisible();
    expect(screen.getAllByTestId("sky-finder-context-star").length).toBeGreaterThan(0);
    expect(screen.getByText(/Gaia DR3 · G ≤ 5.5/i)).toBeVisible();
    expect(screen.getByText(/context stars are above the geometric horizon/i)).toBeVisible();
    expect(screen.getByText(/Proper motion not propagated/i)).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-below")).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.queryByTestId("sky-finder-bright-star-layer")).not.toBeInTheDocument();
    expect(screen.getByText("Bright-star context is hidden.")).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-below")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /^Moon:/ })).toBeVisible();

    await user.click(toggle);
    expect(await screen.findByTestId("sky-finder-bright-star-layer")).toBeVisible();
  });

  it("shows the target region and named anchors with independent context controls", async () => {
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    const selectedTime = screen.getByDisplayValue("22:00");
    await user.clear(selectedTime);
    await user.type(selectedTime, "12:00");

    expect(await screen.findByRole("heading", { name: "Constellation region" })).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-constellation")).toHaveTextContent(
      "Constellation Leo",
    );
    expect(screen.getByText(/Official abbreviation/)).toHaveTextContent("Leo");
    expect(screen.getByText(/not a stick-figure drawing/i)).toBeVisible();
    expect(await screen.findByTestId("sky-finder-named-anchor-layer")).toBeVisible();
    expect(await screen.findByTestId("sky-finder-constellation-boundary")).toBeVisible();
    expect(screen.getByText(/Nearest named sky anchor by angular separation/i)).toBeVisible();
    expect(screen.getAllByTestId("sky-finder-named-anchor-row").length).toBeLessThanOrEqual(12);

    const brightToggle = screen.getByRole("checkbox", { name: /show bright-star context/i });
    const namedToggle = screen.getByRole("checkbox", { name: /show named star anchors/i });
    const boundaryToggle = screen.getByRole("checkbox", { name: /show constellation boundary/i });
    const solarToggle = screen.getByRole("checkbox", { name: /show solar-system markers/i });
    expect(brightToggle).toBeChecked();
    expect(namedToggle).toBeChecked();
    expect(boundaryToggle).toBeChecked();
    expect(solarToggle).toBeChecked();

    await user.click(brightToggle);
    expect(screen.queryByTestId("sky-finder-bright-star-layer")).not.toBeInTheDocument();
    expect(screen.getByTestId("sky-finder-named-anchor-layer")).toBeVisible();

    await user.click(namedToggle);
    expect(screen.queryByTestId("sky-finder-named-anchor-layer")).not.toBeInTheDocument();
    expect(screen.getByText(/Named star anchor markers and labels are hidden/i)).toBeVisible();

    await user.click(brightToggle);
    expect(await screen.findByTestId("sky-finder-bright-star-layer")).toBeVisible();
    await user.click(boundaryToggle);
    expect(screen.queryByTestId("sky-finder-constellation-boundary")).not.toBeInTheDocument();
    expect(screen.getByText("Constellation boundary is hidden.")).toBeVisible();
    expect(solarToggle).toBeChecked();
  });

  it("isolates named-anchor failure from the real bright context and target region", async () => {
    resetIauContextCachesForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === NAMED_ANCHOR_CONTEXT_URL) {
          return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
        }
        if (String(input) === BRIGHT_STAR_CONTEXT_URL) return brightStarResponse();
        if (String(input) === CONSTELLATION_CONTEXT_URL) return constellationResponse();
        throw new Error("Unexpected test network request");
      }),
    );
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByText("Named star anchors unavailable.")).toBeVisible();
    expect(await screen.findByTestId("sky-finder-bright-star-layer")).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-guidance")).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-constellation")).toHaveTextContent(
      "Constellation Leo",
    );
  });

  it("isolates constellation failure from named anchors and the real bright context", async () => {
    resetIauContextCachesForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === CONSTELLATION_CONTEXT_URL) {
          return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as Response;
        }
        if (String(input) === BRIGHT_STAR_CONTEXT_URL) return brightStarResponse();
        if (String(input) === NAMED_ANCHOR_CONTEXT_URL) return namedAnchorResponse();
        throw new Error("Unexpected test network request");
      }),
    );
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByText("Constellation context unavailable.")).toBeVisible();
    expect(await screen.findByTestId("sky-finder-named-anchor-layer")).toBeVisible();
    expect(screen.getByTestId("sky-finder-bright-star-layer")).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-guidance")).toBeVisible();
  });

  it("keeps the core finder usable while bright-star context loads", async () => {
    resetBrightStarContextCacheForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByText("Loading pinned bright-star context…")).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-guidance")).toBeVisible();
    expect(screen.getByTestId("sky-finder-target-below")).toBeInTheDocument();
  });

  it("fails closed without breaking target, Moon, or reference markers", async () => {
    resetBrightStarContextCacheForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) }) as Response),
    );
    const user = userEvent.setup();
    renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByText("Bright-star context unavailable.")).toBeVisible();
    expect(screen.queryByTestId("sky-finder-bright-star-layer")).not.toBeInTheDocument();
    expect(screen.getByTestId("sky-finder-target-below")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: /^Moon:/ })).toBeVisible();
  });

  it("updates context projections for time and location without re-fetching the artifact", async () => {
    const fetchSpy = vi.mocked(globalThis.fetch);
    const user = userEvent.setup();
    const { container } = renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    expect(await screen.findByTestId("sky-finder-bright-star-layer")).toBeVisible();

    const markerPositions = () =>
      new Map(
        [
          ...container.querySelectorAll<SVGCircleElement>(
            '[data-testid="sky-finder-context-star"]',
          ),
        ].map((marker) => [
          marker.dataset.sourceId ?? "",
          `${marker.getAttribute("cx")},${marker.getAttribute("cy")}`,
        ]),
      );
    const initial = markerPositions();
    const selectedTime = screen.getByDisplayValue("22:00");
    await user.clear(selectedTime);
    await user.type(selectedTime, "12:00");
    await waitFor(() => {
      const updated = markerPositions();
      expect(
        [...initial].some(
          ([sourceId, coordinates]) =>
            updated.has(sourceId) && updated.get(sourceId) !== coordinates,
        ),
      ).toBe(true);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const afterTime = markerPositions();
    await user.clear(screen.getByLabelText("Latitude"));
    await user.type(screen.getByLabelText("Latitude"), "-33.8688");
    await user.clear(screen.getByLabelText("Longitude"));
    await user.type(screen.getByLabelText("Longitude"), "151.2093");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));
    await waitFor(() => {
      const updated = markerPositions();
      expect(
        [...afterTime].some(
          ([sourceId, coordinates]) =>
            updated.has(sourceId) && updated.get(sourceId) !== coordinates,
        ),
      ).toBe(true);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("passes an accessibility scan with the loaded finder", async () => {
    const user = userEvent.setup();
    const { container } = renderPlanner();

    await user.type(screen.getByLabelText("Latitude"), "12.972");
    await user.type(screen.getByLabelText("Longitude"), "77.594");
    await user.click(screen.getByRole("button", { name: /calculate with these coordinates/i }));

    expect(await screen.findByRole("heading", { name: "Sky Finder" })).toBeVisible();
    expect((await axe(container)).violations).toEqual([]);
  });
});
