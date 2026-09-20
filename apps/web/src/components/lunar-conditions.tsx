"use client";

import { useMemo } from "react";

import {
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { ObservationConditionsMessages } from "../lib/i18n/messages/types";
import type { ObservationPlan } from "../lib/observation/domain";
import { computeLunarConditions, type LunarConditions } from "../lib/observation/lunar";

function formatTime(instant: Date, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(instant, locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
}

function formatAngle(value: number, locale: PublishedLocale): string {
  return `${formatLocaleNumber(value, locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}°`;
}

function formatIllumination(
  illuminationFraction: number,
  locale: PublishedLocale,
  unavailableValue: string,
): string {
  if (
    !Number.isFinite(illuminationFraction) ||
    illuminationFraction < 0 ||
    illuminationFraction > 1
  ) {
    return unavailableValue;
  }
  return formatLocaleNumber(illuminationFraction, locale, {
    maximumFractionDigits: 0,
    style: "percent",
  });
}

function formatAzimuth(azimuth: number, compass: string, locale: PublishedLocale): string {
  return `${formatAngle(azimuth, locale)} · ${compass}`;
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

export function LunarConditionsSection({
  locale,
  messages,
  plan,
  timeZone,
  unavailableValue,
}: Readonly<{
  locale: PublishedLocale;
  messages: ObservationConditionsMessages["lunar"];
  plan: ObservationPlan;
  timeZone: string;
  unavailableValue: string;
}>) {
  const lunar = useMemo<LunarConditions | null>(
    () =>
      computeLunarConditions(
        plan.coordinate,
        plan.location,
        plan.selected.instant,
        plan.night.astronomicalDarkness,
        plan.samples,
      ),
    [plan],
  );

  return (
    <section aria-labelledby="lunar-conditions-heading" className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold" id="lunar-conditions-heading">
          {messages.title}
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          {messages.description}
        </p>
      </div>
      {lunar === null ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
          {messages.unavailable}
        </p>
      ) : (
        <>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <h4 className="text-base font-semibold text-[var(--foreground)]">
              {messages.selectedTitle}
            </h4>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metricCard(
                messages.metrics.illumination,
                formatIllumination(lunar.selected.illuminationFraction, locale, unavailableValue),
                messages.phases[lunar.selected.phase],
              )}
              {metricCard(
                messages.metrics.altitude,
                formatAngle(lunar.selected.position.altitude, locale),
                lunar.selected.position.altitude < 0
                  ? messages.metrics.belowHorizon
                  : messages.metrics.aboveHorizon,
              )}
              {metricCard(
                messages.metrics.azimuth,
                formatAzimuth(
                  lunar.selected.position.azimuth,
                  lunar.selected.position.compass,
                  locale,
                ),
                messages.metrics.azimuthConvention,
              )}
              {metricCard(
                messages.metrics.separation,
                formatAngle(lunar.selected.targetSeparationDegrees, locale),
                messages.metrics.separationDetail,
              )}
            </dl>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              {formatMessageTemplate(messages.selectedSummary, {
                altitude: formatAngle(Math.abs(lunar.selected.position.altitude), locale),
                horizonPosition:
                  lunar.selected.position.altitude < 0
                    ? messages.horizonPosition.below
                    : messages.horizonPosition.above,
                separation: formatAngle(lunar.selected.targetSeparationDegrees, locale),
                time: formatTime(plan.selected.instant, timeZone, locale),
              })}
            </p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
            <h4 className="text-base font-semibold text-[var(--foreground)]">
              {messages.closest.title}
            </h4>
            <p className="mt-2 text-xl font-medium text-[var(--foreground)]">
              {lunar.minimumSeparationDuringDarkness === null
                ? messages.closest.notApplicable
                : formatAngle(lunar.minimumSeparationDuringDarkness, locale)}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {lunar.minimumSeparationDuringDarkness === null
                ? messages.closest.unavailableDescription
                : messages.closest.description}
            </p>
          </div>
          <p className="text-xs leading-5 text-[var(--muted)]">{messages.model}</p>
        </>
      )}
    </section>
  );
}

export function LunarConditions({
  locale,
  messages,
  plan,
  timeZone,
}: Readonly<{
  locale: PublishedLocale;
  messages: ObservationConditionsMessages;
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
    </section>
  );
}
