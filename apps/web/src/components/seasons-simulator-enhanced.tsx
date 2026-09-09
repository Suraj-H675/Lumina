"use client";

import dynamic from "next/dynamic";

import type { SeasonsCalculationResponse } from "@lumina/api-client";

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
}>;

/** Progressive enhancement boundary; the server-rendered text alternative remains truthful. */
export function SeasonsSimulatorEnhanced({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: SeasonsSimulatorEnhancedProps) {
  return (
    <InteractiveSeasonsSimulator
      apiOrigin={apiOrigin}
      initialCalculation={initialCalculation}
      initialState={initialState}
      initialStateInvalid={initialStateInvalid}
    />
  );
}
