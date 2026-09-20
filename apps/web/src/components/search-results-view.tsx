import type { CatalogSearchResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { CollectionSaveMessages } from "../lib/i18n/messages/types";
import { ResultCard } from "./result-card";

type ExploreResultsViewProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  items: CatalogSearchResponse["items"];
  locale: PublishedLocale;
  query: string;
}>;

/**
 * Committed search results, rendered strictly in the order returned by the
 * accepted search engine. Match tiers and similarity internals never surface.
 */
export function ExploreResultsView({
  collectionSaveMessages,
  items,
  locale,
  query,
}: ExploreResultsViewProps) {
  if (items.length === 0) {
    return (
      <section
        aria-labelledby="explore-no-results-heading"
        className="max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8"
      >
        <h2
          className="text-xl font-semibold text-[var(--foreground)]"
          id="explore-no-results-heading"
        >
          No objects matched “{query}”
        </h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">
          Try a shorter fragment, a different spelling, or a catalogue designation such as{" "}
          <span className="font-mono text-sm">HD 209458</span>.
        </p>
      </section>
    );
  }

  return (
    <ul aria-label="Search results" className="grid gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <ResultCard
          collectionSaveMessages={collectionSaveMessages}
          key={item.entity.id}
          locale={locale}
          result={item}
        />
      ))}
    </ul>
  );
}
