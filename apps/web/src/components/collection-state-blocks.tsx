"use client";

import { useCallback, useState } from "react";

import { collectionStoreFailureMessage } from "../lib/collections-messages";
import { resetCollections } from "../lib/collections-store";
import type { CollectionsMessages, CollectionStateMessages } from "../lib/i18n/messages/types";
import styles from "./collections-experience.module.css";

/**
 * Honest bounded states shared by every collections surface: while the store
 * hydrates, when localStorage is unusable, and the corruption-recovery panel.
 * None of these ever destroy user data implicitly — resetting is a deliberate,
 * confirmed user action.
 */

export function CollectionLoadingNote({
  messages,
}: Readonly<{ messages: CollectionsMessages["shared"] }>) {
  return (
    <p className={styles.statusMessage} role="status">
      {messages.loading}
    </p>
  );
}

export function StorageUnavailableNote({
  context,
  messages,
}: Readonly<{ context: "page" | "picker"; messages: CollectionsMessages["shared"] }>) {
  return (
    <div className={styles.statusPanel} role="status">
      <h2>{messages.storageUnavailable.title}</h2>
      <p>
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
 * visitor that the rest of Nova-Lumina remains usable.
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
    <div className={compact ? styles.compactStatus : styles.statusPanel}>
      <div role="status">
        <h2>{messages.shared.corrupted.title}</h2>
        <p>{messages.shared.corrupted.description}</p>
      </div>
      <button className={styles.secondaryAction} onClick={handleReset} type="button">
        {resetArmed
          ? messages.shared.corrupted.confirmResetAction
          : messages.shared.corrupted.resetAction}
      </button>
      <p aria-live="polite" className={styles.recoveryStatus} role="status">
        {message}
      </p>
    </div>
  );
}
