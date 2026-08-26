import Link from "next/link";

import type { EntityDetailResponse } from "@lumina/api-client";

import {
  formatMeasurementValue,
  objectMetaLine,
  objectProvenanceRows,
  objectTitle,
} from "../lib/catalog-display";

type ObjectViewProps = Readonly<{
  detail: EntityDetailResponse;
  /** The public slug that resolved to this entity; used for the compare link. */
  slug: string;
}>;

/**
 * The public object experience: identity first, then exactly the scientific
 * data and provenance the accepted public contract exposes. Nothing is
 * inferred; quantities without a canonical selection are stated as such.
 */
export function ObjectView({ detail, slug }: ObjectViewProps) {
  const title = objectTitle(detail);
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
          ← Explore
        </Link>
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          Catalogue object
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
          {title}
        </h1>
        <p className="text-lg text-[var(--muted)]">{objectMetaLine(detail)}</p>
        <p>
          <Link
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-medium text-[var(--foreground)] no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            href={`/compare?object=${encodeURIComponent(slug)}`}
          >
            <span aria-hidden="true">⇄</span> Compare this object
          </Link>
        </p>
      </header>

      <section aria-labelledby="object-data-heading" className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-xl font-semibold" id="object-data-heading">
            Scientific data
          </h2>
          <span className="text-sm text-[var(--muted)]">
            Values are shown exactly as selected by Lumina&apos;s reviewed pipeline.
          </span>
        </div>

        {measuredQuantities.length === 0 && unselectedQuantities.length === 0 ? (
          <p className="max-w-2xl leading-7 text-[var(--muted)]">
            No measurements are published through Lumina for this object yet. This page will grow as
            reviewed data is added — nothing is estimated or filled in on your behalf.
          </p>
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
                        {entry.measurement_count}{" "}
                        {entry.measurement_count === 1 ? "measurement" : "measurements"} recorded ·
                        original value {measurement.original_value} {measurement.original_unit}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
            {unselectedQuantities.length > 0 ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                Also tracked, awaiting a canonical selection:{" "}
                {unselectedQuantities.map((entry) => entry.quantity.name).join(", ")}.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="object-provenance-heading" className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] pb-2">
          <h2 className="text-xl font-semibold" id="object-provenance-heading">
            Provenance
          </h2>
          <span className="text-sm text-[var(--muted)]">Where every value above comes from.</span>
        </div>
        {provenanceRows.length === 0 ? (
          <p className="leading-7 text-[var(--muted)]">No source records back this object yet.</p>
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
                  Source record <span className="font-mono">{row.recordId}</span>
                </p>
                {row.quantityNames.length > 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Covers: {row.quantityNames.join(", ")}
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
          ← Back to Explore
        </Link>
      </footer>
    </article>
  );
}
