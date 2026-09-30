"use client";

import Link from "next/link";

import { formatMessageTemplate } from "../lib/i18n/format";
import type { MissionControlMessages } from "../lib/i18n/messages/types";
import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getContinueLessonSlug, isLearningPathComplete } from "../lib/learning/prerequisites";
import { useLearningPathProgress, useLearningProgressStatus } from "../lib/learning/progress-store";

type ContinueLearningCardProps = Readonly<{
  content: LearningContent;
  messages: MissionControlMessages["continueLearning"];
  path: LearningPath;
}>;

export function ContinueLearningCard({ content, messages, path }: ContinueLearningCardProps) {
  const status = useLearningProgressStatus();
  const progress = useLearningPathProgress(path.slug);
  const lessonSlug = getContinueLessonSlug(path, progress);
  const lesson = content.lessons.find((entry) => entry.slug === lessonSlug);
  const lessonTitle = lesson?.title ?? messages.nextLessonFallback;
  const pathComplete = isLearningPathComplete(path, progress);
  const masteredCount = path.lesson_slugs.filter((slug) =>
    progress?.lessons.some(
      (lessonProgress) => lessonProgress.lesson_slug === slug && lessonProgress.mastered,
    ),
  ).length;
  const linkLabel =
    progress === null
      ? formatMessageTemplate(messages.startPath, { pathTitle: path.title })
      : pathComplete
        ? formatMessageTemplate(messages.reviewPath, { pathTitle: path.title })
        : formatMessageTemplate(messages.continueLesson, { lessonTitle });

  return (
    <section
      aria-labelledby="continue-learning-heading"
      className="border-y border-[var(--border)] py-7"
    >
      <p className="font-mono text-[0.68rem] font-semibold tracking-[0.12em] text-[var(--accent)] uppercase">
        {messages.eyebrow}
      </p>
      <h2
        className="mt-3 font-[var(--font-display)] text-3xl font-medium tracking-[-0.035em]"
        id="continue-learning-heading"
      >
        {messages.title}
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">
        {pathComplete ? messages.completeDescription : messages.activeDescription}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          className="inline-flex min-h-11 items-center border-b border-[var(--accent)] font-semibold text-[var(--foreground)] no-underline transition-colors hover:text-[var(--accent-strong)]"
          href={`/learn/${path.slug}/${lessonSlug}`}
        >
          {linkLabel}
        </Link>
        <span className="text-sm text-[var(--muted)]">
          {status === "loading"
            ? messages.checkingProgress
            : progress === null
              ? formatMessageTemplate(messages.noProgress, {
                  lessonCount: path.lesson_slugs.length,
                })
              : formatMessageTemplate(messages.progress, {
                  lessonCount: path.lesson_slugs.length,
                  masteredCount,
                })}
        </span>
      </div>
    </section>
  );
}
