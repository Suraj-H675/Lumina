import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { SpaceWeatherResponse } from "@lumina/api-client";

vi.mock("server-only", () => ({}));

import { createSpaceWeatherMetadata } from "../src/app/now/space-weather/route-page";
import { SpaceWeatherView } from "../src/app/now/space-weather/space-weather-view";
import { SiteShell } from "../src/components/site-shell";
import { DEFAULT_LOCALE } from "../src/lib/i18n/locales";
import { enMessages } from "../src/lib/i18n/messages/en";
import type { SpaceWeatherMessages } from "../src/lib/i18n/messages/types";
import { EN_SHELL_PROPS } from "./i18n-test-fixture";
import { loadNowSpaceWeather } from "../src/lib/server/space-now";

const source = {
  name: "NOAA / NWS Space Weather Prediction Center",
  official_documentation_url: "https://www.swpc.noaa.gov/",
  attribution_text: "NOAA / NWS Space Weather Prediction Center.",
};

const freshness = {
  cache_state: "fresh" as const,
  retrieved_at: "2026-09-12T12:00:00Z",
  fresh_until: "2026-09-12T12:10:00Z",
  stale_until: "2026-09-12T13:00:00Z",
  last_refresh_failure_code: null,
};

const response: SpaceWeatherResponse = {
  availability: "fresh",
  unavailable_reason: null,
  scales: {
    date_text: "2026-09-12",
    time_text: "12:00:00",
    radio_blackout: { level: 1, text: "Minor" },
    solar_radiation: { level: 0, text: "Below NOAA scale thresholds" },
    geomagnetic: { level: 2, text: "Moderate" },
  },
  kp: {
    latest_observed: {
      time_text: "2026-09-12T09:00:00",
      kp: 2.33,
      status: "observed",
      noaa_scale: null,
    },
    latest_estimated: {
      time_text: "2026-09-12T12:00:00",
      kp: 4,
      status: "estimated",
      noaa_scale: "G1",
    },
    forecast: [
      { time_text: "2026-09-12T15:00:00", kp: 5.67, status: "predicted", noaa_scale: "G2" },
    ],
  },
  solar_wind: {
    speed_time_utc: "2026-09-12T11:55:00Z",
    proton_speed_km_s: 404,
    field_time_utc: "2026-09-12T11:55:00Z",
    bt_nt: 6,
    bz_gsm_nt: -3,
  },
  latest_notifications: [
    {
      product_id: "WSA",
      issue_time_text: "2026-09-12T11:30:00",
      message: "Plain provider text <script>alert('fixture')</script>",
    },
  ],
  impacts: [
    { family: "R", summary: "HF radio impacts are possible on the sunlit side." },
    { family: "S", summary: "Spacecraft and high-frequency communications can be affected." },
    { family: "G", summary: "Power systems and navigation can be affected at higher levels." },
  ],
  freshness,
  source,
  aurora: {
    mode: "official_link",
    official_url: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    label: "NOAA Aurora 30-Minute Forecast",
    explanation:
      "The NOAA OVATION-based forecast is model guidance and does not guarantee visibility from a particular place.",
  },
};

function renderPage(
  value: SpaceWeatherResponse,
  messages: SpaceWeatherMessages = enMessages.spaceNow.spaceWeather,
) {
  return render(
    <SiteShell {...EN_SHELL_PROPS}>
      <SpaceWeatherView
        locale={DEFAULT_LOCALE}
        messages={messages}
        outcome={{ data: value, kind: "ok" }}
      />
    </SiteShell>,
  );
}

describe("Space Now Space Weather", () => {
  it("keeps NOAA families, Kp statuses, units, timestamps, and notifications distinct", () => {
    const { container } = renderPage(response);

    expect(screen.getByRole("heading", { level: 1, name: "Space Weather" })).toBeVisible();
    expect(screen.getByText("R1 — Minor")).toBeVisible();
    expect(screen.getByText("S0 — Below NOAA scale thresholds")).toBeVisible();
    expect(screen.getByText("G2 — Moderate")).toBeVisible();
    expect(screen.getByText("Latest observed Kp")).toBeVisible();
    expect(screen.getByText("Latest estimated Kp")).toBeVisible();
    expect(screen.getByText("observed")).toBeVisible();
    expect(screen.getByText("estimated")).toBeVisible();
    expect(screen.getByText("Predicted")).toBeVisible();
    expect(screen.getByText("404 km/s")).toBeVisible();
    expect(screen.getByText("6 nT")).toBeVisible();
    expect(screen.getByText("-3 nT")).toBeVisible();
    expect(screen.getByText(/Plain provider text <script>/)).toBeVisible();
    expect(screen.getByRole("link", { name: "NOAA Aurora 30-Minute Forecast" })).toHaveAttribute(
      "href",
      "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("Space Weather Score");
  });

  it("preserves high-precision scientific numbers while formatting them through the locale", () => {
    renderPage({
      ...response,
      kp: {
        ...response.kp,
        latest_observed: {
          ...response.kp.latest_observed!,
          kp: 2.1234567890123,
        },
        forecast: [
          {
            ...response.kp.forecast[0]!,
            kp: 5.678901234567,
          },
        ],
      },
      solar_wind: {
        ...response.solar_wind!,
        proton_speed_km_s: 404.123456789,
      },
    });

    expect(screen.getByText("2.1234567890123")).toBeVisible();
    expect(screen.getByText("5.678901234567")).toBeVisible();
    expect(screen.getByText("404.123456789 km/s")).toBeVisible();
  });

  it("localizes interface chrome without rewriting NOAA/SWPC source data", () => {
    const messages: SpaceWeatherMessages = {
      ...enMessages.spaceNow.spaceWeather,
      kp: {
        ...enMessages.spaceNow.spaceWeather.kp,
        statuses: {
          ...enMessages.spaceNow.spaceWeather.kp.statuses,
          observed: "Fixture observed",
        },
        title: "Fixture Kp heading",
      },
      metadataDescription: "Fixture metadata from {provider}.",
      metadataTitle: "Fixture Space Weather metadata",
      notifications: {
        ...enMessages.spaceNow.spaceWeather.notifications,
        issueTime: "Fixture issue time: {time}",
      },
      scales: {
        ...enMessages.spaceNow.spaceWeather.scales,
        title: "Fixture {provider} scales heading",
      },
      source: {
        ...enMessages.spaceNow.spaceWeather.source,
        documentation: "Fixture documentation for {sourceName}",
      },
      title: "Fixture Space Weather",
    };

    renderPage(response, messages);

    expect(screen.getByRole("heading", { level: 1, name: "Fixture Space Weather" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fixture NOAA scales heading" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Fixture Kp heading" })).toBeVisible();
    expect(screen.getByText("Fixture observed")).toBeVisible();
    expect(screen.getByText("R1 — Minor")).toBeVisible();
    expect(screen.getByText("2026-09-12T09:00:00")).toBeVisible();
    expect(screen.getByText("Fixture issue time: 2026-09-12T11:30:00")).toBeVisible();
    expect(screen.getByText(/Plain provider text <script>/)).toBeVisible();
    expect(screen.getByText("HF radio impacts are possible on the sunlit side.")).toBeVisible();
    expect(screen.getByText("NOAA / NWS Space Weather Prediction Center.")).toBeVisible();
    expect(screen.getByRole("link", { name: "NOAA Aurora 30-Minute Forecast" })).toHaveAttribute(
      "href",
      response.aurora.official_url,
    );
    expect(
      screen.getByRole("link", {
        name: "Fixture documentation for NOAA / NWS Space Weather Prediction Center",
      }),
    ).toHaveAttribute("href", source.official_documentation_url);
    expect(createSpaceWeatherMetadata(messages)).toEqual({
      description: "Fixture metadata from NOAA Space Weather Prediction Center.",
      title: "Fixture Space Weather metadata",
    });
  });

  it("makes stale state and Lumina retrieval time explicit", () => {
    renderPage({
      ...response,
      availability: "stale",
      freshness: {
        ...freshness,
        cache_state: "stale",
        last_refresh_failure_code: "provider.timeout",
      },
    });

    expect(screen.getByRole("status")).toHaveTextContent("Stale Space Weather snapshot");
    expect(screen.getByText("Snapshot retrieved at (UTC)")).toBeVisible();
    expect(screen.getByText("2026-09-12T12:00:00Z")).toBeVisible();
    expect(screen.getByText("provider.timeout")).toBeVisible();
  });

  it("renders quiet and unavailable states without inventing measurements", () => {
    const quiet: SpaceWeatherResponse = {
      ...response,
      scales: {
        ...response.scales!,
        radio_blackout: { level: 0, text: null },
        solar_radiation: { level: 0, text: null },
        geomagnetic: { level: 0, text: null },
      },
      kp: { latest_observed: null, latest_estimated: null, forecast: [] },
      solar_wind: {
        speed_time_utc: "2026-09-12T11:55:00Z",
        proton_speed_km_s: null,
        field_time_utc: "2026-09-12T11:55:00Z",
        bt_nt: null,
        bz_gsm_nt: null,
      },
      latest_notifications: [],
    };
    const { rerender } = renderPage(quiet);
    expect(screen.getByText("R0 — No source description")).toBeVisible();
    expect(screen.getByText("No notification records are present in this snapshot.")).toBeVisible();
    expect(screen.getAllByText("Not reported").length).toBeGreaterThanOrEqual(3);

    rerender(
      <SpaceWeatherView
        locale={DEFAULT_LOCALE}
        messages={enMessages.spaceNow.spaceWeather}
        outcome={{ kind: "unavailable" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Space Weather data is currently unavailable.",
    );
    expect(screen.queryByText("404 km/s")).not.toBeInTheDocument();
  });

  it.each(["fresh", "stale", "unavailable"] as const)(
    "passes axe for the %s state",
    async (state) => {
      const value: SpaceWeatherResponse =
        state === "unavailable"
          ? {
              ...response,
              availability: "unavailable",
              unavailable_reason: "cached_content_expired",
              scales: null,
              kp: { latest_observed: null, latest_estimated: null, forecast: [] },
              solar_wind: null,
              latest_notifications: [],
              freshness: { ...freshness, cache_state: "expired" },
            }
          : { ...response, availability: state, freshness: { ...freshness, cache_state: state } };
      const { container } = renderPage(value);
      expect((await axe(container)).violations).toHaveLength(0);
    },
  );
});

describe("server-rendered Space Weather loader", () => {
  it("requests only Lumina's public cache projection", async () => {
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
      loadNowSpaceWeather({
        environment: "production",
        fetchImplementation,
        origin: "https://lumina-api.example.test",
      }),
    ).resolves.toEqual({ data: response, kind: "ok" });
    expect(requests).toEqual(["https://lumina-api.example.test/api/v1/now/space-weather"]);
    expect(requests[0]).not.toContain("services.swpc.noaa.gov");
  });
});
