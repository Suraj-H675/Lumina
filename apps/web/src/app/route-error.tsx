"use client";

import type { RouteErrorMessages } from "../lib/i18n/messages/types";
import styles from "../components/route-state.module.css";

export type RouteErrorProps = Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>;

export default function RouteError({ error, messages, reset }: RouteErrorProps) {
  void error;

  return (
    <section aria-labelledby="route-error-title" className={styles.state} role="alert">
      <h1 className={styles.title} id="route-error-title">
        {messages.title}
      </h1>
      <p className={styles.description}>{messages.description}</p>
      <button className={styles.action} onClick={reset} type="button">
        {messages.retry}
      </button>
    </section>
  );
}
