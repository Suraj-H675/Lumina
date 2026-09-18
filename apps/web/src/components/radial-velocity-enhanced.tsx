"use client";

import dynamic from "next/dynamic";
import type { RadialVelocityCalculationResponse } from "@lumina/api-client";
import type { RadialVelocityState } from "../lib/simulations/radial-velocity";

const InteractiveRadialVelocity = dynamic(
  () => import("./radial-velocity-view").then((module) => module.RadialVelocityView),
  { loading: () => null, ssr: false },
);

type RadialVelocityEnhancedProps = Readonly<{
  initialState: RadialVelocityState;
  initialStateInvalid: boolean;
  initialCalculation: RadialVelocityCalculationResponse | null;
  apiOrigin: string | null;
}>;

export function RadialVelocityEnhanced(props: RadialVelocityEnhancedProps) {
  return <InteractiveRadialVelocity {...props} />;
}
