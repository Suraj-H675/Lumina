import type { LearningLesson, LearningPath } from "./content";
import type { LearningPathProgress } from "./progress-model";

export type LessonPrerequisiteState = Readonly<{
  missing: string[];
  unlocked: boolean;
}>;

/** A lesson is available only when every authored prerequisite is mastered. */
export function getLessonPrerequisiteState(
  lesson: LearningLesson,
  progress: Pick<LearningPathProgress, "lessons"> | null,
): LessonPrerequisiteState {
  const mastered = new Set(
    (progress?.lessons ?? []).filter((entry) => entry.mastered).map((entry) => entry.lesson_slug),
  );
  const missing = lesson.prerequisites.filter((prerequisite) => !mastered.has(prerequisite));
  return { missing, unlocked: missing.length === 0 };
}

/** Continue at the first unmastered lesson in authored path order. */
export function getContinueLessonSlug(
  path: LearningPath,
  progress: Pick<LearningPathProgress, "lessons"> | null,
): string {
  const mastered = new Set(
    (progress?.lessons ?? []).filter((entry) => entry.mastered).map((entry) => entry.lesson_slug),
  );
  return path.lesson_slugs.find((slug) => !mastered.has(slug)) ?? path.lesson_slugs[0] ?? "";
}

/** Derive completion from the authored path, never from an imported flag alone. */
export function isLearningPathComplete(
  path: LearningPath,
  progress: Pick<LearningPathProgress, "lessons"> | null,
): boolean {
  if (progress === null) return false;
  const mastered = new Set(
    progress.lessons.filter((lesson) => lesson.mastered).map((lesson) => lesson.lesson_slug),
  );
  return path.lesson_slugs.every((slug) => mastered.has(slug));
}
