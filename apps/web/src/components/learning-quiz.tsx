"use client";

import { useState } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningLessonMessages } from "../lib/i18n/messages/types";
import type { LearningQuiz } from "../lib/learning/content";
import { evaluateQuiz, type QuizEvaluation } from "../lib/learning/quiz";

const primaryButtonClassName =
  "inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-hover)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60";

type LearningQuizProps = Readonly<{
  locale: PublishedLocale;
  messages: LearningLessonMessages["quiz"];
  onEvaluated: (evaluation: QuizEvaluation) => void;
  quiz: LearningQuiz;
}>;

export function LearningQuiz({ locale, messages, onEvaluated, quiz }: LearningQuizProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [evaluation, setEvaluation] = useState<QuizEvaluation | null>(null);

  function submit(): void {
    const nextEvaluation = evaluateQuiz(quiz, answers);
    setEvaluation(nextEvaluation);
    onEvaluated(nextEvaluation);
  }

  function reset(): void {
    setAnswers({});
    setEvaluation(null);
  }

  return (
    <section
      aria-labelledby="knowledge-check-heading"
      className="space-y-6 border-t border-[var(--border)] pt-8"
    >
      <div className="space-y-2">
        <h2 id="knowledge-check-heading">{messages.title}</h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.intro, { quizTitle: quiz.title })}
        </p>
      </div>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {quiz.questions.map((question, questionIndex) => (
          <fieldset
            className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5"
            key={question.id}
          >
            <legend className="max-w-full px-1 text-base font-semibold">
              {formatMessageTemplate(messages.question, {
                questionNumber: formatLocaleNumber(questionIndex + 1, locale),
                questionPrompt: question.prompt,
              })}
            </legend>
            <div className="space-y-2">
              {question.choices.map((choice) => {
                const inputId = `${quiz.id}-${question.id}-${choice.id}`;
                return (
                  <label
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2 py-2 hover:bg-[var(--surface-hover)]"
                    htmlFor={inputId}
                    key={choice.id}
                  >
                    <input
                      checked={answers[question.id] === choice.id}
                      id={inputId}
                      name={question.id}
                      onChange={() =>
                        setAnswers((current) => ({ ...current, [question.id]: choice.id }))
                      }
                      type="radio"
                      value={choice.id}
                    />
                    <span>{choice.label}</span>
                  </label>
                );
              })}
            </div>
            <details>
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-[var(--link)] underline">
                {messages.hintAction}
              </summary>
              <p className="leading-7 text-[var(--muted)]">{question.hint}</p>
            </details>
          </fieldset>
        ))}
        <div className="flex flex-wrap gap-3">
          <button className={primaryButtonClassName} type="submit">
            {messages.checkAnswers}
          </button>
          {evaluation !== null ? (
            <button
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-medium text-[var(--foreground)]"
              onClick={reset}
              type="button"
            >
              {messages.tryAgain}
            </button>
          ) : null}
        </div>
      </form>
      {evaluation !== null ? (
        <QuizResults evaluation={evaluation} locale={locale} messages={messages} quiz={quiz} />
      ) : null}
    </section>
  );
}

function QuizResults({
  evaluation,
  locale,
  messages,
  quiz,
}: Readonly<{
  evaluation: QuizEvaluation;
  locale: PublishedLocale;
  messages: LearningLessonMessages["quiz"];
  quiz: LearningQuiz;
}>) {
  const resultMessage = formatMessageTemplate(
    evaluation.passed ? messages.resultMastered : messages.keepPractising,
    {
      correctCount: formatLocaleNumber(evaluation.correct_count, locale),
      totalCount: formatLocaleNumber(evaluation.total_questions, locale),
    },
  );
  return (
    <section
      aria-live="polite"
      aria-labelledby="quiz-result-heading"
      className="space-y-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-5"
    >
      <h3 className="text-lg font-semibold" id="quiz-result-heading">
        {resultMessage}
      </h3>
      <ol className="m-0 grid list-decimal gap-4 pl-6">
        {evaluation.results.map((result, index) => {
          const question = quiz.questions[index];
          if (question === undefined) return null;
          return (
            <li key={result.question_id}>
              <p
                className={
                  result.correct
                    ? "font-semibold text-[var(--success)]"
                    : "font-semibold text-[var(--warning)]"
                }
              >
                {result.correct ? messages.correctLabel : messages.notYetLabel}: {result.feedback}
              </p>
              <p className="mt-1 leading-7 text-[var(--muted)]">{result.explanation}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
