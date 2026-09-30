"use client";

import { useEffect } from "react";
import styles from "../../../components/route-state.module.css";
import type { RouteErrorMessages } from "../../../lib/i18n/messages/types";

export default function ObjectRouteError({
  error,
  messages,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section aria-labelledby="object-error-title" className={styles.state} role="alert">
      <h1 className={styles.title} id="object-error-title">
        {messages.title}
      </h1>
      <p className={styles.description}>{messages.description}</p>
      <button className={styles.action} onClick={() => reset()} type="button">
        {messages.retry}
      </button>
    </section>
  );
}
