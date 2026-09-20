"use client";

import { useCallback, useState } from "react";

import { collectionStoreFailureMessage } from "../lib/collections-messages";
import { resetCollections } from "../lib/collections-store";
import type { CollectionsMessages, CollectionStateMessages } from "../lib/i18n/messages/types";

/**
 * Honest bounded states shared by every collections surface: while the store
 * hydrates, when localStorage is unusable, and the corruption-recovery panel.
 * None of these ever destroy user data implicitly — resetting is a deliberate,
 * confirmed user action.
 */

const secondaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

export function CollectionLoadingNote({
  messages,
}: Readonly<{ messages: CollectionsMessages["shared"] }>) {
  return (
    <p className="text-sm text-[var(--muted)]" role="status">
      {messages.loading}
    </p>
  );
}

export function StorageUnavailableNote({
  context,
  messages,
}: Readonly<{ context: "page" | "picker"; messages: CollectionsMessages["shared"] }>) {
  return (
    <div
      className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-6"
      role="status"
    >
      <h2 className="text-lg font-semibold">{messages.storageUnavailable.title}</h2>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        {context === "picker"
          ? messages.storageUnavailable.pickerDescription
          : messages.storageUnavailable.pageDescription}
      </p>
    </div>
  );
}

/**
 * Recovery state for unreadable persisted data. Explains what happened, keeps
 * the bytes untouched until an explicit two-step confirmation, and reminds the
 * visitor that the rest of Lumina remains usable.
 */
export function CorruptedStoragePanel({
  compact = false,
  messages,
}: Readonly<{ compact?: boolean; messages: CollectionStateMessages }>) {
  const [resetArmed, setResetArmed] = useState(false);
  const [message, setMessage] = useState("");

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setMessage(messages.shared.corrupted.resetWarning);
      return;
    }
    const result = resetCollections();
    if (result.ok) {
      setMessage(messages.shared.corrupted.resetSuccess);
      setResetArmed(false);
    } else {
      setMessage(collectionStoreFailureMessage(result.reason, messages.failures));
    }
  }, [messages, resetArmed]);

  return (
    <div
      className={`space-y-4 ${compact ? "" : "max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-6"}`}
    >
      <div role="status">
        <h2 className="text-lg font-semibold">{messages.shared.corrupted.title}</h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          {messages.shared.corrupted.description}
        </p>
      </div>
      <button className={secondaryButtonClassName} onClick={handleReset} type="button">
        {resetArmed
          ? messages.shared.corrupted.confirmResetAction
          : messages.shared.corrupted.resetAction}
      </button>
      <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
        {message}
      </p>
    </div>
  );
}
