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
  clearNovaLuminaOfflineCopies,
  readApproximateBrowserStorage,
  type ApproximateBrowserStorage,
} from "../lib/pwa-storage";
import styles from "./trust-surfaces.module.css";

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
      const result = await clearNovaLuminaOfflineCopies();
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
    <div className={styles.storage}>
      <section aria-labelledby="browser-storage-heading" className={styles.storageOverview}>
        <h2 id="browser-storage-heading">{messages.approximate.heading}</h2>
        {estimate === null ? (
          <p>{messages.approximate.checking}</p>
        ) : estimate.kind === "available" ? (
          <p>
            {formatMessageTemplate(messages.approximate.available, {
              quota: formatMib(estimate.quotaBytes, locale),
              usage: formatMib(estimate.usageBytes, locale),
            })}
          </p>
        ) : estimate.kind === "unsupported" ? (
          <p>{messages.approximate.unsupported}</p>
        ) : (
          <p>{messages.approximate.unavailable}</p>
        )}
      </section>

      <div className={styles.storageSections}>
        <section aria-labelledby="offline-copies-heading" className={styles.storageSection}>
          <h2 id="offline-copies-heading">{messages.offlineCopies.heading}</h2>
          <p>{messages.offlineCopies.description}</p>
          <p className={styles.separation}>{messages.offlineCopies.separationNotice}</p>
          <div className={styles.actions}>
            <button
              className={styles.dangerAction}
              onClick={() => setConfirmClearCaches(true)}
              type="button"
            >
              {messages.offlineCopies.clearAction}
            </button>
          </div>
          {confirmClearCaches ? (
            <div className={styles.confirmation}>
              <p>{messages.offlineCopies.confirmDescription}</p>
              <div className={styles.actions}>
                <button
                  className={styles.dangerAction}
                  onClick={() => void clearCaches()}
                  type="button"
                >
                  {messages.offlineCopies.confirmAction}
                </button>
                <button
                  className={styles.cancelAction}
                  onClick={() => setConfirmClearCaches(false)}
                  type="button"
                >
                  {messages.cancelAction}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="personal-data-heading" className={styles.storageSection}>
          <h2 id="personal-data-heading">{messages.personal.heading}</h2>
          <p>{messages.personal.description}</p>
          {personal.kind === "loading" ? (
            <p>{messages.personal.checking}</p>
          ) : personal.kind === "unavailable" ? (
            <p>{messages.personal.unavailable}</p>
          ) : (
            <ul className={styles.counts}>
              <li>
                {formatCountMessage(messages.personal.savedPlans, personal.savedPlans, locale)}
              </li>
              <li>
                {formatCountMessage(
                  messages.personal.journalEntries,
                  personal.journalEntries,
                  locale,
                )}
              </li>
            </ul>
          )}
          <p className={styles.separation}>{messages.personal.separateStoresNotice}</p>
          <div className={styles.actions}>
            <button
              className={styles.dangerAction}
              disabled={personal.kind !== "available" || savedPlanCount === 0}
              onClick={() => setConfirmDeletePlans(true)}
              type="button"
            >
              {messages.personal.deleteAction}
            </button>
            <Link className={styles.actionLink} href="/journal">
              {messages.personal.manageJournal}
            </Link>
          </div>
          {confirmDeletePlans ? (
            <div className={styles.confirmation}>
              <p>{messages.personal.confirmDescription}</p>
              <div className={styles.actions}>
                <button
                  className={styles.dangerAction}
                  onClick={() => void deletePlans()}
                  type="button"
                >
                  {messages.personal.confirmAction}
                </button>
                <button
                  className={styles.cancelAction}
                  onClick={() => setConfirmDeletePlans(false)}
                  type="button"
                >
                  {messages.cancelAction}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      {actionStatus !== "" ? (
        <p className={styles.feedback} role="status">
          {actionStatus}
        </p>
      ) : null}
      {actionError !== "" ? (
        <p className={`${styles.feedback} ${styles.error}`} role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
