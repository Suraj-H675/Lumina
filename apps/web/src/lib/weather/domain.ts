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

export type WeatherCondition =
  | "clearSky"
  | "denseDrizzle"
  | "denseFreezingDrizzle"
  | "depositingRimeFog"
  | "fog"
  | "heavyFreezingRain"
  | "heavyRain"
  | "heavySnowFall"
  | "heavySnowShowers"
  | "lightDrizzle"
  | "lightFreezingDrizzle"
  | "lightFreezingRain"
  | "mainlyClear"
  | "moderateDrizzle"
  | "moderateRain"
  | "moderateRainShowers"
  | "moderateSnowFall"
  | "overcast"
  | "partlyCloudy"
  | "slightRain"
  | "slightRainShowers"
  | "slightSnowFall"
  | "slightSnowShowers"
  | "snowGrains"
  | "thunderstorm"
  | "thunderstormHeavyHail"
  | "thunderstormSlightHail"
  | "unavailable"
  | "unknown"
  | "violentRainShowers";

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

/** Maps the provider's documented WMO weather codes to stable presentation keys. */
export function weatherCondition(code: number | null): WeatherCondition {
  if (code === null) return "unavailable";
  const conditions: Readonly<Record<number, WeatherCondition>> = {
    0: "clearSky",
    1: "mainlyClear",
    2: "partlyCloudy",
    3: "overcast",
    45: "fog",
    48: "depositingRimeFog",
    51: "lightDrizzle",
    53: "moderateDrizzle",
    55: "denseDrizzle",
    56: "lightFreezingDrizzle",
    57: "denseFreezingDrizzle",
    61: "slightRain",
    63: "moderateRain",
    65: "heavyRain",
    66: "lightFreezingRain",
    67: "heavyFreezingRain",
    71: "slightSnowFall",
    73: "moderateSnowFall",
    75: "heavySnowFall",
    77: "snowGrains",
    80: "slightRainShowers",
    81: "moderateRainShowers",
    82: "violentRainShowers",
    85: "slightSnowShowers",
    86: "heavySnowShowers",
    95: "thunderstorm",
    96: "thunderstormSlightHail",
    99: "thunderstormHeavyHail",
  };
  return conditions[code] ?? "unknown";
}
