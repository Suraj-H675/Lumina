"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatLocaleList, formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningLessonMessages, LearningSourcesMessages } from "../lib/i18n/messages/types";
import type {
  AudienceMode,
  LearningContent,
  LearningLesson,
  LearningPath,
  LearningQuiz as LearningQuizContract,
} from "../lib/learning/content";
import { getSourcesForIds } from "../lib/learning/content";
import { getLessonPrerequisiteState } from "../lib/learning/prerequisites";
import {
  recordLearningQuizAttempt,
  startLearningLesson,
  useLearningPathProgress,
  useLearningProgressStatus,
  type LearningProgressStoreFailureReason,
} from "../lib/learning/progress-store";
import type { QuizEvaluation } from "../lib/learning/quiz";

import { LearningModeSelector } from "./learning-mode-selector";
import { LearningQuiz } from "./learning-quiz";
import { LearningSources } from "./learning-sources";

type LearningLessonViewProps = Readonly<{
  content: LearningContent;
  lesson: LearningLesson;
  locale: PublishedLocale;
  messages: LearningLessonMessages;
  path: LearningPath;
  quiz: LearningQuizContract;
  sourceMessages: LearningSourcesMessages;
}>;

export function LearningLessonView({
  content,
  lesson,
  locale,
  messages,
  path,
  quiz,
  sourceMessages,
}: LearningLessonViewProps) {
  const status = useLearningProgressStatus();
  const progress = useLearningPathProgress(path.slug);
  const [mode, setMode] = useState<AudienceMode>("explorer");
  const [saveMessage, setSaveMessage] = useState("");
  const startedRef = useRef(false);
  const prerequisiteState = getLessonPrerequisiteState(lesson, progress);
  const currentIndex = path.lesson_slugs.indexOf(lesson.slug);
  const previousSlug = currentIndex > 0 ? path.lesson_slugs[currentIndex - 1] : undefined;
  const nextSlug = currentIndex >= 0 ? path.lesson_slugs[currentIndex + 1] : undefined;

  const progressFailureMessage = useCallback(
    (reason: LearningProgressStoreFailureReason): string => {
      switch (reason) {
        case "storage-unavailable":
          return messages.failures.storageUnavailable;
        case "storage-corrupted":
          return messages.failures.storageCorrupted;
        case "storage-quota-exceeded":
          return messages.failures.storageQuotaExceeded;
        case "storage-write-failed":
          return messages.failures.storageWriteFailed;
        case "invalid-content":
          return messages.failures.invalidContent;
        case "import-invalid":
          return messages.failures.importInvalid;
      }
    },
    [messages.failures],
  );

  useEffect(() => {
    if (status !== "ready" || !prerequisiteState.unlocked || startedRef.current) return;
    startedRef.current = true;
    const result = startLearningLesson(path.slug, lesson.slug);
    if (result.ok) return;
    const message = progressFailureMessage(result.reason);
    const timeoutId = window.setTimeout(() => setSaveMessage(message), 0);
    return () => window.clearTimeout(timeoutId);
  }, [lesson.slug, path.slug, prerequisiteState.unlocked, progressFailureMessage, status]);

  const handleModeChange = useCallback((nextMode: AudienceMode) => setMode(nextMode), []);

  function handleEvaluated(evaluation: QuizEvaluation): void {
    const result = recordLearningQuizAttempt(path.slug, lesson.slug, evaluation);
    setSaveMessage(
      result.ok
        ? evaluation.passed
          ? messages.masterySaved
          : messages.saveAttempt
        : progressFailureMessage(result.reason),
    );
  }

  return (
    <article className="space-y-10">
      <nav aria-label={messages.breadcrumbLabel}>
        <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-sm text-[var(--muted)]">
          <li>
            <Link className="text-[var(--link)] underline" href="/learn">
              {messages.learnLink}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link className="text-[var(--link)] underline" href={`/learn/${path.slug}`}>
              {path.title}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{lesson.title}</li>
        </ol>
      </nav>
      <header className="max-w-3xl space-y-5">
        <p className="text-sm text-[var(--muted)]">
          {formatMessageTemplate(messages.lessonMeta, {
            lessonCount: formatLocaleNumber(path.lesson_slugs.length, locale),
            lessonNumber: formatLocaleNumber(currentIndex + 1, locale),
            minutes: formatLocaleNumber(lesson.estimated_minutes, locale),
          })}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{lesson.title}</h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{lesson.summary}</p>
      </header>
      {!prerequisiteState.unlocked ? (
        <section
          aria-labelledby="lesson-locked-heading"
          className="max-w-2xl space-y-4 rounded-lg border border-dashed border-[var(--border-strong)] px-6 py-6"
          role="status"
        >
          <h2 id="lesson-locked-heading">{messages.lockedTitle}</h2>
          <p className="leading-7 text-[var(--muted)]">
            {formatMessageTemplate(messages.lockedDescription, {
              prerequisites: formatLocaleList(prerequisiteState.missing, locale),
            })}
          </p>
          <Link
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold text-[var(--foreground)] no-underline"
            href={`/learn/${path.slug}/${previousSlug ?? path.lesson_slugs[0]}`}
          >
            {messages.goToAvailableLesson}
          </Link>
        </section>
      ) : (
        <>
          <LearningModeSelector onChange={handleModeChange} />
          <section
            aria-labelledby="lesson-hook-heading"
            className="max-w-3xl space-y-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
          >
            <h2 className="sr-only" id="lesson-hook-heading">
              {messages.lessonIntroduction}
            </h2>
            <p className="text-xl leading-8 text-[var(--foreground)]">{lesson.hook}</p>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-[var(--accent)]">
                {lesson.mode_variants[mode].label}
              </p>
              <p className="leading-7 text-[var(--muted)]">
                {lesson.mode_variants[mode].explanation}
              </p>
              <p className="text-sm leading-6 text-[var(--muted)]">
                <strong className="text-[var(--foreground)]">{messages.thinkAboutLabel}</strong>{" "}
                {lesson.mode_variants[mode].deeper_question}
              </p>
            </div>
          </section>
          <section aria-labelledby="lesson-objectives-heading" className="max-w-3xl space-y-4">
            <h2 id="lesson-objectives-heading">{messages.objectivesTitle}</h2>
            <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
              {lesson.learning_objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>
          <div className="max-w-3xl space-y-10">
            {lesson.sections.map((section) => (
              <section
                aria-labelledby={`${section.id}-heading`}
                className="space-y-4"
                key={section.id}
              >
                <h2 id={`${section.id}-heading`}>{section.heading}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p className="leading-7 text-[var(--muted)]" key={paragraph}>
                    {paragraph}
                  </p>
                ))}
                <ul className="m-0 grid list-disc gap-2 pl-6 leading-7 text-[var(--muted)]">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <section aria-labelledby="real-examples-heading" className="max-w-3xl space-y-4">
            <h2 id="real-examples-heading">{messages.realExamplesTitle}</h2>
            <ul className="m-0 grid gap-3 list-none p-0">
              {lesson.real_object_examples.map((example) => (
                <li
                  className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4"
                  key={example.name}
                >
                  <strong>{example.name}</strong>
                  <p className="mt-1 leading-7 text-[var(--muted)]">{example.why_it_helps}</p>
                </li>
              ))}
            </ul>
          </section>
          <aside
            aria-labelledby="misconception-heading"
            className="max-w-3xl space-y-4 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-6"
          >
            <h2 id="misconception-heading">{messages.misconceptionTitle}</h2>
            <p className="font-semibold">{lesson.misconception_check.prompt}</p>
            <p className="leading-7 text-[var(--muted)]">
              <strong className="text-[var(--foreground)]">{messages.commonMistakeLabel}</strong>{" "}
              {lesson.misconception_check.misconception}
            </p>
            <p className="leading-7 text-[var(--muted)]">
              <strong className="text-[var(--foreground)]">{messages.correctionLabel}</strong>{" "}
              {lesson.misconception_check.correction}
            </p>
          </aside>
          <section aria-labelledby="lesson-activity-heading" className="max-w-3xl space-y-4">
            <h2 id="lesson-activity-heading">
              {formatMessageTemplate(messages.activityTitle, {
                activityTitle: lesson.activity.title,
              })}
            </h2>
            <p className="text-sm text-[var(--muted)]">
              {formatMessageTemplate(messages.activityMeta, {
                materials: formatLocaleList(lesson.activity.materials, locale),
                minutes: formatLocaleNumber(lesson.activity.duration_minutes, locale),
              })}
            </p>
            <ol className="m-0 grid list-decimal gap-2 pl-6 leading-7 text-[var(--muted)]">
              {lesson.activity.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-4 text-sm leading-6 text-[var(--muted)]">
              <strong className="text-[var(--foreground)]">{messages.safetyLabel}</strong>{" "}
              {lesson.activity.safety}
            </p>
            <p className="leading-7 text-[var(--muted)]">
              <strong className="text-[var(--foreground)]">
                {messages.expectedObservationLabel}
              </strong>{" "}
              {lesson.activity.expected_observation}
            </p>
          </section>
          <LearningQuiz
            locale={locale}
            messages={messages.quiz}
            onEvaluated={handleEvaluated}
            quiz={quiz}
          />
          <p
            aria-live="polite"
            className="min-h-6 max-w-3xl text-sm font-semibold text-[var(--success)]"
            role="status"
          >
            {saveMessage}
          </p>
          <nav
            aria-label={messages.navigationLabel}
            className="flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-6"
          >
            {previousSlug !== undefined ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 font-medium text-[var(--foreground)] no-underline"
                href={`/learn/${path.slug}/${previousSlug}`}
              >
                {messages.previousLesson}
              </Link>
            ) : (
              <span />
            )}
            {nextSlug !== undefined ? (
              <Link
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold text-[var(--foreground)] no-underline"
                href={`/learn/${path.slug}/${nextSlug}`}
              >
                {messages.nextLesson}
              </Link>
            ) : (
              <Link
                className="inline-flex min-h-11 items-center rounded-md border border-[var(--border-strong)] px-4 font-semibold text-[var(--foreground)] no-underline"
                href={`/learn/${path.slug}`}
              >
                {messages.reviewPathProgress}
              </Link>
            )}
          </nav>
          <LearningSources
            locale={locale}
            messages={sourceMessages}
            reviewedAt={lesson.reviewed_at}
            reviewedBy={lesson.reviewed_by}
            sources={getSourcesForIds(content, lesson.source_ids)}
            version={lesson.version}
          />
        </>
      )}
    </article>
  );
}
