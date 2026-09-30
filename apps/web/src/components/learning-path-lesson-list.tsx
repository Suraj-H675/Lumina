"use client";

import Link from "next/link";

import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningPathMessages } from "../lib/i18n/messages/types";
import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getLessonPrerequisiteState, isLearningPathComplete } from "../lib/learning/prerequisites";
import { useLearningPathProgress, useLearningProgressStatus } from "../lib/learning/progress-store";
import styles from "./learning-experience.module.css";

type LearningPathLessonListProps = Readonly<{
  content: LearningContent;
  locale: PublishedLocale;
  messages: LearningPathMessages["lessonList"];
  path: LearningPath;
}>;

export function LearningPathLessonList({
  content,
  locale,
  messages,
  path,
}: LearningPathLessonListProps) {
  const status = useLearningProgressStatus();
  const progress = useLearningPathProgress(path.slug);
  const mastered = new Set(
    (progress?.lessons ?? [])
      .filter((lesson) => lesson.mastered)
      .map((lesson) => lesson.lesson_slug),
  );
  const masteredCount = path.lesson_slugs.filter((slug) => mastered.has(slug)).length;
  const pathComplete = isLearningPathComplete(path, progress);

  return (
    <section aria-labelledby="path-lessons-heading" className={styles.lessonListSection}>
      <div className={styles.lessonListHeader}>
        <h2 className={styles.lessonListTitle} id="path-lessons-heading">
          {messages.title}
        </h2>
        <p className={styles.progressMeta}>
          {status === "loading"
            ? messages.checkingProgress
            : formatMessageTemplate(messages.progress, {
                lessonCount: formatLocaleNumber(path.lesson_slugs.length, locale),
                masteredCount: formatLocaleNumber(masteredCount, locale),
              })}
        </p>
      </div>
      {status === "corrupted" ? (
        <p className={styles.progressStatus} role="status">
          {messages.statusCorrupted}
        </p>
      ) : null}
      <ol className={styles.lessonList}>
        {path.lesson_slugs.map((lessonSlug, index) => {
          const lesson = content.lessons.find((entry) => entry.slug === lessonSlug);
          if (lesson === undefined) return null;
          const prerequisiteState = getLessonPrerequisiteState(lesson, progress);
          const lessonProgress = progress?.lessons.find(
            (entry) => entry.lesson_slug === lesson.slug,
          );
          const isMastered = mastered.has(lesson.slug);
          const stateLabel = isMastered
            ? messages.mastered
            : lessonProgress === undefined || lessonProgress.attempts === 0
              ? messages.notStarted
              : messages.inProgress;
          return (
            <li className={styles.lessonEntry} key={lesson.slug}>
              {prerequisiteState.unlocked ? (
                <Link className={styles.lessonLink} href={`/learn/${path.slug}/${lesson.slug}`}>
                  <span className={styles.lessonNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <span className={styles.lessonEntryTitle}>{lesson.title}</span>
                    <span className={styles.lessonEntrySummary}>{lesson.summary}</span>
                  </span>
                  <span
                    className={styles.lessonState}
                    data-mastered={isMastered ? "true" : "false"}
                  >
                    {stateLabel}
                  </span>
                </Link>
              ) : (
                <div aria-disabled="true" className={styles.lessonLocked}>
                  <span className={styles.lessonNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <span className={styles.lessonEntryTitle}>{lesson.title}</span>
                    <span className={styles.lessonEntrySummary}>
                      {formatMessageTemplate(messages.completeFirst, {
                        prerequisites: prerequisiteState.missing.join(", "),
                      })}
                    </span>
                  </span>
                  <span className={styles.lessonState}>{messages.locked}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {pathComplete ? (
        <p className={styles.pathComplete} role="status">
          {formatMessageTemplate(messages.pathComplete, {
            threshold: formatLocaleNumber(path.completion_rule.mastery_threshold, locale, {
              maximumFractionDigits: 2,
            }),
          })}
        </p>
      ) : null}
    </section>
  );
}
