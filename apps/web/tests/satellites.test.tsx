import { axe } from "jest-axe";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SatelliteListResponse, SatellitePassResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { POST } from "../src/app/api/satellite-passes/route";
import { SatellitePassFinder } from "../src/app/now/satellites/satellite-pass-finder";
import { createSatellitesMetadata } from "../src/app/now/satellites/route-page";
import { SatellitesView } from "../src/app/now/satellites/satellites-view";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { SatelliteMessages } from "../src/lib/i18n/messages/types";
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

function renderSatellites(
  response: SatelliteListResponse = listResponse,
  messages: SatelliteMessages = enMessages.spaceNow.satellites,
) {
  return render(
    <SatellitesView
      locale={DEFAULT_LOCALE}
      messages={messages}
      outcome={{ data: response, kind: "ok" }}
    />,
  );
}

function renderFinder(
  messages: SatelliteMessages["passFinder"] = enMessages.spaceNow.satellites.passFinder,
) {
  return render(
    <SatellitePassFinder locale={DEFAULT_LOCALE} messages={messages} satellites={satellites} />,
  );
}

describe("Satellite Passes page", () => {
  it("renders selected-group data, provenance, and privacy/model limitations accessibly", async () => {
    const { container } = renderSatellites();

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

  it("localizes page chrome without rewriting provider, satellite, group, or model data", () => {
    const messages: SatelliteMessages = {
      ...enMessages.spaceNow.satellites,
      intro:
        "Fixture catalogue from {provider}: {stationsGroup}, {visualGroup}; propagated with {propagationModel}.",
      metadataDescription: "Fixture metadata for {provider} using {propagationModel}.",
      metadataTitle: "Fixture satellite metadata",
      satellites: {
        ...enMessages.spaceNow.satellites.satellites,
        heading: "Fixture satellite list",
      },
      source: {
        ...enMessages.spaceNow.satellites.source,
        documentation: "Fixture docs for {provider}",
      },
      title: "Fixture satellite title",
    };

    renderSatellites(listResponse, messages);

    expect(
      screen.getByRole("heading", { level: 1, name: "Fixture satellite title" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fixture satellite list" })).toBeVisible();
    expect(
      screen.getByText("Fixture catalogue from CelesTrak: STATIONS, VISUAL; propagated with SGP4."),
    ).toBeVisible();
    expect(screen.getByText("ISS (ZARYA)")).toBeVisible();
    expect(screen.getByText("NORAD 25544")).toBeVisible();
    expect(screen.getByText("2026-09-15T03:00:00.000000Z")).toBeVisible();
    expect(screen.getByText("STATIONS, VISUAL")).toBeVisible();
    expect(screen.getByRole("link", { name: "Fixture docs for CelesTrak" })).toHaveAttribute(
      "href",
      source.official_documentation_url,
    );
    expect(createSatellitesMetadata(messages)).toEqual({
      description: "Fixture metadata for CelesTrak using SGP4.",
      title: "Fixture satellite metadata",
    });
  });

  it("keeps an unavailable cache explicit and does not show a pass form", () => {
    renderSatellites({
      ...listResponse,
      availability: "unavailable",
      freshness: { ...listResponse.freshness, cache_state: "expired" },
      returned_satellite_count: 0,
      satellites: [],
      total_satellite_count: 0,
      unavailable_reason: "cached_content_expired",
    });
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
    renderFinder();
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
    renderFinder();
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

  it("localizes pass-result enums without changing the private request or model output", async () => {
    const localizedResponse: SatellitePassResponse = {
      ...passResponse,
      prediction: {
        ...passResponse.prediction,
        passes: [
          {
            ...passResponse.prediction.passes[0]!,
            observer_sky_state_at_peak: "civil_twilight",
          },
        ],
      },
    };
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(localizedResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchImplementation);
    const messages: SatelliteMessages["passFinder"] = {
      ...enMessages.spaceNow.satellites.passFinder,
      heading: "Fixture private pass finder",
      result: {
        ...enMessages.spaceNow.satellites.passFinder.result,
        heading: "Fixture passes for {satellite}",
        skyCivilTwilight: "Fixture civil twilight",
      },
    };
    renderFinder(messages);

    fireEvent.change(screen.getByLabelText("Latitude (degrees)"), {
      target: { value: "35.1234" },
    });
    fireEvent.change(screen.getByLabelText("Longitude (degrees)"), {
      target: { value: "-105.5678" },
    });
    fireEvent.change(screen.getByLabelText("Elevation (metres)"), { target: { value: "920" } });
    await userEvent.click(screen.getByRole("button", { name: "Calculate next 24 hours" }));

    expect(
      await screen.findByRole("heading", { name: "Fixture passes for ISS (ZARYA)" }),
    ).toBeVisible();
    expect(screen.getByText(/Fixture civil twilight/)).toBeVisible();
    expect(screen.getByText(/SGP4 · WGS72 · observer WGS84 · element offset 3.0 h/)).toBeVisible();
    expect(screen.getByText(/2026-09-15T20:03:47Z/)).toBeVisible();
    const [input, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(String(input)).toBe("/api/satellite-passes");
    expect(String(init?.body)).toContain('"latitude_deg":35.1234');
    expect(String(init?.body)).toContain('"longitude_deg":-105.5678');
  });

  it("maps night explicitly instead of falling through to the defensive sky-state fallback", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(passResponse), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchImplementation);
    const messages: SatelliteMessages["passFinder"] = {
      ...enMessages.spaceNow.satellites.passFinder,
      result: {
        ...enMessages.spaceNow.satellites.passFinder.result,
        skyNight: "Fixture night",
        skyUnknown: "Fixture unknown sky state",
      },
    };
    renderFinder(messages);

    fireEvent.change(screen.getByLabelText("Latitude (degrees)"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Longitude (degrees)"), { target: { value: "-105" } });
    await userEvent.click(screen.getByRole("button", { name: "Calculate next 24 hours" }));

    expect(await screen.findByText(/Fixture night/)).toBeVisible();
    expect(screen.queryByText(/Fixture unknown sky state/)).not.toBeInTheDocument();
  });

  it("preserves a high-precision no-pass altitude threshold in display formatting", async () => {
    const response: SatellitePassResponse = {
      ...passResponse,
      prediction: {
        ...passResponse.prediction,
        algorithm: {
          ...passResponse.prediction.algorithm,
          altitude_threshold_deg: 10.123456789,
        },
        passes: [],
        state: "no_passes",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    renderFinder();

    fireEvent.change(screen.getByLabelText("Latitude (degrees)"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Longitude (degrees)"), { target: { value: "-105" } });
    await userEvent.click(screen.getByRole("button", { name: "Calculate next 24 hours" }));

    expect(
      await screen.findByText(
        "No complete passes above 10.123456789° were found in the next 24 hours.",
      ),
    ).toBeVisible();
  });

  it.each([
    [
      "elements_outside_supported_age",
      "The requested prediction window extends beyond Lumina's supported element-age bound",
    ],
    [
      "catalog_number_unsupported_by_sgp4",
      "This catalog number is outside the runtime range supported by Lumina's current SGP4 implementation",
    ],
    [
      "unsupported_sgp4_state",
      "The element state is not supported safely by the current SGP4 runtime",
    ],
    [
      "unsupported_event_sequence",
      "The propagated event sequence could not be used safely for a complete pass",
    ],
  ] as const)("maps refusal reason %s explicitly", async (refusalReason, expectedMessage) => {
    const refused: SatellitePassResponse = {
      ...passResponse,
      prediction: {
        ...passResponse.prediction,
        passes: [],
        refusal_reason: refusalReason,
        state: "refused",
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(refused), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      ),
    );
    renderFinder();

    fireEvent.change(screen.getByLabelText("Latitude (degrees)"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("Longitude (degrees)"), { target: { value: "-105" } });
    await userEvent.click(screen.getByRole("button", { name: "Calculate next 24 hours" }));

    expect(await screen.findByRole("status")).toHaveTextContent(expectedMessage);
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
