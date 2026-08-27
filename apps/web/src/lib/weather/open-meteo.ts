import {
  roundedWeatherCoordinates,
  WEATHER_FORECAST_DAYS,
  WEATHER_PROVIDER_NAME,
  type WeatherForecast,
  type WeatherHour,
} from "./domain";
import type { ObserverLocation } from "../observation/domain";

export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_HOURLY_VARIABLES = [
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "visibility",
  "relative_humidity_2m",
  "precipitation_probability",
  "wind_speed_10m",
  "weather_code",
] as const;

type OpenMeteoHourlyVariable = (typeof OPEN_METEO_HOURLY_VARIABLES)[number];
type JsonObject = Readonly<Record<string, unknown>>;

export type WeatherProviderErrorKind =
  "aborted" | "http" | "invalid-response" | "network" | "timeout";

export class WeatherProviderError extends Error {
  readonly kind: WeatherProviderErrorKind;

  constructor(kind: WeatherProviderErrorKind) {
    super("Weather provider request was unavailable.");
    this.name = "WeatherProviderError";
    this.kind = kind;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidUnit(variable: OpenMeteoHourlyVariable, unit: unknown): boolean {
  const expected: Readonly<Record<OpenMeteoHourlyVariable, string>> = {
    cloud_cover: "%",
    cloud_cover_low: "%",
    cloud_cover_mid: "%",
    cloud_cover_high: "%",
    visibility: "m",
    relative_humidity_2m: "%",
    precipitation_probability: "%",
    wind_speed_10m: "km/h",
    weather_code: "wmo code",
  };
  return unit === expected[variable];
}

function isValidValue(variable: OpenMeteoHourlyVariable, value: unknown): value is number | null {
  if (value === null) return true;
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  switch (variable) {
    case "cloud_cover":
    case "cloud_cover_low":
    case "cloud_cover_mid":
    case "cloud_cover_high":
    case "relative_humidity_2m":
    case "precipitation_probability":
      return value >= 0 && value <= 100;
    case "visibility":
    case "wind_speed_10m":
      return value >= 0;
    case "weather_code":
      return Number.isInteger(value) && value >= 0 && value <= 99;
  }
}

function nullableNumbers(
  value: unknown,
  variable: OpenMeteoHourlyVariable,
  length: number,
): value is Array<number | null> {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((entry) => isValidValue(variable, entry))
  );
}

/** Strictly validates and normalizes one untrusted Open-Meteo response. */
export function parseOpenMeteoForecast(payload: unknown, fetchedAt: Date): WeatherForecast | null {
  if (!isObject(payload) || !isObject(payload.hourly) || !isObject(payload.hourly_units)) {
    return null;
  }
  if (!Number.isFinite(fetchedAt.getTime())) return null;

  const hourly = payload.hourly;
  const units = payload.hourly_units;
  const times = hourly.time;
  if (
    !Array.isArray(times) ||
    times.length === 0 ||
    !times.every(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && Number.isFinite(value * 1000),
    )
  ) {
    return null;
  }
  for (const variable of OPEN_METEO_HOURLY_VARIABLES) {
    if (!isValidUnit(variable, units[variable])) return null;
    if (!nullableNumbers(hourly[variable], variable, times.length)) return null;
  }

  const instants = times.map((seconds) => new Date(seconds * 1000));
  if (!instants.every((instant) => Number.isFinite(instant.getTime()))) return null;

  const values = new Map<OpenMeteoHourlyVariable, Array<number | null>>();
  for (const variable of OPEN_METEO_HOURLY_VARIABLES) {
    const variableValues = hourly[variable];
    if (!nullableNumbers(variableValues, variable, times.length)) return null;
    values.set(variable, variableValues);
  }
  const valueAt = (variable: OpenMeteoHourlyVariable, index: number): number | null =>
    values.get(variable)?.[index] ?? null;
  const hours: Array<WeatherHour> = instants.map((instant, index) => ({
    cloudCover: valueAt("cloud_cover", index),
    cloudCoverHigh: valueAt("cloud_cover_high", index),
    cloudCoverLow: valueAt("cloud_cover_low", index),
    cloudCoverMid: valueAt("cloud_cover_mid", index),
    instant,
    precipitationProbability: valueAt("precipitation_probability", index),
    relativeHumidity: valueAt("relative_humidity_2m", index),
    visibilityMeters: valueAt("visibility", index),
    weatherCode: valueAt("weather_code", index),
    windSpeedKmh: valueAt("wind_speed_10m", index),
  }));

  return { fetchedAt, hours, provider: WEATHER_PROVIDER_NAME };
}

/** Builds the fixed, bounded, browser-direct provider request. */
export function buildOpenMeteoForecastUrl(location: ObserverLocation): string {
  const coordinates = roundedWeatherCoordinates(location);
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", coordinates.latitude);
  url.searchParams.set("longitude", coordinates.longitude);
  url.searchParams.set("hourly", OPEN_METEO_HOURLY_VARIABLES.join(","));
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("timezone", "GMT");
  url.searchParams.set("forecast_days", String(WEATHER_FORECAST_DAYS));
  return url.toString();
}

type FetchOptions = Readonly<{
  fetchImpl?: typeof fetch;
  now?: () => Date;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

/** Fetches one bounded forecast and exposes only provider-neutral values. */
export async function fetchOpenMeteoForecast(
  location: ObserverLocation,
  options: FetchOptions = {},
): Promise<WeatherForecast> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  let timedOut = false;
  let externallyAborted = options.signal?.aborted ?? false;
  const abortExternal = () => {
    externallyAborted = true;
    controller.abort();
  };
  options.signal?.addEventListener("abort", abortExternal, { once: true });
  if (externallyAborted) controller.abort();
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(buildOpenMeteoForecastUrl(location), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new WeatherProviderError("http");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WeatherProviderError("invalid-response");
    }
    const fetchedAt = options.now?.() ?? new Date();
    const forecast = parseOpenMeteoForecast(payload, fetchedAt);
    if (forecast === null) throw new WeatherProviderError("invalid-response");
    return forecast;
  } catch (error) {
    if (error instanceof WeatherProviderError) throw error;
    if (externallyAborted) throw new WeatherProviderError("aborted");
    if (timedOut) throw new WeatherProviderError("timeout");
    throw new WeatherProviderError("network");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortExternal);
  }
}
