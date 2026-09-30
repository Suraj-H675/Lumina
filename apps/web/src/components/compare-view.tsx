import Link from "next/link";

import type { CompareCell, CompareModel, CompareObjectState } from "../lib/compare-model";
import { COMPARE_MAX_OBJECTS } from "../lib/compare-url";
import { formatMeasurementValue } from "../lib/catalog-display";
import { formatLocaleNumber, formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  CollectionSaveMessages,
  CompareMessages,
  EntityTypeMessages,
} from "../lib/i18n/messages/types";
import { CompareAddObject } from "./compare-add-object";
import { CompareRemoveButton } from "./compare-remove-button";
import { CompareSaveSelected } from "./compare-save-selected";
import styles from "./compare-view.module.css";

type CompareViewProps = Readonly<{
  /** Public API origin resolved on the server; suggestions stay off without it. */
  apiOrigin?: string;
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  messages: CompareMessages;
  model: CompareModel;
  selectedSlugs: ReadonlyArray<string>;
}>;

type SlotIdentity = Readonly<{
  heading: string;
  href: string | null;
  meta: string;
}>;

function slotIdentity(
  state: CompareObjectState,
  messages: CompareMessages["slots"],
  entityTypeMessages: EntityTypeMessages,
): SlotIdentity {
  switch (state.kind) {
    case "ok":
      return {
        heading: state.detail.canonical_name,
        href: `/objects/${state.slug}`,
        meta: entityTypeMessages[state.detail.entity_type],
      };
    case "unknown":
      return {
        heading: messages.unknownTitle,
        href: null,
        meta: formatMessageTemplate(messages.unknownDescription, { slug: state.slug }),
      };
    case "unavailable":
      return {
        heading: messages.unavailableTitle,
        href: null,
        meta: messages.unavailableDescription,
      };
  }
}

function unavailableText(
  kind: Extract<CompareCell, { kind: "unknown" | "unavailable" | "unmeasured" }>["kind"],
  messages: CompareMessages["cells"],
) {
  switch (kind) {
    case "unknown":
      return messages.unknown;
    case "unavailable":
      return messages.unavailable;
    case "unmeasured":
      return messages.unmeasured;
  }
}

function CellValue({
  cell,
  locale,
  messages,
}: Readonly<{
  cell: CompareCell;
  locale: PublishedLocale;
  messages: CompareMessages["cells"];
}>) {
  if (cell.kind !== "value") {
    return <span className={styles.unavailable}>{unavailableText(cell.kind, messages)}</span>;
  }
  return (
    <span className={styles.value}>
      <span className={styles.valueNumber}>{formatMeasurementValue(cell.measurement.value)}</span>{" "}
      <span className={styles.valueUnit}>{cell.measurement.unitSymbol}</span>
      <span className={styles.valueMeta}>
        {cell.measurementCount === 1
          ? formatMessageTemplate(messages.measurementDetails.one, {
              sourceLabel: cell.measurement.sourceLabel,
            })
          : formatMessageTemplate(messages.measurementDetails.multiple, {
              count: formatLocaleNumber(cell.measurementCount, locale),
              sourceLabel: cell.measurement.sourceLabel,
            })}
      </span>
      <span className={styles.valueOriginal}>
        {formatMessageTemplate(messages.original, {
          originalUnit: cell.measurement.originalUnit,
          originalValue: cell.measurement.originalValue,
        })}
      </span>
    </span>
  );
}

function EmptyCompare({
  apiOrigin,
  locale,
  messages,
}: Readonly<{
  apiOrigin?: string;
  locale: PublishedLocale;
  messages: CompareMessages;
}>) {
  return (
    <div className={styles.emptyCompare}>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionEyebrow}>{messages.empty.addHeading}</p>
        <h2 className={styles.sectionTitle}>{messages.empty.title}</h2>
        <p className={styles.sectionDescription}>{messages.empty.description}</p>
      </div>
      <section aria-labelledby="compare-add-heading" className={styles.emptyCopy}>
        <h2 className="sr-only" id="compare-add-heading">
          {messages.empty.addHeading}
        </h2>
        <CompareAddObject
          {...(apiOrigin === undefined ? {} : { apiOrigin })}
          locale={locale}
          messages={messages.add}
          selectedSlugs={[]}
        />
      </section>
    </div>
  );
}

/**
 * The provenance-safe comparison experience. Every displayed value keeps its
 * source; nothing is scored, ranked, or silently merged.
 */
export function CompareView({
  apiOrigin,
  collectionSaveMessages,
  entityTypeMessages,
  locale,
  messages,
  model,
  selectedSlugs,
}: CompareViewProps) {
  const { objects, rows } = model;
  const atMaximum = selectedSlugs.length >= COMPARE_MAX_OBJECTS;
  const loadedCount = objects.filter((state) => state.kind === "ok").length;

  if (objects.length === 0) {
    return (
      <EmptyCompare
        {...(apiOrigin === undefined ? {} : { apiOrigin })}
        locale={locale}
        messages={messages}
      />
    );
  }

  const identities = objects.map((state) =>
    slotIdentity(state, messages.slots, entityTypeMessages),
  );
  // Save-the-objects payload: only successfully loaded slots contribute an
  // identity snapshot; unknown/unavailable slots are not catalogue objects.
  const saveableIdentities = objects.flatMap((state) =>
    state.kind === "ok"
      ? [
          {
            canonical_name: state.detail.canonical_name,
            entity_type: state.detail.entity_type,
            slug: state.slug,
          },
        ]
      : [],
  );
  // Invite a second object only when there is room to actually add one; when
  // the comparison is full (or only unknown/unavailable slots remain), that
  // state is communicated by the selector itself instead of contradicting it.
  const partialCopy = loadedCount === 1 && !atMaximum ? messages.selection.partial : null;

  return (
    <div className={styles.body}>
      {/* B. Object selector */}
      <section aria-labelledby="compare-selection-heading" className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionEyebrow}>{messages.selection.heading}</p>
          <h2 className={styles.sectionTitle} id="compare-selection-heading">
            {messages.selection.heading}
          </h2>
        </div>
        <div className={styles.selection}>
          <ul aria-label={messages.selection.ariaLabel} className={styles.slotList}>
            {identities.map((identity, index) => (
              <li className={styles.slot} key={selectedSlugs[index] ?? identity.heading}>
                <span className={styles.slotIdentity}>
                  {identity.href !== null ? (
                    <Link className={styles.slotName} href={identity.href}>
                      {identity.heading}
                    </Link>
                  ) : (
                    <span className={styles.slotName}>{identity.heading}</span>
                  )}
                  <span className={styles.slotMeta}>{identity.meta}</span>
                </span>
                {selectedSlugs[index] !== undefined ? (
                  <CompareRemoveButton
                    displayName={identity.heading}
                    removeAction={messages.removeAction}
                    removeSlug={selectedSlugs[index] as string}
                    slugs={selectedSlugs}
                  />
                ) : null}
              </li>
            ))}
            {!atMaximum ? (
              <li className={styles.addSlot}>
                <CompareAddObject
                  {...(apiOrigin === undefined ? {} : { apiOrigin })}
                  locale={locale}
                  messages={messages.add}
                  selectedSlugs={selectedSlugs}
                />
              </li>
            ) : (
              <li className={styles.fullSlot}>
                {formatMessageTemplate(messages.selection.full, {
                  count: formatLocaleNumber(COMPARE_MAX_OBJECTS, locale),
                })}
              </li>
            )}
          </ul>
          {partialCopy !== null ? (
            <p className={styles.partial} role="status">
              {partialCopy}
            </p>
          ) : null}
          <CompareSaveSelected
            identities={saveableIdentities}
            locale={locale}
            messages={collectionSaveMessages}
          />
        </div>
      </section>

      {loadedCount === 0 ? (
        <section aria-labelledby="compare-data-heading" className={styles.section}>
          <div className={styles.sectionHeader}>
            <p className={styles.sectionEyebrow}>{messages.comparison.heading}</p>
            <h2 className={styles.sectionTitle} id="compare-data-heading">
              {messages.comparison.heading}
            </h2>
            <p className={styles.sectionDescription}>{messages.comparison.emptySummary}</p>
          </div>
          <p className={styles.emptyScience}>{messages.comparison.emptyDescription}</p>
        </section>
      ) : (
        <>
          {/* C. Identity comparison */}
          <section aria-labelledby="compare-identity-heading" className={styles.section}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>{messages.comparison.identityHeading}</p>
              <h2 className={styles.sectionTitle} id="compare-identity-heading">
                {messages.comparison.identityHeading}
              </h2>
              <p className={styles.sectionDescription}>{messages.comparison.identitySummary}</p>
            </div>
            <ul aria-label={messages.comparison.identityAriaLabel} className={styles.identityList}>
              {identities.map((identity, index) =>
                identity.href === null ? null : (
                  <li
                    className={styles.identityItem}
                    key={selectedSlugs[index] ?? identity.heading}
                  >
                    <Link className={styles.identityName} href={identity.href}>
                      {identity.heading}
                    </Link>
                    <span className={styles.identityMeta}>{identity.meta}</span>
                  </li>
                ),
              )}
            </ul>
          </section>

          {/* D/E. Scientific comparison with per-value provenance */}
          <section aria-labelledby="compare-data-heading" className={styles.section}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionEyebrow}>{messages.comparison.heading}</p>
              <h2 className={styles.sectionTitle} id="compare-data-heading">
                {messages.comparison.heading}
              </h2>
              <p className={styles.sectionDescription}>{messages.comparison.scienceSummary}</p>
            </div>

            <div className={styles.scienceWrap}>
              <table className={styles.scienceTable}>
                <caption className="sr-only">{messages.comparison.tableCaption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{messages.comparison.quantityHeading}</th>
                    {identities.map((identity, index) => (
                      <th key={selectedSlugs[index] ?? `column-${index}`} scope="col">
                        <span className={styles.columnName}>{identity.heading}</span>
                        <span className={styles.columnMeta}>{identity.meta}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.quantityCode}>
                      <th scope="row">{row.quantityName}</th>
                      {row.cells.map((cell, index) => (
                        <td key={selectedSlugs[index] ?? `cell-${index}`}>
                          <CellValue cell={cell} locale={locale} messages={messages.cells} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul
                aria-label={messages.comparison.quantityListAriaLabel}
                className={styles.mobileQuantities}
              >
                {rows.map((row) => (
                  <li className={styles.mobileQuantity} key={row.quantityCode}>
                    <h3 className={styles.mobileQuantityTitle}>{row.quantityName}</h3>
                    <ul className={styles.mobileCellList}>
                      {row.cells.map((cell, index) => (
                        <li
                          className={styles.mobileCell}
                          data-testid={`mobile-cell-${row.quantityCode}-${index}`}
                          key={selectedSlugs[index] ?? `mobile-${index}`}
                        >
                          <p className={styles.mobileCellName}>{identities[index]?.heading}</p>
                          <CellValue cell={cell} locale={locale} messages={messages.cells} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </>
      )}

      <footer className={styles.footer}>
        <Link className={styles.footerLink} href="/explore">
          {messages.footerBackToExplore}
        </Link>
      </footer>
    </div>
  );
}
