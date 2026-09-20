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
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{messages.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
        <p className="leading-7 text-[var(--muted)]">{messages.privacyDetail}</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold"
          href="/identify"
        >
          {messages.identifyAnotherImage}
        </Link>
      </div>

      <JournalTransferControls
        locale={locale}
        messages={messages.transfer}
        onImported={() => void reloadJournal()}
      />

      {state.kind === "loading" ? (
        <p role="status">{messages.loading}</p>
      ) : state.kind === "error" ? (
        <section className="border border-[var(--border)] p-5" role="alert">
          <h2 className="text-xl font-semibold">{messages.states.unavailableTitle}</h2>
          <p className="mt-2 text-[var(--muted)]">{state.message}</p>
        </section>
      ) : state.entries.length === 0 ? (
        <section className="border border-[var(--border)] p-5 sm:p-7">
          <h2 className="text-2xl font-semibold">{messages.states.emptyTitle}</h2>
          <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">
            {messages.states.emptyDescription}
          </p>
        </section>
      ) : (
        <section aria-labelledby="journal-entries-heading" className="space-y-5">
          <h2 className="text-2xl font-semibold" id="journal-entries-heading">
            {messages.states.entriesTitle}
          </h2>
          <div className="grid gap-5">
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
    <article className="space-y-5 border border-[var(--border)] p-5 sm:p-7">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          {formatMessageTemplate(messages.savedAt, {
            timestamp: formatTimestamp(entry.created_at, locale),
          })}
        </p>
        <h3 className="text-2xl font-semibold">{entry.title}</h3>
        <p className="text-sm text-[var(--muted)]">
          {messages.entryIdLabel} <code>{entry.id}</code>
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="space-y-2">
          <h4 className="font-semibold">{messages.savedObjectsTitle}</h4>
          <ul className="flex flex-wrap gap-2" aria-label={messages.savedObjectsLabel}>
            {entry.objects.slice(0, 20).map((object) => (
              <li
                className="border border-[var(--border)] px-2 py-1 text-sm"
                key={`${object.source}:${object.entity_id ?? ""}:${object.name}`}
              >
                {object.name}
              </li>
            ))}
          </ul>
          {entry.objects.length > 20 ? (
            <p className="text-sm text-[var(--muted)]">
              {formatCountMessage(messages.moreSavedObjects, entry.objects.length - 20, locale)}
            </p>
          ) : null}
        </div>
      ) : null}

      {entry.conditions !== null && entry.conditions.length > 0 ? (
        <div>
          <h4 className="font-semibold">{messages.conditionsTitle}</h4>
          <p className="mt-1 whitespace-pre-wrap leading-7 text-[var(--muted)]">
            {entry.conditions}
          </p>
        </div>
      ) : null}
      {entry.notes.length > 0 ? (
        <div>
          <h4 className="font-semibold">{messages.notesTitle}</h4>
          <p className="mt-1 whitespace-pre-wrap leading-7 text-[var(--muted)]">{entry.notes}</p>
        </div>
      ) : null}

      {entry.plate_solve === null ? null : (
        <details className="border border-[var(--border)] p-4">
          <summary className="cursor-pointer font-semibold">
            {messages.plateSolveProvenance}
          </summary>
          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
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

      <div className="border-t border-[var(--border)] pt-4">
        {deleting ? (
          <div
            className="flex flex-wrap gap-3"
            role="group"
            aria-label={formatMessageTemplate(messages.deleteGroupLabel, { title: entry.title })}
          >
            <button
              className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
              onClick={onConfirmDelete}
              type="button"
            >
              {messages.confirmLocalDelete}
            </button>
            <button
              className="min-h-11 px-4 font-semibold text-[var(--link)] underline"
              onClick={onCancelDelete}
              type="button"
            >
              {messages.keepEntry}
            </button>
          </div>
        ) : (
          <button
            className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
            onClick={onRequestDelete}
            type="button"
          >
            {messages.deleteLocalEntry}
          </button>
        )}
      </div>
    </article>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] p-4">
      <dt className="text-sm text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
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
