import type { Metadata } from "next";

import { OfflineStorageManager } from "../../../components/offline-storage-manager";

export const metadata: Metadata = {
  title: "Offline storage",
  description: "Review and manage Lumina offline copies and local saved observation plans.",
};

export default function OfflineStoragePage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Offline mode
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Storage and offline copies</h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Review Lumina&apos;s best-effort offline cache separately from personal data stored in
          this browser. These controls do not create an account or cloud backup.
        </p>
      </header>
      <OfflineStorageManager />
    </article>
  );
}
