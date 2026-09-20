import type { Metadata } from "next";

import type { SpaceNowMessages } from "../../lib/i18n/messages/types";
import { loadNowApod } from "../../lib/server/space-now";
import { SpaceNowView } from "./space-now-view";

export function createSpaceNowMetadata(messages: SpaceNowMessages): Metadata {
  return {
    title: messages.metadataTitle,
    description: messages.metadataDescription,
  };
}

export default async function SpaceNowPage({ messages }: Readonly<{ messages: SpaceNowMessages }>) {
  const outcome = await loadNowApod();
  return <SpaceNowView messages={messages} outcome={outcome} />;
}
