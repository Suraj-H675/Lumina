import type { LearningSource } from "../lib/learning/content";
import {
  formatLocaleDateTime,
  formatLocaleList,
  formatLocaleNumber,
  formatMessageTemplate,
} from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { LearningSourcesMessages } from "../lib/i18n/messages/types";

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
    <section
      aria-labelledby="learning-sources-heading"
      className="space-y-4 border-t border-[var(--border)] pt-8"
    >
      <div className="space-y-2">
        <h2 id="learning-sources-heading">{messages.title}</h2>
        <p className="leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.reviewSummary, {
            reviewedAt: reviewDate(reviewedAt, locale),
            reviewedBy: formatLocaleList(reviewedBy, locale),
            version: formatLocaleNumber(version, locale),
          })}
        </p>
      </div>
      <ol aria-label={messages.sourcesLabel} className="m-0 grid list-decimal gap-3 pl-6">
        {sources.map((source) => (
          <li className="pl-2" key={source.id}>
            <a className="font-medium text-[var(--link)] underline" href={source.url_or_doi}>
              {source.title}
            </a>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {formatMessageTemplate(messages.sourceMeta, {
                accessedAt: reviewDate(source.accessed_at, locale),
                claimScope: source.claim_scope,
                organization: source.organization_or_authors,
              })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
