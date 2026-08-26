import Link from "next/link";

import type { CatalogSearchResponse } from "@lumina/api-client";

import { entityTypeLabel } from "../lib/catalog-display";

type ResultCardProps = Readonly<{
  result: CatalogSearchResponse["items"][number];
}>;

/**
 * One search hit. Backend ranking order is preserved by the parent list; the
 * card exposes only identity information supported by the summary contract.
 */
export function ResultCard({ result }: ResultCardProps) {
  const { entity, matched_alias: matchedAlias } = result;
  return (
    <li className="list-none">
      <Link
        className="flex h-full min-h-11 flex-col justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-5 py-4 no-underline transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]"
        href={`/objects/${entity.slug}`}
      >
        <span className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {entity.canonical_name}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
          <span className="rounded-sm border border-[var(--border)] px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">
            {entityTypeLabel(entity.entity_type)}
          </span>
          {matchedAlias !== null && matchedAlias !== "" ? (
            <span className="truncate">Matched “{matchedAlias}”</span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
