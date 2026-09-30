"use client";

import { enMessages } from "../lib/i18n/messages/en";
import styles from "../components/route-state.module.css";
import "./globals.css";

type GlobalErrorProps = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  void error;
  const messages = enMessages.routeBoundaries.globalError;

  return (
    <html lang="en">
      <body>
        <title>{`${messages.title} — Nova-Lumina`}</title>
        <main className={`${styles.state} ${styles.global}`} role="alert">
          <h1 className={styles.title}>{messages.title}</h1>
          <p className={styles.description}>{messages.description}</p>
          <button className={styles.action} onClick={reset} type="button">
            {messages.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
