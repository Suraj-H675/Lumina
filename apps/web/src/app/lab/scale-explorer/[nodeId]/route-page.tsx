import type { Metadata } from "next";

import { ScaleExplorerEnhanced } from "../../../../components/scale-explorer-enhanced";
import { ScaleExplorerNoScript } from "../../../../components/scale-explorer-no-script";
import type { PublishedLocale } from "../../../../lib/i18n/locales";
import type {
  PresentationModeMessages,
  ScaleExplorerMessages,
} from "../../../../lib/i18n/messages/types";
import {
  SCALE_EXPLORER_NODE_IDS,
  SCALE_EXPLORER_MODEL_VERSION,
  type ScaleNodeId,
} from "../../../../lib/simulations/scale-explorer";

export function createScaleExplorerNodeMetadata(messages: ScaleExplorerMessages): Metadata {
  return {
    alternates: {
      canonical: "/lab/scale-explorer",
    },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

export const dynamicParams = false;

export function generateStaticParams(): Array<{ nodeId: string }> {
  return SCALE_EXPLORER_NODE_IDS.map((nodeId) => ({ nodeId }));
}

type ScaleExplorerNodePageProps = Readonly<{
  locale: PublishedLocale;
  messages: ScaleExplorerMessages;
  params: Promise<{ nodeId: string }>;
  presentationModeMessages: PresentationModeMessages;
}>;

export default async function ScaleExplorerNodePage({
  locale,
  messages,
  params,
  presentationModeMessages,
}: ScaleExplorerNodePageProps) {
  const { nodeId } = await params;
  if (!SCALE_EXPLORER_NODE_IDS.includes(nodeId as ScaleNodeId)) {
    return null;
  }
  const initialState = {
    model_version: SCALE_EXPLORER_MODEL_VERSION,
    node_id: nodeId as ScaleNodeId,
    version: 1 as const,
  };
  return (
    <>
      <ScaleExplorerNoScript
        initialState={initialState}
        initialStateInvalid={false}
        locale={locale}
        messages={messages}
      />
      <ScaleExplorerEnhanced
        initialState={initialState}
        initialStateInvalid={false}
        locale={locale}
        messages={messages}
        presentationModeMessages={presentationModeMessages}
      />
    </>
  );
}
