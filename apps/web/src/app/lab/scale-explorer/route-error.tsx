"use client";

import type { RouteErrorMessages } from "../../../lib/i18n/messages/types";

type ScaleExplorerErrorProps = Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>;

export default function ScaleExplorerError({ error, messages, reset }: ScaleExplorerErrorProps) {
  void error;

  return (
    <section
      aria-labelledby="scale-route-error-heading"
      className="max-w-2xl space-y-4"
      role="alert"
    >
      <h1 className="text-2xl font-semibold" id="scale-route-error-heading">
        {messages.title}
      </h1>
      <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      <button
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 font-semibold"
        onClick={reset}
        type="button"
      >
        {messages.retry}
      </button>
    </section>
  );
}
