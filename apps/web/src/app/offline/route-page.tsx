import type { Metadata } from "next";
import Link from "next/link";

import styles from "../../components/trust-surfaces.module.css";
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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.title}>{messages.title}</h1>
        </div>
        <p className={styles.intro}>{messages.intro}</p>
      </header>

      <div className={styles.availabilityGrid}>
        <section aria-labelledby="offline-available-heading" className={styles.availability}>
          <h2 id="offline-available-heading">{messages.availableTitle}</h2>
          <p>{messages.availableDescription}</p>
        </section>

        <section aria-labelledby="offline-needs-network-heading" className={styles.availability}>
          <h2 id="offline-needs-network-heading">{messages.networkTitle}</h2>
          <p>{messages.networkDescription}</p>
        </section>
      </div>

      <aside className={styles.backup}>
        <h2>{messages.backupTitle}</h2>
        <div className={styles.backupBody}>
          <p>{messages.backupDescription}</p>
          <Link className={styles.actionLink} href="/offline/storage">
            {messages.manageStorage}
          </Link>
        </div>
      </aside>
    </article>
  );
}
