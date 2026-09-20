"use client";

import type { RouteErrorMessages } from "../../lib/i18n/messages/types";

type LearningErrorProps = Readonly<{
  error: Error & { digest?: string };
  messages: RouteErrorMessages;
  reset: () => void;
}>;

export default function LearningError({ messages, reset }: LearningErrorProps) {
  return (
    <section aria-labelledby="learning-error-heading" className="max-w-2xl space-y-4" role="alert">
      <h1 id="learning-error-heading">{messages.title}</h1>
      <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      <button
        className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold"
        onClick={reset}
        type="button"
      >
        {messages.retry}
      </button>
    </section>
  );
}
