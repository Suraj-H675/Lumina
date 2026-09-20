"use client";

import { useCallback, useState } from "react";

import type { EntityType } from "@lumina/api-client";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { SaveObservationPlanMessages } from "../lib/i18n/messages/types";
import { SavedPlanStorageError, putSavedObservationPlan } from "../lib/journal/database";
import type { ObservationPlan } from "../lib/observation/domain";
import {
  createSavedObservationPlan,
  MAX_SAVED_OBSERVATION_PLANS,
} from "../lib/observation/saved-plan";

type SaveObservationPlanButtonProps = Readonly<{
  locale: PublishedLocale;
  messages: SaveObservationPlanMessages;
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

function saveFailureMessage(
  error: unknown,
  locale: PublishedLocale,
  messages: SaveObservationPlanMessages["failures"],
): string {
  if (error instanceof SavedPlanStorageError) {
    if (error.reason === "plan-limit") {
      return formatMessageTemplate(messages.planLimit, {
        count: formatLocaleNumber(MAX_SAVED_OBSERVATION_PLANS, locale),
      });
    }
    if (error.reason === "quota-exceeded") {
      return messages.quotaExceeded;
    }
    if (error.reason === "storage-corrupted") {
      return messages.storageCorrupted;
    }
    if (error.reason === "storage-unavailable") {
      return messages.storageUnavailable;
    }
  }
  return messages.generic;
}

export function SaveObservationPlanButton({
  locale,
  messages,
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
        message: messages.failures.identifierUnavailable,
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
      setState({ kind: "error", message: saveFailureMessage(error, locale, messages.failures) });
    }
  }, [locale, messages.failures, nightDate, plan, state.kind, target, timeZone]);

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] p-4">
      <h3 className="text-base font-semibold">{messages.title}</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{messages.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] disabled:cursor-wait disabled:opacity-70"
          disabled={state.kind === "saving"}
          onClick={() => void savePlan()}
          type="button"
        >
          {state.kind === "saving" ? messages.savingAction : messages.saveAction}
        </button>
        {state.kind === "saved" ? (
          <a
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--link)] underline"
            href={`/observe?saved=${state.id}`}
          >
            {messages.openSavedPlan}
          </a>
        ) : null}
      </div>
      {state.kind === "saved" ? (
        <p className="mt-3 text-sm text-[var(--muted)]" role="status">
          {messages.savedStatus}
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
