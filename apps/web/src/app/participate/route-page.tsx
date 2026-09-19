import type { Metadata } from "next";

import { ParticipateEnhanced } from "../../components/participate-enhanced";
import { ParticipateNoScript } from "../../components/participate-no-script";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { ParticipateMessages } from "../../lib/i18n/messages/types";
import { loadParticipate } from "../../lib/server/participate";

export function createParticipateMetadata(messages: ParticipateMessages): Metadata {
  return {
    alternates: { canonical: "/participate" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default async function ParticipatePage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: ParticipateMessages }>) {
  const outcome = await loadParticipate();
  if (outcome.kind !== "ok") {
    return (
      <article className="max-w-4xl space-y-6">
        <header className="space-y-4">
          <p className="text-sm font-semibold tracking-[0.14em] text-[var(--accent)] uppercase">
            {messages.eyebrow}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {messages.metadataTitle}
          </h1>
        </header>
        <section
          aria-labelledby="participate-unavailable-heading"
          className="space-y-3"
          role="alert"
        >
          <h2 className="text-2xl font-semibold" id="participate-unavailable-heading">
            {messages.unavailable.title}
          </h2>
          <p className="leading-7 text-[var(--muted)]">{messages.unavailable.description}</p>
        </section>
      </article>
    );
  }

  return (
    <>
      <ParticipateNoScript locale={locale} messages={messages} response={outcome.data} />
      <ParticipateEnhanced locale={locale} messages={messages} response={outcome.data} />
    </>
  );
}
