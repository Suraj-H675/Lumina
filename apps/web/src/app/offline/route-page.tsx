import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline",
  description: "Lumina's bounded offline fallback and availability guidance.",
};

export default function OfflinePage() {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Offline mode
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Lumina is offline</h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Pages you visited while online may still be available as reviewed offline copies. An
          unvisited page may need a connection before Lumina can make it available offline.
        </p>
      </header>

      <section aria-labelledby="offline-available-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="offline-available-heading">
          What can still work
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Previously visited learning material, curated Explore pages, object pages, and the basic
          observation-planner shell can be available from Lumina&apos;s local content cache. Saved
          personal data is stored separately from those offline copies.
        </p>
      </section>

      <section aria-labelledby="offline-needs-network-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="offline-needs-network-heading">
          What still needs a network
        </h2>
        <p className="leading-7 text-[var(--muted)]">
          Live space data, source status, weather, uploads, and jobs need a network connection.
          Lumina never relabels an old provider result as current just because the app is offline.
        </p>
      </section>

      <aside className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Offline copies are not a backup</h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          Your browser or operating system can evict cached pages. Personal browser storage can also
          be cleared independently, so offline availability is best effort rather than a permanent
          guarantee.
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--link)] underline"
          href="/offline/storage"
        >
          Manage offline storage
        </Link>
      </aside>
    </article>
  );
}
