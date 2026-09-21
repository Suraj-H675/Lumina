"use client";

import dynamic from "next/dynamic";
import type { RocketMissionDesignerCalculationResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { RocketMissionDesignerMessages } from "../lib/i18n/messages/types";
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
  locale: PublishedLocale;
  messages: RocketMissionDesignerMessages;
}>;

export function RocketMissionDesignerEnhanced(props: RocketMissionDesignerEnhancedProps) {
  return <InteractiveRocketMissionDesigner {...props} />;
}
