"use client";

import dynamic from "next/dynamic";

import type { PresentationModeMessages } from "../lib/i18n/messages/types";
import { PresentationModeMessagesProvider } from "../lib/i18n/presentation-mode-context";
import type { HRDiagramState } from "../lib/simulations/hr-diagram-explorer";

const InteractiveHRDiagramExplorer = dynamic(
  () => import("./hr-diagram-explorer-enhanced").then((module) => module.HRDiagramExplorerEnhanced),
  {
    loading: () => null,
    ssr: false,
  },
);

type HRDiagramExplorerEnhancedLoaderProps = Readonly<{
  initialState: HRDiagramState;
  initialStateInvalid: boolean;
  presentationModeMessages: PresentationModeMessages;
}>;

export function HRDiagramExplorerEnhancedLoader({
  initialState,
  initialStateInvalid,
  presentationModeMessages,
}: HRDiagramExplorerEnhancedLoaderProps) {
  return (
    <PresentationModeMessagesProvider messages={presentationModeMessages}>
      <InteractiveHRDiagramExplorer
        initialState={initialState}
        initialStateInvalid={initialStateInvalid}
      />
    </PresentationModeMessagesProvider>
  );
}
