"use client";

import dynamic from "next/dynamic";
import type { OrbitSandboxCalculationResponse } from "@lumina/api-client";
import type { OrbitSandboxState } from "../lib/simulations/orbit-sandbox";

const InteractiveOrbitSandbox = dynamic(
  () => import("./orbit-sandbox-view").then((module) => module.OrbitSandboxView),
  { loading: () => null, ssr: false },
);

type OrbitSandboxEnhancedProps = Readonly<{
  initialState: OrbitSandboxState;
  initialStateInvalid: boolean;
  initialCalculation: OrbitSandboxCalculationResponse | null;
  apiOrigin: string | null;
}>;

export function OrbitSandboxEnhanced(props: OrbitSandboxEnhancedProps) {
  return <InteractiveOrbitSandbox {...props} />;
}
