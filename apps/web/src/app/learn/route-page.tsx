import type { Metadata } from "next";
import Link from "next/link";

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
        <div>
          <p className={styles.pathLabel}>{landing.pathLabel}</p>
          <h2 className={styles.featuredPathTitle} id="available-path-heading">
            {path.title}
          </h2>
          <p className={styles.featuredPathSummary}>{path.summary}</p>
        </div>
        <div className={styles.featuredPathMeta}>
          <p className={styles.pathMeta}>
            {formatMessageTemplate(landing.pathMeta, { lessonCount: path.lesson_slugs.length })}
          </p>
          <Link className={styles.textAction} href={`/learn/${path.slug}`}>
            {landing.viewPath}
          </Link>
        </div>
      </section>
      <LearningProgressControls locale={locale} messages={messages.progressControls} />
    </article>
  );
}
