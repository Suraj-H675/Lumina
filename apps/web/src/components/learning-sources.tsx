import type { LearningSource } from "../lib/learning/content";
import {
  formatLocaleDateTime,
  formatLocaleList,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningSourcesMessages } from "../lib/i18n/messages/types";
import styles from "./learning-experience.module.css";

type LearningSourcesProps = Readonly<{
  locale: PublishedLocale;
  messages: LearningSourcesMessages;
  reviewedAt: string;
  reviewedBy: ReadonlyArray<string>;
  sources: ReadonlyArray<LearningSource>;
  version: number;
}>;

function reviewDate(timestamp: string, locale: PublishedLocale): string {
  return formatLocaleDateTime(new Date(timestamp), locale, {
    dateStyle: "long",
    timeZone: "UTC",
  });
}

export function LearningSources({
  locale,
  messages,
  reviewedAt,
  reviewedBy,
  sources,
  version,
}: LearningSourcesProps) {
  return (
    <section aria-labelledby="learning-sources-heading" className={styles.sources}>
      <div>
        <h2 className={styles.sourcesTitle} id="learning-sources-heading">
          {messages.title}
        </h2>
        <p className={styles.sourceReview}>
          {formatMessageTemplate(messages.reviewSummary, {
            reviewedAt: reviewDate(reviewedAt, locale),
            reviewedBy: formatLocaleList(reviewedBy, locale),
            version: formatLocaleNumber(version, locale),
          })}
        </p>
      </div>
      <ol aria-label={messages.sourcesLabel} className={styles.sourceList}>
        {sources.map((source) => (
          <li className={styles.sourceItem} key={source.id}>
            <div>
              <a className={styles.sourceLink} href={source.url_or_doi}>
                {source.title}
              </a>
              <p className={styles.sourceMeta}>
                {formatMessageTemplate(messages.sourceMeta, {
                  accessedAt: reviewDate(source.accessed_at, locale),
                  claimScope: source.claim_scope,
                  organization: source.organization_or_authors,
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
