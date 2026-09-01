import type { Metadata } from "next";
import Link from "next/link";

import { CatalogueSearchBox } from "../../components/catalogue-search-box";
import {
  EntityCardGrid,
  ExploreEmptyState,
  ExploreUnavailableState,
} from "../../components/explore-catalogue-view";
import { ExploreResultsView } from "../../components/search-results-view";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { loadExploreCatalogue, searchCatalogue } from "../../lib/server/catalog";

export const metadata: Metadata = {
  title: "Explore the catalogue",
  description:
    "Search and browse Lumina's reviewed astronomical catalogue. Every published value keeps its source and provenance.",
};

type ExplorePageProps = Readonly<{
  searchParams: Promise<Readonly<{ cursor?: string | string[]; q?: string | string[] }>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExplorePage({ searchParams }: ExplorePageProps) {
  const params = await searchParams;
  const query = (firstValue(params.q) ?? "").trim();
  const rawCursor = firstValue(params.cursor)?.trim();
  const cursor = rawCursor === undefined || rawCursor.length === 0 ? undefined : rawCursor;

  // The public API origin, resolved once server-side. It carries no secrets —
  // the suggest endpoint is a public read — so the client combobox may call it
  // directly for bounded typeahead requests.
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  const committed = query.length > 0;

  return (
    <div className="space-y-10">
      <header className="mx-auto max-w-2xl space-y-6 text-center">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          The catalogue
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Explore real objects, provenance included
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">
          A small but honest slice of the universe: every value Lumina publishes is traceable to its
          source. Start with a name — or browse below.
        </p>
      </header>

      <div className="relative mx-auto max-w-2xl">
        <CatalogueSearchBox
          {...(apiOrigin === undefined ? {} : { apiOrigin })}
          initialQuery={query}
        />
      </div>

      {committed ? (
        <ExploreSearchSection query={query} />
      ) : (
        <ExploreBrowseSection {...(cursor === undefined ? {} : { cursor })} />
      )}
    </div>
  );
}

/** Committed search state: results come straight from /api/v1/search, order untouched. */
async function ExploreSearchSection({ query }: Readonly<{ query: string }>) {
  const outcome = await searchCatalogue(query);

  if (outcome.kind === "ok") {
    return (
      <section aria-labelledby="results-heading" className="space-y-4">
        <h2 className="sr-only" id="results-heading">
          Search results
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {outcome.items.length} {outcome.items.length === 1 ? "result" : "results"} for{" "}
          <span className="font-mono text-[var(--foreground)]">{query}</span>, ranked by the
          catalogue search engine.
        </p>
        <ExploreResultsView items={outcome.items} query={query} />
      </section>
    );
  }
  return (
    <section aria-labelledby="results-heading" className="space-y-4">
      <h2 className="sr-only" id="results-heading">
        Search results
      </h2>
      {outcome.kind === "empty-query" ? (
        <p className="leading-7 text-[var(--muted)]">
          Type at least two characters to search the catalogue.
        </p>
      ) : outcome.kind === "invalid-query" ? (
        <p className="leading-7 text-[var(--muted)]">
          That search could not be validated. Try a shorter or simpler query.
        </p>
      ) : (
        <ExploreUnavailableState context="search" />
      )}
    </section>
  );
}

/** Discovery state: the bounded canonical browse slice. */
async function ExploreBrowseSection({ cursor }: Readonly<{ cursor?: string }>) {
  const outcome = await loadExploreCatalogue(cursor === undefined ? {} : { cursor });

  return (
    <section aria-labelledby="browse-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 id="browse-heading">In the catalogue now</h2>
        <span className="text-sm text-[var(--muted)]">
          Reviewed objects only — the catalogue grows deliberately.
        </span>
      </div>
      {outcome.kind === "ok" ? (
        outcome.items.length === 0 ? (
          <ExploreEmptyState />
        ) : (
          <>
            {!outcome.completeSlice ? (
              <p className="text-sm text-[var(--muted)]">
                {cursor === undefined
                  ? `Showing the first ${outcome.items.length} objects.`
                  : `Showing the next ${outcome.items.length} objects.`}
              </p>
            ) : null}
            <EntityCardGrid items={outcome.items} />
            {outcome.nextCursor !== null ? (
              <nav aria-label="Catalogue pagination" className="flex justify-end">
                <Link
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)] no-underline hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  href={`/explore?cursor=${encodeURIComponent(outcome.nextCursor)}`}
                >
                  Next page
                </Link>
              </nav>
            ) : null}
          </>
        )
      ) : (
        <ExploreUnavailableState context="catalogue" />
      )}
    </section>
  );
}
