import type { Metadata } from "next";

import { ImpactSimulatorEnhanced } from "../../../components/impact-simulator-enhanced";
import { ImpactSimulatorNoScript } from "../../../components/impact-simulator-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { ImpactSimulatorMessages } from "../../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadImpactSimulatorCalculation } from "../../../lib/server/impact-simulator";
import {
  DEFAULT_IMPACT_SIMULATOR_STATE,
  decodeImpactSimulatorState,
  type ImpactSimulatorState,
} from "../../../lib/simulations/impact-simulator";

export function createImpactSimulatorMetadata(messages: ImpactSimulatorMessages): Metadata {
  return {
    alternates: { canonical: "/lab/impact-simulator" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type ImpactSimulatorPageProps = Readonly<{
  locale: PublishedLocale;
  messages: ImpactSimulatorMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: ImpactSimulatorState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_IMPACT_SIMULATOR_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeImpactSimulatorState(encoded);
  return decoded === null
    ? { state: DEFAULT_IMPACT_SIMULATOR_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function ImpactSimulatorPage({
  locale,
  messages,
  searchParams,
}: ImpactSimulatorPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadImpactSimulatorCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <ImpactSimulatorNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <ImpactSimulatorEnhanced
        apiOrigin={publicApiConfiguration.valid ? publicApiConfiguration.origin : null}
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
    </>
  );
}
