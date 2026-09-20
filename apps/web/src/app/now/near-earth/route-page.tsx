import type { Metadata } from "next";

import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { NearEarthMessages, SpaceNowMessages } from "../../../lib/i18n/messages/types";
import { NASA_NEOWS_NAME } from "../../../lib/space-now/provider-display";
import { loadNowNearEarth } from "../../../lib/server/space-now";
import { NearEarthView } from "./near-earth-view";

export function createNearEarthMetadata(messages: NearEarthMessages): Metadata {
  return {
    title: messages.metadataTitle,
    description: formatMessageTemplate(messages.metadataDescription, {
      provider: NASA_NEOWS_NAME,
    }),
  };
}

export default async function NearEarthPage({
  locale,
  messages,
  retrievalMessages,
}: Readonly<{
  locale: PublishedLocale;
  messages: NearEarthMessages;
  retrievalMessages: SpaceNowMessages["retrieval"];
}>) {
  const outcome = await loadNowNearEarth();
  return (
    <NearEarthView
      locale={locale}
      messages={messages}
      outcome={outcome}
      retrievalMessages={retrievalMessages}
    />
  );
}
