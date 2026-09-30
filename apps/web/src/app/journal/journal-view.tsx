"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  formatCountMessage,
  formatLocaleDateTime,
  formatLocaleList,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { JournalMessages } from "../../lib/i18n/messages/types";
import {
  deleteJournalEntry,
  listJournalEntries,
  type JournalStorageError,
} from "../../lib/journal/database";
import type { JournalEntry } from "../../lib/journal/model";
import { JournalTransferControls } from "./journal-transfer-controls";
import styles from "./journal-view.module.css";

type JournalUiState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ entries: JournalEntry[]; kind: "ready" }>
  | Readonly<{ kind: "error"; message: string }>;

export function JournalView({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: JournalMessages }>) {
  const [state, setState] = useState<JournalUiState>({ kind: "loading" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const reloadJournal = useCallback(async () => {
    try {
      const entries = await listJournalEntries();
      setState({ entries, kind: "ready" });
    } catch (error) {
      setState({ kind: "error", message: journalLoadMessage(error, messages.failures) });
    }
  }, [messages.failures]);

  useEffect(() => {
    let cancelled = false;
    void listJournalEntries()
      .then((entries) => {
        if (!cancelled) setState({ entries, kind: "ready" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: journalLoadMessage(error, messages.failures) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [messages.failures]);

  async function remove(entryId: string) {
    try {
      await deleteJournalEntry(entryId);
      const entries = await listJournalEntries();
      setDeleteConfirmId(null);
      setState({ entries, kind: "ready" });
    } catch (error) {
      setState({ kind: "error", message: journalLoadMessage(error, messages.failures) });
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <div className={styles.heroAside}>
          <p className={styles.intro}>{messages.intro}</p>
          <p className={styles.privacy}>{messages.privacyDetail}</p>
          <div className={styles.heroActions}>
            <Link className={styles.textAction} href="/identify">
              {messages.identifyAnotherImage}
            </Link>
          </div>
        </div>
      </header>

      <JournalTransferControls
        locale={locale}
        messages={messages.transfer}
        onImported={() => void reloadJournal()}
      />

      {state.kind === "loading" ? (
        <p className={styles.statusMessage} role="status">
          {messages.loading}
        </p>
      ) : state.kind === "error" ? (
        <section className={styles.statePanel} role="alert">
          <h2>{messages.states.unavailableTitle}</h2>
          <p>{state.message}</p>
        </section>
      ) : state.entries.length === 0 ? (
        <section className={styles.statePanel}>
          <h2>{messages.states.emptyTitle}</h2>
          <p>{messages.states.emptyDescription}</p>
        </section>
      ) : (
        <section aria-labelledby="journal-entries-heading" className={styles.entriesSection}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{messages.states.entriesTitle}</p>
            <h2 className={styles.sectionTitle} id="journal-entries-heading">
              {messages.states.entriesTitle}
            </h2>
          </div>
          <div className={styles.entries}>
            {state.entries.map((entry) => (
              <JournalEntryCard
                deleting={deleteConfirmId === entry.id}
                entry={entry}
                key={entry.id}
                locale={locale}
                messages={messages.entries}
                onCancelDelete={() => setDeleteConfirmId(null)}
                onConfirmDelete={() => void remove(entry.id)}
                onRequestDelete={() => setDeleteConfirmId(entry.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function JournalEntryCard({
  deleting,
  entry,
  locale,
  messages,
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
}: Readonly<{
  deleting: boolean;
  entry: JournalEntry;
  locale: PublishedLocale;
  messages: JournalMessages["entries"];
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
}>) {
  return (
    <article className={styles.entry}>
      <div className={styles.entryRail}>
        <p className={styles.entryStamp}>
          {formatMessageTemplate(messages.savedAt, {
            timestamp: formatTimestamp(entry.created_at, locale),
          })}
        </p>
        <h3 className={styles.entryTitle}>{entry.title}</h3>
        <p className={styles.entryId}>
          {messages.entryIdLabel} <code>{entry.id}</code>
        </p>
      </div>

      <div className={styles.entryBody}>
        <dl className={styles.metrics}>
          <Metric
            label={messages.observationTimeLabel}
            value={
              entry.observed_time === null
                ? messages.notRecorded
                : formatTimestamp(entry.observed_time.utc, locale)
            }
          />
          <Metric label={messages.locationLabel} value={formatLocation(entry, locale, messages)} />
          <Metric
            label={messages.solvedCenterLabel}
            value={
              entry.plate_solve === null
                ? messages.noPlateSolve
                : formatMessageTemplate(messages.solvedCenterValue, {
                    dec: formatLocaleNumber(entry.plate_solve.center_dec_deg, locale, {
                      maximumFractionDigits: 6,
                      minimumFractionDigits: 6,
                    }),
                    ra: formatLocaleNumber(entry.plate_solve.center_ra_deg, locale, {
                      maximumFractionDigits: 6,
                      minimumFractionDigits: 6,
                    }),
                  })
            }
          />
          <Metric
            label={messages.coordinateFrameLabel}
            value={entry.plate_solve?.frame ?? messages.notRecorded}
          />
          <Metric
            label={messages.pixelScaleLabel}
            value={
              entry.plate_solve === null
                ? messages.notRecorded
                : formatMessageTemplate(messages.pixelScaleValue, {
                    value: formatLocaleNumber(entry.plate_solve.pixel_scale_arcsec, locale, {
                      maximumFractionDigits: 3,
                      minimumFractionDigits: 3,
                    }),
                  })
            }
          />
          <Metric
            label={messages.equipmentLabel}
            value={
              entry.equipment.length === 0
                ? messages.notRecorded
                : formatLocaleList(entry.equipment, locale)
            }
          />
          <Metric
            label={messages.localImageLabel}
            value={
              entry.attachment_ids.length === 0
                ? messages.localImageNotRetained
                : messages.localImageRetained
            }
          />
          <Metric
            label={messages.followUpLabel}
            value={entry.follow_up ? messages.followUpMarked : messages.followUpNotMarked}
          />
        </dl>

        {entry.objects.length > 0 ? (
          <div className={styles.entrySection}>
            <h4>{messages.savedObjectsTitle}</h4>
            <div>
              <ul className={styles.objectList} aria-label={messages.savedObjectsLabel}>
                {entry.objects.slice(0, 20).map((object) => (
                  <li key={`${object.source}:${object.entity_id ?? ""}:${object.name}`}>
                    {object.name}
                  </li>
                ))}
              </ul>
              {entry.objects.length > 20 ? (
                <p className={styles.moreObjects}>
                  {formatCountMessage(messages.moreSavedObjects, entry.objects.length - 20, locale)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {entry.conditions !== null && entry.conditions.length > 0 ? (
          <div className={styles.entrySection}>
            <h4>{messages.conditionsTitle}</h4>
            <p className="whitespace-pre-wrap">{entry.conditions}</p>
          </div>
        ) : null}
        {entry.notes.length > 0 ? (
          <div className={styles.entrySection}>
            <h4>{messages.notesTitle}</h4>
            <p className="whitespace-pre-wrap">{entry.notes}</p>
          </div>
        ) : null}

        {entry.plate_solve === null ? null : (
          <details className={styles.provenance}>
            <summary>{messages.plateSolveProvenance}</summary>
            <div className={styles.provenanceBody}>
              <p>
                {messages.solverVersionLabel} <code>{entry.plate_solve.solver_version}</code>
              </p>
              <p>
                {messages.wcsFingerprintLabel} <code>{entry.plate_solve.wcs_source_sha256}</code>
              </p>
              <p>
                {messages.snapshotIdLabel} <code>{entry.plate_solve.snapshot_id}</code>
              </p>
            </div>
          </details>
        )}

        <div className={styles.entryActions}>
          {deleting ? (
            <div
              className={styles.entryActions}
              role="group"
              aria-label={formatMessageTemplate(messages.deleteGroupLabel, { title: entry.title })}
            >
              <button className={styles.dangerAction} onClick={onConfirmDelete} type="button">
                {messages.confirmLocalDelete}
              </button>
              <button className={styles.secondaryAction} onClick={onCancelDelete} type="button">
                {messages.keepEntry}
              </button>
            </div>
          ) : (
            <button className={styles.dangerAction} onClick={onRequestDelete} type="button">
              {messages.deleteLocalEntry}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className={styles.metric}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatLocation(
  entry: JournalEntry,
  locale: PublishedLocale,
  messages: JournalMessages["entries"],
): string {
  if (entry.location === null) return messages.notRecorded;
  if (entry.location.latitude_deg === null || entry.location.longitude_deg === null) {
    return entry.location.label;
  }
  return formatMessageTemplate(messages.locationWithCoordinates, {
    label: entry.location.label,
    latitude: formatLocaleNumber(entry.location.latitude_deg, locale, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 4,
    }),
    longitude: formatLocaleNumber(entry.location.longitude_deg, locale, {
      maximumFractionDigits: 4,
      minimumFractionDigits: 4,
    }),
  });
}

function formatTimestamp(value: string, locale: PublishedLocale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : formatLocaleDateTime(date, locale, {
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
        minute: "2-digit",
        month: "short",
        second: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
        year: "numeric",
      });
}

function journalLoadMessage(error: unknown, messages: JournalMessages["failures"]): string {
  const reason =
    typeof error === "object" && error !== null && "reason" in error
      ? (error as JournalStorageError).reason
      : null;
  return reason === "storage-corrupted" ? messages.storageCorrupted : messages.storageUnavailable;
}
