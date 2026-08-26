import type { CatalogSearchResponse } from "@lumina/api-client";

import { ResultCard } from "./result-card";

type ExploreResultsViewProps = Readonly<{
  items: CatalogSearchResponse["items"];
  query: string;
}>;

/**
 * Committed search results, rendered strictly in the order returned by the
 * accepted search engine. Match tiers and similarity internals never surface.
 */
export function ExploreResultsView({ items, query }: ExploreResultsViewProps) {
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
        <ResultCard key={item.entity.id} result={item} />
      ))}
    </ul>
  );
}
