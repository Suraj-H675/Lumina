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
      className="max-w-2xl rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
    >
      <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
        {messages.eyebrow}
      </p>
      <h2 className="mt-2 text-2xl font-semibold" id="continue-learning-heading">
        {messages.title}
      </h2>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        {pathComplete ? messages.completeDescription : messages.activeDescription}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold text-[var(--foreground)] no-underline hover:border-[var(--accent)]"
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
