import type { Metadata } from "next";

import { CollectionDetailView } from "../../../components/collection-detail-view";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";

/**
 * A local collection lives only in one browser, so server metadata cannot
 * (and must not) reflect its name; the truthful generic title comes from the
 * layout template. The page shell is still server-rendered.
 */
export const metadata: Metadata = {
  description:
    "One of your object collections. Collections are stored locally in this browser on this device.",
  title: "Collection",
};

type CollectionPageProps = Readonly<{
  params: Promise<Readonly<{ collectionId: string }>>;
}>;

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { collectionId } = await params;

  // Public API origin for bounded typeahead adds; carries no secrets.
  const configured = resolveWebApiOrigin();
  const apiOrigin = configured.valid ? configured.origin : undefined;

  return (
    <CollectionDetailView
      {...(apiOrigin === undefined ? {} : { apiOrigin })}
      collectionId={collectionId}
    />
  );
}
