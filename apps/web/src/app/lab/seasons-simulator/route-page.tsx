import type { Metadata } from "next";

import { SeasonsSimulatorEnhanced } from "../../../components/seasons-simulator-enhanced";
import { SeasonsSimulatorNoScript } from "../../../components/seasons-simulator-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type {
  PresentationModeMessages,
  SeasonsSimulatorMessages,
} from "../../../lib/i18n/messages/types";
import {
  DEFAULT_SEASONS_STATE,
  decodeSeasonsState,
  type SeasonsState,
} from "../../../lib/simulations/seasons-simulator";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadSeasonsCalculation } from "../../../lib/server/seasons-simulator";

export const dynamic = "force-dynamic";

export function createSeasonsSimulatorMetadata(messages: SeasonsSimulatorMessages): Metadata {
  return {
    alternates: {
      canonical: "/lab/seasons-simulator",
    },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type SeasonsSimulatorPageProps = Readonly<{
  locale: PublishedLocale;
  messages: SeasonsSimulatorMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  presentationModeMessages: PresentationModeMessages;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{
  state: SeasonsState;
  invalid: boolean;
}> {
  const rawState = searchParams.state;
  if (rawState === undefined) return { state: DEFAULT_SEASONS_STATE, invalid: false };
  const encoded = Array.isArray(rawState) || rawState.length === 0 ? null : rawState;
  const decoded = encoded === null ? null : decodeSeasonsState(encoded);
  return decoded === null
    ? { state: DEFAULT_SEASONS_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function SeasonsSimulatorPage({
  locale,
  messages,
  presentationModeMessages,
  searchParams,
}: SeasonsSimulatorPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadSeasonsCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <SeasonsSimulatorNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <SeasonsSimulatorEnhanced
        apiOrigin={publicApiConfiguration.valid ? publicApiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
        presentationModeMessages={presentationModeMessages}
      />
    </>
  );
}
