import type { Metadata } from "next";
import Link from "next/link";

import { CatalogueSearchBox } from "../../components/catalogue-search-box";
import {
  EntityCardGrid,
  ExploreEmptyState,
  ExploreUnavailableState,
} from "../../components/explore-catalogue-view";
import { ExploreResultsView } from "../../components/search-results-view";
import { formatCountMessage } from "../../lib/i18n/format";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type {
  CatalogueSearchMessages,
  CollectionSaveMessages,
  EntityTypeMessages,
  ExploreMessages,
} from "../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../lib/server/api-origin";
import { loadExploreCatalogue, searchCatalogue } from "../../lib/server/catalog";

export function createExploreMetadata(messages: ExploreMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type ExplorePageProps = Readonly<{
  catalogueSearchMessages: CatalogueSearchMessages;
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: ExploreMessages;
  searchParams: Promise<Readonly<{ cursor?: string | string[]; q?: string | string[] }>>;
}>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExplorePage({
  catalogueSearchMessages,
  collectionSaveMessages,
  entityTypeMessages,
  locale,
  messages,
  searchParams,
}: ExplorePageProps) {
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
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {messages.header.title}
        </h1>
        <p className="text-lg leading-8 text-[var(--muted)]">{messages.header.intro}</p>
        <div className="flex flex-wrap justify-center gap-3 pt-1">
          <Link
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--link)] no-underline hover:bg-[var(--surface-hover)]"
            href="/explore/deep-sky"
          >
            {messages.header.deepSkyAction}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--link)] no-underline hover:bg-[var(--surface-hover)]"
            href="/explore/solar-system"
          >
            {messages.header.solarSystemAction}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--link)] no-underline hover:bg-[var(--surface-hover)]"
            href="/explore/exoplanet-systems"
          >
            {messages.header.exoplanetSystemsAction}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--link)] no-underline hover:bg-[var(--surface-hover)]"
            href="/explore/missions/voyager-1"
          >
            {messages.header.voyagerAction}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--link)] no-underline hover:bg-[var(--surface-hover)]"
            href="/explore/system-compare"
          >
            {messages.header.systemCompareAction}
          </Link>
        </div>
      </header>

      <div className="relative mx-auto max-w-2xl">
        <CatalogueSearchBox
          {...(apiOrigin === undefined ? {} : { apiOrigin })}
          initialQuery={query}
          locale={locale}
          messages={catalogueSearchMessages}
        />
      </div>

      {committed ? (
        <ExploreSearchSection
          collectionSaveMessages={collectionSaveMessages}
          entityTypeMessages={entityTypeMessages}
          locale={locale}
          messages={messages.search}
          query={query}
          unavailableMessages={messages.unavailable}
        />
      ) : (
        <ExploreBrowseSection
          {...(cursor === undefined ? {} : { cursor })}
          collectionSaveMessages={collectionSaveMessages}
          entityTypeMessages={entityTypeMessages}
          locale={locale}
          messages={messages.browse}
          unavailableMessages={messages.unavailable}
        />
      )}
    </div>
  );
}

/** Committed search state: results come straight from /api/v1/search, order untouched. */
async function ExploreSearchSection({
  collectionSaveMessages,
  entityTypeMessages,
  locale,
  messages,
  query,
  unavailableMessages,
}: Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: ExploreMessages["search"];
  query: string;
  unavailableMessages: ExploreMessages["unavailable"];
}>) {
  const outcome = await searchCatalogue(query);

  if (outcome.kind === "ok") {
    return (
      <section aria-labelledby="results-heading" className="space-y-4">
        <h2 className="sr-only" id="results-heading">
          {messages.heading}
        </h2>
        <p className="text-sm text-[var(--muted)]">
          {formatCountMessage(messages.summary, outcome.items.length, locale, { query })}
        </p>
        <ExploreResultsView
          collectionSaveMessages={collectionSaveMessages}
          entityTypeMessages={entityTypeMessages}
          items={outcome.items}
          locale={locale}
          messages={messages}
          query={query}
        />
      </section>
    );
  }
  return (
    <section aria-labelledby="results-heading" className="space-y-4">
      <h2 className="sr-only" id="results-heading">
        {messages.heading}
      </h2>
      {outcome.kind === "empty-query" ? (
        <p className="leading-7 text-[var(--muted)]">{messages.minimumQuery}</p>
      ) : outcome.kind === "invalid-query" ? (
        <p className="leading-7 text-[var(--muted)]">{messages.invalidQuery}</p>
      ) : (
        <ExploreUnavailableState context="search" messages={unavailableMessages} />
      )}
    </section>
  );
}

/** Discovery state: the bounded canonical browse slice. */
async function ExploreBrowseSection({
  collectionSaveMessages,
  cursor,
  entityTypeMessages,
  locale,
  messages,
  unavailableMessages,
}: Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  cursor?: string;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: ExploreMessages["browse"];
  unavailableMessages: ExploreMessages["unavailable"];
}>) {
  const outcome = await loadExploreCatalogue(cursor === undefined ? {} : { cursor });

  return (
    <section aria-labelledby="browse-heading" className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
        <h2 id="browse-heading">{messages.heading}</h2>
        <span className="text-sm text-[var(--muted)]">{messages.summary}</span>
      </div>
      {outcome.kind === "ok" ? (
        outcome.items.length === 0 ? (
          <ExploreEmptyState messages={messages} />
        ) : (
          <>
            {!outcome.completeSlice ? (
              <p className="text-sm text-[var(--muted)]">
                {cursor === undefined
                  ? formatCountMessage(messages.showingFirst, outcome.items.length, locale)
                  : formatCountMessage(messages.showingNext, outcome.items.length, locale)}
              </p>
            ) : null}
            <EntityCardGrid
              collectionSaveMessages={collectionSaveMessages}
              entityTypeMessages={entityTypeMessages}
              items={outcome.items}
              locale={locale}
              messages={messages}
            />
            {outcome.nextCursor !== null ? (
              <nav aria-label={messages.paginationAriaLabel} className="flex justify-end">
                <Link
                  className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)] no-underline hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
                  href={`/explore?cursor=${encodeURIComponent(outcome.nextCursor)}`}
                >
                  {messages.nextPage}
                </Link>
              </nav>
            ) : null}
          </>
        )
      ) : (
        <ExploreUnavailableState context="catalogue" messages={unavailableMessages} />
      )}
    </section>
  );
}
