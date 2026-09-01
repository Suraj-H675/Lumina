import { describe, expect, it } from "vitest";

import { getQuizForLesson, loadLearningContent } from "../src/lib/learning/content";
import { evaluateQuiz } from "../src/lib/learning/quiz";

describe("learning quiz evaluation", () => {
  it("scores the same submitted answers deterministically", () => {
    const quiz = getQuizForLesson(loadLearningContent(), "read-the-moon");
    const answers = {
      "moon-light": "a",
      "moon-half-lit": "b",
      "moon-full-rise": "a",
    };

    expect(evaluateQuiz(quiz, answers)).toEqual({
      correct_count: 2,
      passed: false,
      score: 2 / 3,
      total_questions: 3,
      results: [
        expect.objectContaining({ question_id: "moon-light", correct: true }),
        expect.objectContaining({ question_id: "moon-half-lit", correct: false }),
        expect.objectContaining({ question_id: "moon-full-rise", correct: true }),
      ],
    });
  });

  it("returns authored feedback and passes only at the fixed mastery threshold", () => {
    const quiz = getQuizForLesson(loadLearningContent(), "read-the-moon");
    const evaluation = evaluateQuiz(quiz, {
      "moon-light": "a",
      "moon-half-lit": "a",
      "moon-full-rise": "a",
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.results[0]).toMatchObject({
      feedback: quiz.questions[0]?.feedback_correct,
      hint: quiz.questions[0]?.hint,
      explanation: quiz.questions[0]?.explanation,
    });
  });

  it("treats missing, unknown, and non-string answers as incorrect", () => {
    const quiz = getQuizForLesson(loadLearningContent(), "start-with-the-sky");
    const evaluation = evaluateQuiz(quiz, {
      "start-definition": "a",
      "unknown-question": "a",
      "start-equipment": 1,
    });

    expect(evaluation.correct_count).toBe(1);
    expect(evaluation.results[1]).toMatchObject({
      correct: false,
      feedback: quiz.questions[1]?.feedback_incorrect,
      selected_choice_id: null,
    });
  });
});
