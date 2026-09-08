"use client";

import dynamic from "next/dynamic";

import type { ScaleExplorerState } from "../lib/simulations/scale-explorer";

const InteractiveScaleExplorer = dynamic(
  () => import("./scale-explorer-view").then((module) => module.ScaleExplorerView),
  {
    // The server-rendered no-script representation is the truthful fallback while this bundle loads.
    loading: () => null,
    ssr: false,
  },
);

type ScaleExplorerEnhancedProps = Readonly<{
  initialState: ScaleExplorerState;
  initialStateInvalid: boolean;
}>;

/**
 * Progressive enhancement boundary for the lab. The accessible server representation stays
 * available before this intentionally lazy interactive bundle is loaded.
 */
export function ScaleExplorerEnhanced({
  initialState,
  initialStateInvalid,
}: ScaleExplorerEnhancedProps) {
  return (
    <InteractiveScaleExplorer
      initialState={initialState}
      initialStateInvalid={initialStateInvalid}
    />
  );
}
