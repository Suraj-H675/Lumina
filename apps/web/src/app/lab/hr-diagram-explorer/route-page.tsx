import type { Metadata } from "next";

import { HRDiagramExplorerEnhancedLoader } from "../../../components/hr-diagram-explorer-enhanced-loader";
import { HRDiagramExplorerNoScript } from "../../../components/hr-diagram-explorer-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type {
  HRDiagramExplorerMessages,
  PresentationModeMessages,
} from "../../../lib/i18n/messages/types";
import {
  DEFAULT_HR_DIAGRAM_STATE,
  decodeHRDiagramState,
  type HRDiagramState,
} from "../../../lib/simulations/hr-diagram-explorer";

export const dynamic = "force-dynamic";

export function createHRDiagramExplorerMetadata(messages: HRDiagramExplorerMessages): Metadata {
  return {
    alternates: {
      canonical: "/lab/hr-diagram-explorer",
    },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type HRDiagramExplorerPageProps = Readonly<{
  locale: PublishedLocale;
  messages: HRDiagramExplorerMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  presentationModeMessages: PresentationModeMessages;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{
  state: HRDiagramState;
  invalid: boolean;
}> {
  const rawState = searchParams.state;
  if (rawState === undefined) return { state: DEFAULT_HR_DIAGRAM_STATE, invalid: false };
  const encoded = Array.isArray(rawState) || rawState.length === 0 ? null : rawState;
  const decoded = encoded === null ? null : decodeHRDiagramState(encoded);
  return decoded === null
    ? { state: DEFAULT_HR_DIAGRAM_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function HRDiagramExplorerPage({
  locale,
  messages,
  presentationModeMessages,
  searchParams,
}: HRDiagramExplorerPageProps) {
  const requested = stateFromSearchParams(await searchParams);

  return (
    <>
      <HRDiagramExplorerNoScript
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <HRDiagramExplorerEnhancedLoader
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
        presentationModeMessages={presentationModeMessages}
      />
    </>
  );
}
