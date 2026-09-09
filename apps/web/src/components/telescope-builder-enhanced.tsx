"use client";

import dynamic from "next/dynamic";

import type { TelescopeBuilderCalculationResponse } from "@lumina/api-client";

import type { TelescopeBuilderState } from "../lib/simulations/telescope-builder";

const InteractiveTelescopeBuilder = dynamic(
  () => import("./telescope-builder-view").then((module) => module.TelescopeBuilderView),
  {
    loading: () => null,
    ssr: false,
  },
);

type TelescopeBuilderEnhancedProps = Readonly<{
  initialState: TelescopeBuilderState;
  initialStateInvalid: boolean;
  initialCalculation: TelescopeBuilderCalculationResponse | null;
  apiOrigin: string | null;
}>;

/** Progressive enhancement boundary; the server-rendered text alternative remains truthful. */
export function TelescopeBuilderEnhanced({
  initialState,
  initialStateInvalid,
  initialCalculation,
  apiOrigin,
}: TelescopeBuilderEnhancedProps) {
  return (
    <InteractiveTelescopeBuilder
      apiOrigin={apiOrigin}
      initialCalculation={initialCalculation}
      initialState={initialState}
      initialStateInvalid={initialStateInvalid}
    />
  );
}
