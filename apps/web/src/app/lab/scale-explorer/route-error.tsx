"use client";

import type { RouteErrorMessages } from "../../../lib/i18n/messages/types";
import styles from "../../../components/route-state.module.css";

type ScaleExplorerErrorProps = Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>;

export default function ScaleExplorerError({ error, messages, reset }: ScaleExplorerErrorProps) {
  void error;

  return (
    <section aria-labelledby="scale-route-error-heading" className={styles.state} role="alert">
      <h1 className={styles.title} id="scale-route-error-heading">
        {messages.title}
      </h1>
      <p className={styles.description}>{messages.description}</p>
      <button className={styles.action} onClick={reset} type="button">
        {messages.retry}
      </button>
    </section>
  );
}
