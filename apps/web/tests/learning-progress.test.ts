import { describe, expect, it } from "vitest";

import {
  EMPTY_LEARNING_PROGRESS,
  mergeLearningProgress,
  recordQuizAttemptMutation,
  startLessonMutation,
  validateLearningProgress,
} from "../src/lib/learning/progress-model";
import {
  createLearningProgressExport,
  parseLearningProgressExport,
} from "../src/lib/learning/progress-export";

const REQUIRED_LESSONS = ["start-with-the-sky", "find-patterns-and-directions"];
const FIRST_EVALUATION = { correct_count: 2, passed: false, score: 2 / 3, total_questions: 3 };
const MASTERED_EVALUATION = { correct_count: 3, passed: true, score: 1, total_questions: 3 };

describe("learning progress policy", () => {
  it("starts a path and remembers the latest lesson locally", () => {
    const started = startLessonMutation(
      EMPTY_LEARNING_PROGRESS,
      "your-first-night-sky",
      "start-with-the-sky",
      "2026-09-01T10:00:00.000Z",
    );

    expect(started.paths[0]).toMatchObject({
      last_lesson_slug: "start-with-the-sky",
      path_slug: "your-first-night-sky",
      started_at: "2026-09-01T10:00:00.000Z",
    });
  });

  it("requires 0.8 mastery and completes only after every required lesson", () => {
    let progress = startLessonMutation(
      EMPTY_LEARNING_PROGRESS,
      "your-first-night-sky",
      "start-with-the-sky",
      "2026-09-01T10:00:00.000Z",
    );
    progress = recordQuizAttemptMutation(
      progress,
      "your-first-night-sky",
      "start-with-the-sky",
      FIRST_EVALUATION,
      REQUIRED_LESSONS,
      "attempt-1",
      "2026-09-01T10:01:00.000Z",
    );
    expect(progress.paths[0]?.lessons[0]).toMatchObject({ mastered: false, best_score: 2 / 3 });
    expect(progress.paths[0]?.completed).toBe(false);

    progress = recordQuizAttemptMutation(
      progress,
      "your-first-night-sky",
      "start-with-the-sky",
      MASTERED_EVALUATION,
      REQUIRED_LESSONS,
      "attempt-2",
      "2026-09-01T10:02:00.000Z",
    );
    expect(progress.paths[0]?.lessons[0]).toMatchObject({ mastered: true, best_score: 1 });
    expect(progress.paths[0]?.completed).toBe(false);

    progress = recordQuizAttemptMutation(
      progress,
      "your-first-night-sky",
      "find-patterns-and-directions",
      MASTERED_EVALUATION,
      REQUIRED_LESSONS,
      "attempt-3",
      "2026-09-01T10:03:00.000Z",
    );
    expect(progress.paths[0]?.completed).toBe(true);
  });

  it("round-trips an export and merges imported attempts without losing local progress", async () => {
    const local = recordQuizAttemptMutation(
      startLessonMutation(
        EMPTY_LEARNING_PROGRESS,
        "your-first-night-sky",
        "start-with-the-sky",
        "2026-09-01T10:00:00.000Z",
      ),
      "your-first-night-sky",
      "start-with-the-sky",
      MASTERED_EVALUATION,
      REQUIRED_LESSONS,
      "local-attempt",
      "2026-09-01T10:05:00.000Z",
    );
    const imported = recordQuizAttemptMutation(
      startLessonMutation(
        EMPTY_LEARNING_PROGRESS,
        "your-first-night-sky",
        "find-patterns-and-directions",
        "2026-08-31T10:00:00.000Z",
      ),
      "your-first-night-sky",
      "find-patterns-and-directions",
      MASTERED_EVALUATION,
      REQUIRED_LESSONS,
      "imported-attempt",
      "2026-08-31T10:01:00.000Z",
    );
    const envelope = await createLearningProgressExport(imported, "2026-09-01T11:00:00.000Z");
    const parsed = await parseLearningProgressExport(JSON.stringify(envelope));

    expect(parsed).toEqual(imported);
    const merged = mergeLearningProgress(local, parsed);
    expect(merged.paths[0]?.lessons.map((lesson) => lesson.lesson_slug)).toEqual(REQUIRED_LESSONS);
    expect(merged.paths[0]?.attempts).toHaveLength(2);
    expect(merged.paths[0]?.lessons.every((lesson) => lesson.mastered)).toBe(true);
  });

  it("rejects tampered, unknown, and malformed progress exports", async () => {
    const envelope = await createLearningProgressExport(
      EMPTY_LEARNING_PROGRESS,
      "2026-09-01T11:00:00.000Z",
    );
    const tampered = structuredClone(envelope);
    (tampered.sections.learning_progress as unknown as { version: number }).version = 99;

    await expect(parseLearningProgressExport(JSON.stringify(tampered))).rejects.toThrow(
      /checksum|schema|validated/i,
    );
    expect(validateLearningProgress({ version: 1, paths: [{ nope: true }] })).toBeNull();
    const impossibleCompletion = startLessonMutation(
      EMPTY_LEARNING_PROGRESS,
      "your-first-night-sky",
      "start-with-the-sky",
      "2026-09-01T10:00:00.000Z",
    );
    impossibleCompletion.paths[0]!.completed = true;
    expect(validateLearningProgress(impossibleCompletion)).toBeNull();
    await expect(parseLearningProgressExport("{not json")).rejects.toThrow(
      /could not be validated/i,
    );
  });
});
