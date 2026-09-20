import type { Metadata } from "next";

import type { PublishedLocale } from "../../lib/i18n/locales";
import type { JournalMessages } from "../../lib/i18n/messages/types";
import { JournalView } from "./journal-view";

export function createJournalMetadata(messages: JournalMessages): Metadata {
  return {
    description: messages.metadataDescription,
    robots: { follow: false, index: false },
    title: messages.metadataTitle,
  };
}

export default function JournalPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: JournalMessages }>) {
  return <JournalView locale={locale} messages={messages} />;
}
