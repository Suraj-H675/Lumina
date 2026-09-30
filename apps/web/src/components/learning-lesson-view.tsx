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
import styles from "./learning-experience.module.css";

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
    <article className={styles.lessonPage}>
      <nav aria-label={messages.breadcrumbLabel} className={styles.breadcrumbs}>
        <ol className={styles.breadcrumbList}>
          <li>
            <Link href="/learn">{messages.learnLink}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/learn/${path.slug}`}>{path.title}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{lesson.title}</li>
        </ol>
      </nav>
      <header className={styles.lessonHero}>
        <div className={styles.lessonHeroTitleBlock}>
          <p className={styles.lessonIndex}>
            {formatMessageTemplate(messages.lessonMeta, {
              lessonCount: formatLocaleNumber(path.lesson_slugs.length, locale),
              lessonNumber: formatLocaleNumber(currentIndex + 1, locale),
              minutes: formatLocaleNumber(lesson.estimated_minutes, locale),
            })}
          </p>
          <h1 className={styles.lessonTitle}>{lesson.title}</h1>
        </div>
        <div className={styles.lessonHeroMeta}>
          <p className={styles.lessonSummary}>{lesson.summary}</p>
        </div>
      </header>
      {!prerequisiteState.unlocked ? (
        <section aria-labelledby="lesson-locked-heading" className={styles.locked} role="status">
          <h2 id="lesson-locked-heading">{messages.lockedTitle}</h2>
          <p>
            {formatMessageTemplate(messages.lockedDescription, {
              prerequisites: formatLocaleList(prerequisiteState.missing, locale),
            })}
          </p>
          <Link
            className={styles.textAction}
            href={`/learn/${path.slug}/${previousSlug ?? path.lesson_slugs[0]}`}
          >
            {messages.goToAvailableLesson}
          </Link>
        </section>
      ) : (
        <>
          <LearningModeSelector onChange={handleModeChange} />
          <section aria-labelledby="lesson-hook-heading" className={styles.lessonLead}>
            <h2 className="sr-only" id="lesson-hook-heading">
              {messages.lessonIntroduction}
            </h2>
            <p className={styles.hook}>{lesson.hook}</p>
            <div className={styles.modePanel}>
              <p className={styles.modeVariantLabel}>{lesson.mode_variants[mode].label}</p>
              <p className={styles.modeExplanation}>{lesson.mode_variants[mode].explanation}</p>
              <p className={styles.modeQuestion}>
                <strong>{messages.thinkAboutLabel}</strong>{" "}
                {lesson.mode_variants[mode].deeper_question}
              </p>
            </div>
          </section>
          <section aria-labelledby="lesson-objectives-heading" className={styles.lessonSection}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>{messages.objectivesTitle}</p>
              <h2 className={styles.lessonSectionHeading} id="lesson-objectives-heading">
                {messages.objectivesTitle}
              </h2>
            </div>
            <ul className={styles.objectiveList}>
              {lesson.learning_objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>
          <>
            {lesson.sections.map((section) => (
              <section
                aria-labelledby={`${section.id}-heading`}
                className={styles.lessonSection}
                key={section.id}
              >
                <h2 className={styles.lessonSectionHeading} id={`${section.id}-heading`}>
                  {section.heading}
                </h2>
                <div className={styles.lessonBody}>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  <ul className={styles.bodyList}>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              </section>
            ))}
          </>
          <section aria-labelledby="real-examples-heading" className={styles.examples}>
            <h2 className={styles.lessonSectionHeading} id="real-examples-heading">
              {messages.realExamplesTitle}
            </h2>
            <ul className={styles.exampleList}>
              {lesson.real_object_examples.map((example) => (
                <li className={styles.example} key={example.name}>
                  <strong>{example.name}</strong>
                  <p>{example.why_it_helps}</p>
                </li>
              ))}
            </ul>
          </section>
          <aside aria-labelledby="misconception-heading" className={styles.misconception}>
            <h2 id="misconception-heading">{messages.misconceptionTitle}</h2>
            <p>
              <strong>{lesson.misconception_check.prompt}</strong>
            </p>
            <p>
              <strong>{messages.commonMistakeLabel}</strong>{" "}
              {lesson.misconception_check.misconception}
            </p>
            <p>
              <strong>{messages.correctionLabel}</strong> {lesson.misconception_check.correction}
            </p>
          </aside>
          <section aria-labelledby="lesson-activity-heading" className={styles.activity}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>{messages.activityTitle}</p>
              <h2 className={styles.sectionTitle} id="lesson-activity-heading">
                {formatMessageTemplate(messages.activityTitle, {
                  activityTitle: lesson.activity.title,
                })}
              </h2>
            </div>
            <div className={styles.activityBody}>
              <p className={styles.activityMeta}>
                {formatMessageTemplate(messages.activityMeta, {
                  materials: formatLocaleList(lesson.activity.materials, locale),
                  minutes: formatLocaleNumber(lesson.activity.duration_minutes, locale),
                })}
              </p>
              <ol className={styles.stepList}>
                {lesson.activity.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className={styles.safety}>
                <strong>{messages.safetyLabel}</strong> {lesson.activity.safety}
              </p>
              <p className={styles.expectedObservation}>
                <strong>{messages.expectedObservationLabel}</strong>{" "}
                {lesson.activity.expected_observation}
              </p>
            </div>
          </section>
          <LearningQuiz
            locale={locale}
            messages={messages.quiz}
            onEvaluated={handleEvaluated}
            quiz={quiz}
          />
          <p aria-live="polite" className={styles.saveMessage} role="status">
            {saveMessage}
          </p>
          <nav aria-label={messages.navigationLabel} className={styles.lessonNavigation}>
            {previousSlug !== undefined ? (
              <Link className={styles.navAction} href={`/learn/${path.slug}/${previousSlug}`}>
                {messages.previousLesson}
              </Link>
            ) : (
              <span />
            )}
            {nextSlug !== undefined ? (
              <Link className={styles.navAction} href={`/learn/${path.slug}/${nextSlug}`}>
                {messages.nextLesson}
              </Link>
            ) : (
              <Link className={styles.navAction} href={`/learn/${path.slug}`}>
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
