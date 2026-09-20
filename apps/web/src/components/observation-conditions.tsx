"use client";

import { useId, useMemo } from "react";

import {
  formatCountMessage,
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ObservationConditionsMessages } from "../lib/i18n/messages/types";
import type { ObservationPlan } from "../lib/observation/domain";
import {
  WEATHER_PROVIDER_LICENSE_URL,
  WEATHER_PROVIDER_NAME,
  WEATHER_PROVIDER_URL,
  nearestWeatherHour,
  summarizeWeatherHours,
  weatherCondition,
  type WeatherForecast,
  type WeatherHour,
  type WeatherSummary,
} from "../lib/weather/domain";
import {
  useObservationWeather,
  type ObservationWeatherState,
} from "../lib/weather/use-observation-weather";

import { LunarConditionsSection } from "./lunar-conditions";

function formatTime(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatShortTime(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

function formatPercent(
  value: number | null,
  locale: PublishedLocale,
  unavailableValue: string,
): string {
  return value === null
    ? unavailableValue
    : formatLocaleNumber(value / 100, locale, {
        maximumFractionDigits: 0,
        style: "percent",
      });
}

function formatKilometres(
  meters: number | null,
  locale: PublishedLocale,
  unavailableValue: string,
): string {
  if (meters === null) return unavailableValue;
  const kilometres = meters / 1_000;
  const precision = kilometres >= 10 ? 0 : 1;
  return formatLocaleNumber(kilometres, locale, {
    maximumFractionDigits: precision,
    style: "unit",
    unit: "kilometer",
    unitDisplay: "short",
  });
}

function formatKmh(
  value: number | null,
  locale: PublishedLocale,
  unavailableValue: string,
): string {
  return value === null
    ? unavailableValue
    : formatLocaleNumber(value, locale, {
        maximumFractionDigits: 0,
        style: "unit",
        unit: "kilometer-per-hour",
        unitDisplay: "short",
      });
}

function formatMeters(value: number, locale: PublishedLocale): string {
  return formatLocaleNumber(value, locale, {
    maximumFractionDigits: 0,
    style: "unit",
    unit: "meter",
    unitDisplay: "short",
  });
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
  locale,
  messages,
  timeZone,
  unavailableValue,
  window,
}: Readonly<{
  hours: ReadonlyArray<WeatherHour>;
  locale: PublishedLocale;
  messages: ObservationConditionsMessages["weather"]["timeline"];
  timeZone: string;
  unavailableValue: string;
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
  const firstLabel = formatShortTime(points[0]!.instant, timeZone, locale);
  const lastLabel = formatShortTime(points.at(-1)!.instant, timeZone, locale);
  const summary = points
    .map((point) =>
      formatMessageTemplate(messages.point, {
        cloudCover: formatPercent(point.cloudCover, locale, unavailableValue),
        time: formatShortTime(point.instant, timeZone, locale),
      }),
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
            {formatPercent(100, locale, unavailableValue)}
          </text>
          <text
            fill="var(--muted)"
            fontSize="12"
            textAnchor="end"
            x={width - right}
            y={top + plotHeight + 4}
          >
            {formatPercent(0, locale, unavailableValue)}
          </text>
        </svg>
      </div>
      <figcaption className="text-sm leading-6 text-[var(--muted)]" id={`${timelineId}-caption`}>
        <span className="font-medium text-[var(--foreground)]">{messages.title}</span>{" "}
        {messages.description}
      </figcaption>
      <p className="sr-only">{summary}</p>
    </figure>
  );
}

function WeatherSummarySection({
  locale,
  messages,
  summary,
  unavailableValue,
}: Readonly<{
  locale: PublishedLocale;
  messages: ObservationConditionsMessages["weather"]["summary"];
  summary: WeatherSummary | null;
  unavailableValue: string;
}>) {
  if (summary === null) {
    return <p className="text-sm text-[var(--muted)]">{messages.empty}</p>;
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
      <h4 className="text-base font-semibold text-[var(--foreground)]">{messages.title}</h4>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metricCard(
          messages.cloudCoverRange,
          summary.cloudCover === null
            ? unavailableValue
            : formatMessageTemplate(messages.cloudCoverRangeValue, {
                maximum: formatLocaleNumber(summary.cloudCover.max, locale, {
                  maximumFractionDigits: 0,
                }),
                minimum: formatLocaleNumber(summary.cloudCover.min, locale, {
                  maximumFractionDigits: 0,
                }),
              }),
          messages.cloudCoverDetail,
        )}
        {metricCard(
          messages.precipitationMaximum,
          formatPercent(summary.maximumPrecipitationProbability, locale, unavailableValue),
          messages.precipitationDetail,
        )}
        {metricCard(
          messages.visibilityMinimum,
          formatKilometres(summary.minimumVisibilityMeters, locale, unavailableValue),
          messages.visibilityDetail,
        )}
        {metricCard(
          formatMessageTemplate(messages.windMaximum, {
            height: formatMeters(10, locale),
          }),
          formatKmh(summary.maximumWindSpeedKmh, locale, unavailableValue),
          messages.windDetail,
        )}
      </dl>
      <p className="mt-3 text-xs text-[var(--muted)]">
        {formatCountMessage(messages.points, summary.pointCount, locale)}
      </p>
    </div>
  );
}

function WeatherAttribution({
  enabled,
  fetchedAt,
  locale,
  messages,
  timeZone,
}: Readonly<{
  enabled: boolean;
  fetchedAt?: Date | undefined;
  locale: PublishedLocale;
  messages: ObservationConditionsMessages["weather"]["attribution"];
  timeZone: string;
}>) {
  const providerSummary =
    fetchedAt === undefined
      ? formatMessageTemplate(messages.provider, { provider: WEATHER_PROVIDER_NAME })
      : formatMessageTemplate(messages.providerRetrieved, {
          provider: WEATHER_PROVIDER_NAME,
          time: formatTime(fetchedAt, timeZone, locale),
        });
  return (
    <div className="space-y-2 text-xs leading-5 text-[var(--muted)]">
      {enabled ? (
        <p>
          {formatMessageTemplate(messages.privacy, {
            digits: formatLocaleNumber(2, locale),
            provider: WEATHER_PROVIDER_NAME,
          })}
        </p>
      ) : null}
      <p>
        {providerSummary}{" "}
        <a
          className="font-medium text-[var(--link)] underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--foreground)]"
          href={WEATHER_PROVIDER_URL}
          rel="noreferrer"
          target="_blank"
        >
          {formatMessageTemplate(messages.dataLink, { provider: WEATHER_PROVIDER_NAME })}
        </a>{" "}
        ·{" "}
        <a
          className="text-[var(--link)] underline underline-offset-2"
          href={WEATHER_PROVIDER_LICENSE_URL}
          rel="noreferrer"
          target="_blank"
        >
          {messages.licenceLink}
        </a>
      </p>
    </div>
  );
}

function WeatherUnavailable({
  messages,
  weather,
}: Readonly<{
  messages: ObservationConditionsMessages["weather"];
  weather: ObservationWeatherState;
}>) {
  if (weather.unavailableReason === "date") {
    return (
      <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
        {messages.dateUnavailable}
      </p>
    );
  }
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
      <p className="text-sm text-[var(--muted)]" role="alert">
        {messages.errorUnavailable}
      </p>
      <button
        className="mt-3 inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)]"
        onClick={weather.retry}
        type="button"
      >
        {messages.retryAction}
      </button>
    </div>
  );
}

function LoadedWeather({
  forecast,
  locale,
  messages,
  plan,
  timeZone,
  unavailableValue,
}: Readonly<{
  forecast: WeatherForecast;
  locale: PublishedLocale;
  messages: ObservationConditionsMessages["weather"];
  plan: ObservationPlan;
  timeZone: string;
  unavailableValue: string;
}>) {
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

  return (
    <div className="space-y-4">
      {selectedHour === null ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
          {messages.selectedUnavailable}
        </p>
      ) : (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
          <h4 className="text-base font-semibold text-[var(--foreground)]">
            {formatMessageTemplate(messages.selectedTitle, {
              time: formatTime(selectedHour.instant, timeZone, locale),
            })}
          </h4>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatMessageTemplate(messages.selectedDescription, {
              condition: messages.conditions[weatherCondition(selectedHour.weatherCode)],
            })}
          </p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metricCard(
              messages.metrics.cloudCover,
              formatPercent(selectedHour.cloudCover, locale, unavailableValue),
              messages.metrics.cloudCoverDetail,
            )}
            {metricCard(
              messages.metrics.visibility,
              formatKilometres(selectedHour.visibilityMeters, locale, unavailableValue),
              messages.metrics.visibilityDetail,
            )}
            {metricCard(
              messages.metrics.humidity,
              formatPercent(selectedHour.relativeHumidity, locale, unavailableValue),
              formatMessageTemplate(messages.metrics.humidityDetail, {
                height: formatMeters(2, locale),
              }),
            )}
            {metricCard(
              messages.metrics.precipitation,
              formatPercent(selectedHour.precipitationProbability, locale, unavailableValue),
              messages.metrics.precipitationDetail,
            )}
            {metricCard(
              messages.metrics.wind,
              formatKmh(selectedHour.windSpeedKmh, locale, unavailableValue),
              formatMessageTemplate(messages.metrics.windDetail, {
                height: formatMeters(10, locale),
              }),
            )}
          </dl>
          <details className="mt-4 rounded-md border border-[var(--border)] px-3 py-2">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-[var(--foreground)]">
              {messages.cloudLayers.title}
            </summary>
            <dl className="grid gap-3 pb-2 pt-2 sm:grid-cols-3">
              {metricCard(
                messages.cloudLayers.low,
                formatPercent(selectedHour.cloudCoverLow, locale, unavailableValue),
              )}
              {metricCard(
                messages.cloudLayers.mid,
                formatPercent(selectedHour.cloudCoverMid, locale, unavailableValue),
              )}
              {metricCard(
                messages.cloudLayers.high,
                formatPercent(selectedHour.cloudCoverHigh, locale, unavailableValue),
              )}
            </dl>
          </details>
        </div>
      )}
      <WeatherSummarySection
        locale={locale}
        messages={messages.summary}
        summary={summary}
        unavailableValue={unavailableValue}
      />
      <CloudCoverTimeline
        hours={forecast.hours}
        locale={locale}
        messages={messages.timeline}
        timeZone={timeZone}
        unavailableValue={unavailableValue}
        window={weatherWindow}
      />
    </div>
  );
}

function WeatherConditionsSection({
  locale,
  messages,
  nightDate,
  plan,
  timeZone,
  unavailableValue,
}: Readonly<{
  locale: PublishedLocale;
  messages: ObservationConditionsMessages["weather"];
  nightDate: string;
  plan: ObservationPlan;
  timeZone: string;
  unavailableValue: string;
}>) {
  const weather = useObservationWeather({ location: plan.location, nightDate });
  const enabled = weather.status !== "idle";

  return (
    <section aria-labelledby="weather-conditions-heading" className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold" id="weather-conditions-heading">
          {messages.title}
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          {messages.description}
        </p>
      </div>
      {!enabled ? (
        weather.availability === "allowed" ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              {formatMessageTemplate(messages.optInDescription, {
                provider: WEATHER_PROVIDER_NAME,
              })}
            </p>
            <button
              className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] transition-colors hover:bg-[var(--accent-strong)]"
              onClick={weather.enable}
              type="button"
            >
              {messages.loadAction}
            </button>
          </div>
        ) : (
          <WeatherUnavailable
            messages={messages}
            weather={{ ...weather, unavailableReason: "date", status: "unavailable" }}
          />
        )
      ) : weather.status === "loading" ? (
        <p
          aria-live="polite"
          className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]"
          role="status"
        >
          {messages.loading}
        </p>
      ) : weather.status === "unavailable" ? (
        <WeatherUnavailable messages={messages} weather={weather} />
      ) : weather.forecast !== undefined ? (
        <LoadedWeather
          forecast={weather.forecast}
          locale={locale}
          messages={messages}
          plan={plan}
          timeZone={timeZone}
          unavailableValue={unavailableValue}
        />
      ) : null}
      <WeatherAttribution
        enabled={enabled}
        fetchedAt={weather.forecast?.fetchedAt}
        locale={locale}
        messages={messages.attribution}
        timeZone={timeZone}
      />
    </section>
  );
}

export function ObservationConditions({
  locale,
  messages,
  nightDate,
  plan,
  timeZone,
}: Readonly<{
  locale: PublishedLocale;
  messages: ObservationConditionsMessages;
  nightDate: string;
  plan: ObservationPlan;
  timeZone: string;
}>) {
  return (
    <section aria-labelledby="observing-conditions-heading" className="space-y-8">
      <div className="border-b border-[var(--border)] pb-2">
        <h2 className="text-2xl font-semibold" id="observing-conditions-heading">
          {messages.overview.title}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          {messages.overview.description}
        </p>
      </div>
      <LunarConditionsSection
        locale={locale}
        messages={messages.lunar}
        plan={plan}
        timeZone={timeZone}
        unavailableValue={messages.unavailableValue}
      />
      <WeatherConditionsSection
        locale={locale}
        messages={messages.weather}
        nightDate={nightDate}
        plan={plan}
        timeZone={timeZone}
        unavailableValue={messages.unavailableValue}
      />
    </section>
  );
}
