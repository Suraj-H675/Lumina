import Link from "next/link";

import type { EntityDetailResponse } from "@lumina/api-client";

import { JournalEntryButton } from "./journal-entry-button";
import { SaveToCollectionsButton } from "./save-to-collections";
import { formatMeasurementValue, objectProvenanceRows, objectTitle } from "../lib/catalog-display";
import { formatCountMessage, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  CollectionSaveMessages,
  EntityTypeMessages,
  JournalEntryMessages,
  ObjectMessages,
} from "../lib/i18n/messages/types";

type ObjectViewProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  detail: EntityDetailResponse;
  entityTypeMessages: EntityTypeMessages;
  journalEntryMessages: JournalEntryMessages;
  locale: PublishedLocale;
  messages: ObjectMessages;
  /** The public slug that resolved to this entity; used for the compare link. */
  slug: string;
}>;

/**
 * The public object experience: identity first, then exactly the scientific
 * data and provenance the accepted public contract exposes. Nothing is
 * inferred; quantities without a canonical selection are stated as such.
 */
export function ObjectView({
  collectionSaveMessages,
  detail,
  entityTypeMessages,
  journalEntryMessages,
  locale,
  messages,
  slug,
}: ObjectViewProps) {
  const title = objectTitle(detail);
  const entityType = entityTypeMessages[detail.entity_type];
  const provenanceRows = objectProvenanceRows(detail);
  const measuredQuantities = detail.quantities.filter((entry) => entry.current_selection !== null);
  const unselectedQuantities = detail.quantities.filter(
    (entry) => entry.current_selection === null,
  );

  return (
    <article className="space-y-12">
      <header className="space-y-3">
        <Link
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--muted)] underline decoration-[var(--border-strong)] underline-offset-4 transition-colors hover:text-[var(--foreground)]"
          href="/explore"
        >
          {messages.header.backToExplore}
        </Link>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {messages.header.eyebrow}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
          {title}
        </h1>
        <p className="text-lg text-[var(--muted)]">
          {detail.quantities.length === 0
            ? entityType
            : formatCountMessage(
                messages.header.measuredQuantities,
                detail.quantities.length,
                locale,
                { entityType },
              )}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--background)] no-underline transition-colors hover:bg-[var(--accent-strong)]"
            href={`/observe?object=${encodeURIComponent(slug)}`}
          >
            <span aria-hidden="true">◒</span> {messages.header.observe}
          </Link>
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            href={`/compare?object=${encodeURIComponent(slug)}`}
          >
            <span aria-hidden="true">⇄</span> {messages.header.compare}
          </Link>
          <SaveToCollectionsButton
            identity={{
              canonical_name: title,
              entity_type: detail.entity_type,
              slug,
            }}
            locale={locale}
            messages={collectionSaveMessages}
          />
          <JournalEntryButton
            entityId={detail.id}
            messages={journalEntryMessages}
            objectName={title}
          />
        </div>
      </header>

      <section aria-labelledby="object-data-heading" className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-xl font-semibold" id="object-data-heading">
            {messages.science.heading}
          </h2>
          <span className="text-sm text-[var(--muted)]">{messages.science.summary}</span>
        </div>

        {measuredQuantities.length === 0 && unselectedQuantities.length === 0 ? (
          <p className="max-w-2xl leading-7 text-[var(--muted)]">{messages.science.empty}</p>
        ) : (
          <>
            <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {measuredQuantities.map((entry) => {
                const selection = entry.current_selection;
                if (selection === null) return null;
                const { measurement } = selection;
                return (
                  <div
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                    key={entry.quantity.code}
                  >
                    <dt className="text-sm font-medium text-[var(--muted)]">
                      {entry.quantity.name}
                    </dt>
                    <dd className="mt-1.5">
                      <span className="font-mono text-2xl tracking-tight text-[var(--foreground)]">
                        {formatMeasurementValue(measurement.value)}
                      </span>{" "}
                      <span className="text-sm text-[var(--accent)]">
                        {measurement.unit.symbol}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--muted)]">
                        {formatCountMessage(
                          messages.science.measurementDetails,
                          entry.measurement_count,
                          locale,
                          {
                            originalUnit: measurement.original_unit,
                            originalValue: measurement.original_value,
                          },
                        )}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
            {unselectedQuantities.length > 0 ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                {formatMessageTemplate(messages.science.unselected, {
                  quantities: unselectedQuantities.map((entry) => entry.quantity.name).join(", "),
                })}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="object-provenance-heading" className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-xl font-semibold" id="object-provenance-heading">
            {messages.provenance.heading}
          </h2>
          <span className="text-sm text-[var(--muted)]">{messages.provenance.summary}</span>
        </div>
        {provenanceRows.length === 0 ? (
          <p className="leading-7 text-[var(--muted)]">{messages.provenance.empty}</p>
        ) : (
          <ul className="grid list-none gap-3 p-0 md:grid-cols-2">
            {provenanceRows.map((row) => (
              <li
                className="rounded-md border border-[var(--border)] bg-[var(--background-raised)] px-4 py-4"
                key={row.recordId}
              >
                <p className="font-medium text-[var(--foreground)]">{row.providerName}</p>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {row.datasetName} ({row.releaseVersion})
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatMessageTemplate(messages.provenance.sourceRecord, {
                    recordId: row.recordId,
                  })}
                </p>
                {row.quantityNames.length > 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {formatMessageTemplate(messages.provenance.covers, {
                      quantities: row.quantityNames.join(", "),
                    })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="border-t border-[var(--border)] pt-6">
        <Link
          className="inline-flex min-h-11 items-center gap-2 font-medium text-[var(--link)] underline"
          href="/explore"
        >
          {messages.footerBackToExplore}
        </Link>
      </footer>
    </article>
  );
}
