import { QUIZ_MASTERY_THRESHOLD } from "./quiz";

export const LEARNING_PROGRESS_STORAGE_KEY = "lumina.learning.v1";
export const LEARNING_PROGRESS_SCHEMA_VERSION = 1 as const;
export const MAX_LEARNING_PATHS = 20;
export const MAX_LEARNING_ATTEMPTS_PER_PATH = 200;

export type LearningQuizAttempt = {
  id: string;
  lesson_slug: string;
  score: number;
  correct_count: number;
  total_questions: number;
  passed: boolean;
  submitted_at: string;
};

export type LearningLessonProgress = {
  lesson_slug: string;
  attempts: number;
  best_score: number;
  mastered: boolean;
  last_attempt_at: string | null;
};

export type LearningPathProgress = {
  path_slug: string;
  started_at: string;
  updated_at: string;
  last_lesson_slug: string | null;
  completed: boolean;
  lessons: LearningLessonProgress[];
  attempts: LearningQuizAttempt[];
};

export type LearningProgressData = {
  version: 1;
  paths: LearningPathProgress[];
};

export const EMPTY_LEARNING_PROGRESS: LearningProgressData = { paths: [], version: 1 };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/iu;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export class LearningProgressValidationError extends Error {
  readonly code = "LEARNING_PROGRESS_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "LearningProgressValidationError";
  }
}

function fail(message: string): never {
  throw new LearningProgressValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validAttempt(value: unknown): value is LearningQuizAttempt {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "correct_count",
      "id",
      "lesson_slug",
      "passed",
      "score",
      "submitted_at",
      "total_questions",
    ])
  ) {
    return false;
  }
  return (
    isSafeId(value.id) &&
    isSlug(value.lesson_slug) &&
    isScore(value.score) &&
    isNonNegativeInteger(value.correct_count) &&
    isPositiveInteger(value.total_questions) &&
    value.correct_count <= value.total_questions &&
    value.score === value.correct_count / value.total_questions &&
    value.passed === value.score >= QUIZ_MASTERY_THRESHOLD &&
    isTimestamp(value.submitted_at)
  );
}

function validLessonProgress(value: unknown): value is LearningLessonProgress {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["attempts", "best_score", "last_attempt_at", "lesson_slug", "mastered"])
  ) {
    return false;
  }
  return (
    isSlug(value.lesson_slug) &&
    isNonNegativeInteger(value.attempts) &&
    isScore(value.best_score) &&
    typeof value.mastered === "boolean" &&
    value.mastered === value.best_score >= QUIZ_MASTERY_THRESHOLD &&
    (value.last_attempt_at === null || isTimestamp(value.last_attempt_at))
  );
}

function validPathProgress(value: unknown): value is LearningPathProgress {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "attempts",
      "completed",
      "last_lesson_slug",
      "lessons",
      "path_slug",
      "started_at",
      "updated_at",
    ]) ||
    !isSlug(value.path_slug) ||
    !isTimestamp(value.started_at) ||
    !isTimestamp(value.updated_at) ||
    (value.last_lesson_slug !== null && !isSlug(value.last_lesson_slug)) ||
    typeof value.completed !== "boolean" ||
    !Array.isArray(value.lessons) ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > MAX_LEARNING_ATTEMPTS_PER_PATH ||
    !value.lessons.every(validLessonProgress) ||
    !value.attempts.every(validAttempt)
  ) {
    return false;
  }
  const lessons = value.lessons;
  const attempts = value.attempts;
  if (new Set(lessons.map((lesson) => lesson.lesson_slug)).size !== lessons.length) return false;
  if (new Set(attempts.map((attempt) => attempt.id)).size !== attempts.length) return false;
  if (
    attempts.some(
      (attempt) => !lessons.some((lesson) => lesson.lesson_slug === attempt.lesson_slug),
    )
  ) {
    return false;
  }
  for (const lesson of lessons) {
    const lessonAttempts = attempts.filter((attempt) => attempt.lesson_slug === lesson.lesson_slug);
    const bestScore = lessonAttempts.reduce((best, attempt) => Math.max(best, attempt.score), 0);
    const lastAttempt = lessonAttempts.reduce<string | null>(
      (latest, attempt) =>
        latest === null || attempt.submitted_at > latest ? attempt.submitted_at : latest,
      null,
    );
    if (
      lesson.attempts !== lessonAttempts.length ||
      lesson.best_score !== bestScore ||
      lesson.mastered !== bestScore >= QUIZ_MASTERY_THRESHOLD ||
      lesson.last_attempt_at !== lastAttempt
    ) {
      return false;
    }
  }
  if (value.completed && (lessons.length === 0 || lessons.some((lesson) => !lesson.mastered))) {
    return false;
  }
  return true;
}

/** Validate untrusted local bytes without throwing or exposing raw payloads. */
export function validateLearningProgress(value: unknown): LearningProgressData | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["paths", "version"]) ||
    value.version !== LEARNING_PROGRESS_SCHEMA_VERSION ||
    !Array.isArray(value.paths) ||
    value.paths.length > MAX_LEARNING_PATHS ||
    !value.paths.every(validPathProgress)
  ) {
    return null;
  }
  if (new Set(value.paths.map((path) => path.path_slug)).size !== value.paths.length) return null;
  return { paths: value.paths, version: 1 };
}

function ensureSlug(value: string, field: string): void {
  if (!isSlug(value)) fail(`${field} is invalid`);
}

function ensureTimestamp(value: string, field: string): void {
  if (!isTimestamp(value)) fail(`${field} is invalid`);
}

function emptyLessonProgress(lessonSlug: string): LearningLessonProgress {
  return {
    attempts: 0,
    best_score: 0,
    last_attempt_at: null,
    lesson_slug: lessonSlug,
    mastered: false,
  };
}

function withLesson(path: LearningPathProgress, lessonSlug: string): LearningPathProgress {
  if (path.lessons.some((lesson) => lesson.lesson_slug === lessonSlug)) return path;
  return { ...path, lessons: [...path.lessons, emptyLessonProgress(lessonSlug)] };
}

function pathFor(data: LearningProgressData, pathSlug: string): LearningPathProgress | undefined {
  return data.paths.find((path) => path.path_slug === pathSlug);
}

/** Start a lesson and update Continue Learning's latest location. */
export function startLessonMutation(
  data: LearningProgressData,
  pathSlug: string,
  lessonSlug: string,
  now: string,
): LearningProgressData {
  ensureSlug(pathSlug, "path slug");
  ensureSlug(lessonSlug, "lesson slug");
  ensureTimestamp(now, "timestamp");
  const existing = pathFor(data, pathSlug);
  if (existing === undefined) {
    return {
      paths: [
        ...data.paths,
        {
          attempts: [],
          completed: false,
          last_lesson_slug: lessonSlug,
          lessons: [emptyLessonProgress(lessonSlug)],
          path_slug: pathSlug,
          started_at: now,
          updated_at: now,
        },
      ],
      version: 1,
    };
  }
  const nextPath = withLesson(
    { ...existing, last_lesson_slug: lessonSlug, updated_at: now },
    lessonSlug,
  );
  return {
    paths: data.paths.map((path) => (path.path_slug === pathSlug ? nextPath : path)),
    version: 1,
  };
}

type EvaluationSummary = Readonly<{
  correct_count: number;
  passed: boolean;
  score: number;
  total_questions: number;
}>;

function assertEvaluation(evaluation: EvaluationSummary): void {
  if (
    !isNonNegativeInteger(evaluation.correct_count) ||
    !isPositiveInteger(evaluation.total_questions) ||
    evaluation.correct_count > evaluation.total_questions ||
    !isScore(evaluation.score) ||
    evaluation.score !== evaluation.correct_count / evaluation.total_questions
  ) {
    fail("quiz evaluation is invalid");
  }
}

/** Record one aggregate quiz attempt; repeated attempt ids are idempotent. */
export function recordQuizAttemptMutation(
  data: LearningProgressData,
  pathSlug: string,
  lessonSlug: string,
  evaluation: EvaluationSummary,
  requiredLessonSlugs: ReadonlyArray<string>,
  attemptId: string,
  submittedAt: string,
): LearningProgressData {
  ensureSlug(pathSlug, "path slug");
  ensureSlug(lessonSlug, "lesson slug");
  ensureSlug(attemptId, "attempt id");
  ensureTimestamp(submittedAt, "timestamp");
  assertEvaluation(evaluation);
  if (requiredLessonSlugs.length === 0 || requiredLessonSlugs.some((slug) => !isSlug(slug))) {
    fail("required lesson list is invalid");
  }
  const existing = pathFor(data, pathSlug);
  const started =
    existing ??
    ({
      attempts: [],
      completed: false,
      last_lesson_slug: null,
      lessons: [],
      path_slug: pathSlug,
      started_at: submittedAt,
      updated_at: submittedAt,
    } satisfies LearningPathProgress);
  if (started.attempts.some((attempt) => attempt.id === attemptId)) return data;
  if (started.attempts.length >= MAX_LEARNING_ATTEMPTS_PER_PATH)
    fail("learning attempt limit reached");
  const attempt: LearningQuizAttempt = {
    correct_count: evaluation.correct_count,
    id: attemptId,
    lesson_slug: lessonSlug,
    passed: evaluation.score >= QUIZ_MASTERY_THRESHOLD,
    score: evaluation.score,
    submitted_at: submittedAt,
    total_questions: evaluation.total_questions,
  };
  const pathWithLesson = withLesson(started, lessonSlug);
  const attempts = [...pathWithLesson.attempts, attempt];
  const lessons = pathWithLesson.lessons.map((lesson) => {
    const lessonAttempts = attempts.filter((entry) => entry.lesson_slug === lesson.lesson_slug);
    const bestScore = lessonAttempts.reduce((best, entry) => Math.max(best, entry.score), 0);
    const lastAttemptAt = lessonAttempts.reduce<string | null>(
      (latest, entry) =>
        latest === null || entry.submitted_at > latest ? entry.submitted_at : latest,
      null,
    );
    return {
      ...lesson,
      attempts: lessonAttempts.length,
      best_score: bestScore,
      last_attempt_at: lastAttemptAt,
      mastered: bestScore >= QUIZ_MASTERY_THRESHOLD,
    };
  });
  const completed = requiredLessonSlugs.every((requiredSlug) =>
    lessons.some((lesson) => lesson.lesson_slug === requiredSlug && lesson.mastered),
  );
  const nextPath: LearningPathProgress = {
    ...pathWithLesson,
    attempts,
    completed,
    last_lesson_slug: lessonSlug,
    lessons,
    updated_at: submittedAt,
  };
  return {
    paths: data.paths.some((path) => path.path_slug === pathSlug)
      ? data.paths.map((path) => (path.path_slug === pathSlug ? nextPath : path))
      : [...data.paths, nextPath],
    version: 1,
  };
}

function mergePathProgress(
  local: LearningPathProgress,
  imported: LearningPathProgress,
): LearningPathProgress {
  const attemptsById = new Map(local.attempts.map((attempt) => [attempt.id, attempt]));
  for (const attempt of imported.attempts) {
    const existing = attemptsById.get(attempt.id);
    if (existing === undefined || attempt.submitted_at > existing.submitted_at) {
      attemptsById.set(attempt.id, attempt);
    }
  }
  const attempts = [...attemptsById.values()].sort(
    (left, right) =>
      left.submitted_at.localeCompare(right.submitted_at) || left.id.localeCompare(right.id),
  );
  const lessonSlugs = [
    ...new Set([
      ...local.lessons.map((lesson) => lesson.lesson_slug),
      ...imported.lessons.map((lesson) => lesson.lesson_slug),
      ...attempts.map((attempt) => attempt.lesson_slug),
    ]),
  ];
  const lessons = lessonSlugs.map((lessonSlug) => {
    const lessonAttempts = attempts.filter((attempt) => attempt.lesson_slug === lessonSlug);
    const bestScore = lessonAttempts.reduce((best, attempt) => Math.max(best, attempt.score), 0);
    const lastAttemptAt = lessonAttempts.reduce<string | null>(
      (latest, attempt) =>
        latest === null || attempt.submitted_at > latest ? attempt.submitted_at : latest,
      null,
    );
    return {
      attempts: lessonAttempts.length,
      best_score: bestScore,
      last_attempt_at: lastAttemptAt,
      lesson_slug: lessonSlug,
      mastered: bestScore >= QUIZ_MASTERY_THRESHOLD,
    };
  });
  const useImportedLatest = imported.updated_at > local.updated_at;
  return {
    attempts,
    completed: local.completed || imported.completed,
    last_lesson_slug: useImportedLatest ? imported.last_lesson_slug : local.last_lesson_slug,
    lessons,
    path_slug: local.path_slug,
    started_at: local.started_at < imported.started_at ? local.started_at : imported.started_at,
    updated_at: local.updated_at > imported.updated_at ? local.updated_at : imported.updated_at,
  };
}

/** Merge local and imported progress monotonically, preserving newer local records. */
export function mergeLearningProgress(
  local: LearningProgressData,
  imported: LearningProgressData,
): LearningProgressData {
  const importedByPath = new Map(imported.paths.map((path) => [path.path_slug, path]));
  const paths = local.paths.map((path) => {
    const importedPath = importedByPath.get(path.path_slug);
    return importedPath === undefined ? path : mergePathProgress(path, importedPath);
  });
  for (const importedPath of imported.paths) {
    if (!local.paths.some((path) => path.path_slug === importedPath.path_slug))
      paths.push(importedPath);
  }
  const merged = { paths, version: 1 as const };
  const validated = validateLearningProgress(merged);
  return validated === null ? fail("merged learning progress is invalid") : validated;
}
