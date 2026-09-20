"use client";

import dynamic from "next/dynamic";
import type { TransitMethodCalculationResponse } from "@lumina/api-client";
import type { PublishedLocale } from "../lib/i18n/locales";
import type { TransitMethodMessages } from "../lib/i18n/messages/types";
import type { TransitMethodState } from "../lib/simulations/transit-method";

const InteractiveTransitMethod = dynamic(
  () => import("./transit-method-view").then((module) => module.TransitMethodView),
  { loading: () => null, ssr: false },
);

type TransitMethodEnhancedProps = Readonly<{
  initialState: TransitMethodState;
  initialStateInvalid: boolean;
  initialCalculation: TransitMethodCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: TransitMethodMessages;
}>;

export function TransitMethodEnhanced(props: TransitMethodEnhancedProps) {
  return <InteractiveTransitMethod {...props} />;
}
