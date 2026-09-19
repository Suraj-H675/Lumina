"use client";

import dynamic from "next/dynamic";
import type { ImpactSimulatorCalculationResponse } from "@lumina/api-client";

import type { ImpactSimulatorState } from "../lib/simulations/impact-simulator";

const InteractiveImpactSimulator = dynamic(
  () => import("./impact-simulator-view").then((module) => module.ImpactSimulatorView),
  { loading: () => null, ssr: false },
);

type ImpactSimulatorEnhancedProps = Readonly<{
  initialState: ImpactSimulatorState;
  initialStateInvalid: boolean;
  initialCalculation: ImpactSimulatorCalculationResponse | null;
  apiOrigin: string | null;
}>;

export function ImpactSimulatorEnhanced(props: ImpactSimulatorEnhancedProps) {
  return <InteractiveImpactSimulator {...props} />;
}
