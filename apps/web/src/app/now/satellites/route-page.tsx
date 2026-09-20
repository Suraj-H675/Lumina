import type { Metadata } from "next";

import { formatMessageTemplate } from "../../../lib/i18n/format";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SatelliteMessages } from "../../../lib/i18n/messages/types";
import { CELESTRAK_NAME, SGP4_NAME } from "../../../lib/space-now/provider-display";
import { loadNowSatellites } from "../../../lib/server/space-now";
import { SatellitesView } from "./satellites-view";

export function createSatellitesMetadata(messages: SatelliteMessages): Metadata {
  return {
    title: messages.metadataTitle,
    description: formatMessageTemplate(messages.metadataDescription, {
      propagationModel: SGP4_NAME,
      provider: CELESTRAK_NAME,
    }),
  };
}

export default async function SatellitesPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: SatelliteMessages }>) {
  return <SatellitesView locale={locale} messages={messages} outcome={await loadNowSatellites()} />;
}
