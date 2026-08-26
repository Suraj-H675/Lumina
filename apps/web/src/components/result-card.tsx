import Link from "next/link";

import type { CatalogSearchResponse } from "@lumina/api-client";

import { entityTypeLabel } from "../lib/catalog-display";
import { SaveToCollectionsButton } from "./save-to-collections";

type ResultCardProps = Readonly<{
  result: CatalogSearchResponse["items"][number];
}>;

/**
 * One search hit. Backend ranking order is preserved by the parent list; the
 * card exposes only identity information supported by the summary contract.
 * The card remains primary navigation with a distinct, separately named Save
 * control beside it.
 */
export function ResultCard({ result }: ResultCardProps) {
  const { entity, matched_alias: matchedAlias } = result;
  return (
    <li className="list-none">
      <div className="flex h-full items-stretch rounded-md border border-[var(--border)] bg-[var(--surface)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]">
        <Link
          className="flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-2 px-5 py-4 no-underline"
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
        <div className="flex items-center pr-1.5">
          <SaveToCollectionsButton
            identity={{
              canonical_name: entity.canonical_name,
              entity_type: entity.entity_type,
              slug: entity.slug,
            }}
            variant="icon"
          />
        </div>
      </div>
    </li>
  );
}
