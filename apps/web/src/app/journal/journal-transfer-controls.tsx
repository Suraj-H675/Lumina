"use client";

import { useRef, useState } from "react";

import {
  JournalExportError,
  MAX_JOURNAL_IMPORT_BYTES,
  applyJournalImportPreview,
  createJournalExport,
  parseJournalExport,
  previewJournalImport,
  type JournalConflictDecision,
  type JournalImportPreview,
  type ParsedJournalImport,
} from "../../lib/journal/export";

type ImportReview = Readonly<{
  bundle: ParsedJournalImport;
  preview: JournalImportPreview;
}>;

export function JournalTransferControls({ onImported }: Readonly<{ onImported: () => void }>) {
  const [exportState, setExportState] = useState<"idle" | "working" | "error">("idle");
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [decisions, setDecisions] = useState<ReadonlyMap<string, JournalConflictDecision>>(
    () => new Map(),
  );
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportJournal() {
    setExportState("working");
    try {
      const raw = await createJournalExport(new Date().toISOString());
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.download = `lumina-journal-${new Date().toISOString().slice(0, 10)}.json`;
        anchor.href = url;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setExportState("idle");
    } catch {
      setExportState("error");
    }
  }

  async function chooseImport(file: File | undefined) {
    setImportReview(null);
    setDecisions(new Map());
    setImportMessage(null);
    if (file === undefined) return;
    if (file.size <= 0 || file.size > MAX_JOURNAL_IMPORT_BYTES) {
      setImportMessage("That journal file is empty or exceeds Lumina's bounded import limit.");
      return;
    }
    try {
      const bundle = await parseJournalExport(await file.text());
      const preview = await previewJournalImport(bundle);
      setImportReview({ bundle, preview });
    } catch {
      setImportMessage("That journal file could not be validated. Nothing was imported.");
    }
  }

  function chooseConflict(id: string, decision: JournalConflictDecision) {
    setDecisions((current) => {
      const next = new Map(current);
      next.set(id, decision);
      return next;
    });
  }

  async function applyImport() {
    if (importReview === null) return;
    if (importReview.preview.conflicts.some((conflict) => !decisions.has(conflict.id))) {
      setImportMessage("Choose how to resolve every conflicting entry before importing.");
      return;
    }
    setImporting(true);
    setImportMessage(null);
    try {
      const result = await applyJournalImportPreview(
        importReview.bundle,
        importReview.preview,
        decisions,
        new Date().toISOString(),
      );
      setImportMessage(
        `Import complete: ${result.added} added, ${result.replaced} replaced, ${result.kept_local} kept local.`,
      );
      setImportReview(null);
      setDecisions(new Map());
      if (fileRef.current !== null) fileRef.current.value = "";
      onImported();
    } catch (error) {
      setImportMessage(importFailureMessage(error));
    } finally {
      setImporting(false);
    }
  }

  return (
    <section
      aria-labelledby="journal-transfer-heading"
      className="space-y-5 border border-[var(--border)] p-5 sm:p-7"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold" id="journal-transfer-heading">
          Export or import journal data
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Journal exports are portable personal-data files. They can contain your notes, explicitly
          confirmed location/time, equipment, normalized plate-solve snapshots, and any image Blobs
          you chose to retain. Store exports accordingly.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold disabled:opacity-50"
          disabled={exportState === "working"}
          onClick={() => void exportJournal()}
          type="button"
        >
          {exportState === "working" ? "Preparing export…" : "Export local journal"}
        </button>
      </div>
      {exportState === "error" ? (
        <p role="alert">The browser could not prepare a validated journal export.</p>
      ) : null}

      <div className="space-y-3 border-t border-[var(--border)] pt-5">
        <label className="block space-y-2 font-semibold" htmlFor="journal-import-file">
          <span>Import a Lumina journal file</span>
          <input
            accept="application/json,.json"
            className="block min-h-11 max-w-full"
            id="journal-import-file"
            onChange={(event) => void chooseImport(event.target.files?.[0])}
            ref={fileRef}
            type="file"
          />
        </label>
        <p className="text-sm leading-6 text-[var(--muted)]">
          Lumina validates the version, entry schema, attachment hashes, and whole-journal checksum
          before previewing any import. Existing entries are never silently overwritten.
        </p>
      </div>

      {importReview === null ? null : (
        <div className="space-y-4 border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-xl font-semibold">Import preview</h3>
          <p>
            New entries: <strong>{importReview.preview.added_ids.length}</strong>. Conflicts
            requiring a decision: <strong>{importReview.preview.conflicts.length}</strong>.
          </p>
          {importReview.preview.conflicts.map((conflict) => (
            <fieldset className="space-y-2 border-t border-[var(--border)] pt-3" key={conflict.id}>
              <legend className="font-semibold">
                Conflict <code>{conflict.id}</code>
              </legend>
              <p className="text-sm text-[var(--muted)]">
                Local updated {formatTimestamp(conflict.local_updated_at)} · imported updated{" "}
                {formatTimestamp(conflict.incoming_updated_at)}. Lumina&apos;s timestamp-based
                suggestion is{" "}
                {conflict.recommendation === "use_imported" ? "use imported" : "keep local"}, but
                you must choose.
              </p>
              <label className="mr-4 inline-flex min-h-11 items-center gap-2">
                <input
                  checked={decisions.get(conflict.id) === "keep_local"}
                  name={`journal-conflict-${conflict.id}`}
                  onChange={() => chooseConflict(conflict.id, "keep_local")}
                  type="radio"
                />
                Keep local
              </label>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input
                  checked={decisions.get(conflict.id) === "use_imported"}
                  name={`journal-conflict-${conflict.id}`}
                  onChange={() => chooseConflict(conflict.id, "use_imported")}
                  type="radio"
                />
                Use imported
              </label>
            </fieldset>
          ))}
          <button
            className="min-h-11 border border-[var(--border-strong)] px-4 font-semibold disabled:opacity-50"
            disabled={importing}
            onClick={() => void applyImport()}
            type="button"
          >
            {importing ? "Importing…" : "Apply reviewed import"}
          </button>
        </div>
      )}

      {importMessage === null ? null : (
        <p aria-live="polite" role="status">
          {importMessage}
        </p>
      )}
    </section>
  );
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString().replace("T", " ");
}

function importFailureMessage(error: unknown): string {
  if (!(error instanceof JournalExportError)) {
    return "The journal import could not be completed safely; local data was left unchanged.";
  }
  switch (error.code) {
    case "JOURNAL_IMPORT_CONFLICT_UNRESOLVED":
      return "Resolve every journal conflict before importing.";
    case "JOURNAL_IMPORT_PREVIEW_STALE":
      return "The local journal changed after the preview. Review the import again before applying it.";
    case "JOURNAL_EXPORT_INVALID":
    case "JOURNAL_EXPORT_TOO_LARGE":
    case "JOURNAL_IMPORT_INVALID":
      return "The journal file could not be validated, so local data was left unchanged.";
  }
}
