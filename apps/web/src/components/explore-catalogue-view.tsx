import Link from "next/link";

import type { EntitySummaryResponse } from "@lumina/api-client";

import { entityTypeLabel } from "../lib/catalog-display";

/** Browse grid for the discovery state; order is the backend's canonical order. */
export function EntityCardGrid({ items }: Readonly<{ items: Array<EntitySummaryResponse> }>) {
  return (
    <ul aria-label="Catalogue objects" className="grid gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((entity) => (
        <li key={entity.id} className="list-none">
          <Link
            className="flex h-full min-h-11 flex-col justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
            href={`/objects/${entity.slug}`}
          >
            <span className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
              {entity.canonical_name}
            </span>
            <span className="text-sm text-[var(--muted)]">
              {entityTypeLabel(entity.entity_type)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Honest empty state for an intentionally small reviewed slice. */
export function ExploreEmptyState() {
  return (
    <div className="max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8">
      <h3 className="text-xl font-semibold">The catalogue is being curated</h3>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        No reviewed objects are published yet. Lumina adds objects deliberately, with full
        provenance, rather than importing catalogues wholesale.
      </p>
    </div>
  );
}

/** Bounded failure state; never substitutes unrelated content. */
export function ExploreUnavailableState({
  context,
}: Readonly<{ context: "catalogue" | "search" }>) {
  return (
    <div
      className="max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] px-6 py-8"
      role="status"
    >
      <h3 className="text-xl font-semibold">
        {context === "search"
          ? "Search is unavailable right now"
          : "The catalogue is unavailable right now"}
      </h3>
      <p className="mt-2 leading-7 text-[var(--muted)]">
        Lumina could not reach the catalogue service within its bounded request window. Nothing is
        shown rather than showing something wrong — please retry in a moment.
      </p>
    </div>
  );
}
