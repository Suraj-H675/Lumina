import type { Metadata } from "next";

import { OfflineStorageManager } from "../../../components/offline-storage-manager";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { OfflineMessages } from "../../../lib/i18n/messages/types";

export function createOfflineStorageMetadata(messages: OfflineMessages["storage"]): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default function OfflineStoragePage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: OfflineMessages["storage"] }>) {
  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">{messages.title}</h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">{messages.intro}</p>
      </header>
      <OfflineStorageManager locale={locale} messages={messages} />
    </article>
  );
}
