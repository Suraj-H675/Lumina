import type { Metadata } from "next";

import { EclipseSimulatorEnhanced } from "../../../components/eclipse-simulator-enhanced";
import { EclipseSimulatorNoScript } from "../../../components/eclipse-simulator-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { EclipseSimulatorMessages } from "../../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadEclipseSimulatorCalculation } from "../../../lib/server/eclipse-simulator";
import {
  DEFAULT_ECLIPSE_SIMULATOR_STATE,
  decodeEclipseSimulatorState,
  type EclipseSimulatorState,
} from "../../../lib/simulations/eclipse-simulator";

export function createEclipseSimulatorMetadata(messages: EclipseSimulatorMessages): Metadata {
  return {
    alternates: { canonical: "/lab/eclipse-simulator" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type EclipseSimulatorPageProps = Readonly<{
  locale: PublishedLocale;
  messages: EclipseSimulatorMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: EclipseSimulatorState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_ECLIPSE_SIMULATOR_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeEclipseSimulatorState(encoded);
  return decoded === null
    ? { state: DEFAULT_ECLIPSE_SIMULATOR_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function EclipseSimulatorPage({
  locale,
  messages,
  searchParams,
}: EclipseSimulatorPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadEclipseSimulatorCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;
  return (
    <>
      <EclipseSimulatorNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <EclipseSimulatorEnhanced
        apiOrigin={apiConfiguration.valid ? apiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
    </>
  );
}
