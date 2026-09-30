"use client";

import type { RouteErrorMessages } from "../../lib/i18n/messages/types";
import styles from "../../components/route-state.module.css";

type LearningErrorProps = Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>;

export default function LearningError({ messages, reset }: LearningErrorProps) {
  return (
    <section aria-labelledby="learning-error-heading" className={styles.state} role="alert">
      <h1 className={styles.title} id="learning-error-heading">
        {messages.title}
      </h1>
      <p className={styles.description}>{messages.description}</p>
      <button className={styles.action} onClick={reset} type="button">
        {messages.retry}
      </button>
    </section>
  );
}
