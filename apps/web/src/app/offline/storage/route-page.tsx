import type { Metadata } from "next";

import { OfflineStorageManager } from "../../../components/offline-storage-manager";
import styles from "../../../components/trust-surfaces.module.css";
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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>{messages.intro}</p>
      </header>
      <OfflineStorageManager locale={locale} messages={messages} />
    </article>
  );
}
