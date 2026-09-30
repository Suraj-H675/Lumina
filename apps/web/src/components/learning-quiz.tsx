"use client";

import { useState } from "react";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningLessonMessages } from "../lib/i18n/messages/types";
import type { LearningQuiz } from "../lib/learning/content";
import { evaluateQuiz, type QuizEvaluation } from "../lib/learning/quiz";
import styles from "./learning-experience.module.css";

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
    <section aria-labelledby="knowledge-check-heading" className={styles.quiz}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle} id="knowledge-check-heading">
          {messages.title}
        </h2>
      </div>
      <div className={styles.quizBody}>
        <p className={styles.quizIntro}>
          {formatMessageTemplate(messages.intro, { quizTitle: quiz.title })}
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className={styles.quizQuestions}>
            {quiz.questions.map((question, questionIndex) => (
              <fieldset className={styles.question} key={question.id}>
                <legend>
                  {formatMessageTemplate(messages.question, {
                    questionNumber: formatLocaleNumber(questionIndex + 1, locale),
                    questionPrompt: question.prompt,
                  })}
                </legend>
                <div className={styles.choices}>
                  {question.choices.map((choice) => {
                    const inputId = `${quiz.id}-${question.id}-${choice.id}`;
                    return (
                      <label className={styles.choice} htmlFor={inputId} key={choice.id}>
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
                <details className={styles.hint}>
                  <summary>{messages.hintAction}</summary>
                  <p>{question.hint}</p>
                </details>
              </fieldset>
            ))}
          </div>
          <div className={styles.buttonRow}>
            <button className={styles.primaryButton} type="submit">
              {messages.checkAnswers}
            </button>
            {evaluation !== null ? (
              <button className={styles.secondaryButton} onClick={reset} type="button">
                {messages.tryAgain}
              </button>
            ) : null}
          </div>
        </form>
        {evaluation !== null ? (
          <QuizResults evaluation={evaluation} locale={locale} messages={messages} quiz={quiz} />
        ) : null}
      </div>
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
    <section aria-live="polite" aria-labelledby="quiz-result-heading" className={styles.quizResult}>
      <h3 id="quiz-result-heading">{resultMessage}</h3>
      <ol>
        {evaluation.results.map((result, index) => {
          const question = quiz.questions[index];
          if (question === undefined) return null;
          return (
            <li key={result.question_id}>
              <p className={styles.resultState} data-correct={result.correct ? "true" : "false"}>
                {result.correct ? messages.correctLabel : messages.notYetLabel}: {result.feedback}
              </p>
              <p>{result.explanation}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
