"use client";

import dynamic from "next/dynamic";
import type { SpectroscopyCalculationResponse } from "@lumina/api-client";

import type { PublishedLocale } from "../lib/i18n/locales";
import type { SpectroscopyLabMessages } from "../lib/i18n/messages/types";
import type { SpectroscopyState } from "../lib/simulations/spectroscopy-lab";

const InteractiveSpectroscopyLab = dynamic(
  () => import("./spectroscopy-lab-view").then((module) => module.SpectroscopyLabView),
  { loading: () => null, ssr: false },
);

type SpectroscopyLabEnhancedProps = Readonly<{
  initialState: SpectroscopyState;
  initialStateInvalid: boolean;
  initialCalculation: SpectroscopyCalculationResponse | null;
  apiOrigin: string | null;
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages;
}>;

export function SpectroscopyLabEnhanced(props: SpectroscopyLabEnhancedProps) {
  return <InteractiveSpectroscopyLab {...props} />;
}
