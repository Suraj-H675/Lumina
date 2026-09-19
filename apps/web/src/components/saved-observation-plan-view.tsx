"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

function formatInstant(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone,
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(instant));
}

function formatEvent(
  event:
    | SavedObservationPlan["planner"]["night"]["sunset"]
    | SavedObservationPlan["planner"]["target_events"]["rise"],
  timeZone: string,
): string {
  if (event.kind === "time") return formatInstant(event.instant_utc, timeZone);
  if (event.kind === "circumpolar") return "Circumpolar from the saved latitude";
  if (event.kind === "never-rises") return "Never rises from the saved latitude";
  if (event.kind === "not-during-night") return "No event during the saved observing night";
  return "Unavailable in the saved calculation";
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
}: Readonly<{ kind: Exclude<LoadedState["kind"], "loaded" | "loading"> }>) {
  const content =
    kind === "deleted"
      ? {
          heading: "Saved plan deleted",
          body: "This local snapshot was removed from this browser. Other Lumina personal data was not cleared.",
        }
      : kind === "missing"
        ? {
            heading: "Saved plan not found",
            body: "This browser does not have a saved plan with that local identifier. Lumina did not substitute another plan.",
          }
        : kind === "invalid"
          ? {
              heading: "Saved plan address is invalid",
              body: "The local saved-plan identifier is malformed, so Lumina did not query IndexedDB for another record.",
            }
          : kind === "unavailable"
            ? {
                heading: "Saved plans are unavailable",
                body: "This browser is not allowing Lumina to read its local IndexedDB storage right now.",
              }
            : kind === "corrupted"
              ? {
                  heading: "Saved plan storage could not be trusted",
                  body: "The stored record failed validation. Lumina left the local data untouched instead of guessing or repairing it silently.",
                }
              : {
                  heading: "Saved plan could not be read",
                  body: "Lumina could not read this local snapshot. No replacement calculation was created.",
                };

  return (
    <section className="space-y-5">
      <h1 className="text-4xl font-semibold tracking-tight">{content.heading}</h1>
      <p className="max-w-2xl leading-7 text-[var(--muted)]">{content.body}</p>
      <Link
        className="inline-flex min-h-11 items-center text-[var(--link)] underline"
        href="/observe"
      >
        Open observation planner
      </Link>
    </section>
  );
}

export function SavedObservationPlanView({ savedId }: Readonly<{ savedId: string }>) {
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
      setDeleteError("Lumina could not delete this saved plan. The local record may still exist.");
    }
  }, [savedId]);

  if (state.kind === "loading") {
    return (
      <section aria-live="polite" className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Loading saved plan…</h1>
        <p className="text-[var(--muted)]">Reading this browser&apos;s local IndexedDB snapshot.</p>
      </section>
    );
  }
  if (state.kind !== "loaded") return <EmptySavedPlanState kind={state.kind} />;

  const { plan } = state;
  const selected = plan.planner.selected;
  const max = plan.planner.max_during_darkness;
  const source = plan.coordinate_source;
  const repeatHref = `/observe?object=${encodeURIComponent(plan.target.slug)}&date=${encodeURIComponent(plan.night_date)}`;

  return (
    <article className="space-y-9">
      <header className="space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Saved observation plan
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {plan.target.canonical_name}
        </h1>
        <p className="max-w-3xl text-lg leading-8 text-[var(--muted)]">
          This is a saved snapshot, not a current recomputation. It preserves the exact local
          inputs, source context, and deterministic result from when you chose Save plan.
        </p>
        <p className="text-sm text-[var(--muted)]">
          Saved{" "}
          <time dateTime={plan.created_at}>{formatInstant(plan.created_at, plan.time_zone)}</time>
          {" · "}night of {plan.night_date} · {plan.time_zone}
        </p>
      </header>

      <section aria-labelledby="saved-observer-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="saved-observer-heading">
          Saved observer and selected instant
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Location
            </p>
            <p className="mt-2 font-mono text-sm">
              {plan.observer.latitude_deg.toFixed(6)}°, {plan.observer.longitude_deg.toFixed(6)}°
            </p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Stored only in this browser.
            </p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Selected time
            </p>
            <p className="mt-2 text-sm">{formatInstant(plan.selected_time_utc, plan.time_zone)}</p>
          </div>
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
              Sky position
            </p>
            <p className="mt-2 font-mono text-sm">
              Altitude {selected.position.altitude_deg.toFixed(1)}°
            </p>
            <p className="mt-1 font-mono text-sm">
              Azimuth {selected.position.azimuth_deg.toFixed(1)}° · {selected.position.compass}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="saved-night-heading" className="space-y-4">
        <h2 className="text-2xl font-semibold" id="saved-night-heading">
          Saved night geometry
        </h2>
        {max !== null ? (
          <p className="leading-7 text-[var(--muted)]">
            Highest sampled altitude during astronomical darkness: {max.altitude_deg.toFixed(1)}° at{" "}
            {formatInstant(max.instant_utc, plan.time_zone)}.
          </p>
        ) : (
          <p className="leading-7 text-[var(--muted)]">
            Astronomical darkness was unavailable in this saved calculation.
          </p>
        )}
        <dl className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["Rise", plan.planner.target_events.rise],
              ["Transit", plan.planner.target_events.transit],
              ["Set", plan.planner.target_events.set],
            ] as const
          ).map(([label, event]) => (
            <div
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
              key={label}
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {label}
              </dt>
              <dd className="mt-2 text-sm">{formatEvent(event, plan.time_zone)}</dd>
            </div>
          ))}
        </dl>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Sunset · geometric", plan.planner.night.sunset],
              ["Astronomical dusk", plan.planner.night.astronomical_dusk],
              ["Astronomical dawn", plan.planner.night.astronomical_dawn],
              ["Sunrise · geometric", plan.planner.night.sunrise],
            ] as const
          ).map(([label, event]) => (
            <div
              className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] p-4"
              key={label}
            >
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                {label}
              </dt>
              <dd className="mt-2 text-sm">{formatEvent(event, plan.time_zone)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="saved-samples-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="saved-samples-heading">
          Saved altitude samples
        </h2>
        <div className="overflow-x-auto rounded-md border border-[var(--border)]">
          <table
            aria-label="Saved altitude samples"
            className="w-full min-w-[30rem] text-left text-sm"
          >
            <thead className="bg-[var(--background-raised)]">
              <tr>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Saved instant
                </th>
                <th className="px-4 py-3 font-semibold" scope="col">
                  Altitude · geometric
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.planner.altitude_samples.map((sample) => (
                <tr className="border-t border-[var(--border)]" key={sample.instant_utc}>
                  <td className="px-4 py-3">{formatInstant(sample.instant_utc, plan.time_zone)}</td>
                  <td className="px-4 py-3 font-mono">{sample.altitude_deg.toFixed(1)}°</td>
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
          Source and calculation snapshot
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          {source.provider_name} · {source.dataset_name} ({source.dataset_release_version}) · source
          record <span className="font-mono">{source.source_record_id}</span> · reference epoch J
          {source.reference_epoch.toFixed(1)}.
        </p>
        <p className="leading-7 text-[var(--muted)]">
          astronomy-engine {plan.model.astronomy_engine_version} · geometric topocentric calculation
          · no refraction · astronomical darkness at solar altitude −18°.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center text-[var(--link)] underline"
          href={repeatHref}
        >
          Plan this target again
        </Link>
        <button
          className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
          onClick={() => setConfirmDelete(true)}
          type="button"
        >
          Delete saved plan
        </button>
      </div>

      {confirmDelete ? (
        <section
          aria-labelledby="delete-saved-plan-heading"
          className="rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] p-4"
        >
          <h2 className="text-lg font-semibold" id="delete-saved-plan-heading">
            Delete this local snapshot?
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            This removes only this saved plan from this browser. It does not clear journal entries,
            other saved plans, or offline page copies.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
              onClick={() => void deletePlan()}
              type="button"
            >
              Confirm delete
            </button>
            <button
              className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
              onClick={() => setConfirmDelete(false)}
              type="button"
            >
              Cancel
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
