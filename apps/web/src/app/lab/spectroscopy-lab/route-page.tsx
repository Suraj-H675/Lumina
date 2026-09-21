import type { Metadata } from "next";

import { SpectroscopyLabEnhanced } from "../../../components/spectroscopy-lab-enhanced";
import { SpectroscopyLabNoScript } from "../../../components/spectroscopy-lab-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { SpectroscopyLabMessages } from "../../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadSpectroscopyCalculation } from "../../../lib/server/spectroscopy-lab";
import {
  DEFAULT_SPECTROSCOPY_STATE,
  decodeSpectroscopyState,
  type SpectroscopyState,
} from "../../../lib/simulations/spectroscopy-lab";

export function createSpectroscopyLabMetadata(messages: SpectroscopyLabMessages): Metadata {
  return {
    alternates: { canonical: "/lab/spectroscopy-lab" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type SpectroscopyLabPageProps = Readonly<{
  locale: PublishedLocale;
  messages: SpectroscopyLabMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: SpectroscopyState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_SPECTROSCOPY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeSpectroscopyState(encoded);
  return decoded === null
    ? { state: DEFAULT_SPECTROSCOPY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function SpectroscopyLabPage({
  locale,
  messages,
  searchParams,
}: SpectroscopyLabPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadSpectroscopyCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <SpectroscopyLabNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <SpectroscopyLabEnhanced
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
