"use client";

import dynamic from "next/dynamic";

import type { SeasonsCalculationResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type {
  PresentationModeMessages,
  SeasonsSimulatorMessages,
} from "../lib/i18n/messages/types";
import { PresentationModeMessagesProvider } from "../lib/i18n/presentation-mode-context";
import type { SeasonsState } from "../lib/simulations/seasons-simulator";

const InteractiveSeasonsSimulator = dynamic(
  () => import("./seasons-simulator-view").then((module) => module.SeasonsSimulatorView),
  {
    loading: () => null,
    ssr: false,
  },
);

type SeasonsSimulatorEnhancedProps = Readonly<{
  initialState: SeasonsState;
  initialStateInvalid: boolean;
  initialCalculation: SeasonsCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages;
  presentationModeMessages: PresentationModeMessages;
}>;

/** Progressive enhancement boundary; the server-rendered text alternative remains truthful. */
export function SeasonsSimulatorEnhanced({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
  locale,
  messages,
  presentationModeMessages,
}: SeasonsSimulatorEnhancedProps) {
  return (
    <PresentationModeMessagesProvider messages={presentationModeMessages}>
      <InteractiveSeasonsSimulator
        apiOrigin={apiOrigin}
        initialCalculation={initialCalculation}
        initialState={initialState}
        initialStateInvalid={initialStateInvalid}
        locale={locale}
        messages={messages}
      />
    </PresentationModeMessagesProvider>
  );
}
