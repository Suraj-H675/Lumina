"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

export function JournalView() {
  const [state, setState] = useState<JournalUiState>({ kind: "loading" });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const reloadJournal = useCallback(async () => {
    try {
      const entries = await listJournalEntries();
      setState({ entries, kind: "ready" });
    } catch (error) {
      setState({ kind: "error", message: journalLoadMessage(error) });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listJournalEntries()
      .then((entries) => {
        if (!cancelled) setState({ entries, kind: "ready" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", message: journalLoadMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function remove(entryId: string) {
    try {
      await deleteJournalEntry(entryId);
      const entries = await listJournalEntries();
      setDeleteConfirmId(null);
      setState({ entries, kind: "ready" });
    } catch (error) {
      setState({ kind: "error", message: journalLoadMessage(error) });
    }
  }

  return (
    <div className="space-y-10">
      <header className="max-w-4xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Browser-local observations
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Observation Journal</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          These entries live only in this browser&apos;s local IndexedDB. Lumina does not send
          journal notes, confirmed locations, equipment, or locally retained image attachments to
          the API.
        </p>
        <p className="leading-7 text-[var(--muted)]">
          Plate-solve snapshots come from Lumina&apos;s normalized WCS result. Observation time and
          location appear only when you explicitly confirmed them while saving.
        </p>
      </header>

      <div className="flex flex-wrap gap-3">
        <Link
          className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 font-semibold"
          href="/identify"
        >
          Identify another image
        </Link>
      </div>

      <JournalTransferControls onImported={() => void reloadJournal()} />

      {state.kind === "loading" ? (
        <p role="status">Loading the local journal…</p>
      ) : state.kind === "error" ? (
        <section className="border border-[var(--border)] p-5" role="alert">
          <h2 className="text-xl font-semibold">Local journal unavailable</h2>
          <p className="mt-2 text-[var(--muted)]">{state.message}</p>
        </section>
      ) : state.entries.length === 0 ? (
        <section className="border border-[var(--border)] p-5 sm:p-7">
          <h2 className="text-2xl font-semibold">No journal entries yet</h2>
          <p className="mt-2 max-w-3xl leading-7 text-[var(--muted)]">
            Add an observation from a catalogue object or observation plan, or solve an image in
            Identify and save its normalized astrometric result.
          </p>
        </section>
      ) : (
        <section aria-labelledby="journal-entries-heading" className="space-y-5">
          <h2 className="text-2xl font-semibold" id="journal-entries-heading">
            Saved observations
          </h2>
          <div className="grid gap-5">
            {state.entries.map((entry) => (
              <JournalEntryCard
                deleting={deleteConfirmId === entry.id}
                entry={entry}
                key={entry.id}
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
  onCancelDelete,
  onConfirmDelete,
  onRequestDelete,
}: Readonly<{
  deleting: boolean;
  entry: JournalEntry;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
}>) {
  return (
    <article className="space-y-5 border border-[var(--border)] p-5 sm:p-7">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.16em] text-[var(--accent)] uppercase">
          Saved {formatTimestamp(entry.created_at)}
        </p>
        <h3 className="text-2xl font-semibold">{entry.title}</h3>
        <p className="text-sm text-[var(--muted)]">
          Entry ID: <code>{entry.id}</code>
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Observation time"
          value={
            entry.observed_time === null ? "Not recorded" : formatTimestamp(entry.observed_time.utc)
          }
        />
        <Metric label="Location" value={formatLocation(entry)} />
        <Metric
          label="Solved center"
          value={
            entry.plate_solve === null
              ? "No plate solve"
              : `${entry.plate_solve.center_ra_deg.toFixed(6)}° RA, ${entry.plate_solve.center_dec_deg.toFixed(6)}° Dec`
          }
        />
        <Metric label="Coordinate frame" value={entry.plate_solve?.frame ?? "Not recorded"} />
        <Metric
          label="Pixel scale"
          value={
            entry.plate_solve === null
              ? "Not recorded"
              : `${entry.plate_solve.pixel_scale_arcsec.toFixed(3)} arcsec/pixel`
          }
        />
        <Metric
          label="Equipment"
          value={entry.equipment.length === 0 ? "Not recorded" : entry.equipment.join(" · ")}
        />
        <Metric
          label="Local image"
          value={entry.attachment_ids.length === 0 ? "Not retained" : "Retained in this browser"}
        />
        <Metric label="Follow-up" value={entry.follow_up ? "Marked" : "Not marked"} />
      </dl>

      {entry.objects.length > 0 ? (
        <div className="space-y-2">
          <h4 className="font-semibold">Saved objects</h4>
          <ul className="flex flex-wrap gap-2" aria-label="Saved objects">
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
              + {entry.objects.length - 20} more saved objects
            </p>
          ) : null}
        </div>
      ) : null}

      {entry.conditions !== null && entry.conditions.length > 0 ? (
        <div>
          <h4 className="font-semibold">Conditions</h4>
          <p className="mt-1 whitespace-pre-wrap leading-7 text-[var(--muted)]">
            {entry.conditions}
          </p>
        </div>
      ) : null}
      {entry.notes.length > 0 ? (
        <div>
          <h4 className="font-semibold">Notes</h4>
          <p className="mt-1 whitespace-pre-wrap leading-7 text-[var(--muted)]">{entry.notes}</p>
        </div>
      ) : null}

      {entry.plate_solve === null ? null : (
        <details className="border border-[var(--border)] p-4">
          <summary className="cursor-pointer font-semibold">Plate-solve provenance</summary>
          <div className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <p>
              Solver version: <code>{entry.plate_solve.solver_version}</code>
            </p>
            <p>
              WCS fingerprint: <code>{entry.plate_solve.wcs_source_sha256}</code>
            </p>
            <p>
              Solution snapshot ID: <code>{entry.plate_solve.snapshot_id}</code>
            </p>
          </div>
        </details>
      )}

      <div className="border-t border-[var(--border)] pt-4">
        {deleting ? (
          <div className="flex flex-wrap gap-3" role="group" aria-label={`Delete ${entry.title}`}>
            <button
              className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
              onClick={onConfirmDelete}
              type="button"
            >
              Confirm local delete
            </button>
            <button
              className="min-h-11 px-4 font-semibold text-[var(--link)] underline"
              onClick={onCancelDelete}
              type="button"
            >
              Keep entry
            </button>
          </div>
        ) : (
          <button
            className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold"
            onClick={onRequestDelete}
            type="button"
          >
            Delete local journal entry
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

function formatLocation(entry: JournalEntry): string {
  if (entry.location === null) return "Not recorded";
  if (entry.location.latitude_deg === null || entry.location.longitude_deg === null) {
    return entry.location.label;
  }
  return `${entry.location.label} · ${entry.location.latitude_deg.toFixed(4)}°, ${entry.location.longitude_deg.toFixed(4)}°`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function journalLoadMessage(error: unknown): string {
  const reason =
    typeof error === "object" && error !== null && "reason" in error
      ? (error as JournalStorageError).reason
      : null;
  return reason === "storage-corrupted"
    ? "Saved journal data failed validation. Lumina left the local bytes untouched rather than guessing."
    : "This browser is not allowing Lumina to read the local journal right now.";
}
