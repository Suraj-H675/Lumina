import type { Metadata } from "next";

import { CollectionDetailView } from "../../../components/collection-detail-view";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { CollectionsMessages } from "../../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";

/**
 * A local collection lives only in one browser, so server metadata cannot
 * (and must not) reflect its name; the truthful generic title comes from the
 * layout template. The page shell is still server-rendered.
 */
export function createCollectionDetailMetadata(
  messages: CollectionsMessages["metadata"],
): Metadata {
  return {
    description: messages.detailDescription,
    title: messages.detailTitle,
  };
}

type CollectionPageProps = Readonly<{
  locale: PublishedLocale;
  messages: CollectionsMessages;
  params: Promise<Readonly<{ collectionId: string }>>;
}>;

export default async function CollectionPage({ locale, messages, params }: CollectionPageProps) {
  const { collectionId } = await params;

  // Public API origin for bounded typeahead adds; carries no secrets.
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  return (
    <CollectionDetailView
      {...(apiOrigin === undefined ? {} : { apiOrigin })}
      collectionId={collectionId}
      locale={locale}
      messages={messages}
    />
  );
}
