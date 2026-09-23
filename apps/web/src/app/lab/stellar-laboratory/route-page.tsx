import type { Metadata } from "next";

import { StellarLaboratoryEnhanced } from "../../../components/stellar-laboratory-enhanced";
import { StellarLaboratoryNoScript } from "../../../components/stellar-laboratory-no-script";
import type { PublishedLocale } from "../../../lib/i18n/locales";
import type { StellarLaboratoryMessages } from "../../../lib/i18n/messages/types";
import { resolvePublicWebApiOrigin, resolveWebApiOrigin } from "../../../lib/server/api-origin";
import { loadStellarLaboratoryCalculation } from "../../../lib/server/stellar-laboratory";
import {
  DEFAULT_STELLAR_LABORATORY_STATE,
  decodeStellarLaboratoryState,
  type StellarLaboratoryState,
} from "../../../lib/simulations/stellar-laboratory";

export function createStellarLaboratoryMetadata(messages: StellarLaboratoryMessages): Metadata {
  return {
    alternates: { canonical: "/lab/stellar-laboratory" },
    description: messages.metadataDescription,
    title: messages.metadataTitle,
  };
}

type StellarLaboratoryPageProps = Readonly<{
  locale: PublishedLocale;
  messages: StellarLaboratoryMessages;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function stateFromSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): Readonly<{ state: StellarLaboratoryState; invalid: boolean }> {
  const raw = searchParams.state;
  if (raw === undefined) return { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: false };
  const encoded = Array.isArray(raw) || raw.length === 0 ? null : raw;
  const decoded = encoded === null ? null : decodeStellarLaboratoryState(encoded);
  return decoded === null
    ? { state: DEFAULT_STELLAR_LABORATORY_STATE, invalid: true }
    : { state: decoded, invalid: false };
}

export default async function StellarLaboratoryPage({
  locale,
  messages,
  searchParams,
}: StellarLaboratoryPageProps) {
  const requested = stateFromSearchParams(await searchParams);
  const serverApiConfiguration = resolveWebApiOrigin();
  const publicApiConfiguration = resolvePublicWebApiOrigin();
  const calculation = await loadStellarLaboratoryCalculation(requested.state, {
    ...(serverApiConfiguration.valid ? { origin: serverApiConfiguration.origin } : {}),
  });
  const initialCalculation = calculation.kind === "ok" ? calculation.data : null;

  return (
    <>
      <StellarLaboratoryNoScript
        initialCalculation={initialCalculation}
        initialState={requested.state}
        initialStateInvalid={requested.invalid}
        locale={locale}
        messages={messages}
      />
      <StellarLaboratoryEnhanced
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
