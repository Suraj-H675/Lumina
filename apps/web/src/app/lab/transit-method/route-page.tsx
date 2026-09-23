import type { Metadata } from "next";

import { TransitMethodEnhanced } from "../../../components/transit-method-enhanced";
import { TransitMethodNoScript } from "../../../components/transit-method-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { TransitMethodMessages } from "../../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadTransitMethodCalculation } from "../../../lib/server/transit-method";
import {
  DEFAULT_TRANSIT_METHOD_STATE,
  decodeTransitMethodState,
  type TransitMethodState,
} from "../../../lib/simulations/transit-method";

export function createTransitMethodMetadata(messages: TransitMethodMessages): Metadata {
  return {
    alternates: { canonical: "/lab/transit-method" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type TransitMethodPageProps = Readonly<{
  locale: PublishedLocale;
  messages: TransitMethodMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: TransitMethodState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_TRANSIT_METHOD_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeTransitMethodState(encoded);
  return decoded === null
    ? { state: DEFAULT_TRANSIT_METHOD_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function TransitMethodPage({
  locale,
  messages,
  searchParams,
}: TransitMethodPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadTransitMethodCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <TransitMethodNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <TransitMethodEnhanced
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
