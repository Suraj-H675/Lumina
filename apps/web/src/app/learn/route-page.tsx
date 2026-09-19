import type { Metadata } from "next";
import Link from "next/link";

import { LearningProgressControls } from "../../components/learning-progress-controls";
import { formatMessageTemplate } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { LearnLandingMessages, LearnMessages } from "../../lib/i18n/messages/types";
import { loadLearningContent } from "../../lib/learning/content";

export function learnLandingMetadata(messages: LearnLandingMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export function LearnLandingRoute({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: LearnMessages }>) {
  const content = loadLearningContent();
  const path = content.path;
  const landing = messages.landing;

  return (
    <article className="space-y-12">
      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {landing.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{landing.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{landing.intro}</p>
      </header>
      <section
        aria-labelledby="available-path-heading"
        className="max-w-3xl space-y-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
      >
        <p className="text-sm font-semibold text-[var(--accent)]">{landing.pathLabel}</p>
        <h2 id="available-path-heading">{path.title}</h2>
        <p className="leading-7 text-[var(--muted)]">{path.summary}</p>
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(landing.pathMeta, { lessonCount: path.lesson_slugs.length })}
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold text-[var(--foreground)] no-underline hover:border-[var(--accent)]"
          href={`/learn/${path.slug}`}
        >
          {landing.viewPath}
        </Link>
      </section>
      <LearningProgressControls locale={locale} messages={messages.progressControls} />
    </article>
  );
}
