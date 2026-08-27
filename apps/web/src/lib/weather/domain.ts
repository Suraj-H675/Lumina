import type { ObserverLocation } from "../observation/domain";

const DAY_MS = 86_400_000;

export const WEATHER_PROVIDER_NAME = "Open-Meteo";
export const WEATHER_PROVIDER_URL = "https://open-meteo.com/";
export const WEATHER_PROVIDER_LICENSE_URL = "https://open-meteo.com/en/license";
export const WEATHER_FORECAST_DAYS = 16;

export type WeatherHour = Readonly<{
  cloudCover: number | null;
  cloudCoverHigh: number | null;
  cloudCoverLow: number | null;
  cloudCoverMid: number | null;
  instant: Date;
  precipitationProbability: number | null;
  relativeHumidity: number | null;
  visibilityMeters: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
}>;

export type WeatherForecast = Readonly<{
  fetchedAt: Date;
  hours: ReadonlyArray<WeatherHour>;
  provider: typeof WEATHER_PROVIDER_NAME;
}>;

export type WeatherRange = Readonly<{
  max: number;
  min: number;
}>;

export type WeatherSummary = Readonly<{
  cloudCover: WeatherRange | null;
  maximumPrecipitationProbability: number | null;
  maximumWindSpeedKmh: number | null;
  minimumVisibilityMeters: number | null;
  pointCount: number;
}>;

export type ForecastDateAvailability = "allowed" | "past" | "outside-horizon" | "invalid";

function parseIsoDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  return parsed.toISOString().slice(0, 10) === date ? timestamp : null;
}

/**
 * Uses the browser's local calendar date and the provider's 16-day forecast
 * contract. Past dates are never sent to the live forecast endpoint.
 */
export function forecastDateAvailability(
  nightDate: string,
  todayLocalDate: string,
  forecastDays = WEATHER_FORECAST_DAYS,
): ForecastDateAvailability {
  const selectedTimestamp = parseIsoDate(nightDate);
  const todayTimestamp = parseIsoDate(todayLocalDate);
  if (selectedTimestamp === null || todayTimestamp === null || forecastDays < 1) return "invalid";

  const dayOffset = Math.floor((selectedTimestamp - todayTimestamp) / DAY_MS);
  if (dayOffset < 0) return "past";
  return dayOffset < forecastDays ? "allowed" : "outside-horizon";
}

/** Returns the exact two-decimal coordinate strings sent to the provider. */
export function roundedWeatherCoordinates(location: ObserverLocation): Readonly<{
  latitude: string;
  longitude: string;
}> {
  return {
    latitude: location.latitude.toFixed(2),
    longitude: location.longitude.toFixed(2),
  };
}

function rangeFor(values: ReadonlyArray<number | null>): WeatherRange | null {
  const available = values.filter((value): value is number => value !== null);
  if (available.length === 0) return null;
  return { max: Math.max(...available), min: Math.min(...available) };
}

function maximum(values: ReadonlyArray<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length === 0 ? null : Math.max(...available);
}

function minimum(values: ReadonlyArray<number | null>): number | null {
  const available = values.filter((value): value is number => value !== null);
  return available.length === 0 ? null : Math.min(...available);
}

/** Aggregates only factual ranges and extrema; no composite quality score. */
export function summarizeWeatherHours(
  hours: ReadonlyArray<WeatherHour>,
  window: Readonly<{ end: Date; start: Date }>,
): WeatherSummary | null {
  const points = hours.filter(
    (hour) =>
      hour.instant.getTime() >= window.start.getTime() &&
      hour.instant.getTime() <= window.end.getTime(),
  );
  if (points.length === 0) return null;

  return {
    cloudCover: rangeFor(points.map((point) => point.cloudCover)),
    maximumPrecipitationProbability: maximum(points.map((point) => point.precipitationProbability)),
    maximumWindSpeedKmh: maximum(points.map((point) => point.windSpeedKmh)),
    minimumVisibilityMeters: minimum(points.map((point) => point.visibilityMeters)),
    pointCount: points.length,
  };
}

/** Chooses the closest forecast hour; exact ties resolve to the earlier hour. */
export function nearestWeatherHour(
  hours: ReadonlyArray<WeatherHour>,
  instant: Date,
): WeatherHour | null {
  if (!Number.isFinite(instant.getTime()) || hours.length === 0) return null;
  return hours.reduce<WeatherHour | null>((nearest, hour) => {
    if (nearest === null) return hour;
    const candidateDistance = Math.abs(hour.instant.getTime() - instant.getTime());
    const nearestDistance = Math.abs(nearest.instant.getTime() - instant.getTime());
    return candidateDistance < nearestDistance ? hour : nearest;
  }, null);
}

/** Maps the provider's documented WMO weather codes to factual descriptions. */
export function weatherCodeDescription(code: number | null): string {
  if (code === null) return "Unavailable";
  const descriptions: Readonly<Record<number, string>> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return descriptions[code] ?? "Unknown forecast condition";
}
