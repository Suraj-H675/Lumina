import Link from "next/link";

import { formatCountMessage, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningPathMessages } from "../lib/i18n/messages/types";
import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getSourcesForIds } from "../lib/learning/content";

import { LearningPathLessonList } from "./learning-path-lesson-list";
import { LearningSources } from "./learning-sources";

type LearningPathViewProps = Readonly<{
  content: LearningContent;
  locale: PublishedLocale;
  messages: LearningPathMessages;
  path: LearningPath;
}>;

export function LearningPathView({ content, locale, messages, path }: LearningPathViewProps) {
  return (
    <article className="space-y-12">
      <nav aria-label={messages.breadcrumbLabel}>
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>
            <Link className="text-[var(--link)] underline" href="/learn">
              {messages.learnLink}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{path.title}</li>
        </ol>
      </nav>
      <header className="max-w-3xl space-y-5">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{path.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{path.summary}</p>
        <p className="text-sm text-[var(--muted)]">
          {formatCountMessage(messages.lessonMeta, path.lesson_slugs.length, locale)}
        </p>
      </header>
      <section aria-labelledby="path-objectives-heading" className="max-w-3xl space-y-4">
        <h2 id="path-objectives-heading">{messages.objectivesTitle}</h2>
        <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
          {path.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>
      <LearningPathLessonList
        content={content}
        locale={locale}
        messages={messages.lessonList}
        path={path}
      />
      <section
        aria-labelledby="path-capstone-heading"
        className="max-w-3xl space-y-4 border-t border-[var(--border)] pt-8"
      >
        <h2 id="path-capstone-heading">
          {formatMessageTemplate(messages.capstoneTitle, {
            capstoneTitle: path.capstone_activity.title,
          })}
        </h2>
        <p className="leading-7 text-[var(--muted)]">{messages.capstoneIntro}</p>
        <ol className="m-0 grid list-decimal gap-2 pl-6 leading-7 text-[var(--muted)]">
          {path.capstone_activity.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 text-sm leading-6 text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">{messages.safetyLabel}</strong>{" "}
          {path.capstone_activity.safety}
        </p>
      </section>
      <LearningSources
        reviewedAt={path.reviewed_at}
        reviewedBy={path.reviewed_by}
        sources={getSourcesForIds(content, path.source_ids)}
        version={path.version}
      />
    </article>
  );
}
