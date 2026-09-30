import Link from "next/link";

import type { EntitySummaryResponse } from "@nova-lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  CollectionSaveMessages,
  EntityTypeMessages,
  ExploreMessages,
} from "../lib/i18n/messages/types";
import { SaveToCollectionsButton } from "./save-to-collections";
import styles from "./explore-catalogue-view.module.css";

/** Browse grid for the discovery state; order is the backend's canonical order. */
export function EntityCardGrid({
  collectionSaveMessages,
  entityTypeMessages,
  items,
  locale,
  messages,
}: Readonly<{
  collectionSaveMessages: CollectionSaveMessages;
  entityTypeMessages: EntityTypeMessages;
  items: Array<EntitySummaryResponse>;
  locale: PublishedLocale;
  messages: ExploreMessages["browse"];
}>) {
  return (
    <ul aria-label={messages.objectsAriaLabel} className={styles.grid}>
      {items.map((entity) => (
        <li className={styles.item} key={entity.id}>
          <div className={styles.card}>
            {/* The card stays primary navigation; Save is a distinct control. */}
            <Link className={styles.objectLink} href={`/objects/${entity.slug}`}>
              <span className={styles.name}>{entity.canonical_name}</span>
              <span className={styles.type}>{entityTypeMessages[entity.entity_type]}</span>
            </Link>
            <div className={styles.save}>
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
      ))}
    </ul>
  );
}

/** Honest empty state for an intentionally small reviewed slice. */
export function ExploreEmptyState({ messages }: Readonly<{ messages: ExploreMessages["browse"] }>) {
  return (
    <div className={styles.state}>
      <h3>{messages.emptyTitle}</h3>
      <p>{messages.emptyDescription}</p>
    </div>
  );
}

/** Bounded failure state; never substitutes unrelated content. */
export function ExploreUnavailableState({
  context,
  messages,
}: Readonly<{
  context: "catalogue" | "search";
  messages: ExploreMessages["unavailable"];
}>) {
  return (
    <div className={styles.state} role="status">
      <h3>{context === "search" ? messages.searchTitle : messages.catalogueTitle}</h3>
      <p>{messages.description}</p>
    </div>
  );
}
