"use client";

import dynamic from "next/dynamic";
import type { StellarLaboratoryCalculationResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { StellarLaboratoryMessages } from "../lib/i18n/messages/types";
import type { StellarLaboratoryState } from "../lib/simulations/stellar-laboratory";

const InteractiveStellarLaboratory = dynamic(
  () => import("./stellar-laboratory-view").then((module) => module.StellarLaboratoryView),
  { loading: () => null, ssr: false },
);

type StellarLaboratoryEnhancedProps = Readonly<{
  initialState: StellarLaboratoryState;
  initialStateInvalid: boolean;
  initialCalculation: StellarLaboratoryCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages;
}>;

export function StellarLaboratoryEnhanced(props: StellarLaboratoryEnhancedProps) {
  return <InteractiveStellarLaboratory {...props} />;
}
