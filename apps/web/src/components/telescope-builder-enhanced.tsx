"use client";

import dynamic from "next/dynamic";

import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

import type { PresentationModeMessages } from "../lib/i18n/messages/types";
import { PresentationModeMessagesProvider } from "../lib/i18n/presentation-mode-context";
import type { TelescopeBuilderState } from "../lib/simulations/telescope-builder";

const InteractiveTelescopeBuilder = dynamic(
  () => import("./telescope-builder-view").then((module) => module.TelescopeBuilderView),
  {
    loading: () => null,
    ssr: false,
  },
);

type TelescopeBuilderEnhancedProps = Readonly<{
  initialState: TelescopeBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: TelescopeBuilderCalculationResponse | null;
  apiOrigin: string | null;
  presentationModeMessages: PresentationModeMessages;
}>;

/** Progressive enhancement boundary; the server-rendered text alternative remains truthful. */
export function TelescopeBuilderEnhanced({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  presentationModeMessages,
}: TelescopeBuilderEnhancedProps) {
  return (
    <PresentationModeMessagesProvider messages={presentationModeMessages}>
      <InteractiveTelescopeBuilder
        apiOrigin={apiOrigin}
        initialCalculation={initialCalculation}
        initialState={initialState}
        initialStateInvalid={initialStateInvalid}
      />
    </PresentationModeMessagesProvider>
  );
}
