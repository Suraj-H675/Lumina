"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

function formatMib(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function OfflineStorageManager() {
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
        `Cleared ${result.deleted} Lumina cache stores. Personal browser data was not deleted.`,
      );
    } catch {
      setActionError(
        "Lumina could not clear its offline copies. Saved plans and journal data were not changed.",
      );
    }
  }, []);

  const deletePlans = useCallback(async () => {
    setActionError("");
    setActionStatus("");
    const count = personal.kind === "available" ? personal.savedPlans : 0;
    try {
      await clearSavedObservationPlans();
      await refreshPersonalSummary();
      setConfirmDeletePlans(false);
      setActionStatus(
        `Deleted ${plural(count, "saved observation plan")}. Journal entries and offline copies were not deleted.`,
      );
    } catch {
      setActionError(
        "Lumina could not delete the saved plans. Offline copies and journal data were not changed.",
      );
    }
  }, [personal, refreshPersonalSummary]);

  const savedPlanCount = personal.kind === "available" ? personal.savedPlans : 0;

  return (
    <div className="space-y-8">
      <section aria-labelledby="browser-storage-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="browser-storage-heading">
          Approximate browser storage
        </h2>
        {estimate === null ? (
          <p className="text-[var(--muted)]">Checking the browser&apos;s storage estimate…</p>
        ) : estimate.kind === "available" ? (
          <p className="leading-7 text-[var(--muted)]">
            Approximately {formatMib(estimate.usageBytes)} MiB used of a{" "}
            {formatMib(estimate.quotaBytes)} MiB origin quota. This is an origin-wide estimate from
            the browser, not an exact measurement of Lumina&apos;s offline cache or personal data.
          </p>
        ) : estimate.kind === "unsupported" ? (
          <p className="leading-7 text-[var(--muted)]">
            This browser does not expose an origin-wide storage estimate. Lumina does not request
            persistent-storage permission automatically.
          </p>
        ) : (
          <p className="leading-7 text-[var(--muted)]">
            The browser could not provide its approximate origin-wide usage and quota right now.
          </p>
        )}
      </section>

      <section
        aria-labelledby="offline-copies-heading"
        className="space-y-4 rounded-md border border-[var(--border)] bg-[var(--surface)] p-5"
      >
        <h2 className="text-2xl font-semibold" id="offline-copies-heading">
          Offline copies
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          CacheStorage holds Lumina&apos;s visited offline pages, static app assets, and offline
          metadata. Cache storage is not a backup: the browser or operating system may evict it.
        </p>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Clearing these copies does not delete saved observation plans, journal entries,
          collections, or learning progress.
        </p>
        <button
          className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
          onClick={() => setConfirmClearCaches(true)}
          type="button"
        >
          Clear offline copies
        </button>
        {confirmClearCaches ? (
          <div className="space-y-3 rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] p-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              Lumina will delete only cache names it owns. Pages may need to be visited online again
              before they work offline.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
                onClick={() => void clearCaches()}
                type="button"
              >
                Confirm clear offline copies
              </button>
              <button
                className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
                onClick={() => setConfirmClearCaches(false)}
                type="button"
              >
                Cancel
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
          Personal browser data
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Saved observation plans and journal entries live in IndexedDB, separately from offline
          page copies. Saved plans can contain the exact observer coordinates you explicitly chose
          to store.
        </p>
        {personal.kind === "loading" ? (
          <p className="text-sm text-[var(--muted)]">Checking local IndexedDB…</p>
        ) : personal.kind === "unavailable" ? (
          <p className="text-sm text-[var(--muted)]">
            Lumina cannot safely read the local personal-data counts right now. No data was changed.
          </p>
        ) : (
          <ul className="space-y-1 text-sm text-[var(--muted)]">
            <li>{plural(personal.savedPlans, "saved observation plan")}</li>
            <li>{plural(personal.journalEntries, "journal entry", "journal entries")}</li>
          </ul>
        )}
        <p className="text-sm leading-6 text-[var(--muted)]">
          Collections and learning progress use separate local browser stores and are not counted in
          the IndexedDB summary above. Neither action on this page deletes them.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold disabled:opacity-60"
            disabled={personal.kind !== "available" || savedPlanCount === 0}
            onClick={() => setConfirmDeletePlans(true)}
            type="button"
          >
            Delete all saved plans
          </button>
          <Link
            className="inline-flex min-h-11 items-center text-sm text-[var(--link)] underline"
            href="/journal"
          >
            Manage journal entries
          </Link>
        </div>
        {confirmDeletePlans ? (
          <div className="space-y-3 rounded-md border border-[var(--border-strong)] bg-[var(--background-raised)] p-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              Delete every saved observation plan from this browser? Journal entries and offline
              copies remain separate and will not be cleared.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-md border border-[var(--border-strong)] px-4 text-sm font-semibold"
                onClick={() => void deletePlans()}
                type="button"
              >
                Confirm delete saved plans
              </button>
              <button
                className="min-h-11 rounded-md border border-[var(--border)] px-4 text-sm"
                onClick={() => setConfirmDeletePlans(false)}
                type="button"
              >
                Cancel
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
