import Link from "next/link";

import { formatMessageTemplate } from "../lib/i18n/format";
import type { ObjectMessages } from "../lib/i18n/messages/types";
import styles from "./route-state.module.css";

/**
 * Public not-found experience for unknown catalogue slugs. Raw API error
 * bodies never surface here.
 */
export function ObjectNotFoundView({
  messages,
  slug,
}: Readonly<{ messages: ObjectMessages["notFound"]; slug: string }>) {
  const path = `/objects/${slug}`;
  return (
    <section aria-labelledby="object-not-found-title" className={styles.state}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title} id="object-not-found-title">
        {messages.title}
      </h1>
      <p className={styles.description}>{formatMessageTemplate(messages.description, { path })}</p>
      <Link className={styles.action} href="/explore">
        {messages.browseCatalogue}
      </Link>
    </section>
  );
}
