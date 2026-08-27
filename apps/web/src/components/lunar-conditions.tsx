"use client";

import { useMemo } from "react";

import {
  computeLunarConditions,
  formatIlluminationPercentage,
  type LunarConditions,
} from "../lib/observation/lunar";
import type { ObservationPlan } from "../lib/observation/domain";

function formatTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(instant);
}

function formatAltitude(altitude: number): string {
  return `${altitude.toFixed(1)}°`;
}

function formatAzimuth(azimuth: number, compass: string): string {
  return `${azimuth.toFixed(1)}° · ${compass}`;
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
  plan,
  timeZone,
}: Readonly<{ plan: ObservationPlan; timeZone: string }>) {
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
          Lunar conditions
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--muted)]">
          Calculated for the same observer and selected instant as the target position. Illumination
          is the fraction of the Moon&apos;s visible disk lit by the Sun; it is not a sky-brightness
          estimate.
        </p>
      </div>
      {lunar === null ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4 text-sm text-[var(--muted)]">
          Lunar calculation unavailable for this selected instant. The target geometry remains
          available.
        </p>
      ) : (
        <>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4">
            <h4 className="text-base font-semibold text-[var(--foreground)]">
              Moon at selected time
            </h4>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {metricCard(
                "Illumination",
                formatIlluminationPercentage(lunar.selected.illuminationFraction),
                lunar.selected.phaseLabel,
              )}
              {metricCard(
                "Moon altitude",
                formatAltitude(lunar.selected.position.altitude),
                lunar.selected.position.altitude < 0
                  ? "Below geometric horizon"
                  : "Above geometric horizon",
              )}
              {metricCard(
                "Moon azimuth",
                formatAzimuth(lunar.selected.position.azimuth, lunar.selected.position.compass),
                "0° north, eastward",
              )}
              {metricCard(
                "Target separation",
                `${lunar.selected.targetSeparationDegrees.toFixed(1)}°`,
                "Angular distance from the target",
              )}
            </dl>
            <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
              At {formatTime(plan.selected.instant, timeZone)}, the Moon is{" "}
              {formatAltitude(Math.abs(lunar.selected.position.altitude))}{" "}
              {lunar.selected.position.altitude < 0 ? "below" : "above"} the geometric horizon and{" "}
              {lunar.selected.targetSeparationDegrees.toFixed(1)}° from the target.
            </p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4">
            <h4 className="text-base font-semibold text-[var(--foreground)]">
              Closest target–Moon separation during astronomical darkness
            </h4>
            <p className="mt-2 text-xl font-medium text-[var(--foreground)]">
              {lunar.minimumSeparationDuringDarkness === null
                ? "Not applicable"
                : `${lunar.minimumSeparationDuringDarkness.toFixed(1)}°`}
            </p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              {lunar.minimumSeparationDuringDarkness === null
                ? "No astronomical-darkness interval or valid sample was available for this night."
                : "Minimum angular distance found among the planner’s bounded samples in astronomical darkness."}
            </p>
          </div>
          <p className="text-xs leading-5 text-[var(--muted)]">
            Model: Astronomy Engine 2.1.19. Moon position is topocentric for this observer; altitude
            is geometric with no atmospheric refraction.
          </p>
        </>
      )}
    </section>
  );
}

export function LunarConditions({
  plan,
  timeZone,
}: Readonly<{ plan: ObservationPlan; timeZone: string }>) {
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
    </section>
  );
}
