"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { formatCountMessage, formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { OfflineMessages } from "../lib/i18n/messages/types";
import {
  clearSavedObservationPlans,
  listJournalEntries,
  listSavedObservationPlans,
} from "../lib/journal/database";
import {
  clearLuminaOfflineCopies,
  readApproximateBrowserStorage,
  type ApproximateBrowserStorage,
} from "../lib/pwa-storage";

type PersonalSummary =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ journalEntries: number; kind: "available"; savedPlans: number }>;

function formatMib(bytes: number, locale: PublishedLocale): string {
  return formatLocaleNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1 });
}

export function OfflineStorageManager({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: OfflineMessages["storage"] }>) {
  const [estimate, setEstimate] = useState<ApproximateBrowserStorage | null>(null);
  const [personal, setPersonal] = useState<PersonalSummary>({ kind: "loading" });
  const [confirmClearCaches, setConfirmClearCaches] = useState(false);
  const [confirmDeletePlans, setConfirmDeletePlans] = useState(false);
  const [actionStatus, setActionStatus] = useState("");
  const [actionError, setActionError] = useState("");

  const refreshPersonalSummary = useCallback(async (): Promise<void> => {
    try {
      const [plans, journal] = await Promise.all([
        listSavedObservationPlans(),
        listJournalEntries(),
      ]);
      setPersonal({
        journalEntries: journal.length,
        kind: "available",
        savedPlans: plans.length,
      });
    } catch {
      setPersonal({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readApproximateBrowserStorage().then((value) => {
      if (!cancelled) setEstimate(value);
    });
    void (async () => {
      try {
        const [plans, journal] = await Promise.all([
          listSavedObservationPlans(),
          listJournalEntries(),
        ]);
        if (!cancelled) {
          setPersonal({
            journalEntries: journal.length,
            kind: "available",
            savedPlans: plans.length,
          });
        }
      } catch {
        if (!cancelled) setPersonal({ kind: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearCaches = useCallback(async () => {
    setActionError("");
    setActionStatus("");
    try {
      const result = await clearLuminaOfflineCopies();
      setConfirmClearCaches(false);
      setActionStatus(
        formatCountMessage(messages.offlineCopies.clearSuccess, result.deleted, locale),
      );
    } catch {
      setActionError(messages.offlineCopies.clearFailure);
    }
  }, [locale, messages]);

  const deletePlans = useCallback(async () => {
    setActionError("");
    setActionStatus("");
    const count = personal.kind === "available" ? personal.savedPlans : 0;
    try {
      await clearSavedObservationPlans();
      await refreshPersonalSummary();
      setConfirmDeletePlans(false);
      setActionStatus(formatCountMessage(messages.personal.deleteSuccess, count, locale));
    } catch {
      setActionError(messages.personal.deleteFailure);
    }
  }, [locale, messages, personal, refreshPersonalSummary]);

  const savedPlanCount = personal.kind === "available" ? personal.savedPlans : 0;

  return (
    <div className="space-y-8">
      <section aria-labelledby="browser-storage-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="browser-storage-heading">
          {messages.approximate.heading}
        </h2>
        {estimate === null ? (
          <p className="text-[var(--muted)]">{messages.approximate.checking}</p>
        ) : estimate.kind === "available" ? (
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.approximate.available, {
              quota: formatMib(estimate.quotaBytes, locale),
              usage: formatMib(estimate.usageBytes, locale),
            })}
          </p>
        ) : estimate.kind === "unsupported" ? (
          <p className="leading-7 text-[var(--muted)]">{messages.approximate.unsupported}</p>
        ) : (
          <p className="leading-7 text-[var(--muted)]">{messages.approximate.unavailable}</p>
        )}
      </section>

      <section
        aria-labelledby="offline-copies-heading"
        className="space-y-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 className="text-2xl font-semibold" id="offline-copies-heading">
          {messages.offlineCopies.heading}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.offlineCopies.description}</p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          {messages.offlineCopies.separationNotice}
        </p>
        <button
          className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
          onClick={() => setConfirmClearCaches(true)}
          type="button"
        >
          {messages.offlineCopies.clearAction}
        </button>
        {confirmClearCaches ? (
          <div className="space-y-3 rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] p-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              {messages.offlineCopies.confirmDescription}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
                onClick={() => void clearCaches()}
                type="button"
              >
                {messages.offlineCopies.confirmAction}
              </button>
              <button
                className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
                onClick={() => setConfirmClearCaches(false)}
                type="button"
              >
                {messages.cancelAction}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="personal-data-heading"
        className="space-y-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 className="text-2xl font-semibold" id="personal-data-heading">
          {messages.personal.heading}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.personal.description}</p>
        {personal.kind === "loading" ? (
          <p className="text-sm text-[var(--muted)]">{messages.personal.checking}</p>
        ) : personal.kind === "unavailable" ? (
          <p className="text-sm text-[var(--muted)]">{messages.personal.unavailable}</p>
        ) : (
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            <li>{formatCountMessage(messages.personal.savedPlans, personal.savedPlans, locale)}</li>
            <li>
              {formatCountMessage(
                messages.personal.journalEntries,
                personal.journalEntries,
                locale,
              )}
            </li>
          </ul>
        )}
        <p className="text-sm leading-6 text-[var(--muted)]">
          {messages.personal.separateStoresNotice}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold disabled:opacity-60"
            disabled={personal.kind !== "available" || savedPlanCount === 0}
            onClick={() => setConfirmDeletePlans(true)}
            type="button"
          >
            {messages.personal.deleteAction}
          </button>
          <Link
            className="inline-flex min-h-11 items-center text-sm text-[var(--link)] underline"
            href="/journal"
          >
            {messages.personal.manageJournal}
          </Link>
        </div>
        {confirmDeletePlans ? (
          <div className="space-y-3 rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] p-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              {messages.personal.confirmDescription}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
                onClick={() => void deletePlans()}
                type="button"
              >
                {messages.personal.confirmAction}
              </button>
              <button
                className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
                onClick={() => setConfirmDeletePlans(false)}
                type="button"
              >
                {messages.cancelAction}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {actionStatus !== "" ? (
        <p className="text-sm text-[var(--muted)]" role="status">
          {actionStatus}
        </p>
      ) : null}
      {actionError !== "" ? (
        <p className="text-sm text-[var(--focus)]" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
