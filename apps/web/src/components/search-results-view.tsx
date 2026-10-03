import type { CatalogSearchResponse } from "@nova-lumina/api-client";

import { formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  CollectionSaveMessages,
  EntityTypeMessages,
  ExploreMessages,
} from "../lib/i18n/messages/types";
import { ResultCard } from "./result-card";

const SEARCH_EXAMPLE = "HD 209458";

type ExploreResultsViewProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  items: CatalogSearchResponse["items"];
  locale: PublishedLocale;
  messages: ExploreMessages["search"];
  query: string;
}>;

/**
 * Committed search results, rendered strictly in the order returned by the
 * accepted search engine. Match tiers and similarity internals never surface.
 */
export function ExploreResultsView({
  collectionSaveMessages,
  entityTypeMessages,
  items,
  locale,
  messages,
  query,
}: ExploreResultsViewProps) {
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="explore-no-results-heading"
        className="max-w-2xl border-y border-[var(--border)] py-6"
      >
        <h2
          className="text-xl font-semibold text-[var(--foreground)]"
          id="explore-no-results-heading"
        >
          {formatMessageTemplate(messages.noResultsTitle, { query })}
        </h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          {formatMessageTemplate(messages.noResultsDescription, { example: SEARCH_EXAMPLE })}
        </p>
      </section>
    );
  }

  return (
    <ul
      aria-label={messages.resultsAriaLabel}
      className="m-0 border-t border-[var(--border-strong)] p-0"
    >
      {items.map((item) => (
        <ResultCard
          collectionSaveMessages={collectionSaveMessages}
          entityTypeMessages={entityTypeMessages}
          key={item.entity.id}
          locale={locale}
          matchedAliasMessage={messages.matchedAlias}
          result={item}
        />
      ))}
    </ul>
  );
}
