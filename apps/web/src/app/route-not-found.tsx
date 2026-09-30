import Link from "next/link";

import type { NotFoundMessages } from "../lib/i18n/messages/types";
import styles from "../components/route-state.module.css";

export default function NotFound({ messages }: Readonly<{ messages: NotFoundMessages }>) {
  return (
    <section aria-labelledby="not-found-title" className={styles.state}>
      <p className={styles.code}>{messages.code}</p>
      <h1 className={styles.title} id="not-found-title">
        {messages.title}
      </h1>
      <p className={styles.description}>{messages.description}</p>
      <Link className={styles.action} href="/">
        {messages.returnHome}
      </Link>
    </section>
  );
}
