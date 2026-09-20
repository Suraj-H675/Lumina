import type { Metadata } from "next";

import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { LaunchCenterMessages } from "../../../lib/i18n/messages/types";
import { loadNowLaunches } from "../../../lib/server/space-now";
import { LaunchesView } from "./launches-view";

export function createLaunchesMetadata(messages: LaunchCenterMessages): Metadata {
  return {
    title: messages.list.metadataTitle,
    description: messages.list.metadataDescription,
  };
}

export default async function LaunchesPage({
  locale,
  messages,
}: Readonly<{ locale: PublishedLocale; messages: LaunchCenterMessages }>) {
  return <LaunchesView locale={locale} messages={messages} outcome={await loadNowLaunches()} />;
}
