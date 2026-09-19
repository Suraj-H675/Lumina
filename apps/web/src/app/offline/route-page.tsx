import type { Metadata } from "next";
import Link from "next/link";

import type { OfflineMessages } from "../../lib/i18n/messages/types";

export function createOfflineMetadata(messages: OfflineMessages["landing"]): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default function OfflinePage({
  messages,
}: Readonly<{ messages: OfflineMessages["landing"] }>) {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">{messages.title}</h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
      </header>

      <section aria-labelledby="offline-available-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="offline-available-heading">
          {messages.availableTitle}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.availableDescription}</p>
      </section>

      <section aria-labelledby="offline-needs-network-heading" className="space-y-3">
        <h2 className="text-2xl font-semibold" id="offline-needs-network-heading">
          {messages.networkTitle}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.networkDescription}</p>
      </section>

      <aside className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">{messages.backupTitle}</h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">{messages.backupDescription}</p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--link)] underline"
          href="/offline/storage"
        >
          {messages.manageStorage}
        </Link>
      </aside>
    </article>
  );
}
