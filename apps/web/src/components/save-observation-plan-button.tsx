"use client";

import { useCallback, useState } from "react";

import type { EntityType } from "@lumina/api-client";

import { SavedPlanStorageError, putSavedObservationPlan } from "../lib/journal/database";
import type { ObservationPlan } from "../lib/observation/domain";
import { createSavedObservationPlan } from "../lib/observation/saved-plan";

type SaveObservationPlanButtonProps = Readonly<{
  nightDate: string;
  plan: ObservationPlan;
  target: Readonly<{
    entityId: string;
    slug: string;
    canonicalName: string;
    entityType: EntityType;
  }>;
  timeZone: string;
}>;

type SaveState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "saving" }>
  | Readonly<{ id: string; kind: "saved" }>
  | Readonly<{ kind: "error"; message: string }>;

function saveFailureMessage(error: unknown): string {
  if (error instanceof SavedPlanStorageError) {
    if (error.reason === "plan-limit") {
      return "This browser already has 50 saved plans. Delete one before saving another.";
    }
    if (error.reason === "quota-exceeded") {
      return "This browser does not have enough local storage space to save another plan.";
    }
    if (error.reason === "storage-corrupted") {
      return "Saved-plan storage could not be read safely. Existing local data was not changed.";
    }
    if (error.reason === "storage-unavailable") {
      return "This browser is not allowing Lumina to store saved plans right now.";
    }
  }
  return "Lumina could not save this plan locally. Nothing was sent to the server.";
}

export function SaveObservationPlanButton({
  nightDate,
  plan,
  target,
  timeZone,
}: SaveObservationPlanButtonProps) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const savePlan = useCallback(async () => {
    if (state.kind === "saving") return;
    if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
      setState({
        kind: "error",
        message: "This browser cannot create a safe local identifier for the saved plan.",
      });
      return;
    }

    setState({ kind: "saving" });
    const createdAt = new Date().toISOString();
    try {
      const saved = createSavedObservationPlan({
        createdAt,
        id: crypto.randomUUID(),
        nightDate,
        plan,
        target,
        timeZone,
      });
      await putSavedObservationPlan(saved);
      setState({ id: saved.id, kind: "saved" });
    } catch (error) {
      setState({ kind: "error", message: saveFailureMessage(error) });
    }
  }, [nightDate, plan, state.kind, target, timeZone]);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] p-4">
      <h3 className="text-base font-semibold">Keep this plan on this device</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
        Saving this plan stores the exact observer coordinates, selected time, target, calculated
        geometry, and source context only in this browser. Lumina does not send this saved plan to
        the server or put the coordinates in its URL.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] disabled:cursor-wait disabled:opacity-70"
          disabled={state.kind === "saving"}
          onClick={() => void savePlan()}
          type="button"
        >
          {state.kind === "saving" ? "Saving plan…" : "Save plan"}
        </button>
        {state.kind === "saved" ? (
          <a
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--link)] underline"
            href={`/observe?saved=${state.id}`}
          >
            Open saved plan
          </a>
        ) : null}
      </div>
      {state.kind === "saved" ? (
        <p className="mt-3 text-sm text-[var(--muted)]" role="status">
          Saved locally in this browser. The saved view is a snapshot, not a future recomputation.
        </p>
      ) : null}
      {state.kind === "error" ? (
        <p className="mt-3 text-sm text-[var(--focus)]" role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
