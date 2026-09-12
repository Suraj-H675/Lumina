import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NearEarthResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { NearEarthView } from "../src/app/now/near-earth/near-earth-view";
import { SiteShell } from "../src/components/site-shell";
import { loadNowNearEarth } from "../src/lib/server/space-now";

const source = {
  name: "NASA Asteroids NeoWs",
  official_documentation_url: "https://api.nasa.gov/",
  attribution_text:
    "NASA Asteroids NeoWs, provided through NASA's Open APIs and NASA/JPL asteroid-team data.",
};

const freshness = {
  cache_state: "fresh" as const,
  retrieved_at: "2026-09-12T12:00:00Z",
  fresh_until: "2026-09-12T15:00:00Z",
  stale_until: "2026-09-13T03:00:00Z",
  last_refresh_failure_code: null,
};

const response: NearEarthResponse = {
  availability: "fresh",
  unavailable_reason: null,
  window: { start_date: "2026-09-12", end_date: "2026-09-18" },
  total_encounter_count: 2,
  returned_encounter_count: 2,
  encounters: [
    {
      encounter_id: "nasa-neows-2000001-2026-09-14",
      object_id: "nasa-neows-2000001",
      neo_reference_id: "2000001",
      name: "<script>alert('fixture')</script>",
      approach_date: "2026-09-14",
      approach_time_text: "2026-Sep-14 08:05",
      absolute_magnitude_h: 22.3,
      nominal_distance_km: 3500000,
      nominal_distance_lunar: 9.1,
      relative_velocity_km_s: 19.5,
      estimated_diameter_min_m: 180,
      estimated_diameter_max_m: 410,
      is_potentially_hazardous_asteroid: true,
      distance_uncertainty_status: "not_provided_by_source",
      time_uncertainty_status: "not_provided_by_source",
    },
    {
      encounter_id: "nasa-neows-3542519-2026-09-14",
      object_id: "nasa-neows-3542519",
      neo_reference_id: "3542519",
      name: "(2026 AB)",
      approach_date: "2026-09-14",
      approach_time_text: "2026-Sep-14 10:20",
      absolute_magnitude_h: 25.1,
      nominal_distance_km: 910000.5,
      nominal_distance_lunar: 2.4,
      relative_velocity_km_s: 12.340123,
      estimated_diameter_min_m: 10,
      estimated_diameter_max_m: 20,
      is_potentially_hazardous_asteroid: false,
      distance_uncertainty_status: "not_provided_by_source",
      time_uncertainty_status: "not_provided_by_source",
    },
  ],
  freshness,
  source,
};

function renderPage(value: NearEarthResponse) {
  return render(
    <SiteShell>
      <NearEarthView outcome={{ data: value, kind: "ok" }} />
    </SiteShell>,
  );
}

describe("Space Now Near-Earth Objects", () => {
  it("renders comparable events as safe text with scientific labels", () => {
    const { container } = renderPage(response);

    expect(screen.getByRole("heading", { level: 1, name: "Near-Earth Objects" })).toBeVisible();
    expect(screen.getByText("2026-09-12")).toBeVisible();
    expect(screen.getByText("2026-09-18")).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Nominal miss distance (km)" })).toBeVisible();
    expect(screen.getByText("Potentially hazardous asteroid: Yes")).toBeVisible();
    expect(screen.getByText("Potentially hazardous asteroid: No")).toBeVisible();
    expect(screen.getByText(/technical NASA\/JPL classification/)).toBeVisible();
    expect(screen.getByText(/does not mean an impact is predicted/)).toBeVisible();
    expect(screen.getByText(/Close-approach uncertainty is not provided/)).toBeVisible();
    expect(screen.getByText("<script>alert('fixture')</script>")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("api_key");
    expect(container.innerHTML).not.toContain("nasa_jpl_url");
    expect(container.innerHTML).not.toContain("is_sentry_object");
  });

  it("makes stale status and retrieval timestamp explicit", () => {
    renderPage({
      ...response,
      availability: "stale",
      freshness: {
        ...freshness,
        cache_state: "stale",
        last_refresh_failure_code: "provider.timeout",
      },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Stale near-Earth approach snapshot");
    expect(screen.getByText("Retrieved at (UTC)")).toBeVisible();
    expect(screen.getByText("2026-09-12T12:00:00Z")).toBeVisible();
    expect(screen.getByText("provider.timeout")).toBeVisible();
    expect(screen.getByText("2026-09-12")).toBeVisible();
  });

  it("reports the full feed count when the public table is capped", () => {
    renderPage({
      ...response,
      total_encounter_count: 40,
      returned_encounter_count: 32,
    });

    expect(
      screen.getByText("Showing the next 32 of 40 approaches in this feed window."),
    ).toBeVisible();
  });

  it("renders empty and unavailable states without scientific data", () => {
    const { rerender } = render(
      <NearEarthView
        outcome={{
          data: {
            ...response,
            total_encounter_count: 0,
            returned_encounter_count: 0,
            encounters: [],
          },
          kind: "ok",
        }}
      />,
    );
    expect(
      screen.getByText("No Earth close approaches are listed in the current NeoWs feed window."),
    ).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    rerender(<NearEarthView outcome={{ kind: "unavailable" }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Near-Earth approach data is currently unavailable.",
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it.each(["fresh", "stale", "unavailable"] as const)(
    "passes axe for the %s state",
    async (state) => {
      const value: NearEarthResponse =
        state === "unavailable"
          ? {
              ...response,
              availability: "unavailable",
              unavailable_reason: "cached_content_expired",
              window: null,
              total_encounter_count: 0,
              returned_encounter_count: 0,
              encounters: [],
              freshness: { ...freshness, cache_state: "expired" },
            }
          : { ...response, availability: state, freshness: { ...freshness, cache_state: state } };
      const { container } = renderPage(value);
      expect((await axe(container)).violations).toHaveLength(0);
    },
  );
});

describe("server-rendered Near-Earth loader", () => {
  it("requests only Lumina's public projection without date controls", async () => {
    const requests: string[] = [];
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation((input) => {
      requests.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify(response), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    });

    await expect(
      loadNowNearEarth({
        environment: "production",
        fetchImplementation,
        origin: "https://lumina-api.example.test",
      }),
    ).resolves.toEqual({ data: response, kind: "ok" });
    expect(requests).toEqual(["https://lumina-api.example.test/api/v1/now/near-earth"]);
    expect(requests[0]).not.toContain("api.nasa.gov");
    expect(requests[0]).not.toContain("api_key");
    expect(requests[0]).not.toContain("start_date");
  });

  it("fails closed without a production API origin or on malformed API data", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();

    await expect(
      loadNowNearEarth({ environment: "production", fetchImplementation }),
    ).resolves.toEqual({ kind: "unavailable" });
    expect(fetchImplementation).not.toHaveBeenCalled();

    fetchImplementation.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    await expect(
      loadNowNearEarth({
        environment: "production",
        fetchImplementation,
        origin: "https://lumina-api.example.test",
      }),
    ).resolves.toEqual({ kind: "unavailable" });
  });
});
