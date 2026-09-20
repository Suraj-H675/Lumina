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
    return (
      <span className="text-sm text-[var(--muted)] italic">
        {unavailableText(cell.kind, messages)}
      </span>
    );
  }
  return (
    <span className="block">
      <span className="font-mono text-lg tracking-tight text-[var(--foreground)]">
        {formatMeasurementValue(cell.measurement.value)}
      </span>{" "}
      <span className="text-sm text-[var(--accent)]">{cell.measurement.unitSymbol}</span>
      <span className="mt-0.5 block text-xs text-[var(--muted)]">
        {cell.measurementCount === 1
          ? formatMessageTemplate(messages.measurementDetails.one, {
              sourceLabel: cell.measurement.sourceLabel,
            })
          : formatMessageTemplate(messages.measurementDetails.multiple, {
              count: formatLocaleNumber(cell.measurementCount, locale),
              sourceLabel: cell.measurement.sourceLabel,
            })}
      </span>
      <span className="mt-0.5 block text-xs text-[var(--muted)]">
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
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8">
        <h2 className="text-xl font-semibold">{messages.empty.title}</h2>
        <p className="mt-2 leading-7 text-[var(--muted)]">{messages.empty.description}</p>
      </div>
      <section aria-labelledby="compare-add-heading" className="space-y-3">
        <h2 id="compare-add-heading">{messages.empty.addHeading}</h2>
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
    <div className="space-y-10">
      {/* B. Object selector */}
      <section aria-labelledby="compare-selection-heading" className="space-y-4">
        <h2 className="sr-only" id="compare-selection-heading">
          {messages.selection.heading}
        </h2>
        <ul
          aria-label={messages.selection.ariaLabel}
          className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4"
        >
          {identities.map((identity, index) => (
            <li
              className="flex h-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2"
              key={selectedSlugs[index] ?? identity.heading}
            >
              <span className="min-w-0">
                {identity.href !== null ? (
                  <Link
                    className="block truncate font-semibold text-[var(--foreground)] underline-offset-4 hover:underline"
                    href={identity.href}
                  >
                    {identity.heading}
                  </Link>
                ) : (
                  <span className="block truncate font-semibold text-[var(--muted)]">
                    {identity.heading}
                  </span>
                )}
                <span className="block truncate text-sm text-[var(--muted)]">{identity.meta}</span>
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
            <li className="h-full rounded-md border border-dashed border-[var(--border-strong)] px-4 py-2">
              <CompareAddObject
                {...(apiOrigin === undefined ? {} : { apiOrigin })}
                locale={locale}
                messages={messages.add}
                selectedSlugs={selectedSlugs}
              />
            </li>
          ) : (
            <li className="flex h-full items-center rounded-md border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)]">
              {formatMessageTemplate(messages.selection.full, {
                count: formatLocaleNumber(COMPARE_MAX_OBJECTS, locale),
              })}
            </li>
          )}
        </ul>
        {partialCopy !== null ? (
          <p className="text-[var(--muted)]" role="status">
            {partialCopy}
          </p>
        ) : null}
      </section>

      {/* Collections integration: save the compared objects (identity only). */}
      <CompareSaveSelected
        identities={saveableIdentities}
        locale={locale}
        messages={collectionSaveMessages}
      />

      {loadedCount === 0 ? (
        <section aria-labelledby="compare-data-heading" className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
            <h2 id="compare-data-heading">{messages.comparison.heading}</h2>
            <span className="text-sm text-[var(--muted)]">{messages.comparison.emptySummary}</span>
          </div>
          <p className="leading-7 text-[var(--muted)]">{messages.comparison.emptyDescription}</p>
        </section>
      ) : (
        <>
          {/* C. Identity comparison */}
          <section aria-labelledby="compare-identity-heading" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h2 id="compare-identity-heading">{messages.comparison.identityHeading}</h2>
              <span className="text-sm text-[var(--muted)]">
                {messages.comparison.identitySummary}
              </span>
            </div>
            <ul
              aria-label={messages.comparison.identityAriaLabel}
              className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
            >
              {identities.map((identity, index) =>
                identity.href === null ? null : (
                  <li
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                    key={selectedSlugs[index] ?? identity.heading}
                  >
                    <Link
                      className="font-semibold text-[var(--foreground)] underline-offset-4 hover:underline"
                      href={identity.href}
                    >
                      {identity.heading}
                    </Link>
                    <span className="block text-sm text-[var(--muted)]">{identity.meta}</span>
                  </li>
                ),
              )}
            </ul>
          </section>

          {/* D/E. Scientific comparison with per-value provenance */}
          <section aria-labelledby="compare-data-heading" className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
              <h2 id="compare-data-heading">{messages.comparison.heading}</h2>
              <span className="text-sm text-[var(--muted)]">
                {messages.comparison.scienceSummary}
              </span>
            </div>

            {/* Desktop matrix */}
            <table className="hidden w-full border-collapse lg:table">
              <caption className="sr-only">{messages.comparison.tableCaption}</caption>
              <thead>
                <tr>
                  <th
                    className="w-56 border-b border-[var(--border)] pb-2 pr-4 text-left text-sm font-medium text-[var(--muted)]"
                    scope="col"
                  >
                    {messages.comparison.quantityHeading}
                  </th>
                  {identities.map((identity, index) => (
                    <th
                      className="border-b border-[var(--border)] pb-2 pr-4 text-left"
                      key={selectedSlugs[index] ?? `column-${index}`}
                      scope="col"
                    >
                      <span className="font-semibold text-[var(--foreground)]">
                        {identity.heading}
                      </span>
                      <span className="block text-xs font-normal text-[var(--muted)]">
                        {identity.meta}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="align-top" key={row.quantityCode}>
                    <th
                      className="border-b border-[var(--border)] py-4 pr-4 text-left align-top text-sm font-medium text-[var(--muted)]"
                      scope="row"
                    >
                      {row.quantityName}
                    </th>
                    {row.cells.map((cell, index) => (
                      <td
                        className="border-b border-[var(--border)] py-4 pr-6"
                        key={selectedSlugs[index] ?? `cell-${index}`}
                      >
                        <CellValue cell={cell} locale={locale} messages={messages.cells} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile / tablet: quantity-by-quantity stacked sections */}
            <ul
              aria-label={messages.comparison.quantityListAriaLabel}
              className="list-none space-y-8 p-0 lg:hidden"
            >
              {rows.map((row) => (
                <li className="space-y-3" key={row.quantityCode}>
                  <h3 className="border-b border-[var(--border)] pb-1 text-lg font-semibold">
                    {row.quantityName}
                  </h3>
                  <ul className="grid list-none gap-3 p-0 sm:grid-cols-2">
                    {row.cells.map((cell, index) => (
                      <li
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                        data-testid={`mobile-cell-${row.quantityCode}-${index}`}
                        key={selectedSlugs[index] ?? `mobile-${index}`}
                      >
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                          {identities[index]?.heading}
                        </p>
                        <CellValue cell={cell} locale={locale} messages={messages.cells} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <footer className="border-t border-[var(--border)] pt-6">
        <Link
          className="inline-flex min-h-11 items-center gap-2 font-medium text-[var(--link)] underline"
          href="/explore"
        >
          {messages.footerBackToExplore}
        </Link>
      </footer>
    </div>
  );
}
