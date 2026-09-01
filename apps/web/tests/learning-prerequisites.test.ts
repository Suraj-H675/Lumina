import { describe, expect, it } from "vitest";

import { loadLearningContent } from "../src/lib/learning/content";
import {
  getContinueLessonSlug,
  getLessonPrerequisiteState,
  isLearningPathComplete,
} from "../src/lib/learning/prerequisites";

describe("learning prerequisites and continuation", () => {
  it("unlocks the first lesson and keeps later lessons locked", () => {
    const content = loadLearningContent();
    const first = content.lessons[0];
    const second = content.lessons[1];
    if (first === undefined || second === undefined) throw new Error("path is unexpectedly short");

    expect(getLessonPrerequisiteState(first, null)).toEqual({ missing: [], unlocked: true });
    expect(getLessonPrerequisiteState(second, null)).toEqual({
      missing: ["start-with-the-sky"],
      unlocked: false,
    });
  });

  it("unlocks a lesson only after every prerequisite is mastered", () => {
    const content = loadLearningContent();
    const lesson = content.lessons.find((entry) => entry.slug === "choose-a-good-observing-place");
    if (lesson === undefined) throw new Error("expected lesson is missing");

    expect(
      getLessonPrerequisiteState(lesson, {
        lessons: [
          {
            attempts: 1,
            best_score: 1,
            last_attempt_at: "2026-09-01T10:00:00.000Z",
            lesson_slug: "find-patterns-and-directions",
            mastered: true,
          },
        ],
      }),
    ).toEqual({
      missing: ["read-the-moon"],
      unlocked: false,
    });
  });

  it("continues at the first unmastered lesson and starts at the first lesson", () => {
    const content = loadLearningContent();
    expect(getContinueLessonSlug(content.path, null)).toBe("start-with-the-sky");
    expect(
      getContinueLessonSlug(content.path, {
        lessons: [
          {
            attempts: 1,
            best_score: 1,
            last_attempt_at: "2026-09-01T10:00:00.000Z",
            lesson_slug: "start-with-the-sky",
            mastered: true,
          },
        ],
      }),
    ).toBe("find-patterns-and-directions");
  });

  it("derives path completion from every authored lesson", () => {
    const content = loadLearningContent();
    expect(isLearningPathComplete(content.path, null)).toBe(false);
    expect(
      isLearningPathComplete(content.path, {
        lessons: content.path.lesson_slugs.map((lesson_slug) => ({
          attempts: 1,
          best_score: 1,
          last_attempt_at: "2026-09-01T10:00:00.000Z",
          lesson_slug,
          mastered: true,
        })),
      }),
    ).toBe(true);
  });
});
