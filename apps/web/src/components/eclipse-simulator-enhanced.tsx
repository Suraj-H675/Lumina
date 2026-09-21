"use client";

import dynamic from "next/dynamic";
import type { EclipseSimulatorCalculationResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { EclipseSimulatorMessages } from "../lib/i18n/messages/types";
import type { EclipseSimulatorState } from "../lib/simulations/eclipse-simulator";

const InteractiveEclipseSimulator = dynamic(
  () => import("./eclipse-simulator-view").then((module) => module.EclipseSimulatorView),
  { loading: () => null, ssr: false },
);

type EclipseSimulatorEnhancedProps = Readonly<{
  initialState: EclipseSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: EclipseSimulatorCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: EclipseSimulatorMessages;
}>;

export function EclipseSimulatorEnhanced(props: EclipseSimulatorEnhancedProps) {
  return <InteractiveEclipseSimulator {...props} />;
}
