import type { Metadata } from "next";
import Link from "next/link";

import { LearningPathLessonList } from "../../components/learning-path-lesson-list";
import { LearningProgressControls } from "../../components/learning-progress-controls";
import styles from "../../components/learning-experience.module.css";
import { formatMessageTemplate } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { LearnLandingMessages, LearnMessages } from "../../lib/i18n/messages/types";
import { loadLearningContent } from "../../lib/learning/content";

export function learnLandingMetadata(messages: LearnLandingMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export function LearnLandingRoute({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: LearnMessages }>) {
  const content = loadLearningContent();
  const path = content.path;
  const landing = messages.landing;

  return (
    <article className={styles.landing}>
      <header className={styles.landingHero}>
        <div>
          <p className={styles.eyebrow}>{landing.eyebrow}</p>
          <h1 className={styles.landingTitle}>{landing.title}</h1>
        </div>
        <p className={styles.landingIntro}>{landing.intro}</p>
      </header>
      <section aria-labelledby="available-path-heading" className={styles.featuredPath}>
        <div className={styles.featuredPathMeta}>
          <p className={styles.pathLabel}>{landing.pathLabel}</p>
          <p className={styles.pathMeta}>
            {formatMessageTemplate(landing.pathMeta, { lessonCount: path.lesson_slugs.length })}
          </p>
          <Link className={styles.textAction} href={`/learn/${path.slug}`}>
            {landing.viewPath}
          </Link>
        </div>
        <div>
          <h2 className={styles.featuredPathTitle} id="available-path-heading">
            {path.title}
          </h2>
          <p className={styles.featuredPathSummary}>{path.summary}</p>
        </div>
      </section>
      <LearningPathLessonList
        content={content}
        locale={locale}
        messages={messages.path.lessonList}
        path={path}
      />
      <LearningProgressControls locale={locale} messages={messages.progressControls} />
    </article>
  );
}
