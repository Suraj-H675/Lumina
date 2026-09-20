import Link from "next/link";

import { formatMessageTemplate } from "../lib/i18n/format";
import type { ObjectMessages } from "../lib/i18n/messages/types";

/**
 * Public not-found experience for unknown catalogue slugs. Raw API error
 * bodies never surface here.
 */
export function ObjectNotFoundView({
  messages,
  slug,
}: Readonly<{ messages: ObjectMessages["notFound"]; slug: string }>) {
  const path = `/objects/${slug}`;
  return (
    <section aria-labelledby="object-not-found-title" className="mx-auto max-w-2xl space-y-6 py-10">
      <p className="text-sm font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">404</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" id="object-not-found-title">
        {messages.title}
      </h1>
      <p className="leading-7 text-[var(--muted)]">
        {formatMessageTemplate(messages.description, { path })}
      </p>
      <Link
        className="inline-flex min-h-11 items-center font-medium text-[var(--link)] underline"
        href="/explore"
      >
        {messages.browseCatalogue}
      </Link>
    </section>
  );
}
