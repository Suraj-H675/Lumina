import Link from "next/link";

import { formatCountMessage, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningPathMessages, LearningSourcesMessages } from "../lib/i18n/messages/types";
import type { LearningContent, LearningPath } from "../lib/learning/content";
import { getSourcesForIds } from "../lib/learning/content";

import { LearningPathLessonList } from "./learning-path-lesson-list";
import { LearningSources } from "./learning-sources";
import styles from "./learning-experience.module.css";

type LearningPathViewProps = Readonly<{
  content: LearningContent;
  locale: PublishedLocale;
  messages: LearningPathMessages;
  path: LearningPath;
  sourceMessages: LearningSourcesMessages;
}>;

export function LearningPathView({
  content,
  locale,
  messages,
  path,
  sourceMessages,
}: LearningPathViewProps) {
  return (
    <article className={styles.pathPage}>
      <nav aria-label={messages.breadcrumbLabel} className={styles.breadcrumbs}>
        <ol className={styles.breadcrumbList}>
          <li>
            <Link href="/learn">{messages.learnLink}</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{path.title}</li>
        </ol>
      </nav>
      <header className={styles.pathHero}>
        <div>
          <p className={styles.eyebrow}>{messages.eyebrow}</p>
          <h1 className={styles.pathTitle}>{path.title}</h1>
        </div>
        <div className={styles.pathHeroMeta}>
          <p className={styles.pathSummary}>{path.summary}</p>
          <p className={styles.pathMeta}>
            {formatCountMessage(messages.lessonMeta, path.lesson_slugs.length, locale)}
          </p>
        </div>
      </header>
      <section aria-labelledby="path-objectives-heading" className={styles.pathStructure}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
          <h2 className={styles.sectionTitle} id="path-objectives-heading">
            {messages.objectivesTitle}
          </h2>
        </div>
        <ul className={styles.objectiveList}>
          {path.learning_objectives.map((objective) => (
            <li key={objective}>{objective}</li>
          ))}
        </ul>
      </section>
      <LearningPathLessonList
        content={content}
        locale={locale}
        messages={messages.lessonList}
        path={path}
      />
      <section aria-labelledby="path-capstone-heading" className={styles.capstone}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.eyebrow}</p>
          <h2 className={styles.sectionTitle} id="path-capstone-heading">
            {formatMessageTemplate(messages.capstoneTitle, {
              capstoneTitle: path.capstone_activity.title,
            })}
          </h2>
        </div>
        <div className={styles.capstoneBody}>
          <p className={styles.capstoneIntro}>{messages.capstoneIntro}</p>
          <ol className={styles.stepList}>
            {path.capstone_activity.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className={styles.safety}>
            <strong>{messages.safetyLabel}</strong> {path.capstone_activity.safety}
          </p>
        </div>
      </section>
      <LearningSources
        locale={locale}
        messages={sourceMessages}
        reviewedAt={path.reviewed_at}
        reviewedBy={path.reviewed_by}
        sources={getSourcesForIds(content, path.source_ids)}
        version={path.version}
      />
    </article>
  );
}
