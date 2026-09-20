"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SavedObservationPlanMessages } from "../lib/i18n/messages/types";
import {
  SavedPlanStorageError,
  deleteSavedObservationPlan,
  getSavedObservationPlan,
} from "../lib/journal/database";
import type { SavedObservationPlan } from "../lib/observation/saved-plan";

type LoadedState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "loaded"; plan: SavedObservationPlan }>
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "invalid" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "corrupted" }>
  | Readonly<{ kind: "error" }>
  | Readonly<{ kind: "deleted" }>;

function formatInstant(instant: string, timeZone: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(new Date(instant), locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    timeZoneName: "short",
    year: "numeric",
  });
}

function formatNightDate(value: string, locale: PublishedLocale): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return formatLocaleDateTime(date, locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  });
}

function formatEvent(
  event:
    | SavedObservationPlan["planner"]["night"]["sunset"]
    | SavedObservationPlan["planner"]["target_events"]["rise"],
  timeZone: string,
  locale: PublishedLocale,
  messages: SavedObservationPlanMessages["events"],
): string {
  if (event.kind === "time") return formatInstant(event.instant_utc, timeZone, locale);
  if (event.kind === "circumpolar") return messages.circumpolar;
  if (event.kind === "never-rises") return messages.neverRises;
  if (event.kind === "not-during-night") return messages.notDuringNight;
  return messages.unavailable;
}

function classifyReadFailure(error: unknown): LoadedState {
  if (error instanceof SavedPlanStorageError) {
    if (error.reason === "invalid-plan") return { kind: "invalid" };
    if (error.reason === "storage-unavailable") return { kind: "unavailable" };
    if (error.reason === "storage-corrupted") return { kind: "corrupted" };
  }
  return { kind: "error" };
}

function EmptySavedPlanState({
  kind,
  messages,
}: Readonly<{
  kind: Exclude<LoadedState["kind"], "loaded" | "loading">;
  messages: SavedObservationPlanMessages;
}>) {
  const content = messages.states[kind === "error" ? "error" : kind];

  return (
    <section className="space-y-5">
      <h1 className="text-4xl font-semibold tracking-tight">{content.heading}</h1>
      <p className="max-w-2xl leading-7 text-[var(--muted)]">{content.body}</p>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline"
        href="/observe"
      >
        {messages.actions.openPlanner}
      </Link>
    </section>
  );
}

export function SavedObservationPlanView({
  locale,
  messages,
  savedId,
}: Readonly<{
  locale: PublishedLocale;
  messages: SavedObservationPlanMessages;
  savedId: string;
}>) {
  const [state, setState] = useState<LoadedState>({ kind: "loading" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getSavedObservationPlan(savedId)
      .then((plan) => {
        if (!cancelled) setState(plan === null ? { kind: "missing" } : { kind: "loaded", plan });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState(classifyReadFailure(error));
      });
    return () => {
      cancelled = true;
    };
  }, [savedId]);

  const deletePlan = useCallback(async () => {
    setDeleteError("");
    try {
      await deleteSavedObservationPlan(savedId);
      setState({ kind: "deleted" });
      setConfirmDelete(false);
    } catch {
      setDeleteError(messages.delete.failure);
    }
  }, [messages.delete.failure, savedId]);

  if (state.kind === "loading") {
    return (
      <section aria-live="polite" className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">{messages.loading.title}</h1>
        <p className="text-[var(--muted)]">{messages.loading.description}</p>
      </section>
    );
  }
  if (state.kind !== "loaded") {
    return <EmptySavedPlanState kind={state.kind} messages={messages} />;
  }

  const { plan } = state;
  const selected = plan.planner.selected;
  const max = plan.planner.max_during_darkness;
  const source = plan.coordinate_source;
  const repeatHref = `/observe?object=${encodeURIComponent(plan.target.slug)}&date=${encodeURIComponent(plan.night_date)}`;

  return (
    <article className="space-y-9">
      <header className="space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {plan.target.canonical_name}
        </h1>
        <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">
          {messages.snapshotDescription}
        </p>
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.snapshotSummary, {
            nightDate: formatNightDate(plan.night_date, locale),
            savedAt: formatInstant(plan.created_at, plan.time_zone, locale),
            timeZone: plan.time_zone,
          })}
        </p>
      </header>

      <section aria-labelledby="saved-observer-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="saved-observer-heading">
          {messages.observer.title}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {messages.observer.locationLabel}
            </p>
            <p className="mt-2 font-mono text-sm">
              {formatMessageTemplate(messages.observer.locationValue, {
                latitude: formatLocaleNumber(plan.observer.latitude_deg, locale, {
                  maximumFractionDigits: 6,
                  minimumFractionDigits: 6,
                }),
                longitude: formatLocaleNumber(plan.observer.longitude_deg, locale, {
                  maximumFractionDigits: 6,
                  minimumFractionDigits: 6,
                }),
              })}
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {messages.observer.storedLocal}
            </p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {messages.observer.selectedTimeLabel}
            </p>
            <p className="mt-2 text-sm">
              {formatInstant(plan.selected_time_utc, plan.time_zone, locale)}
            </p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              {messages.observer.skyPositionLabel}
            </p>
            <p className="mt-2 font-mono text-sm">
              {formatMessageTemplate(messages.observer.altitudeValue, {
                altitude: formatLocaleNumber(selected.position.altitude_deg, locale, {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                }),
              })}
            </p>
            <p className="mt-1 font-mono text-sm">
              {formatMessageTemplate(messages.observer.azimuthValue, {
                azimuth: formatLocaleNumber(selected.position.azimuth_deg, locale, {
                  maximumFractionDigits: 1,
                  minimumFractionDigits: 1,
                }),
                compass: selected.position.compass,
              })}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="saved-night-heading" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="saved-night-heading">
          {messages.night.title}
        </h2>
        {max !== null ? (
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.night.highestAltitude, {
              altitude: formatLocaleNumber(max.altitude_deg, locale, {
                maximumFractionDigits: 1,
                minimumFractionDigits: 1,
              }),
              instant: formatInstant(max.instant_utc, plan.time_zone, locale),
            })}
          </p>
        ) : (
          <p className="leading-7 text-[var(--muted)]">{messages.night.darknessUnavailable}</p>
        )}
        <dl className="grid gap-3 sm:grid-cols-3">
          {(
            [
              [messages.events.rise, plan.planner.target_events.rise],
              [messages.events.transit, plan.planner.target_events.transit],
              [messages.events.set, plan.planner.target_events.set],
            ] as const
          ).map(([label, event]) => (
            <div
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
              key={label}
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {label}
              </dt>
              <dd className="mt-2 text-sm">
                {formatEvent(event, plan.time_zone, locale, messages.events)}
              </dd>
            </div>
          ))}
        </dl>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              [messages.events.sunsetGeometric, plan.planner.night.sunset],
              [messages.events.astronomicalDusk, plan.planner.night.astronomical_dusk],
              [messages.events.astronomicalDawn, plan.planner.night.astronomical_dawn],
              [messages.events.sunriseGeometric, plan.planner.night.sunrise],
            ] as const
          ).map(([label, event]) => (
            <div
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] p-4"
              key={label}
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {label}
              </dt>
              <dd className="mt-2 text-sm">
                {formatEvent(event, plan.time_zone, locale, messages.events)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="saved-samples-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="saved-samples-heading">
          {messages.samples.title}
        </h2>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table
            aria-label={messages.samples.label}
            className="w-full min-w-[30rem] text-left text-sm"
          >
            <thead className="bg-[var(--background-raised)]">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  {messages.samples.savedInstant}
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  {messages.samples.altitudeGeometric}
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.planner.altitude_samples.map((sample) => (
                <tr className="border-t border-[var(--border)]" key={sample.instant_utc}>
                  <td className="px-4 py-3">
                    {formatInstant(sample.instant_utc, plan.time_zone, locale)}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {formatLocaleNumber(sample.altitude_deg, locale, {
                      maximumFractionDigits: 1,
                      minimumFractionDigits: 1,
                    })}
                    °
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        aria-labelledby="saved-source-heading"
        className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 className="text-xl font-semibold" id="saved-source-heading">
          {messages.source.title}
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.source.datasetSummary, {
            datasetName: source.dataset_name,
            providerName: source.provider_name,
            referenceEpoch: formatLocaleNumber(source.reference_epoch, locale, {
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            }),
            referenceEpochLabel: messages.source.referenceEpochLabel,
            releaseVersion: source.dataset_release_version,
            sourceRecordId: source.source_record_id,
            sourceRecordLabel: messages.source.sourceRecordLabel,
          })}
        </p>
        <p className="leading-7 text-[var(--muted)]">
          astronomy-engine {plan.model.astronomy_engine_version} ·{" "}
          {formatMessageTemplate(messages.source.calculationDescription, {
            solarAltitude: formatLocaleNumber(
              plan.model.astronomical_darkness_solar_altitude_deg,
              locale,
            ),
          })}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href={repeatHref}
        >
          {messages.actions.planAgain}
        </Link>
        <button
          className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          {messages.actions.deletePlan}
        </button>
      </div>

      {confirmDelete ? (
        <section
          aria-labelledby="delete-saved-plan-heading"
          className="rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] p-4"
        >
          <h2 className="text-lg font-semibold" id="delete-saved-plan-heading">
            {messages.delete.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {messages.delete.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
              onClick={() => void deletePlan()}
              type="button"
            >
              {messages.actions.confirmDelete}
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
              onClick={() => setConfirmDelete(false)}
              type="button"
            >
              {messages.actions.cancelDelete}
            </button>
          </div>
        </section>
      ) : null}
      {deleteError !== "" ? (
        <p className="text-sm text-[var(--focus)]" role="alert">
          {deleteError}
        </p>
      ) : null}
    </article>
  );
}
