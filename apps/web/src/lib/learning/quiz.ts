import type { LearningQuiz } from "./content";

/** Fixed policy for every Phase 3A scored knowledge check. */
export const QUIZ_MASTERY_THRESHOLD = 0.8;

export type QuizQuestionEvaluation = {
  question_id: string;
  selected_choice_id: string | null;
  correct: boolean;
  feedback: string;
  explanation: string;
  hint: string;
};

export type QuizEvaluation = {
  correct_count: number;
  passed: boolean;
  score: number;
  total_questions: number;
  results: QuizQuestionEvaluation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Evaluate one authored quiz without normalising or generating any answer.
 * Unknown question keys, missing answers, and invalid choice ids are incorrect.
 */
export function evaluateQuiz(quiz: LearningQuiz, answers: unknown): QuizEvaluation {
  const answerRecord = isRecord(answers) ? answers : {};
  const results = quiz.questions.map((question) => {
    const candidate = answerRecord[question.id];
    const selectedChoiceId =
      typeof candidate === "string" && question.choices.some((choice) => choice.id === candidate)
        ? candidate
        : null;
    const correct = selectedChoiceId === question.correct_choice_id;
    return {
      correct,
      explanation: question.explanation,
      feedback: correct ? question.feedback_correct : question.feedback_incorrect,
      hint: question.hint,
      question_id: question.id,
      selected_choice_id: selectedChoiceId,
    };
  });
  const correctCount = results.filter((result) => result.correct).length;
  const totalQuestions = quiz.questions.length;
  const score = correctCount / totalQuestions;
  return {
    correct_count: correctCount,
    passed: score >= QUIZ_MASTERY_THRESHOLD,
    score,
    total_questions: totalQuestions,
    results,
  };
}
