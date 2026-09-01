"use client";

import { useState } from "react";

import {
  applyLearningProgressImport,
  exportLearningProgress,
  previewLearningProgressImport,
  resetLearningProgress,
  useLearningProgressData,
  useLearningProgressStatus,
  type LearningProgressImportPreview,
} from "../lib/learning/progress-store";

const primaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-hover)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-60";

export function LearningProgressControls() {
  const status = useLearningProgressStatus();
  const progress = useLearningProgressData();
  const [preview, setPreview] = useState<LearningProgressImportPreview | null>(null);
  const [rawImport, setRawImport] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const envelope = await exportLearningProgress();
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "lumina-learning-progress.json";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setMessage("Learning progress exported to a file on this device.");
    } catch {
      setMessage("Learning progress could not be exported. Nothing was uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    setBusy(true);
    setMessage("");
    try {
      const raw = await file.text();
      const nextPreview = await previewLearningProgressImport(raw);
      setRawImport(raw);
      setPreview(nextPreview);
      setMessage("Review this import before applying it. Your current progress has not changed.");
    } catch {
      setRawImport(null);
      setPreview(null);
      setMessage("This learning-progress file could not be validated, so nothing was imported.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport(): Promise<void> {
    if (rawImport === null) return;
    setBusy(true);
    const result = await applyLearningProgressImport(rawImport);
    if (result.ok) {
      setMessage(
        `Imported ${result.added_paths ?? 0} learning path${result.added_paths === 1 ? "" : "s"} and ${result.added_attempts ?? 0} new attempt${result.added_attempts === 1 ? "" : "s"}.`,
      );
      setRawImport(null);
      setPreview(null);
    } else {
      setMessage(result.message);
    }
    setBusy(false);
  }

  function handleReset(): void {
    if (!resetArmed) {
      setResetArmed(true);
      setMessage("Resetting removes all learning progress on this device. Confirm to continue.");
      return;
    }
    const result = resetLearningProgress();
    setResetArmed(false);
    setMessage(result.ok ? "Local learning progress was cleared." : result.message);
    setPreview(null);
    setRawImport(null);
  }

  return (
    <section
      aria-labelledby="learning-data-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <div className="space-y-2">
        <h2 id="learning-data-heading">Your local learning data</h2>
        <p className="max-w-2xl leading-7 text-[var(--muted)]">
          Progress stays in this browser on this device. Export a backup when you want one;
          importing never uploads your file and requires a review step before merging.
        </p>
      </div>
      {status === "unavailable" ? (
        <p className="text-sm text-[var(--warning)]" role="status">
          Local storage is unavailable. You can read the path, but progress cannot be saved here.
        </p>
      ) : null}
      {status === "corrupted" ? (
        <p className="text-sm text-[var(--warning)]" role="status">
          Saved learning progress could not be read. It has not been deleted. Reset is an explicit
          choice below.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className={primaryButtonClassName}
          disabled={busy || status !== "ready"}
          onClick={() => void handleExport()}
          type="button"
        >
          Export learning progress
        </button>
        <label className={secondaryButtonClassName}>
          Import learning progress
          <input
            accept="application/json,.json"
            className="sr-only"
            disabled={busy}
            onChange={(event) => void handleImport(event)}
            type="file"
          />
        </label>
        <button
          className={secondaryButtonClassName}
          disabled={busy || status === "unavailable"}
          onClick={handleReset}
          type="button"
        >
          {resetArmed ? "Confirm reset — erase local progress" : "Reset local progress"}
        </button>
      </div>
      {preview !== null ? (
        <div
          className="max-w-2xl space-y-3 rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4"
          role="status"
        >
          <h3 className="font-semibold">Review this import</h3>
          <p className="leading-7 text-[var(--muted)]">
            This file adds {preview.added_paths} path{preview.added_paths === 1 ? "" : "s"},{" "}
            {preview.added_attempts} attempt{preview.added_attempts === 1 ? "" : "s"}, and may
            improve {preview.updated_lessons} lesson score{preview.updated_lessons === 1 ? "" : "s"}
            . Current progress is kept; newer local records are not overwritten.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={primaryButtonClassName}
              disabled={busy}
              onClick={() => void confirmImport()}
              type="button"
            >
              Import progress
            </button>
            <button
              className={secondaryButtonClassName}
              disabled={busy}
              onClick={() => {
                setPreview(null);
                setRawImport(null);
                setMessage("Import cancelled. Your current progress has not changed.");
              }}
              type="button"
            >
              Cancel import
            </button>
          </div>
        </div>
      ) : null}
      <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
        {message}
      </p>
      <p className="text-xs text-[var(--muted)]">
        Stored locally: {progress.paths.length} learning path
        {progress.paths.length === 1 ? "" : "s"}. No account or cloud sync is used.
      </p>
    </section>
  );
}
