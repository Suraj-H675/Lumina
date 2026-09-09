"use client";

import dynamic from "next/dynamic";

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
}>;

export function HRDiagramExplorerEnhancedLoader({
  initialState,
  initialStateInvalid,
}: HRDiagramExplorerEnhancedLoaderProps) {
  return (
    <InteractiveHRDiagramExplorer
      initialState={initialState}
      initialStateInvalid={initialStateInvalid}
    />
  );
}
