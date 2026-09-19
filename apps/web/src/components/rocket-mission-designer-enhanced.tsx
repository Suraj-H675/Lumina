"use client";

import dynamic from "next/dynamic";
import type { RocketMissionDesignerCalculationResponse } from "@lumina/api-client";

import type { RocketMissionDesignerState } from "../lib/simulations/rocket-mission-designer";

const InteractiveRocketMissionDesigner = dynamic(
  () => import("./rocket-mission-designer-view").then((module) => module.RocketMissionDesignerView),
  { loading: () => null, ssr: false },
);

type RocketMissionDesignerEnhancedProps = Readonly<{
  initialState: RocketMissionDesignerState;
  initialStateInvalid: boolean;
  initialCalculation: RocketMissionDesignerCalculationResponse | null;
  apiOrigin: string | null;
}>;

export function RocketMissionDesignerEnhanced(props: RocketMissionDesignerEnhancedProps) {
  return <InteractiveRocketMissionDesigner {...props} />;
}
