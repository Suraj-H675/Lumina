"use client";

import dynamic from "next/dynamic";

import type { ScaleExplorerState } from "../lib/simulations/scale-explorer";

const InteractiveScaleExplorer = dynamic(
  () => import("./scale-explorer-view").then((module) => module.ScaleExplorerView),
  {
    loading: () => (
      <p aria-live="polite" className="leading-7 text-[var(--muted)]" role="status">
        Loading interactive controls…
      </p>
    ),
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
