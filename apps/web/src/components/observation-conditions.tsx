"use client";

import { useId, useMemo } from "react";

import {
  WEATHER_PROVIDER_LICENSE_URL,
  WEATHER_PROVIDER_NAME,
  WEATHER_PROVIDER_URL,
  nearestWeatherHour,
  summarizeWeatherHours,
  weatherCodeDescription,
  type WeatherForecast,
  type WeatherHour,
  type WeatherSummary,
} from "../lib/weather/domain";
import {
  useObservationWeather,
  type ObservationWeatherState,
} from "../lib/weather/use-observation-weather";
import type { ObservationPlan } from "../lib/observation/domain";

import { LunarConditionsSection } from "./lunar-conditions";

function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(instant);
}

function formatShortTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(instant);
}

function formatPercent(value: number | null): string {
  return value === null ? "Unavailable" : `${Math.round(value)}%`;
}

function formatKilometres(meters: number | null): string {
  if (meters === null) return "Unavailable";
  const kilometres = meters / 1_000;
  const precision = kilometres >= 10 ? 0 : 1;
  return `${kilometres.toFixed(precision)} km`;
}

function formatKmh(value: number | null): string {
  return value === null ? "Unavailable" : `${Math.round(value)} km/h`;
}

function metricCard(label: string, value: string, detail?: string) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-3">
      <dt className="text-xs font-semibold tracking-[0.12em] text-[var(--muted)] uppercase">
        {label}
      </dt>
      <dd className="mt-2 text-xl font-medium text-[var(--foreground)]">{value}</dd>
      {detail !== undefined ? <dd className="mt-1 text-sm text-[var(--muted)]">{detail}</dd> : null}
    </div>
  );
}

function CloudCoverTimeline({
  hours,
  timeZone,
  window,
}: Readonly<{
  hours: ReadonlyArray<WeatherHour>;
  timeZone: string;
  window: Readonly<{ end: Date; start: Date }>;
}>) {
  const timelineId = useId().replaceAll(":", "");
  const points = hours.filter(
    (hour) =>
      hour.instant.getTime() >= window.start.getTime() &&
      hour.instant.getTime() <= window.end.getTime(),
  );
  if (points.length === 0) return null;

  const width = 720;
  const height = 190;
  const left = 16;
  const right = 16;
  const top = 20;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const barWidth = plotWidth / points.length;
  const firstLabel = formatShortTime(points[0]!.instant, timeZone);
  const lastLabel = formatShortTime(points.at(-1)!.instant, timeZone);
  const summary = points
    .map(
      (point) =>
        `${formatShortTime(point.instant, timeZone)}: ${formatPercent(point.cloudCover)} total cloud cover`,
    )
    .join("; ");

  return (
    <figure aria-labelledby={`${timelineId}-caption`} className="space-y-3">
      <div className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-4">
        <svg
          aria-hidden="true"
          className="h-auto w-full"
          role="presentation"
          viewBox={`0 0 ${width} ${height}`}
        >
          <line
            stroke="var(--border-strong)"
            strokeWidth="1"
            x1={left}
            x2={width - right}
            y1={top + plotHeight}
            y2={top + plotHeight}
          />
          {points.map((point, index) => {
            const cloudCover = point.cloudCover;
            const barHeight =
              cloudCover === null ? plotHeight * 0.18 : (cloudCover / 100) * plotHeight;
            return (
              <rect
                fill="var(--accent)"
                fillOpacity={cloudCover === null ? 0.25 : 0.25 + cloudCover / 133}
                height={Math.max(3, barHeight)}
                key={point.instant.toISOString()}
                width={Math.max(1, barWidth - 2)}
                x={left + index * barWidth + 1}
                y={top + plotHeight - Math.max(3, barHeight)}
              />
            );
          })}
          <text fill="var(--muted)" fontSize="12" textAnchor="start" x={left} y={height - 12}>
            {firstLabel}
          </text>
          <text
            fill="var(--muted)"
            fontSize="12"
            textAnchor="end"
            x={width - right}
            y={height - 12}
          >
            {lastLabel}
          </text>
          <text fill="var(--muted)" fontSize="12" textAnchor="end" x={width - right} y={top + 4}>
            100%
          </text>
          <text
            fill="var(--muted)"
            fontSize="12"
            textAnchor="end"
            x={width - right}
            y={top + plotHeight + 4}
          >
            0%
          </text>
        </svg>
      </div>
      <figcaption className="text-sm leading-6 text-[var(--muted)]" id={`${timelineId}-caption`}>
        <span className="font-medium text-[var(--foreground)]">
          Cloud cover through the observing window.
        </span>{" "}
        Each bar is one forecast hour; taller bars represent a higher total cloud-cover percentage.
      </figcaption>
      <p className="sr-only">{summary}</p>
    </figure>
  );
}

function WeatherSummarySection({ summary }: Readonly<{ summary: WeatherSummary | null }>) {
  if (summary === null) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No forecast points were available in this observing window.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
      <h4 className="text-base font-semibold text-[var(--foreground)]">Night forecast summary</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metricCard(
          "Cloud cover range",
          summary.cloudCover === null
            ? "Unavailable"
            : `${Math.round(summary.cloudCover.min)}–${Math.round(summary.cloudCover.max)}%`,
          "Total cloud cover",
        )}
        {metricCard(
          "Maximum precipitation probability",
          formatPercent(summary.maximumPrecipitationProbability),
          "Forecast probability",
        )}
        {metricCard(
          "Minimum meteorological visibility",
          formatKilometres(summary.minimumVisibilityMeters),
          "Viewing distance, not astronomical transparency",
        )}
        {metricCard(
          "Maximum wind speed at 10 m",
          formatKmh(summary.maximumWindSpeedKmh),
          "Forecast surface wind",
        )}
      </dl>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Based on {summary.pointCount} hourly forecast point(s).
      </p>
    </div>
  );
}

function WeatherAttribution({
  enabled,
  fetchedAt,
  timeZone,
}: Readonly<{ enabled: boolean; fetchedAt?: Date | undefined; timeZone: string }>) {
  return (
    <div className="space-y-2 text-xs leading-5 text-[var(--muted)]">
      {enabled ? (
        <p>
          Weather requests use coordinates rounded to 2 decimal places and are sent directly from
          your browser to Open-Meteo. Lumina does not store observer location.
        </p>
      ) : null}
      <p>
        Forecast provider: {WEATHER_PROVIDER_NAME}.
        {fetchedAt !== undefined ? ` Retrieved ${formatTime(fetchedAt, timeZone)}.` : ""} Data are
        forecasts, not measurements.{" "}
        <a
          className="font-medium text-[var(--link)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--foreground)]"
          href={WEATHER_PROVIDER_URL}
          rel="noreferrer"
          target="_blank"
        >
          Weather data by Open-Meteo
        </a>{" "}
        ·{" "}
        <a
          className="text-[var(--link)] underline underline-offset-2"
          href={WEATHER_PROVIDER_LICENSE_URL}
          rel="noreferrer"
          target="_blank"
        >
          CC BY 4.0 licence
        </a>
      </p>
    </div>
  );
}

function WeatherUnavailable({ weather }: Readonly<{ weather: ObservationWeatherState }>) {
  if (weather.unavailableReason === "date") {
    return (
      <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
        Weather forecast unavailable for this date. Past dates and dates beyond the provider&apos;s
        forecast horizon are not replaced with historical data.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
      <p className="text-sm text-[var(--muted)]" role="alert">
        Could not load the weather forecast. The target geometry and lunar conditions remain
        available.
      </p>
      <button
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
        onClick={weather.retry}
        type="button"
      >
        Retry forecast
      </button>
    </div>
  );
}

function LoadedWeather({
  forecast,
  plan,
  timeZone,
}: Readonly<{ forecast: WeatherForecast; plan: ObservationPlan; timeZone: string }>) {
  const selectedHour = useMemo(
    () => nearestWeatherHour(forecast.hours, plan.selected.instant),
    [forecast.hours, plan.selected.instant],
  );
  const weatherWindow = useMemo(
    () =>
      plan.night.astronomicalDarkness ?? {
        end: plan.plotEnd,
        start: plan.plotStart,
      },
    [plan.night.astronomicalDarkness, plan.plotEnd, plan.plotStart],
  );
  const summary = useMemo(
    () => summarizeWeatherHours(forecast.hours, weatherWindow),
    [forecast.hours, weatherWindow],
  );
  const selectedCloudLayers = selectedHour === null ? null : selectedHour;

  return (
    <div className="space-y-4">
      {selectedHour === null ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
          Forecast not available for this selected date and time.
        </p>
      ) : (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <h4 className="text-base font-semibold text-[var(--foreground)]">
            Forecast nearest {formatTime(selectedHour.instant, timeZone)}
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {weatherCodeDescription(selectedHour.weatherCode)} · hourly forecast point
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metricCard("Cloud cover", formatPercent(selectedHour.cloudCover), "Total")}
            {metricCard(
              "Meteorological visibility",
              formatKilometres(selectedHour.visibilityMeters),
              "Viewing distance",
            )}
            {metricCard(
              "Relative humidity",
              formatPercent(selectedHour.relativeHumidity),
              "At 2 m",
            )}
            {metricCard(
              "Precipitation probability",
              formatPercent(selectedHour.precipitationProbability),
              "Forecast chance",
            )}
            {metricCard("Wind speed", formatKmh(selectedHour.windSpeedKmh), "At 10 m")}
          </dl>
          {selectedCloudLayers !== null ? (
            <details className="mt-4 rounded-md border border-[var(--border)] px-3 py-2">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--foreground)]">
                Cloud layer detail
              </summary>
              <dl className="grid gap-3 pb-2 pt-2 sm:grid-cols-3">
                {metricCard("Low cloud", formatPercent(selectedCloudLayers.cloudCoverLow))}
                {metricCard("Mid cloud", formatPercent(selectedCloudLayers.cloudCoverMid))}
                {metricCard("High cloud", formatPercent(selectedCloudLayers.cloudCoverHigh))}
              </dl>
            </details>
          ) : null}
        </div>
      )}
      <WeatherSummarySection summary={summary} />
      <CloudCoverTimeline hours={forecast.hours} timeZone={timeZone} window={weatherWindow} />
    </div>
  );
}

function WeatherConditionsSection({
  plan,
  nightDate,
  timeZone,
}: Readonly<{ nightDate: string; plan: ObservationPlan; timeZone: string }>) {
  const weather = useObservationWeather({ location: plan.location, nightDate });
  const enabled = weather.status !== "idle";

  return (
    <section aria-labelledby="weather-conditions-heading" className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold" id="weather-conditions-heading">
          Weather forecast conditions
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Weather is optional context around the astronomical calculation. Values come from an
          hourly forecast and are not a measurement of the sky or a guarantee of observing quality.
        </p>
      </div>
      {!enabled ? (
        weather.availability === "allowed" ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              Loading weather sends a rounded location directly to Open-Meteo. Lumina does not store
              it. You choose whether to make this separate provider request.
            </p>
            <button
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] transition-colors hover:bg-[var(--accent-strong)]"
              onClick={weather.enable}
              type="button"
            >
              Load weather forecast
            </button>
          </div>
        ) : (
          <WeatherUnavailable
            weather={{ ...weather, unavailableReason: "date", status: "unavailable" }}
          />
        )
      ) : weather.status === "loading" ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]"
          role="status"
        >
          Loading weather forecast…
        </p>
      ) : weather.status === "unavailable" ? (
        <WeatherUnavailable weather={weather} />
      ) : weather.forecast !== undefined ? (
        <LoadedWeather forecast={weather.forecast} plan={plan} timeZone={timeZone} />
      ) : null}
      <WeatherAttribution
        enabled={enabled}
        fetchedAt={weather.forecast?.fetchedAt}
        timeZone={timeZone}
      />
    </section>
  );
}

export function ObservationConditions({
  nightDate,
  plan,
  timeZone,
}: Readonly<{ nightDate: string; plan: ObservationPlan; timeZone: string }>) {
  return (
    <section aria-labelledby="observing-conditions-heading" className="space-y-8">
      <div className="border-b border-[var(--border)] pb-2">
        <h2 className="text-2xl font-semibold" id="observing-conditions-heading">
          Observing conditions
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Astronomy and weather are shown as separate evidence layers. There is no combined
          observability score.
        </p>
      </div>
      <LunarConditionsSection plan={plan} timeZone={timeZone} />
      <WeatherConditionsSection nightDate={nightDate} plan={plan} timeZone={timeZone} />
    </section>
  );
}
