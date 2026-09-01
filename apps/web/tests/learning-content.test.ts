import { describe, expect, it } from "vitest";

import {
  getLearningPath,
  loadLearningContent,
  validateLearningContent,
  type LearningContent,
} from "../src/lib/learning/content";

describe("learning content contract", () => {
  it("loads a complete published Your First Night Sky path", () => {
    const content = loadLearningContent();
    const path = getLearningPath(content, "your-first-night-sky");

    expect(path.status).toBe("published");
    expect(path.title).toBe("Your First Night Sky");
    expect(path.lesson_slugs.length).toBeGreaterThanOrEqual(4);
    expect(content.lessons.every((lesson) => lesson.knowledge_check_ids.length > 0)).toBe(true);
    expect(content.lessons.every((lesson) => lesson.source_ids.length > 0)).toBe(true);
    expect(content.quizzes.every((quiz) => quiz.questions.length >= 2)).toBe(true);
  });

  it("requires review provenance for published content", () => {
    const content = loadLearningContent();
    const unpublished = structuredClone(content) as LearningContent;
    unpublished.sources = [];

    expect(() => validateLearningContent(unpublished)).toThrow(
      /published learning content must include at least one source/i,
    );
  });

  it("rejects broken quiz links and missing deterministic answers", () => {
    const content = loadLearningContent();
    const broken = structuredClone(content) as LearningContent;
    const lesson = broken.lessons[0];
    const quiz = broken.quizzes[0];
    if (lesson === undefined || quiz === undefined || quiz.questions[0] === undefined) {
      throw new Error("fixture path is unexpectedly incomplete");
    }
    lesson.knowledge_check_ids = ["missing-quiz"];
    quiz.questions[0].correct_choice_id = "missing-choice";

    expect(() => validateLearningContent(broken)).toThrow(/knowledge check|correct choice/i);
  });

  it("rejects prerequisite cycles instead of publishing an unusable path", () => {
    const content = loadLearningContent();
    const broken = structuredClone(content) as LearningContent;
    const first = broken.lessons[0];
    const second = broken.lessons[1];
    if (first === undefined || second === undefined) throw new Error("fixture path is too short");
    first.prerequisites = [second.slug];
    second.prerequisites = [first.slug];

    expect(() => validateLearningContent(broken)).toThrow(/prerequisite cycle/i);
  });
});
