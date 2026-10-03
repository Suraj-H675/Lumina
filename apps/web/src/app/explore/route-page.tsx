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
import { resolvePublicWebApiOrigin } from "../../lib/server/api-origin";
import { loadExploreCatalogue, searchCatalogue } from "../../lib/server/catalog";
import styles from "./explore-page.module.css";

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
  const configured = resolvePublicWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  const committed = query.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.introBlock}>
          <p className={styles.eyebrow}>{messages.header.eyebrow}</p>
          <h1 className={styles.title}>{messages.header.title}</h1>
          <p className={styles.intro}>{messages.header.intro}</p>
        </div>
        <div className={styles.searchStage}>
          <div className={styles.searchContext}>
            <p className={styles.searchLabel}>{catalogueSearchMessages.inputLabel}</p>
            <p className={styles.searchHint}>{messages.browse.summary}</p>
          </div>
          <div className={styles.searchControl}>
            <CatalogueSearchBox
              {...(apiOrigin === undefined ? {} : { apiOrigin })}
              initialQuery={query}
              locale={locale}
              messages={catalogueSearchMessages}
            />
          </div>
        </div>
      </header>

      <nav aria-label={messages.header.title} className={styles.modeNav}>
        {(
          [
            ["/explore/deep-sky", messages.header.deepSkyAction],
            ["/explore/solar-system", messages.header.solarSystemAction],
            ["/explore/exoplanet-systems", messages.header.exoplanetSystemsAction],
            ["/explore/missions/voyager-1", messages.header.voyagerAction],
            ["/explore/system-compare", messages.header.systemCompareAction],
          ] as const
        ).map(([href, label]) => (
          <Link className={styles.modeLink} href={href} key={href}>
            <span>{label}</span>
            <span aria-hidden="true" className={styles.modeArrow}>
              →
            </span>
          </Link>
        ))}
      </nav>

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
      <section aria-labelledby="results-heading" className={styles.catalogueSection}>
        <h2 className="sr-only" id="results-heading">
          {messages.heading}
        </h2>
        <p className={styles.resultsMeta}>
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
    <section aria-labelledby="results-heading" className={styles.catalogueSection}>
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
    <section aria-labelledby="browse-heading" className={styles.catalogueSection}>
      <div className={styles.catalogueHeader}>
        <h2 className={styles.catalogueTitle} id="browse-heading">
          {messages.heading}
        </h2>
        <span className={styles.catalogueSummary}>{messages.summary}</span>
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
              <nav aria-label={messages.paginationAriaLabel} className={styles.pagination}>
                <Link
                  className={styles.nextLink}
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
