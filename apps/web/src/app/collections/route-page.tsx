import type { Metadata } from "next";

import { CollectionsOverview } from "../../components/collections-overview";
import type { PublishedLocale } from "../../lib/i18n/locales";
import type { CollectionsMessages } from "../../lib/i18n/messages/types";

/**
 * Truthful generic metadata: collection names are local-only and must never
 * leak into server infrastructure, so the overview never personalizes titles.
 */
export function createCollectionsMetadata(messages: CollectionsMessages["metadata"]): Metadata {
  return {
    description: messages.overviewDescription,
    title: messages.overviewTitle,
  };
}

export default function CollectionsPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: CollectionsMessages }>) {
  return <CollectionsOverview locale={locale} messages={messages} />;
}
