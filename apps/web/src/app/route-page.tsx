import type { Metadata } from "next";

import { loadReviewedDiscoveries } from "../lib/discoveries/content";
import type { MissionControlMessages } from "../lib/i18n/messages/types";
import { loadNowLaunches } from "../lib/server/space-now";
import { MissionControlHome } from "./mission-control-home";

export function missionControlMetadata(messages: MissionControlMessages): Metadata {
  return {
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export async function MissionControlRoute({
  messages,
}: Readonly<{ messages: MissionControlMessages }>) {
  const launchOutcome = await loadNowLaunches();
  return (
    <MissionControlHome
      discoveries={loadReviewedDiscoveries().entries}
      launchOutcome={launchOutcome}
      messages={messages}
    />
  );
}
