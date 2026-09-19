import Link from "next/link";

import type { NotFoundMessages } from "../lib/i18n/messages/types";

export default function NotFound({ messages }: Readonly<{ messages: NotFoundMessages }>) {
  return (
    <section aria-labelledby="not-found-title" className="max-w-2xl space-y-4">
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
        {messages.code}
      </p>
      <h1 className="text-2xl font-semibold text-[var(--foreground)]" id="not-found-title">
        {messages.title}
      </h1>
      <p className="leading-7 text-[var(--muted)]">{messages.description}</p>
      <Link
        className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
        href="/"
      >
        {messages.returnHome}
      </Link>
    </section>
  );
}
