"use client";

import { useState } from "react";

import { formatCountMessage, formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningProgressControlsMessages } from "../lib/i18n/messages/types";
import {
  applyLearningProgressImport,
  exportLearningProgress,
  previewLearningProgressImport,
  resetLearningProgress,
  useLearningProgressData,
  useLearningProgressStatus,
  type LearningProgressImportPreview,
  type LearningProgressStoreFailureReason,
} from "../lib/learning/progress-store";
import styles from "./learning-experience.module.css";

type LearningProgressControlsProps = Readonly<{
  locale: PublishedLocale;
  messages: LearningProgressControlsMessages;
}>;

function failureMessage(
  reason: LearningProgressStoreFailureReason,
  messages: LearningProgressControlsMessages,
  operation: "import" | "reset",
): string {
  if (reason === "storage-unavailable" && operation === "reset") {
    return messages.failures.resetStorageUnavailable;
  }
  switch (reason) {
    case "storage-unavailable":
      return messages.failures.storageUnavailable;
    case "storage-corrupted":
      return messages.failures.storageCorrupted;
    case "storage-quota-exceeded":
      return messages.failures.storageQuotaExceeded;
    case "storage-write-failed":
      return messages.failures.storageWriteFailed;
    case "invalid-content":
      return messages.failures.invalidContent;
    case "import-invalid":
      return messages.failures.importInvalid;
  }
}

function importSuccessMessage(
  messages: LearningProgressControlsMessages,
  locale: PublishedLocale,
  pathCount: number,
  attemptCount: number,
): string {
  const template =
    pathCount === 1
      ? attemptCount === 1
        ? messages.importSuccess.onePathOneAttempt
        : messages.importSuccess.onePathOtherAttempts
      : attemptCount === 1
        ? messages.importSuccess.otherPathsOneAttempt
        : messages.importSuccess.otherPathsOtherAttempts;
  return formatMessageTemplate(template, {
    attemptCount: formatLocaleNumber(attemptCount, locale),
    pathCount: formatLocaleNumber(pathCount, locale),
  });
}

export function LearningProgressControls({ locale, messages }: LearningProgressControlsProps) {
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
      anchor.download = "nova-lumina-learning-progress.json";
      anchor.click();
      window.URL.revokeObjectURL(url);
      setMessage(messages.exportSuccess);
    } catch {
      setMessage(messages.exportFailure);
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
      setMessage(messages.importReviewReady);
    } catch {
      setRawImport(null);
      setPreview(null);
      setMessage(messages.importInvalid);
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
        importSuccessMessage(messages, locale, result.added_paths ?? 0, result.added_attempts ?? 0),
      );
      setRawImport(null);
      setPreview(null);
    } else {
      setMessage(failureMessage(result.reason, messages, "import"));
    }
    setBusy(false);
  }

  function handleReset(): void {
    if (!resetArmed) {
      setResetArmed(true);
      setMessage(messages.resetWarning);
      return;
    }
    const result = resetLearningProgress();
    setResetArmed(false);
    setMessage(
      result.ok ? messages.resetSuccess : failureMessage(result.reason, messages, "reset"),
    );
    setPreview(null);
    setRawImport(null);
  }

  return (
    <section aria-labelledby="learning-data-heading" className={styles.progressSection}>
      <div>
        <h2 className={styles.progressTitle} id="learning-data-heading">
          {messages.title}
        </h2>
        <p className={styles.progressDescription}>{messages.description}</p>
      </div>
      <div className={styles.progressBody}>
        {status === "unavailable" ? (
          <p className={styles.progressStatus} role="status">
            {messages.statusUnavailable}
          </p>
        ) : null}
        {status === "corrupted" ? (
          <p className={styles.progressStatus} role="status">
            {messages.statusCorrupted}
          </p>
        ) : null}
        <div className={styles.progressActions}>
          <button
            className={styles.primaryButton}
            disabled={busy || status !== "ready"}
            onClick={() => void handleExport()}
            type="button"
          >
            {messages.exportAction}
          </button>
          <label className={styles.secondaryButton}>
            {messages.importAction}
            <input
              accept="application/json,.json"
              className="sr-only"
              disabled={busy}
              onChange={(event) => void handleImport(event)}
              type="file"
            />
          </label>
          <button
            className={styles.secondaryButton}
            disabled={busy || status === "unavailable"}
            onClick={handleReset}
            type="button"
          >
            {resetArmed ? messages.confirmResetAction : messages.resetAction}
          </button>
        </div>
        {preview !== null ? (
          <div className={styles.preview} role="status">
            <h3>{messages.previewTitle}</h3>
            <p className={styles.previewCopy}>
              {formatCountMessage(messages.previewPaths, preview.added_paths, locale)}{" "}
              {formatCountMessage(messages.previewAttempts, preview.added_attempts, locale)}{" "}
              {formatCountMessage(messages.previewLessons, preview.updated_lessons, locale)}{" "}
              {messages.previewRetention}
            </p>
            <div className={styles.previewActions}>
              <button
                className={styles.primaryButton}
                disabled={busy}
                onClick={() => void confirmImport()}
                type="button"
              >
                {messages.confirmImportAction}
              </button>
              <button
                className={styles.secondaryButton}
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setRawImport(null);
                  setMessage(messages.importCancelled);
                }}
                type="button"
              >
                {messages.cancelImportAction}
              </button>
            </div>
          </div>
        ) : null}
        <p aria-live="polite" className={styles.progressMessage} role="status">
          {message}
        </p>
        <p className={styles.progressMeta}>
          {formatCountMessage(messages.storedSummary, progress.paths.length, locale)}
        </p>
      </div>
    </section>
  );
}
