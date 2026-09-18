"use client";

import dynamic from "next/dynamic";
import type { PlanetarySystemBuilderCalculationResponse } from "@lumina/api-client";

import type { PlanetarySystemBuilderState } from "../lib/simulations/planetary-system-builder";

const InteractivePlanetarySystemBuilder = dynamic(
  () =>
    import("./planetary-system-builder-view").then((module) => module.PlanetarySystemBuilderView),
  { loading: () => null, ssr: false },
);

type PlanetarySystemBuilderEnhancedProps = Readonly<{
  initialState: PlanetarySystemBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: PlanetarySystemBuilderCalculationResponse | null;
  apiOrigin: string | null;
}>;

export function PlanetarySystemBuilderEnhanced(props: PlanetarySystemBuilderEnhancedProps) {
  return <InteractivePlanetarySystemBuilder {...props} />;
}
