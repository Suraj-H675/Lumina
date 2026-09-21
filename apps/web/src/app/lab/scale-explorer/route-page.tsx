import type { Metadata } from "next";

import { ScaleExplorerEnhanced } from "../../../components/scale-explorer-enhanced";
import { ScaleExplorerNoScript } from "../../../components/scale-explorer-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type {
  PresentationModeMessages,
  ScaleExplorerMessages,
} from "../../../lib/i18n/messages/types";
import { DEFAULT_SCALE_EXPLORER_STATE } from "../../../lib/simulations/scale-explorer";

export function createScaleExplorerMetadata(messages: ScaleExplorerMessages): Metadata {
  return {
    alternates: {
      canonical: "/lab/scale-explorer",
    },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export default function ScaleExplorerPage({
  locale,
  messages,
  presentationModeMessages,
}: Readonly<{
  locale: PublishedLocale;
  messages: ScaleExplorerMessages;
  presentationModeMessages: PresentationModeMessages;
}>) {
  return (
    <>
      <ScaleExplorerNoScript
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={false}
        locale={locale}
        messages={messages}
      />
      <ScaleExplorerEnhanced
        initialState={DEFAULT_SCALE_EXPLORER_STATE}
        initialStateInvalid={false}
        locale={locale}
        messages={messages}
        presentationModeMessages={presentationModeMessages}
      />
    </>
  );
}
