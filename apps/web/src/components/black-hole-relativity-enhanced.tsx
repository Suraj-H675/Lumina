"use client";

import dynamic from "next/dynamic";
import type { BlackHoleRelativityCalculationResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { BlackHoleRelativityMessages } from "../lib/i18n/messages/types";
import type { BlackHoleRelativityState } from "../lib/simulations/black-hole-relativity";

const InteractiveBlackHoleRelativity = dynamic(
  () => import("./black-hole-relativity-view").then((module) => module.BlackHoleRelativityView),
  { loading: () => null, ssr: false },
);

type BlackHoleRelativityEnhancedProps = Readonly<{
  initialState: BlackHoleRelativityState;
  initialStateInvalid: boolean;
  initialCalculation: BlackHoleRelativityCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: BlackHoleRelativityMessages;
}>;

export function BlackHoleRelativityEnhanced(props: BlackHoleRelativityEnhancedProps) {
  return <InteractiveBlackHoleRelativity {...props} />;
}
