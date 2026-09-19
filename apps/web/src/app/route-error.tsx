"use client";

import type { RouteErrorMessages } from "../lib/i18n/messages/types";

export type RouteErrorProps = Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>;

export default function RouteError({ error, messages, reset }: RouteErrorProps) {
  void error;

  return (
    <section aria-labelledby="route-error-title" className="max-w-2xl space-y-4" role="alert">
      <h1 className="text-2xl font-semibold text-[var(--foreground)]" id="route-error-title">
        {messages.title}
      </h1>
      <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      <button
        className="min-h-11 border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-medium text-[var(--foreground)]"
        onClick={reset}
        type="button"
      >
        {messages.retry}
      </button>
    </section>
  );
}
