"use client";

import { useCallback, useState } from "react";

import { resetCollections } from "../lib/collections-store";

/**
 * Honest bounded states shared by every collections surface: while the store
 * hydrates, when localStorage is unusable, and the corruption-recovery panel.
 * None of these ever destroy user data implicitly — resetting is a deliberate,
 * confirmed user action.
 */

const secondaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]";

export function CollectionLoadingNote() {
  return (
    <p className="text-sm text-[var(--muted)]" role="status">
      Checking your saved collections…
    </p>
  );
}

export function StorageUnavailableNote({ context }: Readonly<{ context: "page" | "picker" }>) {
  return (
    <div
      className="max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-6"
      role="status"
    >
      <h2 className="text-lg font-semibold">Local storage is unavailable</h2>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        This browser is blocking site storage, so Lumina cannot save or show collections right now.
        {context === "picker" ? " Nothing was changed." : ""} Browsing, search, object pages, and
        comparison all keep working normally.
      </p>
    </div>
  );
}

/**
 * Recovery state for unreadable persisted data. Explains what happened, keeps
 * the bytes untouched until an explicit two-step confirmation, and reminds the
 * visitor that the rest of Lumina remains usable.
 */
export function CorruptedStoragePanel({ compact = false }: Readonly<{ compact?: boolean }>) {
  const [resetArmed, setResetArmed] = useState(false);
  const [message, setMessage] = useState("");

  const handleReset = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      setMessage("Resetting erases every saved collection on this device. Confirm to continue.");
      return;
    }
    const result = resetCollections();
    if (result.ok) {
      setMessage("Local collections were cleared.");
      setResetArmed(false);
    } else {
      setMessage(result.message);
    }
  }, [resetArmed]);

  return (
    <div
      className={`space-y-4 ${compact ? "" : "max-w-xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-6"}`}
    >
      <div role="status">
        <h2 className="text-lg font-semibold">Your saved collections could not be read</h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          The data stored for collections in this browser could not be understood. Nothing has been
          changed or deleted. You can keep browsing, searching, and comparing normally, or reset
          collections below to start fresh.
        </p>
      </div>
      <button className={secondaryButtonClassName} onClick={handleReset} type="button">
        {resetArmed ? "Confirm reset — erase all local collections" : "Reset local collections"}
      </button>
      <p aria-live="polite" className="min-h-6 text-sm text-[var(--muted)]" role="status">
        {message}
      </p>
    </div>
  );
}
