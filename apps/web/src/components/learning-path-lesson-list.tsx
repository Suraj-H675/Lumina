"use client";

import Link from "next/link";

import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getLessonPrerequisiteState, isLearningPathComplete } from "../lib/learning/prerequisites";
import { useLearningPathProgress, useLearningProgressStatus } from "../lib/learning/progress-store";

type LearningPathLessonListProps = Readonly<{
  content: LearningContent;
  path: LearningPath;
}>;

export function LearningPathLessonList({ content, path }: LearningPathLessonListProps) {
  const status = useLearningProgressStatus();
  const progress = useLearningPathProgress(path.slug);
  const mastered = new Set(
    (progress?.lessons ?? [])
      .filter((lesson) => lesson.mastered)
      .map((lesson) => lesson.lesson_slug),
  );
  const masteredCount = path.lesson_slugs.filter((slug) => mastered.has(slug)).length;
  const pathComplete = isLearningPathComplete(path, progress);

  return (
    <section aria-labelledby="path-lessons-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="path-lessons-heading">Lessons</h2>
        <p className="text-sm text-[var(--muted)]">
          {status === "loading"
            ? "Checking local progress…"
            : `${masteredCount} of ${path.lesson_slugs.length} mastered`}
        </p>
      </div>
      {status === "corrupted" ? (
        <p className="text-sm text-[var(--warning)]" role="status">
          Saved progress could not be read. You can still read the lessons, but progress is paused
          until it is reset.
        </p>
      ) : null}
      <ol className="m-0 grid list-none gap-3 p-0">
        {path.lesson_slugs.map((lessonSlug, index) => {
          const lesson = content.lessons.find((entry) => entry.slug === lessonSlug);
          if (lesson === undefined) return null;
          const prerequisiteState = getLessonPrerequisiteState(lesson, progress);
          const lessonProgress = progress?.lessons.find(
            (entry) => entry.lesson_slug === lesson.slug,
          );
          const isMastered = mastered.has(lesson.slug);
          const stateLabel = isMastered
            ? "Mastered"
            : lessonProgress === undefined || lessonProgress.attempts === 0
              ? "Not started"
              : "In progress";
          return (
            <li key={lesson.slug}>
              {prerequisiteState.unlocked ? (
                <Link
                  className="flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  href={`/learn/${path.slug}/${lesson.slug}`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-[var(--muted)]">Lesson {index + 1}</span>
                    <span className="block text-lg font-semibold text-[var(--foreground)]">
                      {lesson.title}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--muted)]">{lesson.summary}</span>
                  </span>
                  <span
                    className={
                      isMastered
                        ? "shrink-0 text-sm font-semibold text-[var(--success)]"
                        : "shrink-0 text-sm font-semibold text-[var(--accent)]"
                    }
                  >
                    {stateLabel}
                  </span>
                </Link>
              ) : (
                <div
                  aria-disabled="true"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-[var(--border)] px-5 py-4 opacity-75"
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-[var(--muted)]">Lesson {index + 1}</span>
                    <span className="block text-lg font-semibold text-[var(--foreground)]">
                      {lesson.title}
                    </span>
                    <span className="mt-1 block text-sm text-[var(--muted)]">
                      Complete first: {prerequisiteState.missing.join(", ")}.
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-[var(--muted)]">Locked</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {pathComplete ? (
        <p
          className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 font-semibold text-[var(--success)]"
          role="status"
        >
          Path complete — every lesson is mastered at the 0.8 threshold.
        </p>
      ) : null}
    </section>
  );
}
