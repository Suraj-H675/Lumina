"use client";

import dynamic from "next/dynamic";
import type { RelativityVisualizationsCalculationResponse } from "@lumina/api-client";

import type { RelativityVisualizationsState } from "../lib/simulations/relativity-visualizations";

const InteractiveRelativityVisualizations = dynamic(
  () =>
    import("./relativity-visualizations-view").then(
      (module) => module.RelativityVisualizationsView,
    ),
  { loading: () => null, ssr: false },
);

type RelativityVisualizationsEnhancedProps = Readonly<{
  initialState: RelativityVisualizationsState;
  initialStateInvalid: boolean;
  initialCalculation: RelativityVisualizationsCalculationResponse | null;
  apiOrigin: string | null;
}>;

export function RelativityVisualizationsEnhanced(props: RelativityVisualizationsEnhancedProps) {
  return <InteractiveRelativityVisualizations {...props} />;
}
