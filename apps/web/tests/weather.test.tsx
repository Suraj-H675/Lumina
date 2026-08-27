import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDateString } from "../src/lib/observation/domain";
import type { ObserverLocation } from "../src/lib/observation/domain";
import {
  forecastDateAvailability,
  nearestWeatherHour,
  summarizeWeatherHours,
  weatherCodeDescription,
  type WeatherHour,
} from "../src/lib/weather/domain";
import {
  OPEN_METEO_FORECAST_URL,
  OPEN_METEO_HOURLY_VARIABLES,
  buildOpenMeteoForecastUrl,
  fetchOpenMeteoForecast,
  parseOpenMeteoForecast,
} from "../src/lib/weather/open-meteo";
import {
  clearWeatherForecastCache,
  useObservationWeather,
} from "../src/lib/weather/use-observation-weather";

const location = { latitude: 12.9724, longitude: 77.5946 } as const;
const fetchedAt = new Date("2026-08-27T12:00:00Z");
const times = [
  Date.parse("2026-08-27T21:00:00Z") / 1_000,
  Date.parse("2026-08-27T22:00:00Z") / 1_000,
  Date.parse("2026-08-27T23:00:00Z") / 1_000,
];

function validPayload(overrides: Readonly<{ hourly?: Readonly<Record<string, unknown>> }> = {}) {
  const hourly = {
    time: times,
    cloud_cover: [18, 42, 66],
    cloud_cover_low: [4, 22, 40],
    cloud_cover_mid: [8, 32, 54],
    cloud_cover_high: [2, 12, 28],
    visibility: [24_000, 18_000, 12_000],
    relative_humidity_2m: [71, 74, 78],
    precipitation_probability: [5, 10, 25],
    wind_speed_10m: [7, 9, 11],
    weather_code: [1, 42, 63],
    ...overrides.hourly,
  };
  return {
    latitude: 12.97,
    longitude: 77.59,
    elevation: 900,
    hourly,
    hourly_units: {
      cloud_cover: "%",
      cloud_cover_low: "%",
      cloud_cover_mid: "%",
      cloud_cover_high: "%",
      visibility: "m",
      relative_humidity_2m: "%",
      precipitation_probability: "%",
      wind_speed_10m: "km/h",
      weather_code: "wmo code",
    },
    additive_provider_field: { ignored: true },
  };
}

function hour(overrides: Partial<WeatherHour> = {}): WeatherHour {
  return {
    cloudCover: 10,
    cloudCoverHigh: 5,
    cloudCoverLow: 3,
    cloudCoverMid: 4,
    instant: new Date("2026-08-27T22:00:00Z"),
    precipitationProbability: 5,
    relativeHumidity: 70,
    visibilityMeters: 24_000,
    weatherCode: 0,
    windSpeedKmh: 7,
    ...overrides,
  };
}

function HookHarness({
  location: observerLocation,
  nightDate,
}: Readonly<{ location: ObserverLocation; nightDate: string }>) {
  const weather = useObservationWeather({ location: observerLocation, nightDate });
  return (
    <div>
      <output data-testid="weather-status">{weather.status}</output>
      {weather.status === "idle" && weather.availability === "allowed" ? (
        <button onClick={weather.enable} type="button">
          Load weather forecast
        </button>
      ) : null}
      {weather.status === "success" ? <p>Forecast loaded</p> : null}
      {weather.status === "unavailable" ? <p>Forecast unavailable</p> : null}
    </div>
  );
}

afterEach(() => {
  clearWeatherForecastCache();
  vi.restoreAllMocks();
});

describe("Open-Meteo response boundary", () => {
  it("validates and normalizes a complete additive provider payload", () => {
    const forecast = parseOpenMeteoForecast(validPayload(), fetchedAt);
    expect(forecast?.provider).toBe("Open-Meteo");
    expect(forecast?.fetchedAt).toEqual(fetchedAt);
    expect(forecast?.hours).toHaveLength(3);
    expect(forecast?.hours[0]).toMatchObject({
      cloudCover: 18,
      instant: new Date("2026-08-27T21:00:00Z"),
      visibilityMeters: 24_000,
      windSpeedKmh: 7,
    });
  });

  it("allows nullable hourly values but rejects malformed shape, units, ranges, and lengths", () => {
    expect(
      parseOpenMeteoForecast(
        validPayload({ hourly: { visibility: [24_000, null, 12_000] } }),
        fetchedAt,
      ),
    ).not.toBeNull();
    expect(parseOpenMeteoForecast([], fetchedAt)).toBeNull();
    expect(
      parseOpenMeteoForecast({ hourly_units: validPayload().hourly_units }, fetchedAt),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(
        validPayload({ hourly: { time: ["2026-08-27T21:00:00Z"] } }),
        fetchedAt,
      ),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(validPayload({ hourly: { cloud_cover: [18, 42] } }), fetchedAt),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(validPayload({ hourly: { cloud_cover: [101, 42, 66] } }), fetchedAt),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(
        validPayload({ hourly: { visibility: [-1, 18_000, 12_000] } }),
        fetchedAt,
      ),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(
        validPayload({ hourly: { relative_humidity_2m: [70, 101, 80] } }),
        fetchedAt,
      ),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(validPayload({ hourly: { wind_speed_10m: [-1, 9, 11] } }), fetchedAt),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(
        { ...validPayload(), hourly_units: { ...validPayload().hourly_units, visibility: "km" } },
        fetchedAt,
      ),
    ).toBeNull();
    expect(
      parseOpenMeteoForecast(validPayload({ hourly: { weather_code: [42, null, 63] } }), fetchedAt)
        ?.hours[0]?.weatherCode,
    ).toBe(42);
  });

  it("maps unknown WMO codes without turning them into an error", () => {
    expect(weatherCodeDescription(0)).toBe("Clear sky");
    expect(weatherCodeDescription(42)).toBe("Unknown forecast condition");
    expect(weatherCodeDescription(null)).toBe("Unavailable");
  });
});

describe("weather request and domain semantics", () => {
  it("rounds only the provider request and requests the bounded UTC hourly contract", () => {
    const url = new URL(buildOpenMeteoForecastUrl(location));
    expect(url.origin + url.pathname).toBe(OPEN_METEO_FORECAST_URL);
    expect(url.searchParams.get("latitude")).toBe("12.97");
    expect(url.searchParams.get("longitude")).toBe("77.59");
    expect(url.searchParams.get("hourly")).toBe(OPEN_METEO_HOURLY_VARIABLES.join(","));
    expect(url.searchParams.get("timeformat")).toBe("unixtime");
    expect(url.searchParams.get("timezone")).toBe("GMT");
    expect(url.searchParams.get("wind_speed_unit")).toBe("kmh");
    expect(url.searchParams.get("forecast_days")).toBe("16");
  });

  it("handles forecast date horizon boundaries without using historical data", () => {
    expect(forecastDateAvailability("2026-08-27", "2026-08-27")).toBe("allowed");
    expect(forecastDateAvailability("2026-09-11", "2026-08-27")).toBe("allowed");
    expect(forecastDateAvailability("2026-09-12", "2026-08-27")).toBe("outside-horizon");
    expect(forecastDateAvailability("2026-08-26", "2026-08-27")).toBe("past");
    expect(forecastDateAvailability("2026-02-30", "2026-08-27")).toBe("invalid");
  });

  it("matches nearest forecast hour and resolves exact ties to the earlier point", () => {
    const hours = [
      hour({ instant: new Date("2026-08-27T21:00:00Z") }),
      hour({ instant: new Date("2026-08-27T22:00:00Z") }),
      hour({ instant: new Date("2026-08-27T23:00:00Z") }),
    ];
    expect(nearestWeatherHour(hours, new Date("2026-08-27T22:24:00Z"))?.instant).toEqual(
      hours[1]?.instant,
    );
    expect(nearestWeatherHour(hours, new Date("2026-08-27T22:36:00Z"))?.instant).toEqual(
      hours[2]?.instant,
    );
    expect(nearestWeatherHour(hours, new Date("2026-08-27T22:30:00Z"))?.instant).toEqual(
      hours[1]?.instant,
    );
  });

  it("aggregates independent factual ranges and ignores null variables", () => {
    const summary = summarizeWeatherHours(
      [
        hour({
          cloudCover: 10,
          precipitationProbability: null,
          visibilityMeters: 24_000,
          windSpeedKmh: 7,
        }),
        hour({
          instant: new Date("2026-08-27T23:00:00Z"),
          cloudCover: 60,
          precipitationProbability: 30,
          visibilityMeters: 12_000,
          windSpeedKmh: 11,
        }),
        hour({
          instant: new Date("2026-08-28T00:00:00Z"),
          cloudCover: null,
          precipitationProbability: 50,
          visibilityMeters: null,
          windSpeedKmh: null,
        }),
      ],
      { start: new Date("2026-08-27T21:00:00Z"), end: new Date("2026-08-28T00:00:00Z") },
    );
    expect(summary).toEqual({
      cloudCover: { min: 10, max: 60 },
      maximumPrecipitationProbability: 50,
      maximumWindSpeedKmh: 11,
      minimumVisibilityMeters: 12_000,
      pointCount: 3,
    });
    expect(summarizeWeatherHours([], { start: fetchedAt, end: fetchedAt })).toBeNull();
  });
});

describe("weather provider fetch", () => {
  beforeEach(() => clearWeatherForecastCache());

  it("returns a normalized forecast and uses the supplied clock", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(validPayload()), { status: 200 }),
    );
    const forecast = await fetchOpenMeteoForecast(location, { fetchImpl, now: () => fetchedAt });
    expect(forecast.fetchedAt).toEqual(fetchedAt);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [503, "http"],
    [200, "invalid-response"],
  ] as const)("maps provider response failure %s to %s", async (status, kind) => {
    const body = status === 200 ? "not-json" : "provider error";
    const fetchImpl = vi.fn(async () => new Response(body, { status }));
    await expect(fetchOpenMeteoForecast(location, { fetchImpl })).rejects.toMatchObject({ kind });
  });

  it("maps timeout and external cancellation to bounded safe outcomes", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const timeoutPromise = fetchOpenMeteoForecast(location, { fetchImpl, timeoutMs: 5 });
    const timeoutExpectation = expect(timeoutPromise).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(5);
    await timeoutExpectation;

    const controller = new AbortController();
    const abortPromise = fetchOpenMeteoForecast(location, { fetchImpl, signal: controller.signal });
    const abortExpectation = expect(abortPromise).rejects.toMatchObject({ kind: "aborted" });
    controller.abort();
    await abortExpectation;
    vi.useRealTimers();
  });
});

describe("weather opt-in hook", () => {
  it("does not call Open-Meteo until explicitly enabled", async () => {
    const today = localDateString(new Date());
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(validPayload()), { status: 200 }));
    const user = userEvent.setup();
    render(<HookHarness location={location} nightDate={today} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Load weather forecast" })).toBeVisible(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Load weather forecast" }));
    await waitFor(() => expect(screen.getByText("Forecast loaded")).toBeVisible());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("prevents a superseded response from overwriting the latest location", async () => {
    const today = localDateString(new Date());
    const responses: Array<(response: Response) => void> = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Promise<Response>((resolve) => responses.push(resolve)));
    const user = userEvent.setup();
    const rendered = render(<HookHarness location={location} nightDate={today} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Load weather forecast" })).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "Load weather forecast" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    rendered.rerender(
      <HookHarness location={{ latitude: 12.984, longitude: 77.601 }} nightDate={today} />,
    );
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    responses[1]?.(new Response(JSON.stringify(validPayload()), { status: 200 }));
    await waitFor(() => expect(screen.getByText("Forecast loaded")).toBeVisible());
    responses[0]?.(new Response(JSON.stringify(validPayload()), { status: 200 }));
    await waitFor(() => expect(screen.getByText("Forecast loaded")).toBeVisible());
  });
});
