import type { Metadata } from "next";

import { PlanetarySystemBuilderEnhanced } from "../../../components/planetary-system-builder-enhanced";
import { PlanetarySystemBuilderNoScript } from "../../../components/planetary-system-builder-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { PlanetarySystemBuilderMessages } from "../../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadPlanetarySystemBuilderCalculation } from "../../../lib/server/planetary-system-builder";
import {
  DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE,
  decodePlanetarySystemBuilderState,
  type PlanetarySystemBuilderState,
} from "../../../lib/simulations/planetary-system-builder";

export function createPlanetarySystemBuilderMetadata(
  messages: PlanetarySystemBuilderMessages,
): Metadata {
  return {
    alternates: { canonical: "/lab/planetary-system-builder" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type PlanetarySystemBuilderPageProps = Readonly<{
  locale: PublishedLocale;
  messages: PlanetarySystemBuilderMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: PlanetarySystemBuilderState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodePlanetarySystemBuilderState(encoded);
  return decoded === null
    ? { state: DEFAULT_PLANETARY_SYSTEM_BUILDER_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function PlanetarySystemBuilderPage({
  locale,
  messages,
  searchParams,
}: PlanetarySystemBuilderPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadPlanetarySystemBuilderCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <PlanetarySystemBuilderNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <PlanetarySystemBuilderEnhanced
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
