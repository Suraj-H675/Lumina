"use client";

import { useRef, useState } from "react";

import {
  formatCountMessage,
  formatLocaleDateTime,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { JournalMessages } from "../../lib/i18n/messages/types";
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
import styles from "./journal-view.module.css";

type ImportReview = Readonly<{
  bundle: ParsedJournalImport;
  preview: JournalImportPreview;
}>;

export function JournalTransferControls({
  locale,
  messages,
  onImported,
}: Readonly<{
  locale: PublishedLocale;
  messages: JournalMessages["transfer"];
  onImported: () => void;
}>) {
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
        anchor.download = `nova-lumina-journal-${new Date().toISOString().slice(0, 10)}.json`;
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
      setImportMessage(messages.importFileSizeInvalid);
      return;
    }
    try {
      const bundle = await parseJournalExport(await file.text());
      const preview = await previewJournalImport(bundle);
      setImportReview({ bundle, preview });
    } catch {
      setImportMessage(messages.importInvalid);
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
      setImportMessage(messages.failures.unresolved);
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
        formatMessageTemplate(messages.importComplete, {
          added: formatLocaleNumber(result.added, locale),
          keptLocal: formatLocaleNumber(result.kept_local, locale),
          replaced: formatLocaleNumber(result.replaced, locale),
        }),
      );
      setImportReview(null);
      setDecisions(new Map());
      if (fileRef.current !== null) fileRef.current.value = "";
      onImported();
    } catch (error) {
      setImportMessage(importFailureMessage(error, messages.failures));
    } finally {
      setImporting(false);
    }
  }

  return (
    <section aria-labelledby="journal-transfer-heading" className={styles.transfer}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="journal-transfer-heading">
          {messages.title}
        </h2>
        <p className={styles.sectionDescription}>{messages.description}</p>
      </div>

      <div className={styles.sectionBody}>
        <div className={styles.transferLedger}>
          <div className={styles.transferPanel}>
            <h3>{messages.exportAction}</h3>
            <div className={styles.transferActions}>
              <button
                className={styles.textAction}
                disabled={exportState === "working"}
                onClick={() => void exportJournal()}
                type="button"
              >
                {exportState === "working" ? messages.preparingExport : messages.exportAction}
              </button>
            </div>
            {exportState === "error" ? (
              <p className={styles.errorMessage} role="alert">
                {messages.exportFailure}
              </p>
            ) : null}
          </div>

          <div className={styles.transferPanel}>
            <h3>{messages.importFileLabel}</h3>
            <label className={styles.fileLabel} htmlFor="journal-import-file">
              <span>{messages.importFileLabel}</span>
              <input
                accept="application/json,.json"
                className={styles.fileInput}
                id="journal-import-file"
                onChange={(event) => void chooseImport(event.target.files?.[0])}
                ref={fileRef}
                type="file"
              />
            </label>
            <p className={styles.transferNote}>{messages.importDescription}</p>
          </div>
        </div>

        {importReview === null ? null : (
          <div className={styles.importPreview}>
            <h3>{messages.importPreviewTitle}</h3>
            <p>
              <strong>
                {formatCountMessage(
                  messages.importPreviewNewEntries,
                  importReview.preview.added_ids.length,
                  locale,
                )}
              </strong>
              {". "}
              <strong>
                {formatCountMessage(
                  messages.importPreviewConflicts,
                  importReview.preview.conflicts.length,
                  locale,
                )}
              </strong>
              .
            </p>
            {importReview.preview.conflicts.map((conflict) => (
              <fieldset className={styles.conflict} key={conflict.id}>
                <legend>
                  {formatMessageTemplate(messages.conflictTitle, { id: conflict.id })}
                </legend>
                <p>
                  {formatMessageTemplate(messages.conflictSummary, {
                    importedUpdated: formatTimestamp(conflict.incoming_updated_at, locale),
                    localUpdated: formatTimestamp(conflict.local_updated_at, locale),
                    recommendation:
                      conflict.recommendation === "use_imported"
                        ? messages.recommendationUseImported
                        : messages.recommendationKeepLocal,
                  })}
                </p>
                <div className={styles.conflictChoices}>
                  <label className={styles.conflictChoice}>
                    <input
                      checked={decisions.get(conflict.id) === "keep_local"}
                      name={`journal-conflict-${conflict.id}`}
                      onChange={() => chooseConflict(conflict.id, "keep_local")}
                      type="radio"
                    />
                    {messages.keepLocal}
                  </label>
                  <label className={styles.conflictChoice}>
                    <input
                      checked={decisions.get(conflict.id) === "use_imported"}
                      name={`journal-conflict-${conflict.id}`}
                      onChange={() => chooseConflict(conflict.id, "use_imported")}
                      type="radio"
                    />
                    {messages.useImported}
                  </label>
                </div>
              </fieldset>
            ))}
            <div className={styles.transferActions}>
              <button
                className={styles.textAction}
                disabled={importing}
                onClick={() => void applyImport()}
                type="button"
              >
                {importing ? messages.importActionWorking : messages.applyReviewedImport}
              </button>
            </div>
          </div>
        )}

        {importMessage === null ? null : (
          <p aria-live="polite" className={styles.statusMessage} role="status">
            {importMessage}
          </p>
        )}
      </div>
    </section>
  );
}

function formatTimestamp(value: string, locale: PublishedLocale): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : formatLocaleDateTime(parsed, locale, {
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

function importFailureMessage(
  error: unknown,
  messages: JournalMessages["transfer"]["failures"],
): string {
  if (!(error instanceof JournalExportError)) {
    return messages.generic;
  }
  switch (error.code) {
    case "JOURNAL_IMPORT_CONFLICT_UNRESOLVED":
      return messages.unresolved;
    case "JOURNAL_IMPORT_PREVIEW_STALE":
      return messages.previewStale;
    case "JOURNAL_EXPORT_INVALID":
    case "JOURNAL_EXPORT_TOO_LARGE":
    case "JOURNAL_IMPORT_INVALID":
      return messages.invalid;
  }
}
