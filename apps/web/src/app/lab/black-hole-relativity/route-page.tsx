import type { Metadata } from "next";

import { BlackHoleRelativityEnhanced } from "../../../components/black-hole-relativity-enhanced";
import { BlackHoleRelativityNoScript } from "../../../components/black-hole-relativity-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { BlackHoleRelativityMessages } from "../../../lib/i18n/messages/types";
import { resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadBlackHoleRelativityCalculation } from "../../../lib/server/black-hole-relativity";
import {
  DEFAULT_BLACK_HOLE_RELATIVITY_STATE,
  decodeBlackHoleRelativityState,
  type BlackHoleRelativityState,
} from "../../../lib/simulations/black-hole-relativity";

export function createBlackHoleRelativityMetadata(messages: BlackHoleRelativityMessages): Metadata {
  return {
    alternates: { canonical: "/lab/black-hole-relativity" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type BlackHoleRelativityPageProps = Readonly<{
  locale: PublishedLocale;
  messages: BlackHoleRelativityMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: BlackHoleRelativityState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_BLACK_HOLE_RELATIVITY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeBlackHoleRelativityState(encoded);
  return decoded === null
    ? { state: DEFAULT_BLACK_HOLE_RELATIVITY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function BlackHoleRelativityPage({
  locale,
  messages,
  searchParams,
}: BlackHoleRelativityPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const apiConfiguration = resolveWebApiOrigin();
  const calculation = await loadBlackHoleRelativityCalculation(requested.state, {
    ...(apiConfiguration.valid ? { origin: apiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <BlackHoleRelativityNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <BlackHoleRelativityEnhanced
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
