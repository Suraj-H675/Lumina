"use client";

import Link from "next/link";

import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getContinueLessonSlug, isLearningPathComplete } from "../lib/learning/prerequisites";
import { useLearningPathProgress, useLearningProgressStatus } from "../lib/learning/progress-store";

type ContinueLearningCardProps = Readonly<{
  content: LearningContent;
  path: LearningPath;
}>;

export function ContinueLearningCard({ content, path }: ContinueLearningCardProps) {
  const status = useLearningProgressStatus();
  const progress = useLearningPathProgress(path.slug);
  const lessonSlug = getContinueLessonSlug(path, progress);
  const lesson = content.lessons.find((entry) => entry.slug === lessonSlug);
  const lessonTitle = lesson?.title ?? "the next lesson";
  const pathComplete = isLearningPathComplete(path, progress);
  const masteredCount = path.lesson_slugs.filter((slug) =>
    progress?.lessons.some(
      (lessonProgress) => lessonProgress.lesson_slug === slug && lessonProgress.mastered,
    ),
  ).length;
  const linkLabel =
    progress === null
      ? "Start Your First Night Sky"
      : pathComplete
        ? "Review Your First Night Sky"
        : `Continue with ${lessonTitle}`;

  return (
    <section
      aria-labelledby="continue-learning-heading"
      className="max-w-2xl rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
    >
      <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
        Mission Control
      </p>
      <h2 className="mt-2 text-2xl font-semibold" id="continue-learning-heading">
        Continue Learning
      </h2>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        {pathComplete
          ? "Your first path is complete. Revisit a lesson or make another sky note."
          : "Build a first observing habit with a complete, source-backed learning path."}
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
            ? "Checking local progress…"
            : progress === null
              ? `${path.lesson_slugs.length} lessons · saved only on this device`
              : `${masteredCount} of ${path.lesson_slugs.length} lessons mastered locally`}
        </span>
      </div>
    </section>
  );
}
