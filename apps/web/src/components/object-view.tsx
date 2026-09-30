import Link from "next/link";

import type { EntityDetailResponse } from "@nova-lumina/api-client";

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
import styles from "./object-view.module.css";

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
    <article className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.identity}>
          <Link className={styles.backLink} href="/explore">
            {messages.header.backToExplore}
          </Link>
          <p className={styles.eyebrow}>{messages.header.eyebrow}</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.descriptor}>
            {detail.quantities.length === 0
              ? entityType
              : formatCountMessage(
                  messages.header.measuredQuantities,
                  detail.quantities.length,
                  locale,
                  { entityType },
                )}
          </p>
        </div>
        <div>
          <nav aria-label={title} className={styles.actions}>
            <Link
              className={styles.primaryAction}
              href={`/observe?object=${encodeURIComponent(slug)}`}
            >
              <span>{messages.header.observe}</span>
              <span aria-hidden="true" className={styles.actionGlyph}>
                ◒
              </span>
            </Link>
            <Link
              className={styles.secondaryAction}
              href={`/compare?object=${encodeURIComponent(slug)}`}
            >
              <span>{messages.header.compare}</span>
              <span aria-hidden="true" className={styles.actionGlyph}>
                ⇄
              </span>
            </Link>
          </nav>
          <div className={styles.utilityActions}>
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
        </div>
      </header>

      <section aria-labelledby="object-data-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.header.eyebrow}</p>
          <h2 className={styles.sectionTitle} id="object-data-heading">
            {messages.science.heading}
          </h2>
          <p className={styles.sectionSummary}>{messages.science.summary}</p>
        </div>

        <div>
          {measuredQuantities.length === 0 && unselectedQuantities.length === 0 ? (
            <p className={styles.empty}>{messages.science.empty}</p>
          ) : (
            <>
              <dl className={styles.measurements}>
                {measuredQuantities.map((entry) => {
                  const selection = entry.current_selection;
                  if (selection === null) return null;
                  const { measurement } = selection;
                  return (
                    <div className={styles.measurement} key={entry.quantity.code}>
                      <dt className={styles.measurementName}>{entry.quantity.name}</dt>
                      <dd className={styles.measurementValue}>
                        <span className={styles.value}>
                          {formatMeasurementValue(measurement.value)}
                        </span>
                        <span className={styles.unit}>{measurement.unit.symbol}</span>
                        <span className={styles.measurementDetail}>
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
                <p className={styles.unselected}>
                  {formatMessageTemplate(messages.science.unselected, {
                    quantities: unselectedQuantities.map((entry) => entry.quantity.name).join(", "),
                  })}
                </p>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="object-provenance-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.provenance.heading}</p>
          <h2 className={styles.sectionTitle} id="object-provenance-heading">
            {messages.provenance.heading}
          </h2>
          <p className={styles.sectionSummary}>{messages.provenance.summary}</p>
        </div>
        {provenanceRows.length === 0 ? (
          <p className={styles.empty}>{messages.provenance.empty}</p>
        ) : (
          <ul className={styles.provenanceList}>
            {provenanceRows.map((row) => (
              <li className={styles.provenanceRow} key={row.recordId}>
                <div>
                  <p className={styles.provider}>{row.providerName}</p>
                  <p className={styles.dataset}>
                    {row.datasetName} ({row.releaseVersion})
                  </p>
                </div>
                <div className={styles.sourceDetails}>
                  <p className={styles.sourceRecord}>
                    {formatMessageTemplate(messages.provenance.sourceRecord, {
                      recordId: row.recordId,
                    })}
                  </p>
                  {row.quantityNames.length > 0 ? (
                    <p className={styles.covers}>
                      {formatMessageTemplate(messages.provenance.covers, {
                        quantities: row.quantityNames.join(", "),
                      })}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className={styles.footer}>
        <Link className={styles.footerLink} href="/explore">
          {messages.footerBackToExplore}
        </Link>
      </footer>
    </article>
  );
}
