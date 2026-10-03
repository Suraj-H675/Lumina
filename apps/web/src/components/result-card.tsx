import Link from "next/link";

import type { CatalogSearchResponse } from "@nova-lumina/api-client";

import { formatMessageTemplate } from "../lib/i18n/format";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { CollectionSaveMessages, EntityTypeMessages } from "../lib/i18n/messages/types";
import { SaveToCollectionsButton } from "./save-to-collections";

type ResultCardProps = Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  locale: PublishedLocale;
  matchedAliasMessage: string;
  result: CatalogSearchResponse["items"][number];
}>;

/**
 * One search hit. Backend ranking order is preserved by the parent list; the
 * card exposes only identity information supported by the summary contract.
 * The card remains primary navigation with a distinct, separately named Save
 * control beside it.
 */
export function ResultCard({
  collectionSaveMessages,
  entityTypeMessages,
  locale,
  matchedAliasMessage,
  result,
}: ResultCardProps) {
  const { entity, matched_alias: matchedAlias } = result;
  return (
    <li className="list-none border-b border-[var(--border)]">
      <div className="flex min-w-0 items-stretch">
        <Link
          className="group grid min-h-[4.75rem] min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-2 no-underline max-[36rem]:grid-cols-1"
          href={`/objects/${entity.slug}`}
        >
          <span className="font-[var(--font-display)] text-[1.2rem] font-medium tracking-[-0.025em] text-[var(--foreground)] underline decoration-transparent underline-offset-[0.18em] transition-colors group-hover:text-[var(--accent-strong)] group-hover:decoration-[var(--border-strong)]">
            {entity.canonical_name}
          </span>
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right text-[0.7rem] text-[var(--muted)] max-[36rem]:justify-start max-[36rem]:text-left">
            <span className="font-[var(--font-data)] text-[0.65rem] tracking-[0.04em] uppercase">
              {entityTypeMessages[entity.entity_type]}
            </span>
            {matchedAlias !== null && matchedAlias !== "" ? (
              <span className="truncate">
                {formatMessageTemplate(matchedAliasMessage, { alias: matchedAlias })}
              </span>
            ) : null}
          </span>
        </Link>
        <div className="flex min-w-11 items-center justify-end pl-3">
          <SaveToCollectionsButton
            identity={{
              canonical_name: entity.canonical_name,
              entity_type: entity.entity_type,
              slug: entity.slug,
            }}
            locale={locale}
            messages={collectionSaveMessages}
            variant="icon"
          />
        </div>
      </div>
    </li>
  );
}
