import { axe } from "jest-axe";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SatelliteListResponse, SatellitePassResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { POST } from "../src/app/api/satellite-passes/route";
import { SatellitePassFinder } from "../src/app/now/satellites/satellite-pass-finder";
import { SatellitesView } from "../src/app/now/satellites/satellites-view";
import { loadNowSatellites } from "../src/lib/server/space-now";

const source = {
  attribution_text:
    "Satellite general-perturbations element data is provided by CelesTrak; predictions are model output, not real-time tracking.",
  name: "CelesTrak Current GP Data",
  official_documentation_url: "https://celestrak.org/NORAD/documentation/gp-data-formats.php",
  terms_url: "https://celestrak.org/usage-policy.php",
};

const satellites: SatelliteListResponse["satellites"] = [
  {
    catalog_number: 25544,
    element_age_hours: 2.5,
    element_epoch_utc: "2026-09-15T03:00:00.000000Z",
    groups: ["STATIONS", "VISUAL"],
    name: "ISS (ZARYA)",
    object_id: "1998-067A",
    pass_prediction_runtime_supported: true,
    stale_element_warning: false,
  },
  {
    catalog_number: 340000,
    element_age_hours: 3,
    element_epoch_utc: "2026-09-15T02:30:00.000000Z",
    groups: ["VISUAL"],
    name: "LARGE ID TEST SAT",
    object_id: null,
    pass_prediction_runtime_supported: false,
    stale_element_warning: false,
  },
];

const listResponse: SatelliteListResponse = {
  availability: "fresh",
  freshness: {
    cache_state: "fresh",
    fresh_until: "2026-09-15T08:00:00Z",
    last_refresh_failure_code: null,
    retrieved_at: "2026-09-15T05:00:00Z",
    snapshot_latest_epoch_utc: "2026-09-15T03:00:00Z",
    stale_until: "2026-09-16T05:00:00Z",
  },
  returned_satellite_count: satellites.length,
  satellites,
  source,
  total_satellite_count: satellites.length,
  unavailable_reason: null,
};

const passResponse: SatellitePassResponse = {
  prediction: {
    algorithm: {
      algorithm_version: "lumina-satellite-pass-v1",
      altitude_threshold_deg: 10,
      gravity_model: "WGS72",
      observer_ellipsoid: "WGS84",
      propagation_model: "SGP4",
      shadow_policy: "cylindrical-earth-shadow-v1",
      window_hours: 24,
    },
    element_age_hours_at_start: 3,
    maximum_element_offset_hours: 27,
    passes: [
      {
        observer_sky_state_at_peak: "night",
        observer_sun_altitude_deg_at_peak: -31.2,
        peak: { azimuth_deg: 124.5, direction: "SE", time_utc: "2026-09-15T20:03:47Z" },
        peak_altitude_deg: 19.7,
        rise: { azimuth_deg: 173.5, direction: "S", time_utc: "2026-09-15T20:01:16Z" },
        satellite_sunlit_at_peak: false,
        set: { azimuth_deg: 75.6, direction: "ENE", time_utc: "2026-09-15T20:06:19Z" },
      },
    ],
    refusal_reason: null,
    stale_element_warning: false,
    state: "available",
  },
  requested_start_utc: "2026-09-15T10:00:00Z",
  satellite: satellites[0]!,
  source,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.LUMINA_WEB_API_ORIGIN;
});

describe("Satellite Passes page", () => {
  it("renders selected-group data, provenance, and privacy/model limitations accessibly", async () => {
    const { container } = render(<SatellitesView outcome={{ data: listResponse, kind: "ok" }} />);

    expect(screen.getByRole("heading", { level: 1, name: "Satellite passes" })).toBeVisible();
    expect(screen.getByText("ISS (ZARYA)")).toBeVisible();
    expect(screen.getByText("LARGE ID TEST SAT")).toBeVisible();
    expect(
      screen.getByText(/not real-time tracking or guaranteed optical visibility/i),
    ).toBeVisible();
    expect(screen.getByText(/Coordinates are used only for this calculation/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "CelesTrak GP documentation" })).toHaveAttribute(
      "href",
      source.official_documentation_url,
    );
    expect((await axe(container)).violations).toHaveLength(0);
  });

  it("keeps an unavailable cache explicit and does not show a pass form", () => {
    render(
      <SatellitesView
        outcome={{
          data: {
            ...listResponse,
            availability: "unavailable",
            freshness: { ...listResponse.freshness, cache_state: "expired" },
            returned_satellite_count: 0,
            satellites: [],
            total_satellite_count: 0,
            unavailable_reason: "cached_content_expired",
          },
          kind: "ok",
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "last validated element snapshot has expired",
    );
    expect(
      screen.queryByRole("button", { name: "Calculate next 24 hours" }),
    ).not.toBeInTheDocument();
  });

  it("uses browser geolocation only after an explicit button action", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: { altitude: 1600, latitude: 35.1234, longitude: -105.5678 },
      } as GeolocationPosition),
    );
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    render(<SatellitePassFinder satellites={satellites} />);
    expect(getCurrentPosition).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Latitude (degrees)")).toHaveValue(35.1234);
    expect(screen.getByLabelText("Longitude (degrees)")).toHaveValue(-105.5678);
    expect(screen.getByLabelText("Elevation (metres)")).toHaveValue(1600);
  });

  it("submits exact coordinates only in a same-origin JSON body and validates the result", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(passResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchImplementation);
    render(<SatellitePassFinder satellites={satellites} />);
    fireEvent.change(screen.getByLabelText("Latitude (degrees)"), { target: { value: "35.1234" } });
    fireEvent.change(screen.getByLabelText("Longitude (degrees)"), {
      target: { value: "-105.5678" },
    });
    fireEvent.change(screen.getByLabelText("Elevation (metres)"), { target: { value: "920" } });
    await userEvent.click(screen.getByRole("button", { name: "Calculate next 24 hours" }));

    await screen.findByRole("heading", { level: 3, name: "ISS (ZARYA) predicted passes" });
    const [input, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(input)).toBe("/api/satellite-passes");
    expect(String(input)).not.toContain("35.1234");
    expect(String(input)).not.toContain("-105.5678");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain('"latitude_deg":35.1234');
    expect(String(init?.body)).toContain('"longitude_deg":-105.5678');
    expect(screen.getByText(/does not claim that a pass will be visible/i)).toBeVisible();
  });
});

describe("satellite server and proxy boundaries", () => {
  it("loads only Lumina's cache-only satellite GET endpoint", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(listResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    const outcome = await loadNowSatellites({
      environment: "production",
      fetchImplementation,
      origin: "https://lumina-api.example.test",
    });
    expect(outcome).toEqual({ data: listResponse, kind: "ok" });
    expect(String(fetchImplementation.mock.calls[0]?.[0])).toBe(
      "https://lumina-api.example.test/api/v1/now/satellites",
    );
  });

  it("bounds and validates the private proxy request and never echoes coordinates", async () => {
    process.env.LUMINA_WEB_API_ORIGIN = "https://lumina-api.example.test";
    const backend = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(passResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", backend);
    const requestBody = {
      catalog_number: 25544,
      observer: { elevation_m: 1600, latitude_deg: 35.1234, longitude_deg: -105.5678 },
      start_utc: "2026-09-15T10:00:00Z",
    };
    const response = await POST(
      new Request("http://web.test/api/satellite-passes", {
        body: JSON.stringify(requestBody),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("35.1234");
    expect(text).not.toContain("-105.5678");
    const [url, init] = backend.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://lumina-api.example.test/api/v1/now/satellites/passes");
    expect(String(init?.body)).toContain('"latitude_deg":35.1234');
  });

  it("rejects an oversized proxy body before any backend request", async () => {
    process.env.LUMINA_WEB_API_ORIGIN = "https://lumina-api.example.test";
    const backend = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", backend);
    const response = await POST(
      new Request("http://web.test/api/satellite-passes", {
        body: JSON.stringify({ padding: "x".repeat(5_000) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    expect(response.status).toBe(413);
    expect(backend).not.toHaveBeenCalled();
  });
});
